# Horizontal Scaling & High-Availability Architecture
## College Concert Ticket Booking Platform (CC-VIT 26-27 Recruitment Task)

---

## 1. Executive Summary

When scaling from a single college concert (500 seats, 10,000 students) to nationwide stadium tours (100,000 seats, 2,000,000 concurrent users), single-instance architectures experience thread exhaustion, database connection saturation, and distributed locking bottlenecks.

This document details the engineering blueprint to scale the platform horizontally while preserving the non-negotiable invariant:
$$\text{One Seat} \longrightarrow \text{One Confirmed Booking} \longrightarrow \text{Never Two Winners}$$

---

## 2. Horizontal Architecture Overview

```
                                 [ Global Internet Traffic ]
                                             │
                                             ▼
                                  +─────────────────────+
                                  | Cloudflare CDN / WAF |
                                  |  - DDoS Mitigation  |
                                  |  - Static Assets    |
                                  +─────────────────────+
                                             │
                                             ▼
                                 +──────────────────────+
                                 | Anycast Load Balancer|
                                 |  (AWS ALB / HAProxy) |
                                 +──────────────────────+
                                             │
                      ┌──────────────────────┼──────────────────────┐
                      ▼                      ▼                      ▼
               +──────────────+       +──────────────+       +──────────────+
               | FastAPI App  |       | FastAPI App  |       | FastAPI App  |
               |  Instance 1  |       |  Instance 2  |       |  Instance N  |
               +──────────────+       +──────────────+       +──────────────+
                      │                      │                      │
       ┌──────────────┴───────────────┬──────┴───────────────┬──────┴──────────────┐
       ▼                              ▼                      ▼                     ▼
+───────────────+             +───────────────+      +───────────────+     +───────────────+
| Redis Cluster |             | PgBouncer     |      | RabbitMQ /    |     | Redis PubSub  |
| Distributed   |             | Connection    |      | Kafka Cluster |     | WebSocket     |
| Locks & Holds |             | Pooler        |      | Event Stream  |     | Notification  |
+───────────────+             +───────────────+      +───────────────+     +───────────────+
                                      │                      │
                      ┌───────────────┴──────────────┐       ▼
                      ▼                              ▼   +──────────────────+
              +───────────────+              +─────────+ | Async Background |
              | PostgreSQL 16 |              | Postgres| | Worker Pool      |
              | Primary Writer|              | Read    | | (Expiry, Emails, |
              | (FOR UPDATE)  |              | Replicas| | Analytics)       |
              +───────────────+              +─────────+ +──────────────────+
```

---

## 3. Application Tier Scaling (Stateless Microservices)

1. **Stateless FastAPIs**: Application pods retain zero in-memory session state. Authentication is verified cryptographically via stateless JWT bearer tokens.
2. **Horizontal Pod Autoscaling (HPA)**: Pods scale automatically on CPU utilization (> 70%) and HTTP request queue depth metrics via Kubernetes Metrics Server.
3. **Graceful Shutdown**: On `SIGTERM`, FastAPI instances drain active HTTP requests, stop the local expiry loop, close connection pools safely, and yield to Kubernetes ingress routing.

---

## 4. In-Memory Data Grid (Redis Cluster Sharding)

At 10,000+ requests per second, a single Redis instance CPU core can become a bottleneck. We utilize **Redis Cluster** with consistent hashing:

### 4.1 Hash Tags for Distributed Locking
All Redis keys pertaining to a specific seat are co-located on the same hash slot by using Redis hash tags:
- Distributed Lock: `{seat:42}:lock`
- Temporary Hold: `{seat:42}:reservation`
- Booked Indicator: `{seat:42}:booked`

Because all three keys share the `{seat:42}` tag, multi-key atomic Lua scripts (`RESERVE_SEAT_LUA`) execute on the exact same Redis shard without cross-node transaction penalties.

### 4.2 High Availability via Redis Sentinel / Replication
Each master shard is backed by a synchronous replica. If a master node fails, automatic failover completes in < 3 seconds without losing hold state.

---

## 5. Relational Database Scaling (PostgreSQL 16)

### 5.1 Connection Pooling via PgBouncer
PostgreSQL uses process-per-connection architecture. 10,000 concurrent web connections would overwhelm PostgreSQL shared memory.
- We deploy **PgBouncer** in transaction pooling mode.
- 5,000 frontend connections multiplex into a lean, highly efficient pool of **100 physical PostgreSQL backend connections**, preventing backend crash and keeping latency sub-5ms.

### 5.2 Read/Write Splitting
- **Primary Writer Node**: Handles `POST /seats/{id}/reserve`, `POST /seats/{id}/confirm`, and `DELETE /seats/{id}/cancel` where `SELECT ... FOR UPDATE` requires write locks.
- **Read Replica Pool**: `GET /seats` and aggregated dashboard read queries route to horizontal read replicas via asynchronous streaming replication.

### 5.3 Partitioning by Concert / Event
For multi-event operations, tables are range-partitioned or list-partitioned by `event_id`:
```sql
CREATE TABLE bookings (
    id UUID NOT NULL,
    event_id UUID NOT NULL,
    seat_id INT NOT NULL,
    user_id UUID NOT NULL,
    ...
) PARTITION BY LIST (event_id);
```
Querying and locking seats for Event A never collides with or scans table partitions for Event B.

---

## 6. Asynchronous Event-Driven Messaging (RabbitMQ / Kafka)

To prevent HTTP requests from hanging during peripheral tasks (ticket PDF generation, email dispatches, audit warehousing):
1. **Message Broker**: As demonstrated in `app/core/event_broker.py`, domain events (`seat.reserved`, `booking.confirmed`, `payment.failed`, `reservation.expired`) are pushed directly to durable AMQP exchanges.
2. **Worker Consumer Pools**: Dedicated worker nodes consume messages off RabbitMQ / Kafka topic queues with automatic acknowledgments and dead-letter queues (DLQ) for failed consumer tasks.
3. **Backpressure Management**: If external notification providers (e.g. SendGrid / Twilio) suffer rate limits, messages simply buffer safely in RabbitMQ without impacting seat checkout latency.

---

## 7. Flash-Sale "Waiting Room" Pattern (Virtual Queue)

When 100,000 users arrive at exactly 6:00 PM for 500 seats:
1. **Edge Admission Controller**: Rather than letting 100,000 users hammer the reservation endpoint at once, users enter a Redis Sorted Set virtual waiting room (`ZADD concert:queue timestamp user_id`).
2. **Controlled Ingestion Rate**: A token bucket dispatcher releases 50 users per second to the seat selection map with an encrypted cryptographic clearance token (`checkout_token`).
3. **Zero Crash Guarantee**: The database and backend only ever see a steady, predictable load within tested capacity bounds, eliminating thundering herd problems completely.
