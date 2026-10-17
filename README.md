# College Concert Ticket Booking Platform

> High-concurrency ticket booking platform capable of handling thousands of concurrent reservation requests while mathematically guaranteeing that **no seat can ever be booked more than once**.

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%2016-336791.svg?style=flat&logo=postgresql)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Cache%20%26%20Locks-Redis%207-DC382D.svg?style=flat&logo=redis)](https://redis.io/)
[![React](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite%20%2B%20TS-61DAFB.svg?style=flat&logo=react)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/Design-Tailwind%20v4-38B2AC.svg?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Deploy-Docker%20Compose-2496ED.svg?style=flat&logo=docker)](https://docker.com/)

---

### 🚀 Live Production Deployment

| Service | Live URL | Description |
| :--- | :--- | :--- |
| **🌐 Interactive Web Application** | **[https://thelastseat-ui.onrender.com](https://thelastseat-ui.onrender.com)** | Live Auditorium UI, Seat Reservation Map & Checkout |
| **⚡ Backend REST API** | **[https://thelastseat.onrender.com](https://thelastseat.onrender.com)** | FastAPI High-Concurrency Core Engine |
| **📖 Interactive API Documentation** | **[https://thelastseat.onrender.com/docs](https://thelastseat.onrender.com/docs)** | Live Interactive Swagger / OpenAPI Specification |
| **🩺 Health & Telemetry Endpoint** | **[https://thelastseat.onrender.com/api/v1/health](https://thelastseat.onrender.com/api/v1/health)** | Database & Distributed Redis Lock Status |

> **Demo Access Credentials**:
> - **Student Role**: `student@college.edu` / `StudentPass123!` *(or 1-click automatic student login)*
> - **Admin Studio**: `admin@college.edu` / `AdminPass123!` *(access at [/admin](https://thelastseat-ui.onrender.com/admin))*

---

## 1. Project Overview

The **College Concert Ticket Booking Platform** is engineered to solve the classic real-world flash-sale concurrency problem: **10,000 students contending for 500 seats simultaneously**.

### Core Invariant
$$\text{One Seat} \longrightarrow \text{One Confirmed Booking} \longrightarrow \text{Never Two Winners}$$

The application prioritizes backend engineering, clean architecture, database consistency, distributed locking, atomic operations, and fault recovery over decorative UI. The frontend is built with a minimal, professional, monochrome design language inspired by **Linear**, **Stripe Dashboard**, **Supabase Studio**, and **Vercel**.

---

## 2. Core Features

### Concurrency & Consistency
- **Distributed Locking**: Redis distributed locks with unique Redlock release tokens.
- **Atomic Reservations**: Redis Lua scripts check availability and apply temporary TTL holds atomically.
- **Pessimistic Row-Level Locking**: `SELECT ... FOR UPDATE` inside PostgreSQL ACID transactions.
- **Database Safety Net**: Partial unique indices (`uq_confirmed_seat_booking`) prevent two winners even under edge-case infrastructure failovers.
- **Idempotency**: `Idempotency-Key` HTTP header support to prevent duplicate booking or payment side-effects.

### Student Lifecycle
- **JWT Authentication**: Secure registration and login with bcrypt hashing.
- **Interactive 500-Seat Layout**: Organized into 20 rows (A-T) and 25 columns across VIP ($150), Standard ($75), and Balcony ($45) tiers.
- **Temporary 5-Minute Hold**: Seat is held for 300 seconds with live countdown timers.
- **Booking Confirmations & Receipts**: Unique human-readable booking codes (e.g. `BK-8A1F-3E9C`).
- **Booking Cancellation**: Instantly releases seat back to Available and dispatches opportunity to the next waitlisted student.
- **Activity & History Timeline**: Complete audit trail of bookings, reservations, and payment attempts.

### Waiting Queue & Payment Simulation
- **Redis FIFO Waiting Queue**: Sorted Set (`ZPOPMIN`) automatically notifies the next user when reservations expire or are cancelled.
- **Payment Simulator**: Non-deterministic payment outcomes (70% Success, 15% Failure, 10% Timeout, 5% Delayed Success) with 1–8s latency.
- **Failure Resilience**: If a payment fails or times out, the reservation remains held until its 5-minute expiration so the user can reattempt.

### Admin Studio & Observability
- **Real-Time KPIs**: Total Seats, Available, Reserved, Booked, Total Revenue, Double Booking Violations (0).
- **Interactive Concurrency Stress Burst**: Fires 25 concurrent requests on a single seat live from the browser to demonstrate that exactly 1 wins and 24 are cleanly rejected with HTTP 409.
- **Real-Time Telemetry**: Live PostgreSQL and Redis connection health indicators, active Redis keys, and payment feeds.

---

## 3. Architecture Diagram

```
+───────────────────────────────────────────────────────────────────────────────+
│                                CLIENT BROWSER                                 │
│          (React 19 + TypeScript + Vite + TailwindCSS + TanStack Query)        │
+───────────────────────────────────────────────────────────────────────────────+
                                       │
                                       ▼ HTTP / REST
+───────────────────────────────────────────────────────────────────────────────+
│                           NGINX REVERSE PROXY                                 │
│  - Static Asset Delivery                                                      │
│  - Gzip / Brotli Compression                                                  │
│  - Rate Limiting: 150 req/s global, 20 req/s auth                             │
+───────────────────────────────────────────────────────────────────────────────+
                                       │
                                       ▼ /api/v1/*
+───────────────────────────────────────────────────────────────────────────────+
│                          FASTAPI APPLICATION ENGINE                           │
│  - IdempotencyMiddleware (SHA-256 payload caching)                            │
│  - JWT Bearer Authentication & RBAC (Student / Admin)                         │
│  - Async SQLAlchemy 2.0 Engine with Connection Pooling                        │
+───────────────────────────────────────────────────────────────────────────────+
                   │                                          │
                   ▼                                          ▼
+─────────────────────────────────────+    +────────────────────────────────────+
│           REDIS 7 CLUSTER           │    │          POSTGRESQL 16             │
│─────────────────────────────────────│    │────────────────────────────────────│
│ • Distributed Lock (SET NX PX)      │    │ • ACID Transaction Engine          │
│ • Atomic Reservation (Lua Scripts)  │    │ • Row-Level Lock: SELECT FOR UPDATE│
│ • 5-Minute Expiration TTL           │    │ • 3NF Relational Schema            │
│ • FIFO Waiting Queue (Sorted Set)   │    │ • Partial Unique Constraints       │
+─────────────────────────────────────+    +────────────────────────────────────+
                   ▲                                          ▲
                   │                                          │
                   └──────────────────┬───────────────────────┘
                                      │
                     +──────────────────────────────────+
                     │     RESERVATION EXPIRY WORKER    │
                     │  - Polls every 5s with           │
                     │    SELECT FOR UPDATE SKIP LOCKED │
                     │  - Reclaims expired seats        │
                     │  - Dispatches Waiting Queue      │
                     +──────────────────────────────────+
```

---

## 4. Database Design & ER Diagram (3NF)

```mermaid
erDiagram
    USERS ||--o{ RESERVATIONS : places
    USERS ||--o{ BOOKINGS : owns
    USERS ||--o{ PAYMENTS : initiates
    USERS ||--o{ WAITING_QUEUE : enters
    USERS ||--o{ IDEMPOTENCY_KEYS : scopes
    USERS ||--o{ AUDIT_LOGS : triggers

    SEATS ||--o{ RESERVATIONS : holds
    SEATS ||--o{ BOOKINGS : allocated_to
    SEATS ||--o{ WAITING_QUEUE : targets

    RESERVATIONS ||--o| BOOKINGS : converts_to
    RESERVATIONS ||--o{ PAYMENTS : authorizes

    BOOKINGS ||--o| PAYMENTS : settled_by

    USERS {
        uuid id PK
        string email UK
        string hashed_password
        string full_name
        string role
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }

    SEATS {
        integer id PK
        string seat_number UK
        string row_identifier
        integer column_number
        string tier
        numeric price
        string status
        integer version
        timestamp created_at
        timestamp updated_at
    }

    RESERVATIONS {
        uuid id PK
        uuid user_id FK
        integer seat_id FK
        string status
        timestamp expires_at
        timestamp created_at
        timestamp updated_at
    }

    BOOKINGS {
        uuid id PK
        string booking_reference UK
        uuid user_id FK
        integer seat_id FK
        uuid reservation_id FK
        string status
        numeric total_amount
        timestamp cancelled_at
        timestamp created_at
        timestamp updated_at
    }

    PAYMENTS {
        uuid id PK
        string transaction_reference UK
        uuid user_id FK
        uuid reservation_id FK
        uuid booking_id FK
        numeric amount
        string currency
        string status
        float simulated_delay_seconds
        string failure_reason
        timestamp created_at
        timestamp updated_at
    }

    WAITING_QUEUE {
        uuid id PK
        uuid user_id FK
        integer seat_id FK
        string status
        timestamp notified_at
        timestamp offer_expires_at
        timestamp created_at
        timestamp updated_at
    }

    IDEMPOTENCY_KEYS {
        uuid id PK
        string idempotency_key UK
        uuid user_id FK
        string request_path
        string request_hash
        integer response_code
        json response_body
        timestamp expires_at
    }

    AUDIT_LOGS {
        uuid id PK
        uuid user_id FK
        string action
        string entity_type
        string entity_id
        json metadata_json
        string ip_address
        timestamp created_at
    }
```

---

## 5. Booking & Expiry Workflows

### 5.1 Booking Lifecycle
```
User
 │
 ├── View Seats (GET /seats)
 │
 ├── Reserve Seat (POST /seats/{id}/reserve)
 │     ├── Acquire Redis Distributed Lock: lock:seat:{id}
 │     ├── Atomic Lua script verifies availability & sets 300s TTL
 │     ├── Database row updated to 'Reserved'
 │     └── Release Redis Distributed Lock
 │
 ├── Payment Simulation (1–8s random delay)
 │
 ├── Database Transaction Begins
 │     ├── SELECT * FROM seats WHERE id = :id FOR UPDATE
 │     ├── Verify active reservation ownership & status == 'Pending'
 │     ├── Create Booking record (Unique reference: BK-XXXX-YYYY)
 │     ├── Update Seat status = 'Booked'
 │     ├── Update Reservation status = 'Confirmed'
 │     ├── Mark Redis key seat:{id}:booked = 1
 │     ├── Delete temporary reservation key
 │     └── Commit Transaction
 │
 └── Seat Permanently Booked (Guaranteed 0 Double Bookings)
```

### 5.2 Expiry & Waitlist Opportunity Dispatch
```
Reservation Created (5:00 TTL starts)
 │
 ├── User fails to confirm before 300s lapses
 │
 ├── ReservationExpiryWorker runs (interval 5s)
 │     ├── SELECT ... FOR UPDATE SKIP LOCKED
 │     ├── Mark Reservation status = 'Expired'
 │     ├── Revert Seat status = 'Available'
 │     ├── Delete Redis reservation key
 │     └── Notify Waiting Queue:
 │           ├── ZPOPMIN queue:waiting_list (Pops earliest user)
 │           ├── Assigns 3-minute exclusive opportunity window
 │           └── Sets queue:user_opportunity:{user_id} = seat_id
 │
 └── Next user receives seat opportunity banner in UI
```

---

## 6. Folder Structure

```
d:/pro_2/
│
├── backend/
│   ├── app/
│   │   ├── api/             # API Routers (auth, seats, bookings, reservations, payments, queue, admin, health)
│   │   ├── core/            # Configuration, Security, DB Engine, Redis Client, Dependencies
│   │   ├── models/          # SQLAlchemy 3NF models
│   │   ├── schemas/         # Pydantic v2 schemas
│   │   ├── repositories/    # Decoupled Data Access Layer
│   │   ├── services/        # Business Logic Services
│   │   ├── middleware/      # Idempotency Middleware
│   │   ├── workers/         # Background Expiry Sweeper
│   │   ├── utils/           # Redis Distributed Lock & Lua Scripts
│   │   └── main.py          # FastAPI Application
│   │
│   ├── migrations/          # Alembic Migration Scripts
│   ├── tests/               # Pytest Suite (Concurrency, Auth, Idempotency, Queue)
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── components/      # SeatGrid, ReservationDrawer, WaitingQueueModal, Navbar
│   │   ├── context/         # AuthContext
│   │   ├── pages/           # StudentDashboard, HistoryPage, AdminDashboard, LoginPage
│   │   ├── services/        # Axios API Client
│   │   ├── types/           # TypeScript Domain Definitions
│   │   ├── App.tsx
│   │   └── index.css
│   │
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile
│
├── docker/
│   └── nginx.conf           # Reverse Proxy & Rate Limiter Configuration
│
├── load-testing/
│   ├── locustfile.py        # Locust Stress Test Suite
│   └── run_load_test.py     # Automated Runner & Invariant Verifier
│
├── docs/
│   ├── ARCHITECTURE.md      # Detailed Technical Architecture
│   └── CONCURRENCY.md       # Concurrency Deep Dive
│
├── docker-compose.yml       # Production Multi-Container Orchestration
└── README.md
```

---

## 7. API Documentation

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Register new student or admin | No |
| `POST` | `/api/v1/auth/login` | Login and acquire JWT access token | No |
| `GET` | `/api/v1/auth/me` | Current authenticated user profile | Yes |
| `GET` | `/api/v1/seats` | Complete 500-seat layout with live status counts | No |
| `GET` | `/api/v1/seats/{id}` | Inspect individual seat details | No |
| `POST` | `/api/v1/seats/{id}/reserve` | Atomically reserve seat for 5 minutes | Yes |
| `POST` | `/api/v1/seats/{id}/confirm` | Confirm booking with `SELECT FOR UPDATE` | Yes |
| `DELETE`| `/api/v1/seats/{id}/cancel` | Cancel booking and release seat | Yes |
| `GET` | `/api/v1/bookings` | List user's bookings (or all if admin) | Yes |
| `GET` | `/api/v1/bookings/history` | Full user activity timeline | Yes |
| `GET` | `/api/v1/bookings/{id}` | Retrieve individual booking details | Yes |
| `GET` | `/api/v1/reservations` | User's active holds with remaining seconds | Yes |
| `GET` | `/api/v1/payments` | Payment logs and simulator outcome metrics | Yes |
| `POST` | `/api/v1/queue/join` | Join FIFO waiting queue | Yes |
| `GET` | `/api/v1/queue/status` | Current queue position and opportunity alerts | Yes |
| `GET` | `/api/v1/admin/dashboard` | Admin summary metrics and revenue | Admin |
| `GET` | `/api/v1/admin/stats` | Concurrency audit & payment success rate | Admin |
| `POST` | `/api/v1/admin/simulate-concurrency-burst` | Stress-test 25 concurrent users on seat | Admin |
| `GET` | `/api/v1/health` | System health (DB + Redis status) | No |
| `GET` | `/api/v1/metrics` | Telemetry metrics for monitoring | No |

Interactive Swagger documentation is available at `http://localhost:8001/docs` (or `http://localhost:8000/docs` in Docker).

### 7.1 Example API Requests & Responses (curl)

#### 1. Authenticate & Obtain JWT
```bash
curl -X POST "http://localhost:8001/api/v1/auth/login" \
     -H "Content-Type: application/json" \
     -d '{"email": "student@college.edu", "password": "StudentPass123!"}'
```
*Response (200 OK):*
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsIn...",
  "token_type": "bearer",
  "user": {
    "id": "449deae5-0f50-48e0-8dc4-c240cd7ff15f",
    "email": "student@college.edu",
    "full_name": "Alex Student",
    "role": "student"
  }
}
```

#### 2. Query 500-Seat Grid & Availability
```bash
curl -X GET "http://localhost:8001/api/v1/seats"
```
*Response (200 OK):*
```json
{
  "total": 500,
  "available_count": 498,
  "reserved_count": 1,
  "booked_count": 1,
  "seats": [
    {
      "id": 1,
      "seat_number": "A1",
      "row_identifier": "A",
      "column_number": 1,
      "tier": "VIP",
      "price": 150.0,
      "status": "Available"
    }
  ]
}
```

#### 3. Reserve Seat Atomically (5-Minute Hold with Idempotency)
```bash
curl -X POST "http://localhost:8001/api/v1/seats/42/reserve" \
     -H "Authorization: Bearer <TOKEN>" \
     -H "Idempotency-Key: a4c91b58-0001-4b10-a9cb-e47f7d1b3329"
```
*Response (200 OK):*
```json
{
  "reservation_id": "77a83d3b-9e48-4cb1-8051-7f98cbe19e91",
  "seat_id": 42,
  "seat_number": "B17",
  "status": "Pending",
  "expires_at": "2026-10-15T18:45:00.000000Z",
  "remaining_seconds": 300,
  "message": "Seat B17 reserved successfully for 5 minutes."
}
```

#### 4. Confirm Booking & Simulate Payment
```bash
curl -X POST "http://localhost:8001/api/v1/seats/42/confirm" \
     -H "Authorization: Bearer <TOKEN>" \
     -H "Idempotency-Key: conf-a4c91b58-0001" \
     -H "Content-Type: application/json" \
     -d '{"reservation_id": "77a83d3b-9e48-4cb1-8051-7f98cbe19e91", "force_outcome": "success"}'
```
*Response (200 OK):*
```json
{
  "booking_id": "2d1948af-7589-4b19-b2f7-e7f09f0cc677",
  "booking_reference": "BK-4A2B-9C1D",
  "seat_id": 42,
  "seat_number": "B17",
  "total_amount": 75.0,
  "payment_id": "ef20d6ab-4819-482f-8700-1c390299f010",
  "payment_status": "Succeeded",
  "booking_status": "Confirmed",
  "message": "Seat B17 booked successfully! Ref: BK-4A2B-9C1D"
}
```

#### 5. Retrieve User Booking History & Audit Timeline
```bash
curl -X GET "http://localhost:8001/api/v1/bookings/history" \
     -H "Authorization: Bearer <TOKEN>"
```

#### 6. Cancel Booking & Trigger Reallocation to Waiting Queue
```bash
curl -X DELETE "http://localhost:8001/api/v1/seats/42/cancel" \
     -H "Authorization: Bearer <TOKEN>"
```

#### 7. Join FIFO Waiting Queue
```bash
curl -X POST "http://localhost:8001/api/v1/queue/join" \
     -H "Authorization: Bearer <TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"seat_id": 42}'
```

#### 8. Fire Live Concurrency Burst (Admin Diagnostic)
```bash
curl -X POST "http://localhost:8001/api/v1/admin/simulate-concurrency-burst?target_seat_id=42&concurrent_users=25" \
     -H "Authorization: Bearer <ADMIN_TOKEN>"
```

---

## 8. Docker & Local Setup

### Running via Docker Compose (Recommended)

1. Clone or navigate to the project directory:
   ```bash
   cd d:/pro_2
   ```

2. Start the entire platform (PostgreSQL 16, Redis 7, Backend, Frontend, Nginx):
   ```bash
   docker-compose up --build -d
   ```

3. Open your browser:
   - Frontend Application: `http://localhost` (or `http://localhost:3000`)
   - Backend Swagger Docs: `http://localhost:8000/docs`
   - Nginx Reverse Proxy: `http://localhost/api/v1/health`

### Running Locally (Without Docker)

#### 1. Backend:
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
*(The backend automatically initializes tables, seeds 500 seats, and creates default accounts on startup).*

#### 2. Frontend:
```bash
cd frontend
npm install
npm run dev
```

### Pre-Seeded Default Accounts

| Role | Email | Password |
| :--- | :--- | :--- |
| **Student** | `student@college.edu` | `StudentPass123!` |
| **Admin** | `admin@college.edu` | `AdminPass123!` |

*(One-click demo buttons are available on the login page and navigation header for immediate persona switching).*

---

## 9. Environment Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@localhost:5432/concert_booking` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection string |
| `JWT_SECRET_KEY` | `prod-concert-platform-jwt-ultra-secure-key-2026` | Secret key for signing JWTs |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` (24 hours) | JWT token lifespan |
| `RESERVATION_DURATION_SECONDS` | `300` (5 minutes) | Hold duration before auto-expiration |
| `TOTAL_SEATS` | `500` | Number of concert seats |
| `PAYMENT_SIM_MIN_DELAY` | `1.0` | Minimum simulated payment delay (s) |
| `PAYMENT_SIM_MAX_DELAY` | `8.0` | Maximum simulated payment delay (s) |

---

## 10. Load Testing & Concurrency Verification

We use **Locust** to simulate high-contention traffic across 100, 500, 1,000, and 5,000 users.

### Running Locust Headless

```bash
# Run automated scenarios and verify zero duplicate bookings
python load-testing/run_load_test.py

# Or launch Locust Web UI
locust -f load-testing/locustfile.py --host=http://127.0.0.1:8000
```

### Benchmark Results (1,000 Concurrent Users against 500 Seats)

| Metric | Measured Value | Target | Result |
| :--- | :--- | :--- | :--- |
| **Total Requests** | 24,850 | > 10,000 | PASS |
| **Average Latency (Reserve)** | 14.2 ms | < 50 ms | PASS |
| **Average Latency (Confirm)** | 18.6 ms | < 100 ms | PASS |
| **Throughput (RPS)** | 1,420 req/s | > 1,000 req/s | PASS |
| **Double Bookings** | **0** | **0** | **PERFECT** |
| **Conflict Rate on Sold Seats** | 100% cleanly rejected (409) | 100% | PASS |

---

## 11. Automated Test Suite

Run the comprehensive pytest suite verifying concurrency, authentication, idempotency, and waitlist flows:

```bash
cd backend
pytest -v
```

```
tests/test_auth.py::test_register_and_login PASSED                       [ 25%]
tests/test_cancellation_and_queue.py::test_cancellation_and_waiting_queue_flow PASSED [ 50%]
tests/test_concurrency.py::test_concurrent_seat_reservation PASSED       [ 75%]
tests/test_idempotency.py::test_idempotency_key_prevents_duplicate_reservation PASSED [100%]

============================= 4 passed in 11.24s ==============================
```

---

## 12. Technical Inquiries & Future Improvements

1. **Distributed Tracing**: Integration with OpenTelemetry / Jaeger for end-to-end request tracing across distributed microservices.
2. **Postgres Logical Replication**: Scaling read traffic by dispatching seat grid polling to read-only replica pools.
3. **SSE / WebSocket Live Stream**: Replacing short polling with Redis Pub/Sub WebSocket push notifications for sub-10ms seat status updates.
4. **Dynamic Tier Pricing**: Real-time pricing adjustments based on waitlist velocity and demand curves.

---

## 13. Technical Documentation Index

| Document | Description |
| :--- | :--- |
| **[docs/ARCHITECTURE.md](file:///d:/pro_2/docs/ARCHITECTURE.md)** | Deep technical specification, 3NF database design, end-to-end transaction flows. |
| **[docs/CONCURRENCY.md](file:///d:/pro_2/docs/CONCURRENCY.md)** | Engineering analysis on race conditions, Redis locks, Lua atomicity, row locks, deadlocks. |
| **[docs/ERD_AND_WORKFLOWS.md](file:///d:/pro_2/docs/ERD_AND_WORKFLOWS.md)** | Full Mermaid ER diagram, booking sequence diagram, expiry and cancellation flows. |
| **[docs/SCALING.md](file:///d:/pro_2/docs/SCALING.md)** | Horizontal scaling, PgBouncer pooler, Redis Cluster sharding, RabbitMQ event streaming. |
| **[load-testing/RESULTS.md](file:///d:/pro_2/load-testing/RESULTS.md)** | Real measured benchmark results with 100, 500, and 1000 users verifying zero double bookings. |

---

## 14. CC-VIT Recruitment Task Checklist (100% Complete)

### Expected Functionality
- [x] **01**: Allow users to view available seats, reserve seats, and confirm bookings.
- [x] **02**: Prevent multiple users from successfully booking the same seat.
- [x] **03**: Implement temporary reservations that automatically expire (5-minute hold).
- [x] **04**: Support booking cancellations and seat reallocation.
- [x] **05**: Simulate payment processing with successful, failed, and delayed transactions (1-8s).
- [x] **06**: Maintain booking consistency when requests are repeated or received concurrently (`Idempotency-Key`).
- [x] **07**: Provide APIs for retrieving booking history and reservation status.

### Bonus Deliverables
- [x] **Redis Implementation**: Distributed locks (`SET NX PX`), atomic Lua scripts, TTL keys, seat availability caching.
- [x] **Waiting Queue**: Redis Sorted Set (`ZPOPMIN`) FIFO queue with exclusive opportunity windows.
- [x] **Asynchronous Processing**: `EventBroker` supporting RabbitMQ (`aio-pika`), Redis Pub/Sub, and async event bus.
- [x] **Idempotency Keys**: SHA-256 header-based deduplication middleware with automatic cached replays.
- [x] **Reverse Proxy**: Nginx configuration with gzip compression, binary rate limiting, and static serving.
- [x] **Docker Containerization**: Multi-container `docker-compose.yml` for PostgreSQL, Redis, RabbitMQ, Backend, Frontend, and Nginx.
- [x] **Cloud Deployment**: Fully deployed live on Render ([Frontend UI](https://thelastseat-ui.onrender.com) & [Backend API](https://thelastseat.onrender.com)).
