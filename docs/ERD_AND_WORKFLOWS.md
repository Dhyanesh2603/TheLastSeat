# Entity Relationship Diagram & System Workflows
## College Concert Ticket Booking Platform (CC-VIT 26-27 Recruitment Task)

---

## 1. Entity-Relationship Diagram (3NF)

The database schema is strictly normalized to the Third Normal Form (3NF). Every non-key attribute is non-transitively dependent on the primary key.

```mermaid
erDiagram
    USERS ||--o{ RESERVATIONS : creates
    USERS ||--o{ BOOKINGS : owns
    USERS ||--o{ PAYMENTS : initiates
    USERS ||--o{ WAITING_QUEUE : joins
    USERS ||--o{ IDEMPOTENCY_KEYS : scopes
    USERS ||--o{ AUDIT_LOGS : generates

    SEATS ||--o{ RESERVATIONS : allocated_temporarily
    SEATS ||--o{ BOOKINGS : assigned_permanently
    SEATS ||--o{ WAITING_QUEUE : waitlisted_for

    RESERVATIONS ||--o| BOOKINGS : promotes_to
    RESERVATIONS ||--o{ PAYMENTS : billed_under

    BOOKINGS ||--o| PAYMENTS : settled_by

    USERS {
        uuid id PK "Primary key (UUIDv4)"
        string email UK "Unique college email"
        string hashed_password "Bcrypt salted hash"
        string full_name "Student full name"
        string role "Enum: STUDENT, ADMIN"
        boolean is_active "Account status"
        timestamp created_at "UTC timestamp"
        timestamp updated_at "UTC timestamp"
    }

    SEATS {
        integer id PK "Sequential seat ID (1-500)"
        string seat_number UK "Unique code: A1 to T25"
        string row_identifier "Row letter (A to T)"
        integer column_number "Seat column (1 to 25)"
        string tier "Enum: VIP, STANDARD, BALCONY"
        numeric price "Tier price: $150, $75, $45"
        string status "Enum: Available, Reserved, Booked, Unavailable"
        integer version "Optimistic lock / sequence version"
        timestamp created_at "Creation timestamp"
        timestamp updated_at "Last updated"
    }

    RESERVATIONS {
        uuid id PK "Reservation UUID"
        uuid user_id FK "References USERS(id)"
        integer seat_id FK "References SEATS(id)"
        string status "Enum: Pending, Confirmed, Expired, Cancelled, Payment Failed"
        timestamp expires_at "UTC expiry timestamp (NOW + 300s)"
        timestamp created_at "Hold start time"
        timestamp updated_at "Last state transition"
    }

    BOOKINGS {
        uuid id PK "Booking UUID"
        string booking_reference UK "Alphanumeric code (e.g. BK-4A2B-9C1D)"
        uuid user_id FK "References USERS(id)"
        integer seat_id FK "References SEATS(id)"
        uuid reservation_id FK "References RESERVATIONS(id)"
        string status "Enum: Confirmed, Cancelled"
        numeric total_amount "Total charged price"
        timestamp cancelled_at "Nullable cancellation timestamp"
        timestamp created_at "Booking completion timestamp"
        timestamp updated_at "Last update timestamp"
    }

    PAYMENTS {
        uuid id PK "Payment transaction UUID"
        string transaction_reference UK "Unique gateway ref (e.g. TXN-XXXX)"
        uuid user_id FK "References USERS(id)"
        uuid reservation_id FK "References RESERVATIONS(id)"
        uuid booking_id FK "Nullable FK to BOOKINGS(id)"
        numeric amount "Transaction sum"
        string currency "USD"
        string status "Enum: Succeeded, Failed, Delayed Success, Timed Out"
        float simulated_delay_seconds "Simulated processing latency (1.0 - 8.0s)"
        string failure_reason "Nullable reason for simulated failure"
        timestamp created_at "Payment submission timestamp"
        timestamp updated_at "Settlement timestamp"
    }

    WAITING_QUEUE {
        uuid id PK "Queue entry UUID"
        uuid user_id FK "References USERS(id)"
        integer seat_id FK "Optional target seat reference"
        string status "Enum: Waiting, Notified, Expired, Fulfilled"
        timestamp notified_at "Nullable notification time"
        timestamp offer_expires_at "Nullable 3-minute claim window expiry"
        timestamp created_at "Queue entry timestamp"
        timestamp updated_at "Last state change"
    }

    IDEMPOTENCY_KEYS {
        uuid id PK "Unique key record UUID"
        string idempotency_key UK "Client-supplied UUID header"
        uuid user_id FK "User scope"
        string request_path "HTTP request URI"
        string request_hash "SHA-256 hash of body"
        integer response_code "HTTP status code"
        json response_body "Cached JSON payload"
        timestamp expires_at "Cache expiry (NOW + 24h)"
    }

    AUDIT_LOGS {
        uuid id PK "Immutable audit record UUID"
        uuid user_id FK "Acting user"
        string action "Event code (SEAT_RESERVE, BOOKING_CONFIRM, etc.)"
        string entity_type "Target entity name"
        string entity_id "Target entity ID"
        json metadata_json "Snapshot data"
        string ip_address "Client IP address"
        timestamp created_at "Event timestamp"
    }
```

---

## 2. Complete Booking Sequence Diagram

This sequence illustrates the end-to-end booking flow including Redis distributed locking, atomic Lua scripting, payment simulation, and row-level database locking (`SELECT ... FOR UPDATE`).

```mermaid
sequenceDiagram
    autonumber
    actor Student as Student Client
    participant Proxy as Nginx Reverse Proxy
    participant API as FastAPI Backend
    participant Lock as Redis (Distributed Lock & Lua)
    participant DB as PostgreSQL Database
    participant Event as Asynchronous Event Bus

    Note over Student,API: Phase 1: Temporary Reservation (5-Minute Hold)
    Student->>Proxy: POST /api/v1/seats/42/reserve
    Proxy->>API: Forward Request with Idempotency-Key
    API->>Lock: Acquire Redis Lock (SET lock:seat:42 token NX PX 4000)
    alt Lock Acquisition Failed (Seat currently contested)
        API-->>Student: 429 Too Many Requests (Retry momentarily)
    end
    API->>Lock: Execute Atomic Lua Script (RESERVE_SEAT_LUA)
    alt Seat Already Booked or Reserved in Redis
        API->>Lock: Release Redis Lock
        API-->>Student: 409 Conflict ("Seat is currently reserved")
    end
    Note over Lock: Redis sets seat:42:reservation with 300s TTL
    API->>DB: BEGIN Transaction
    API->>DB: SELECT * FROM seats WHERE id = 42 FOR UPDATE
    API->>DB: INSERT INTO reservations (status='Pending', expires_at=NOW()+300s)
    API->>DB: UPDATE seats SET status='Reserved', version=version+1 WHERE id=42
    API->>DB: COMMIT Transaction
    API->>Lock: Release Redis Lock (Safe token check Lua)
    API->>Event: Publish "seat.reserved" event
    API-->>Student: 200 OK: { reservation_id, remaining_seconds: 300 }

    Note over Student,API: Phase 2: Payment Simulation & Confirmation
    Student->>Proxy: POST /api/v1/seats/42/confirm { reservation_id }
    Proxy->>API: Forward Request
    API->>Lock: Acquire Redis Lock (lock:seat:42)
    API->>DB: BEGIN Transaction
    API->>DB: SELECT * FROM seats WHERE id = 42 FOR UPDATE
    Note over DB: Exclusively locks row #42 against concurrent confirmers
    API->>API: Execute Payment Simulator (1.0 - 8.0s delay)
    alt Payment Succeeded or Delayed Success
        API->>DB: INSERT INTO bookings (booking_reference='BK-XXXX', status='Confirmed')
        API->>DB: UPDATE seats SET status='Booked'
        API->>DB: UPDATE reservations SET status='Confirmed'
        API->>DB: INSERT INTO payments (status='Succeeded')
        API->>DB: COMMIT Transaction
        API->>Lock: SET seat:42:booked = 1
        API->>Lock: DEL seat:42:reservation
        API->>Lock: Release Redis Lock
        API->>Event: Publish "booking.confirmed" event
        API-->>Student: 200 OK: { booking_reference, status: 'Confirmed' }
    else Payment Failed or Timed Out
        API->>DB: UPDATE reservations SET status='Payment Failed'
        Note over DB: Hold remains active until 300s expires for retry
        API->>DB: INSERT INTO payments (status='Failed')
        API->>DB: COMMIT Transaction
        API->>Lock: Release Redis Lock
        API->>Event: Publish "payment.failed" event
        API-->>Student: 200 OK: { message: "Payment failed. Seat held until expiry." }
    end
```

---

## 3. Reservation Expiry & Waitlist Opportunity Flow

When a student abandons their checkout or their 5-minute timer lapses, the background worker automatically recovers the seat and offers it to the FIFO queue.

```mermaid
flowchart TD
    A([Reservation Created: 5-Minute Hold]) --> B{User Confirms Booking?}
    B -- Yes --> C[Permanent Booking Created]
    B -- No / Abandoned --> D[300s TTL Expires]
    D --> E[ReservationExpiryWorker Runs every 5s]
    E --> F["SELECT * FROM reservations WHERE status='Pending' AND expires_at <= NOW() FOR UPDATE SKIP LOCKED"]
    F --> G["Mark Reservation status = 'Expired'"]
    G --> H["Revert Seat status = 'Available'"]
    H --> I["Delete Redis key: seat:{id}:reservation"]
    I --> J["EventBus.publish('reservation.expired')"]
    J --> K{Waiting Queue Empty?}
    K -- Yes --> L[Seat remains Available for public booking]
    K -- No --> M["ZPOPMIN queue:waiting_list (Pops earliest student)"]
    M --> N["Assign 3-minute exclusive claim window (EX 180s)"]
    N --> O["Set Redis key: queue:user_opportunity:{user_id} = seat_id"]
    O --> P["Student receives live opportunity prompt in UI"]
```

---

## 4. Cancellation & Seat Reallocation Flow

```mermaid
flowchart TD
    S([Student requests Cancellation]) --> T[POST /api/v1/seats/:id/cancel]
    T --> U["Acquire Redis Lock: lock:seat:{id}"]
    U --> V["BEGIN DB Transaction"]
    V --> W["SELECT * FROM seats WHERE id = :id FOR UPDATE"]
    W --> X["Verify Booking ownership"]
    X --> Y["Mark Booking status = 'Cancelled', cancelled_at = NOW()"]
    Y --> Z["Revert Seat status = 'Available'"]
    Z --> AA["Delete Redis keys: seat:{id}:booked and seat:{id}:reservation"]
    AA --> AB["COMMIT DB Transaction"]
    AB --> AC["Notify FIFO Waiting Queue"]
    AC --> AD["EventBus.publish('booking.cancelled')"]
    AD --> AE["Release Redis Lock"]
    AE --> AF([Seat Successfully Reallocated])
```
