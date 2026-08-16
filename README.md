# Ticket Booking System

**A Microservices-Based Architecture**

| | |
|---|---|
| **Course** | SWE 4602 — Software Design & Architectures |
| **Department** | CSE |
| **Institution** | Islamic University of Technology |
| **Submission Date** | July 10, 2026 |

### Team Members

| # | Name | ID |
|---|------|-----|
| 1 | Muhtasim Zawad | 220042131 |
| 2 | Abdullah Al Musaddiq | 220042135 |
| 3 | Golam Mahadi Ahmed | 220042163 |
| 4 | Navid Ibrahim | 220042101 |

---

## 1. System Overview

The system is a Ticketmaster-style ticket booking platform split into **two sides**:

- **ADMIN side** — admins log in with an admin account and manage the platform:
  create / edit / delete events, view all bookings, see sales analytics, and create
  more admin accounts.
- **USER side** — normal users browse events, register / log in (JWT), buy tickets
  (with simulated payment), and view their tickets.

Behind both sides are **5 microservices** plus supporting infrastructure:

| Service | Port | Database | Responsibility |
|---|---|---|---|
| User Service | 9002 | Mongo `users_db` (27017) | Registration, login, JWT issuing/validation, roles (USER/ADMIN), profile |
| Event Service | 9003 | Mongo `events_db` (27018) | Events, seat availability, atomic seat lock/release |
| Booking Service | 9004 | Mongo `bookings_db` (27019) | Orchestrates booking: user + event + payment calls, consumes payment events, publishes `BookingConfirmed` |
| Payment Service | 9005 | Mongo `payments_db` (27020) | Simulated payment (fails > $1000), publishes `PaymentCompleted` / `PaymentFailed` |
| Notification Service | 9006 | in-memory | Consumes events via RabbitMQ, "sends" confirmation/receipt emails |
| API Gateway | 8080 | — | Single entry point, routing, CORS, **JWT role filtering for admin routes** |
| Service Registry (Eureka) | 8761 | — | Service discovery |
| RabbitMQ | 5672 / 15672 | — | Async event broker |

**Communication:**
- **Synchronous (REST):** Booking → User (validate), Booking → Event (lock seats),
  Booking → Payment (accept/reject). Load-balanced via Eureka (`@LoadBalanced RestTemplate`).
- **Asynchronous (RabbitMQ):** Payment publishes `PaymentCompleted`/`PaymentFailed` →
  Booking consumes them to finalize/cancel the order. Booking publishes
  `BookingConfirmed` → Notification sends the confirmation email.
- **Auth:** JWT (HS256) issued by User Service; the API Gateway parses tokens and
  blocks admin routes unless the token has role `ADMIN`.

---

## 2. Run Everything

Prerequisite: **Docker Desktop** running. From the project root:

```powershell
docker compose up --build -d    # build + start everything (first time)
docker compose up -d            # restart without rebuilding
docker compose ps               # see all 14 containers
docker compose down             # stop everything
docker compose down -v          # stop + wipe databases (fresh start)
docker compose logs -f <name>   # follow logs of one container
```

### URLs

| URL | What |
|---|---|
| http://localhost:3001 | **USER side** — ticketbook app (neo-brutalism, Ticketmaster-style) |
| http://localhost:3002 | **ADMIN side** — admin panel (events, bookings, users, stats) |
| http://localhost:3000 | Developer dashboard — live activity feed, service status pills, manual steps |
| http://localhost:8080 | API Gateway |
| http://localhost:8761 | Eureka dashboard |
| http://localhost:15672 | RabbitMQ management UI (guest/guest) |
| localhost:27017–27020 | MongoDB instances (users / events / bookings / payments) |

### Default credentials

| Account | Email | Password | Role |
|---|---|---|---|
| Bootstrap admin (auto-created) | `admin@example.com` | `admin123` | ADMIN |
| Register yourself | any | any | USER |

The admin account is created automatically by the User Service on first startup
(`DataInitializer`). More admins can be added from the Admin Panel.

---

## 3. How to Test — ADMIN Side

Open http://localhost:3002 → log in with `admin@example.com / admin123`.

1. **Stats cards** — total events, confirmed/cancelled bookings, revenue, users. Live data.
2. **Events tab → CREATE EVENT** — fill the form, click CREATE EVENT.
   Watch the event appear in the table.
3. **EDIT** — click EDIT on a row, the form switches to edit mode, change the price, SAVE.
4. **DELETE** — click DELETE on a row.
5. **BOOKINGS tab** — all bookings from all users with status badges.
6. **USERS tab** — all registered users with roles. Create another admin with the form below.
7. **Negative tests** (the auth is enforced at the gateway):
   - Open a private window → try `POST http://localhost:8080/events` with no token → **401**
   - Log in as a normal user on the user site, copy the token, use it on the admin route → **403**

Expected auth matrix:

| Request | No token | USER token | ADMIN token |
|---|---|---|---|
| `POST /events` | 401 | 403 | 200 |
| `PUT /events/{id}` | 401 | 403 | 200 |
| `DELETE /events/{id}` | 401 | 403 | 200 |
| `GET /bookings/stats` | 401 | 403 | 200 |
| `POST /users/admin/register` | 401 | 403 | 200 |

---

## 4. How to Test — USER Side

Open http://localhost:3001 (the Ticketmaster-style app).

1. **Browse** — events grid with category filters and search (works without login).
2. **Sign In / Register** — create an account, you get logged in automatically
   (login calls `POST /users/login`, returns a JWT stored in the browser).
3. **Buy tickets** — open an event, pick quantity, BUY NOW. The booking goes
   `PENDING` → `CONFIRMED` (async via RabbitMQ, ~2s). A green ticket confirmation appears.
4. **MY TICKETS** — ticket stubs with status badges.
5. **Cancel a booking** — open MY TICKETS → CANCEL on a CONFIRMED ticket. The booking
   becomes CANCELLED, the seats are returned to the event, and a cancellation
   notification arrives in the 🔔 NOTIFICATIONS bell. (Cancelling someone else's
   booking is rejected — 403.)
6. **Payment failure demo** — buy tickets worth more than $1000 (e.g. many expensive
   seats). Payment Service rejects → **Payment Failed** shown, seats are released
   (visible in the events grid), booking is CANCELLED, and a failure email is "sent".
7. **Log out / log in** — session survives refresh (localStorage).

### JWT test with curl (user side)

```powershell
# register
curl -X POST http://localhost:8080/users -H "Content-Type: application/json" -d '{"name":"Test","email":"test@example.com","password":"pass123"}'

# login -> JWT
curl -X POST http://localhost:8080/users/login -H "Content-Type: application/json" -d '{"email":"test@example.com","password":"pass123"}'

# protected: my profile (needs the token)
curl http://localhost:8080/users/me -H "Authorization: Bearer <token>"

# protected: update my profile
curl -X PUT http://localhost:8080/users/<id> -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"name":"New Name"}'

# wrong password -> 401
curl -X POST http://localhost:8080/users/login -H "Content-Type: application/json" -d '{"email":"test@example.com","password":"wrong"}'
```

---

## 5. How to Test — Microservices & Resilience

1. **Eureka** (http://localhost:8761) — all services + gateway listed as UP.
2. **Stop a service on purpose** (this is the presentation demo):

   ```powershell
   docker compose stop event-service
   ```

   - Dashboard (3000): EVENT pill red within 5s, red banner appears, "EVENT is DOWN",
     Events tab shows the error.
   - User site: browsing fails, other functions keep working (service isolation).
   - Start it again: `docker compose start event-service` — everything recovers
     automatically (re-registers with Eureka). **No other service needs restarting.**
3. **Hard kill vs graceful stop** — `docker compose stop` unregisters immediately;
   a hard `docker kill` leaves a stale Eureka entry for up to ~90s (lease expiry),
   during which the gateway returns 503. Both recover automatically.
4. **Watch the async chain live** — dashboard (3000) "Live Activity" feed traces the
   real inter-service calls: sync REST calls + RabbitMQ events observed by polling.

### RabbitMQ inspection (15672, guest/guest)

- Queues: `payment-completed-booking-queue`, `payment-failed-booking-queue`,
  `booking-confirmed-notification-queue`, `payment-completed-notification-queue`,
  `payment-failed-notification-queue` — on exchanges `payment-exchange` / `booking-exchange`.
- Publish a test message to `payment-exchange` with routing key `payment.completed`
  and watch the consumers react.

### MongoDB inspection

```powershell
docker exec -it mongo-users mongosh users_db       # db.users.find().pretty()
docker exec -it mongo-events mongosh events_db     # db.events.find().pretty()
docker exec -it mongo-bookings mongosh bookings_db # db.bookings.find().pretty()
docker exec -it mongo-payments mongosh payments_db # db.payments.find().pretty()
```

Book a ticket and watch a document appear in `bookings_db` + `payments_db` while
`events_db.bookedSeats` increments.

---

## 6. API Reference

| Method + Path | Auth | Service | Purpose |
|---|---|---|---|
| `POST /users` | public | User | register (role USER) |
| `POST /users/login` | public | User | login → JWT + role |
| `POST /users/admin/register` | ADMIN | User | create admin account |
| `GET /users` | public | User | list users |
| `GET /users/{id}` | public | User | get user (used by Booking Service) |
| `GET /users/me` | USER (JWT) | User | own profile |
| `PUT /users/{id}` | USER (own id) | User | update own profile |
| `POST /users/validate` | Bearer token | User | validate a JWT (for other services) |
| `GET /events` | public | Event | browse events |
| `GET /events/{id}` | public | Event | event detail |
| `POST /events` | ADMIN | Event | create event |
| `PUT /events/{id}` | ADMIN | Event | update event |
| `DELETE /events/{id}` | ADMIN | Event | delete event |
| `POST /events/{id}/book?seats=N` | internal | Event | lock seats (Booking Service) |
| `POST /events/{id}/cancel?seats=N` | internal | Event | release seats (Booking Service) |
| `POST /bookings` | public | Booking | create booking (full flow) |
| `POST /bookings/{id}/cancel` | owner (`userId` in body) | Booking | cancel booking — releases seats, publishes `BookingCancelled` |
| `GET /bookings` | public | Booking | all bookings |
| `GET /bookings/{id}` | public | Booking | booking detail |
| `GET /bookings/stats` | ADMIN | Booking | analytics (counts + revenue) |
| `POST /payments` | internal | Payment | process payment |
| `GET /payments` | public | Payment | payment records |
| `GET /notifications` | public | Notification | emails "sent" |

---

## 7. Booking Flow (what happens on one booking)

1. User clicks BUY → `POST /bookings` through the Gateway.
2. Booking Service **sync**-calls User Service (`GET /users/{id}` — user exists?),
   Event Service (`POST /events/{id}/book` — seats locked, 409 if full).
3. Booking is saved as **PENDING**; Booking Service **sync**-calls Payment Service.
4. Payment Service sleeps 1s (simulated gateway), saves the payment, and **publishes**
   `PaymentCompleted` (or `PaymentFailed` if amount > $1000) to RabbitMQ.
5. **Async:** Booking Service consumes the event → sets CONFIRMED → publishes
   `BookingConfirmed`. On failure it releases the seats and sets CANCELLED.
6. **Async:** Notification Service consumes the payment + booking events → logs
   "emails" (receipt + confirmation).
7. The frontends poll the APIs and reflect the state changes when they actually happen.

---

## 8. Project Structure

```
Ticket-Booking-System/
├── user-service/              # User Service (9002) — registration, login, JWT, roles
├── event-service/             # Event Service (9003) — events, seats, admin CRUD
├── booking-service/           # Booking Service (9004) — orchestration + stats
├── payment-service/           # Payment Service (9005) — simulated payment + events
├── notification-service/      # Notification Service (9006) — async email log
├── api-gateway/               # Gateway (8080) — routing, CORS, admin JWT filter
├── service-registry/          # Eureka (8761)
├── frontend/                  # Developer dashboard (3000) — live activity, status, steps
├── frontend-app/              # USER side (3001) — Ticketmaster-style neo-brutalism app
├── frontend-admin/            # ADMIN side (3002) — admin panel (neo-brutalism)
├── docker-compose.yml         # everything (14 containers)
└── README.md
```

---

## 9. Troubleshooting

| Problem | Fix |
|---|---|
| Frontend shows `400 Request Header Or Cookie Too Large` | Clear cookies for localhost, or use incognito (header limits are already raised) |
| `Connect to service-registry:8761 failed` in logs | Normal during restarts — Eureka clients retry and self-heal |
| Gateway returns 503 right after restarting a service | Wait up to ~90s for the Eureka lease/registry refresh |
| Port already allocated | `docker ps -a` — remove the orphan container holding the port (`docker rm -f <name>`) |
| `POST /events` returns 401 | Create events only from the Admin Panel / with an ADMIN token |
| Mongo timeouts | Ensure the matching `mongo-*` container is healthy (`docker compose ps`) |
