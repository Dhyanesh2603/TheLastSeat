# Concurrency Control & High-Throughput Consistency
## In-Depth Engineering Analysis: Zero Double Bookings Under Race Conditions

---

## 1. The Concurrency Challenge

In a college concert ticketing scenario, **10,000 concurrent clients** attempt to book **500 finite seats** the moment ticket sales go live.

### The Naive "Read-Check-Write" Anti-Pattern
A naive implementation executes three decoupled steps:
```
1. SELECT * FROM seats WHERE id = 42;
2. If seat.status == 'Available':
3.     UPDATE seats SET status = 'Reserved' WHERE id = 42;
```
When Client A and Client B hit Step 1 simultaneously:
- Both read `status = 'Available'`.
- Both evaluate `seat.status == 'Available'` as true.
- Both execute `UPDATE seats SET status = 'Reserved'`.
- **Result: Double booking and race condition.**

---

## 2. The Defense-in-Depth Solution

To eliminate race conditions across multiple application server instances, we implement four layers of protection:

```
[Incoming Request]
        │
        ▼
Layer 1: Redis Distributed Lock (Redlock SET NX PX)
        │ ── Serializes requests per seat at edge
        ▼
Layer 2: Redis Atomic Lua Script Execution
        │ ── Checks availability & sets 300s TTL in 1 atomic roundtrip
        ▼
Layer 3: PostgreSQL ACID Transaction & Row Lock (SELECT ... FOR UPDATE)
        │ ── Locks the physical DB row; enforces serializability
        ▼
Layer 4: Database Unique Constraint Partial Indices
        └── Absolute storage-level invariant: uq_confirmed_seat_booking
```

---

## 3. Layer 1 & 2: Redis Distributed Locking & Atomic Lua

### Safe Distributed Lock Pattern
Locks use the `SET key token NX PX ttl_ms` pattern. A random UUID token is stored with each lock acquisition.

Lock release executes an atomic Lua script that compares the token before deletion:
```lua
if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
else
    return 0
end
```
**Why this matters**: If a transaction takes longer than the lock TTL, another worker could acquire the lock. Without token validation, Worker A finishing late could accidentally release Worker B's lock! The token check guarantees that a client can only release its own lock.

### Atomic Reservation via Lua
Even before acquiring database locks, high volume is filtered through Redis with the `RESERVE_SEAT_LUA` script:
```lua
local res_key = KEYS[1]
local booked_key = KEYS[2]
local res_id = ARGV[1]
local user_id = ARGV[2]
local ttl = tonumber(ARGV[3])

if redis.call("EXISTS", booked_key) == 1 then
    return 0 -- Permanently Booked
end

if redis.call("EXISTS", res_key) == 1 then
    return -1 -- Already Reserved
end

redis.call("SET", res_key, res_id, "EX", ttl)
return 1 -- Granted
```
Because Redis executes Lua scripts on a single-threaded event loop atomically:
- No two requests can interleave between checking existence and setting the key.
- 9,500 of the 10,000 requests are rejected in sub-millisecond memory without overwhelming PostgreSQL connection pools.

---

## 4. Layer 3: Database Row-Level Locking (`SELECT ... FOR UPDATE`)

When confirming bookings, the application initiates an explicit database transaction and executes:
```sql
SELECT * FROM seats 
WHERE id = :seat_id 
FOR UPDATE;
```

### PostgreSQL Mechanics:
1. PostgreSQL acquires an `ExclusiveLock` on the tuple in the table page.
2. Any concurrent transaction attempting to execute `SELECT ... FOR UPDATE`, `UPDATE`, or `DELETE` on the same seat row is blocked until the first transaction commits or rolls back.
3. If the first transaction commits with `seat.status = 'Booked'`, the second waiting transaction unblocks, re-reads the row under `READ COMMITTED` semantics, sees `status = 'Booked'`, and immediately fails with `409 Conflict`.

---

## 5. Deadlock Prevention

Deadlocks occur when two transactions acquire locks in different orders:
- Transaction 1: Locks Seat A, then tries to lock Seat B.
- Transaction 2: Locks Seat B, then tries to lock Seat A.

### Mitigation Strategies:
1. **Single-Seat Granularity**: In our architecture, booking transactions operate on a single seat per confirmation transaction.
2. **Deterministic Locking Order**: For multi-seat operations, seat IDs are strictly sorted numerically (`ORDER BY seat_id ASC`) prior to lock acquisition, ensuring all workers acquire locks in identical sequence.
3. **Short Lock Hold Times**: Non-database operations (like sending external emails) are never performed inside the database transaction boundary.
4. **Lock Acquisition Timeouts**: Both Redis locks (`acquire_timeout = 2.0s`) and database locks (`statement_timeout = 5000ms`) prevent runaway blocked threads.

---

## 6. Reservation Expiry & The `SKIP LOCKED` Pattern

Reservations expire automatically after 5 minutes (300 seconds).

The background worker sweeps expired reservations without lock contention using `FOR UPDATE SKIP LOCKED`:
```sql
SELECT id, seat_id, user_id 
FROM reservations 
WHERE status = 'Pending' AND expires_at <= NOW()
FOR UPDATE SKIP LOCKED
LIMIT 50;
```

### Benefits of `SKIP LOCKED`:
- Multiple worker processes can run simultaneously across multiple instances.
- Worker 1 locks and processes rows 1 to 50.
- Worker 2 immediately skips those locked rows and claims rows 51 to 100 without waiting or blocking.
- Zero deadlocks between worker processes.

---

## 7. Idempotency Guarantees

Network retries and double-clicks could cause duplicate charges or bookings.

Every mutation request accepts an `Idempotency-Key` HTTP header.
1. `IdempotencyMiddleware` computes a SHA-256 hash of `path + request_body`.
2. Checks Redis cache `idempotency:{key}` and PostgreSQL `idempotency_keys` table.
3. If an existing record matches:
   - Returns the identical HTTP status and body payload instantly with header `X-Idempotency-Hit: true`.
   - Never re-executes payment or booking logic.
4. If new:
   - Request executes normally.
   - Successful 2xx responses are atomically cached for 24 hours.

---

## 8. Failure Recovery Scenarios

| Failure Scenario | Recovery Mechanism | Invariant Preserved |
| :--- | :--- | :--- |
| **Payment Gateway Timeout** | Payment marked `Timeout`, reservation remains active until 5m TTL expires. | Seat not double booked; user can retry before TTL. |
| **Worker Process Crash during Hold** | Redis key TTL expires naturally in 300s; background sweeper cleans DB state. | Seat automatically returns to `Available`. |
| **High Contention (10k requests on 1 seat)** | Redis Lua rejects 9,999 requests in <1ms; DB `FOR UPDATE` serializes confirmation. | Exactly 1 winner, 0 double bookings. |
| **Client Disconnects after Payment** | Database transaction commits atomically before responding. Idempotent key returns booking on retry. | No lost ticket, no duplicate charge. |
| **Redis Server Failover** | Database partial unique index (`uq_confirmed_seat_booking`) acts as the ultimate ACID safety net. | Zero double bookings even if Redis is restarted. |
