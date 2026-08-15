# Ticket Booking System

**A Microservices-Based Architecture**

Course: **SWE 4602 — Software Design & Architectures**
Department of **CSE**, **Islamic University of Technology**

| Team Member | ID |
|-------------|-------|
| Muhtasim Zawad | 220042131 |
| Abdullah Al Musaddiq | 220042135 |
| Golam Mahadi Ahmed | 220042163 |
| Navid Ibrahim | 220042101 |

---

## 1. Description

This project demonstrates the principles of microservices architecture in a realistic, moderately
complex domain. The system is decomposed into independently deployable services, each responsible for
a specific business capability, rather than a single monolithic application.

The project demonstrates key architectural patterns used in production-grade distributed systems:

- **Service registration and discovery** (Netflix Eureka)
- **API Gateway routing** as a single entry point for all clients
- **Synchronous inter-service communication** (REST)
- **Asynchronous, event-driven communication** (RabbitMQ message broker)
- **Independent data ownership per service** (Database-per-Service pattern)

---

## 2. Idea

The core idea is to simulate an end-to-end business flow: a user creates records, browses products,
places an order, and an inventory service reacts to the order asynchronously.

By separating these concerns into services, the project demonstrates:

- How a single user action (placing an order) can trigger a chain of inter-service calls.
- How synchronous calls (REST via the API Gateway) differ in design from asynchronous ones
  (publishing a RabbitMQ event that the Inventory Service consumes).
- How service discovery and an API Gateway simplify client-side complexity and enable horizontal scaling.
- How data consistency challenges (e.g., double-ordering beyond available stock) are handled in a
  distributed system.

---

## 3. Services

The system is kept intentionally small and simple — **5 core microservices** plus supporting
infrastructure (Gateway + Registry).

| Service | Responsibility | Port |
|---------|----------------|------|
| **Service Registry** (Eureka) | Service discovery — all services register here so the Gateway can find them | 8761 |
| **API Gateway** (Spring Cloud Gateway) | Single entry point (port 8080), routes requests to services via load-balanced URIs | 8080 |
| **Customer Service** | Customer CRUD — create and fetch customer records | 9002 |
| **Employee Service** | Employee CRUD — create and fetch employee records | 9001 |
| **Product Service** | Product CRUD — create and fetch product records | 9003 |
| **Order Service** | Order CRUD — creates orders, saves to MongoDB, and **publishes a RabbitMQ event** | 9004 |
| **Inventory Service** | No REST endpoint — **listens** on RabbitMQ for order events and checks/updates stock | 8002 |

### Communication Overview

- **Synchronous (REST):** Frontend/client → API Gateway (port 8080) → routed to the target service
  based on the request path (`/customers/**`, `/employees/**`, `/products/**`, `/orders/**`).
- **Asynchronous (event-driven):** Order Service publishes an order event to RabbitMQ → Inventory
  Service consumes the event and attempts to fulfill the order against its in-memory stock.

```
Client
  |
  v
API Gateway (8080)  ---------->  Service Registry / Eureka (8761)
  |   |    |    |
  v   v    v    v
Customer  Employee  Product  Order (9004)
(9002)    (9001)    (9003)      |
                                | publishes event
                                v
                         RabbitMQ (15672)
                                |
                                v
                         Inventory Service (8002)
```

---

## 4. Tech Stack

| Layer | Technology |
|-------|------------|
| Backend Framework | Spring Boot (Java 17) |
| Service Discovery | Netflix Eureka (Spring Cloud) |
| API Gateway | Spring Cloud Gateway |
| Inter-service Sync Communication | REST APIs |
| Inter-service Async Communication | RabbitMQ |
| Database | MongoDB (one per service — Database-per-Service pattern) |
| Build Tool | Maven (with Maven Wrapper `mvnw.cmd`) |
| Version Control | Git, GitHub |

---

## 5. Getting Started

### Prerequisites

- JDK 17+
- MongoDB (local or MongoDB Atlas)
- RabbitMQ running locally (management UI at `http://localhost:15672`, default `guest`/`guest`)

### Startup Order (Important)

Start each service in its own folder with:

```
mvnw.cmd spring-boot:run
```

1. **service-registry** — wait until Tomcat starts on port 8761
2. **api-gateway**
3. **customer-service**, **employee-service**, **product-service**, **order-service**
4. **inventory-service** (optional — only needed to see the RabbitMQ message / fulfillment check)

> **Rule of thumb:** always call port **8080** (the Gateway), not the direct service ports.

---

## 6. Usage Examples

All requests go through the Gateway at `http://localhost:8080`.

### Create an Order (saves to MongoDB + publishes a RabbitMQ event)

```
POST http://localhost:8080/orders/
Content-Type: application/json

{
  "productId": "P001",
  "customerId": "cust2",
  "quantity": 3,
  "price": 99.98
}
```

Expected: `200 OK` with the created order JSON (contains an `id`). The **Inventory Service**
console will show a fulfillment message, e.g.:

```
Order <id> fulfilled: 3 x Laptop (P001). Remaining stock: 7.
```

Seeded inventory catalog (in-memory; resets on restart):
- `P001` = Laptop (10 in stock)
- `P002` = Mouse (5 in stock)
- `P003` = Keyboard (3 in stock)

### Fetch an Order by ID

```
GET http://localhost:8080/orders/<order-id>
```

### Create / Fetch a Customer

```
POST http://localhost:8080/customers/
Content-Type: application/json

{
  "name": "Alice",
  "address": "Dhaka",
  "age": 25
}
```

```
GET http://localhost:8080/customers/<customer-id>
```

### Create / Fetch an Employee

```
POST http://localhost:8080/employees/
Content-Type: application/json

{
  "name": "Bob",
  "designation": "Engineer",
  "salary": 50000.0
}
```

```
GET http://localhost:8080/employees/<employee-id>
```

### Create / Fetch a Product

```
POST http://localhost:8080/products/
Content-Type: application/json

{
  "name": "Laptop",
  "desc": "16GB RAM",
  "price": 85000.0
}
```

```
GET http://localhost:8080/products/<product-id>
```

### Verify the Registry

Open `http://localhost:8761` in a browser — all services should be listed as **UP**:
`ORDER-SERVICE`, `CUSTOMER-SERVICE`, `EMPLOYEE-SERVICE`, `PRODUCT-SERVICE`, `API-GATEWAY`,
`INVENTORY-SERVICE`.

A full, noob-friendly testing guide is available in [`postmantest.txt`](postmantest.txt), including
common problems and fixes.

---

## 7. Project Structure

```
Ticket-Booking-System/
├── service-registry/     # Eureka server (8761)
├── api-gateway/          # Spring Cloud Gateway (8080)
├── customer-service/     # Customer CRUD (9002)
├── employee-service/     # Employee CRUD (9001)
├── product-service/      # Product CRUD (9003)
├── order-service/        # Order CRUD + publishes RabbitMQ events (9004)
├── inventory-service/    # RabbitMQ consumer, stock fulfillment (8002)
├── postmantest.txt       # End-to-end manual testing guide
└── README.md
```

---

## 8. Conclusion

This project outlined the design of a system built on a microservices architecture. By decomposing
the system into small, focused services with clear responsibilities, and supporting them with a
Service Registry, API Gateway, and both synchronous and asynchronous communication mechanisms, the
project demonstrates the core principles taught in the Software Design and Architectures course while
remaining scoped appropriately for a semester project.