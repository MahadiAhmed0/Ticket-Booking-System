# Ticket Booking System — Q&A

A companion guide to the README. Covers how the files connect, what each
microservice does, the exact request/event flow, and answers to the questions
most likely to come up in a review / viva.

---

## Table of Contents

1. [Architecture at a glance](#1-architecture-at-a-glance)
2. [How the files are connected](#2-how-the-files-are-connected)
3. [What each microservice does](#3-what-each-microservice-does)
4. [The booking flow, step by step](#4-the-booking-flow-step-by-step)
5. [The cancel flow, step by step](#5-the-cancel-flow-step-by-step)
6. [How events "fire" (RabbitMQ in detail)](#6-how-events-fire-rabbitmq-in-detail)
7. [Why the Service Registry yaml looks different](#7-why-the-service-registry-yaml-looks-different)
8. [Auth & roles explained](#8-auth--roles-explained)
9. [Database-per-service](#9-database-per-service)
10. [Resilience & service discovery](#10-resilience--service-discovery)
11. [Common Q&A for review](#11-common-qa-for-review)

---

## 1. Architecture at a glance

```
                        ┌─────────────────────────────┐
                        │         API GATEWAY         │  :8080
                        │  routes + CORS + JWT check  │
                        │  (checks ADMIN role only)   │
                        └──────┬──────┬──────┬────────┘
                               │      │      │
        ┌──────────────────────┼──────┼──────┼──────────────────────────┐
        │            routes by path (lb://SERVICE-NAME via Eureka)      │
        ▼                      ▼      ▼      ▼                          ▼
   USER-SERVICE         EVENT-SERVICE  BOOKING-SERVICE   PAYMENT-SERVICE
   :9002  users_db      :9003  events_db  :9004 bookings_db  :9005 payments_db
        │                        ▲              │  ▲                       │
        │                        │              │  │                       │
        │    SYNC REST (load-balanced)          │  └── SYNC: /payments ───┘
        │◄──────────────────────────────────────┘                         │
        │   GET /users/{id} validates user                                │
        └────────────► BOOKING-SERVICE posts /events/{id}/book ──────────► EVENT-SERVICE

   RabbitMQ exchanges (async):
     payment-exchange  : PAYMENT-SERVICE publishes payment.completed / payment.failed
     booking-exchange  : BOOKING-SERVICE publishes booking.confirmed / booking.cancelled

   NOTIFICATION-SERVICE :9006 consumes from both exchanges, "sends" emails
   SERVICE-REGISTRY     :8761 every service (incl. gateway) registers here
   frontends (nginx)    :3000 dashboard / :3001 user / :3002 admin
```

Everything outside the boxes above talks only to the **API Gateway** (`:8080`).
Internal services call each other **by logical name** (`http://EVENT-SERVICE/...`)
through the Eureka-aware `@LoadBalanced RestTemplate`.

---

## 2. How the files are connected

### 2.1 One folder per deployable unit

Each microservice and each frontend is a self-contained folder with its own
`pom.xml`, `Dockerfile`, `src/main/resources/application.yml`, and Java sources.
`docker-compose.yml` at the root builds and wires them all together.

```
Ticket-Booking-System/
├── docker-compose.yml          # defines all 14 containers + networks + health checks
├── user-service/               # registration, login, JWT, roles (Mongo users_db)
├── event-service/              # events + atomic seat lock/release (Mongo events_db)
├── booking-service/            # orchestrates bookings (Mongo bookings_db) + RabbitMQ
├── payment-service/            # simulated payment (Mongo payments_db) + RabbitMQ
├── notification-service/       # async email log (in-memory) + RabbitMQ
├── api-gateway/                # single entry point :8080, admin JWT filter
├── service-registry/           # Eureka :8761
├── frontend/                   # developer dashboard :3000
├── frontend-app/               # user side :3001
├── frontend-admin/             # admin side :3002
└── QnA.md / README.md          # this guide + run instructions
```

### 2.2 How configuration connects the services

Every service's `application.yml` contains the same three "wiring" blocks:

| Block | Purpose |
|---|---|
| `server.port` | which port the service listens on |
| `spring.application.name` | the **logical name** other services use to reach it (must match the name in Eureka + gateway routes) |
| `eureka.client` | register-with-eureka + `defaultZone` — where to announce itself |

The **API Gateway** `application.yml` adds `spring.cloud.gateway.routes`, mapping
URL paths to logical names:

```yaml
- id: user-service
  uri: lb://USER-SERVICE     # "lb://" = load-balance via Eureka
  predicates: [Path=/users/**]
```

So a browser calling `http://localhost:8080/events` hits the gateway, which
looks up `EVENT-SERVICE` in Eureka and forwards the request.

### 2.3 How the code connects

- **Frontend → Gateway:** every frontend stores `const API = "http://localhost:8080"` and
  calls only that base URL (see `frontend-app/app.js:1`).
- **Gateway → Services:** path routes with `lb://NAME` (from `application.yml`).
- **Booking Service → User / Event / Payment:** a single `@LoadBalanced RestTemplate`
  (`booking-service/.../config/RestTemplateConfig.java`) that turns logical names
  into real addresses using Eureka:
  - `GET http://USER-SERVICE/users/{id}`
  - `POST http://EVENT-SERVICE/events/{id}/book?seats=N`
  - `POST http://PAYMENT-SERVICE/payments`
- **Payment → Booking / Notification:** RabbitMQ (no REST). See [section 6](#6-how-events-fire-rabbitmq-in-detail).
- **Booking → Notification:** RabbitMQ (`booking-exchange`).
- **Eureka → everyone:** each service pings `SERVICE-REGISTRY:8761` to register/heartbeat.

### 2.4 Docker wiring

`docker-compose.yml` injects environment variables that override the yml defaults:

| Env var | Used by | Example |
|---|---|---|
| `EUREKA_URL` | all services | `http://service-registry:8761/eureka/` |
| `MONGO_URI` | user/event/booking/payment | `mongodb://mongo-users:27017/users_db` |
| `RABBIT_HOST` | booking/payment/notification | `rabbitmq` |

Each service's `Dockerfile` is identical in shape:

```
maven:3.9-eclipse-temurin-17  ──build──▶  java -jar app.jar
         (stage 1)                         (stage 2, tiny JRE image)
```

`depends_on` in compose only starts services *after* their DB/registry/rabbitmq
is healthy (healthchecks in the compose file), and `restart: on-failure` lets
services recover if they start before a dependency is ready.

---

## 3. What each microservice does

### 3.1 Service Registry (Eureka) — `:8761`
- Central "phone book". Every service registers itself (name + IP + port) and
  sends a heartbeat every 30s.
- The gateway uses it for routing; the booking service uses it to resolve
  `http://EVENT-SERVICE`, `http://USER-SERVICE`, `http://PAYMENT-SERVICE`.
- **Only service with no `eureka.client` registration** — see [section 7](#7-why-the-service-registry-yaml-looks-different).

### 3.2 API Gateway — `:8080`
- The **only** public entry point. Routes by path prefix.
- Enforces CORS so the three browser frontends can call it.
- Runs `AdminAuthFilter`, a `GlobalFilter` that checks JWT role **ADMIN** on
  admin routes (`POST /events`, `PUT/DELETE /events/**`, `GET /bookings/stats`,
  `POST /users/admin/...`). No token → 401, wrong role → 403.
- It does **not** protect user routes — the User Service does that itself (see below).

### 3.3 User Service — `:9002` (`users_db`)
- Owns the `users` collection. Default role `USER`.
- `POST /users` register · `POST /users/login` returns a **JWT** (HS256, secret
  in `application.yml`). The token carries `sub` = userId and a `role` claim.
- `POST /users/admin/register` creates ADMIN accounts (protected at the gateway).
- `JwtInterceptor` (registered in `WebConfig`) protects `GET /users/me` and
  `PUT/DELETE /users/{id}` — parses the bearer token and puts `userId` in the request.
- `GET /users/{id}` is **intentionally open** so the Booking Service can validate users.
- `DataInitializer` creates the bootstrap `admin@example.com / admin123` on first boot.

### 3.4 Event Service — `:9003` (`events_db`)
- Owns the `events` collection (name, venue, date, category, price, totalSeats, bookedSeats).
- Public reads: `GET /events`, `GET /events/{id}`.
- Admin CRUD (protected at the gateway): `POST /events`, `PUT/DELETE /events/{id}`.
- **Internal endpoints used by Booking Service only** (called via Eureka name, not by browsers):
  - `POST /events/{id}/book?seats=N` — **atomically** locks seats; `synchronized` +
    a `CONFLICT` (409) if not enough seats remain.
  - `POST /events/{id}/cancel?seats=N` — releases seats back.

### 3.5 Booking Service — `:9004` (`bookings_db`)
- The **orchestrator**. `createBooking`:
  1. validates the user (sync → User Service),
  2. locks seats (sync → Event Service),
  3. saves the booking as **PENDING**,
  4. charges (sync → Payment Service).
- Consumes `PaymentCompleted` / `PaymentFailed` events and **finalizes** the order
  (`BookingPaymentListener`): CONFIRMED on success, CANCELLED + seat release on failure.
- Publishes `BookingConfirmed` / `BookingCancelled` events for the Notification Service.
- `GET /bookings/stats` computes admin analytics (counts + revenue from CONFIRMED only).
- `cancelBooking` checks ownership (403 if not the owner), releases seats, publishes `BookingCancelled`.

### 3.6 Payment Service — `:9005` (`payments_db`)
- Simulated payment gateway: sleeps 1s (pretend external call), succeeds if
  `amount <= 1000`, fails above.
- Saves a `Payment` row, then **publishes** `PaymentCompleted` or `PaymentFailed`
  to RabbitMQ. Never talks to other services synchronously — it only fires events.

### 3.7 Notification Service — `:9006` (in-memory)
- Pure consumer. Listens on 4 queues (booking confirmed/cancelled + payment
  completed/failed), "sends" an email by appending to an in-memory list
  (`EmailLogService`) and printing to logs.
- `GET /notifications` returns the log so frontends can show the 🔔 bell.
- No database — a real implementation would call an SMTP/email gateway.

---

## 4. The booking flow, step by step

Scenario: a logged-in user buys tickets for an event.

1. **Browser** → `POST http://localhost:8080/bookings`
   body `{ userId, eventId, seats }` (via the gateway; `frontend-app/app.js`).
2. **Gateway** routes `/bookings/**` → `lb://BOOKING-SERVICE`.
3. **Booking Service** `createBooking`:
   - `GET http://USER-SERVICE/users/{id}` → user exists? If not → 400.
   - `POST http://EVENT-SERVICE/events/{id}/book?seats=N` → seats locked atomically.
     If full → 409, and nothing is saved yet.
   - Saves booking `status=PENDING` with `totalPrice = price * seats`.
   - `POST http://PAYMENT-SERVICE/payments` `{ bookingId, amount }`.
4. **Payment Service**: sleeps 1s, decides `SUCCESS` or `FAILED`, saves the Payment,
   publishes an event to `payment-exchange`:
   - `payment.completed → "bookingId|amount|SUCCESS"`
   - `payment.failed    → "bookingId|amount|FAILED"`
5. **Booking Service** (`BookingPaymentListener`, async) consumes the event:
   - **Completed** → booking `CONFIRMED`, then publishes to `booking-exchange`:
     `"BOOKING_CONFIRMED|bookingId|userEmail|eventName|totalPrice"`.
   - **Failed** → releases seats via `EVENT-SERVICE .../cancel`, booking `CANCELLED`.
6. **Notification Service** (async) consumes from both exchanges and logs the
   confirmation email / payment receipt / failure notice.
7. **Frontend** polls `GET /bookings/{id}` until it sees CONFIRMED (or reads the
   failure from the `402` error), then re-renders the ticket stub.

Note: if payment **immediately fails**, `createBooking` throws `402 Payment Required`
and lets the async `PaymentFailed` handler do the seat release — deliberately NOT
done in the request thread, to avoid a race (see comment in `BookingService.java`).

### State machine of a booking

```
              createBooking()
   (none) ────────────────────► PENDING ────── PaymentCompleted ───► CONFIRMED
                                    │
                                    └── PaymentFailed (event) ────────► CANCELLED (seats released)
```

`cancelBooking()` moves CONFIRMED → CANCELLED (releases seats, fires `BookingCancelled`).

---

## 5. The cancel flow, step by step

1. **Browser** → `POST http://localhost:8080/bookings/{id}/cancel` `{ userId }`.
2. **Gateway** routes to Booking Service.
3. `cancelBooking`:
   - booking not found → 404; not your booking → **403**; already cancelled → idempotent return;
     still PENDING → 400 "try again shortly" (payment may not be finished).
   - `POST EVENT-SERVICE /events/{id}/cancel?seats=N` releases seats.
   - status → `CANCELLED`, save.
   - publishes `"BOOKING_CANCELLED|bookingId|userEmail|eventName"` to `booking-exchange`.
4. **Notification Service** consumes `booking.cancelled` and "sends" the cancellation email.

---

## 6. How events "fire" (RabbitMQ in detail)

The async side uses **Direct Exchanges** and **durable queues**.

### 6.1 Who publishes, who consumes

| Exchange | Routing key | Publisher | Queues (consumers) |
|---|---|---|---|
| `payment-exchange` | `payment.completed` | Payment Service | `payment-completed-booking-queue` (Booking), `payment-completed-notification-queue` (Notification) |
| `payment-exchange` | `payment.failed` | Payment Service | `payment-failed-booking-queue` (Booking), `payment-failed-notification-queue` (Notification) |
| `booking-exchange` | `booking.confirmed` | Booking Service | `booking-confirmed-notification-queue` (Notification) |
| `booking-exchange` | `booking.cancelled` | Booking Service | `booking-cancelled-notification-queue` (Notification) |

### 6.2 Why each consumer declares its own queue?

Because with a **direct exchange**, every message is routed to **one** consumer per
queue. If Booking and Notification shared a single queue, RabbitMQ would deliver each
message to only one of them (round-robin) and the other would starve. Giving each
consumer its own queue bound to the same exchange means **both** get every message.
This is documented in the code comments of both `RabbitConfig` classes.

### 6.3 Message format

Plain strings split by `|`:

- `PaymentService` publishes: `bookingId|amount|SUCCESS` or `bookingId|amount|FAILED`
- `BookingService` publishes: `BOOKING_CONFIRMED|bookingId|userEmail|eventName|totalPrice`
  and `BOOKING_CANCELLED|bookingId|userEmail|eventName`

### 6.4 Why "events" rather than more REST calls?

- **Decoupling**: Booking/Payment/Notification never wait on each other over HTTP for
  the finalize/email steps. Payment fires-and-forgets; Booking reacts; Notification reacts.
- **Resilience**: if the Notification Service is down, messages stay in queues and are
  delivered when it returns (durable queues).
- **Latency**: the user gets a fast response; confirmation is finalized asynchronously
  (~1–2s) and the frontend polls for the result.

### 6.5 How to watch an event fire live

- RabbitMQ UI: http://localhost:15672 (guest/guest) → Queues tab → message counts rise.
- Booking Service logs: `[BOOKING] ... CONFIRMED via PaymentCompleted event`.
- Payment logs: `[PAYMENT] PaymentCompleted event published for booking ...`.
- Notification logs: `[NOTIFICATION] ...` entries.
- `GET http://localhost:8080/notifications` returns the sent-email list.

---

## 7. Why the Service Registry yaml looks different

Compare `service-registry/src/main/resources/application.yml` with, say,
`user-service/src/main/resources/application.yml`:

```yaml
# service-registry/application.yml
server:
  port: 8761
eureka:
  client:
    register-with-eureka: false     # ← unusual!
    fetch-registry: false           # ← unusual!
  server:
    enable-self-preservation: false
```

The differences and why:

| Setting | Meaning | Why it's there |
|---|---|---|
| No `spring.cloud.gateway`, no `mongodb`, no `rabbitmq`, no `jwt.*` | The registry needs none of those | It is the *coordinator*, not a business service |
| `register-with-eureka: false` | It does **not** register itself as a service | A server can't discover a server with nothing to route to; it would only create a useless self-entry (and an error loop) |
| `fetch-registry: false` | It does **not** pull the registry from another server | There's no other Eureka to copy from — it *is* the source of truth |
| `enable-self-preservation: false` | Disables Eureka's "self-preservation" mode | In dev/demo, self-preservation would keep dead instances listed for a long time after a kill — making `docker kill` demos confusing. Disabling it lets stale entries expire in ~90s so the gateway recovers quickly |
| `max-http-request-header-size: 32KB` | Bigger HTTP headers | Matches the other services (JWT + cookies get large) |

Everything else (user/event/booking/payment/notification/gateway) sets
`register-with-eureka: true` and `fetch-registry: true` because those are
**clients** that announce themselves and need to resolve each other.

---

## 8. Auth & roles explained

- **User Service issues JWTs** signed with `jwt.secret`
  (`ticket-booking-system-swe4602-secret-key-2026`) — the same secret is copied into
  the API Gateway yml so the gateway can verify them too.
- Token claims: `sub` = userId, `email`, `role` (`USER` or `ADMIN`), exp = 1 hour.
- **Two independent guards:**
  1. **Gateway `AdminAuthFilter`** (WebFlux `GlobalFilter`) — blocks admin routes for
     non-ADMIN tokens. This is the front door.
  2. **User Service `JwtInterceptor`** (Servlet interceptor) — protects `/users/me` and
     `PUT/DELETE /users/{id}` directly, in case someone bypasses the gateway.

| Request | No token | USER token | ADMIN token |
|---|---|---|---|
| `POST /events`, `PUT/DELETE /events/**`, `GET /bookings/stats`, `POST /users/admin/register` | 401 | 403 | 200 |
| `GET /users/me`, `PUT /users/{id}` | 401 | 200 (own id) / 403 (other's id) | 200 |

The Booking Service's internal calls to `GET /users/{id}` and the event book/cancel
endpoints stay open because they are only reachable on the Docker network by name,
not from the browser.

---

## 9. Database-per-service

Each service owns its own Mongo instance — no shared database. This enforces the
microservice boundary: services can only share data through **API calls** or
**events**, never by reading each other's tables.

| Service | Mongo container | Host port | DB |
|---|---|---|---|
| User | `mongo-users` | 27017 | `users_db` |
| Event | `mongo-events` | 27018 | `events_db` |
| Booking | `mongo-bookings` | 27019 | `bookings_db` |
| Payment | `mongo-payments` | 27020 | `payments_db` |
| Notification | — (in-memory) | — | — |

Because services are decoupled, the Booking model stores denormalized copies of
user/event data (name, email, event name, price). This is intentional: it means the
booking record is readable/queryable even if the User or Event service is down.

---

## 10. Resilience & service discovery

- **Load balancing:** `@LoadBalanced RestTemplate` + `lb://` gateway routes = client-side
  load balancing through Eureka. If you scale a service to 2+ instances, calls spread across them.
- **Self-healing registration:** services retry registration; after a restart they
  re-register and appear in Eureka automatically — no other service needs a restart.
- **Stale instance handling:** a graceful `docker compose stop` unregisters immediately.
  A hard `docker kill` leaves a stale entry up to ~90s (lease expiry) — during which the
  gateway may return 503 — then it disappears. `enable-self-preservation: false` keeps
  this expiry fast (see section 7).
- **Async durability:** RabbitMQ queues are durable (`new Queue(name, true)`), so events
  published while a consumer is down are not lost.
- **Idempotency guards:** the booking listeners only act on bookings that are still
  `PENDING` (`!PENDING → return`), so a redelivered message can't double-confirm.

---

## 11. Common Q&A for review

**Q: Why does the frontend talk only to the API Gateway and not to services directly?**
A: One entry point → uniform CORS, centralized admin auth, routing, and the ability to
move/scale services without touching frontends. Browsers shouldn't know (or trust)
internal service addresses.

**Q: What's the difference between the sync REST calls and the RabbitMQ events?**
A: REST = request/response where the answer is needed immediately (does the user exist,
can seats be locked, was payment accepted). Events = fire-and-forget notifications of
something that already happened (payment result, booking finalization), letting
dependent services react independently.

**Q: What happens if seats are locked but the payment never completes?**
A: The booking stays `PENDING`. There is no scheduler that times out stale PENDING
bookings in this version — a production system would add a timeout/expiry job to release
stale seat locks.

**Q: Why is seat-locking `synchronized`?**
A: To serialize seat operations within one Event Service instance so two simultaneous
bookings can't both pass the "enough seats" check (avoids overselling). With multiple
instances you'd want a real distributed lock (Mongo `findAndModify`, or a Redis lock).

**Q: How would you scale this for real traffic?**
A: Add service instances behind Eureka (compose `scale`), move Mongo to replicas,
make RabbitMQ clustered, replace in-memory email log with a real provider, add
timeouts/retries/CircuitBreaker around the sync calls, and add a booking-expiry job.

**Q: What does `@LoadBalanced` do?**
A: It wraps the `RestTemplate` with a load-balancer interceptor so
`http://EVENT-SERVICE/...` is resolved via Eureka to a real, currently-registered
instance (and load-balanced if several exist) instead of a hardcoded URL.

**Q: Why is the JWT secret in both the User Service and the Gateway yml files?**
A: The User Service signs tokens; the gateway must verify the role claim without calling
the user service on every request. Shared secret = gateway can verify offline. In
production this would be a vault/secret-manager value, not a committed literal.

**Q: How does the admin know who is an admin?**
A: The `role` field on the User document (default `USER`). `DataInitializer` seeds one
`ADMIN`; the gateway checks `role == "ADMIN"` from the JWT claim; more admins are
created via `POST /users/admin/register` (itself admin-only).

**Q: What if the Notification Service is down during a booking?**
A: Nothing breaks. The payment/booking events sit in durable queues and are delivered
when it comes back. The email log is in-memory though, so the log itself resets on restart.

**Q: What is `frontend/nginx.conf`?**
A: The developer dashboard and admin panel run behind nginx; this config raises the
`large_client_header_buffers` so big JWT cookies don't get rejected
(hence the "Header Or Cookie Too Large" fix in the README troubleshooting).

**Q: Why does Payment Service sleep for 1 second?**
A: It simulates the latency of calling a real external payment gateway. The rest of the
flow (async events) means this delay doesn't block other bookings.

**Q: How do I trace one full booking in the logs?**
A: `docker compose logs -f booking-service payment-service notification-service event-service`
then buy a ticket — you'll see the sync calls, the `[PAYMENT]` event, the
`[BOOKING] ... CONFIRMED`, and the `[NOTIFICATION]` email in sequence.