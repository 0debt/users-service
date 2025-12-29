# Users Service

A microservice responsible for **user management and authentication**, built with **Bun** and **Hono**.
Part of the **0debt** project.

<p align="center">
  <img src="https://img.shields.io/badge/Runtime-Bun-black?style=flat-square&logo=bun" alt="Bun">
  <img src="https://img.shields.io/badge/Framework-Hono-E36002?style=flat-square&logo=hono" alt="Hono">
  <img src="https://img.shields.io/badge/Database-MongoDB-47A248?style=flat-square&logo=mongodb" alt="MongoDB">
  <img src="https://img.shields.io/badge/Cache-Redis-DC382D?style=flat-square&logo=redis" alt="Redis">
</p>

---

## Features

* 👤 **User Management**: Register, authenticate, update profile and manage user data
* 🔐 **JWT Authentication**: Users-service acts as the JWT issuer for the platform
* ⚡ **Redis Cache**: Cache-aside pattern for internal user data (TTL 60s)
* 🚦 **Throttling**: Redis-based rate limiting on login to prevent brute-force attacks
* 🧩 **Feature Toggles**: Plan-based feature control (FREE / PRO / ENTERPRISE)
* 🖼️ **Avatar Upload**: Cloud storage integration using Supabase Storage
* 🧯 **Circuit Breaker**: Resilient communication with notifications-service
* ❤️ **Health Check**: Endpoint for infrastructure health validation
* 📚 **API Documentation**: Swagger / OpenAPI integrated with routes for interactive API testing
* 🧪 **Testing**: 25 tests covering positive and negative scenarios

---
### External API Usage (Avatar Generation)

The users-service integrates with the **DiceBear API** (`https://api.dicebear.com`) to automatically generate a default avatar during user registration. The avatar URL is generated in the backend using the user’s name or email as a seed and stored as part of the user profile in MongoDB. This external API is consumed exclusively from the backend and is transparent to the frontend.


---

> **Additional Documentation**  
>  
> A detailed explanation of how this microservice fulfills all the requirements of the course project at the microservice level is provided in the accompanying **README.pdf** file.

---

## Tech Stack

| Component     | Technology        |
| ------------- | ----------------- |
| Runtime       | Bun               |
| Framework     | Hono              |
| Database      | MongoDB Atlas     |
| Cache         | Redis             |
| Auth          | JWT               |
| Cloud Storage | Supabase Storage  |
| Resilience    | Circuit Breaker   |
| API Docs      | OpenAPI / Swagger |

---

## Prerequisites

* Bun (latest version)
* MongoDB Atlas account or local MongoDB instance
* Redis (optional – service works without it)
* Supabase project (for avatar storage)

---

## Installation

```bash
git clone <repository-url>
cd users-service
bun install
```

---

## Configuration

Create a `.env` file:

```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/
MONGODB_DB_NAME=users_service
JWT_SECRET=super-secret-key
PORT=3000

REDIS_URL=redis://localhost:6379  # Without Redis = cache disabled
NOTIFICATIONS_SERVICE_URL=url_notifications-service

SUPABASE_URL=https://yourproject.supabase.co
SUPABASE_ANON_KEY=service-role-key
SUPABASE_BUCKET=avatars
```

---

## Usage

### Development

```bash
bun run dev
```

Server starts on `http://localhost:3000`

### Production

The service can be started in production using the same entry point as in development.
Environment-specific configuration is provided through environment variables injected
by the deployment platform (Coolify).

---
## API Endpoints

The following list summarizes all the endpoints exposed by the **users-service**.  
The complete details for each endpoint (parameters, schemas, and examples) are available in the Swagger documentation provided by the microservice.

---

### Auth

| Method | Endpoint | Description | Auth |
|------|---------|-------------|------|
| POST | `/api/v1/auth/register` | Register new user | No |
| POST | `/api/v1/auth/login` | User login (JWT issued) | No |

---

### Users

| Method | Endpoint | Description | Auth |
|------|---------|-------------|------|
| GET | `/api/v1/users/me` | Get authenticated user data | Yes |
| GET | `/api/v1/users` | List users (testing only) | Yes |
| GET | `/api/v1/users/{id}` | Get authenticated user by ID | Yes |
| PATCH | `/api/v1/users/{id}` | Update authenticated user data | Yes |
| DELETE | `/api/v1/users/{id}` | Delete authenticated user | Yes |
| PATCH | `/api/v1/users/{id}/avatar` | Upload user avatar (PRO/ENTERPRISE plan only) | Yes |

---

### Plans

| Method | Endpoint | Description | Auth |
|------|---------|-------------|------|
| GET | `/api/v1/users/me/plan` | Get current user plan and add-ons | Yes |
| PATCH | `/api/v1/users/{id}/plan` | Change authenticated user plan | Yes |
| PATCH | `/api/v1/users/{id}/addons` | Update authenticated user add-ons | Yes |

---

### Internal (microservices only)

| Method | Endpoint | Description | Auth |
|------|---------|-------------|------|
| GET | `/api/v1/internal/users/{id}` | Get internal user data for groups-service microservice| Internal |

---

### System

| Method | Endpoint | Description | Auth |
|------|---------|-------------|------|
| GET | `/api/v1/health` | Service health check | No |

---

> **Note on Add-ons support**  
>  
> The users-service includes dedicated endpoints for managing user add-ons (such as updating and retrieving add-on information). These endpoints are fully implemented and documented at the microservice level.  
>  
> However, the add-ons functionality is not currently integrated into the overall application workflow across all microservices. As a result, while the endpoints exist and operate correctly within the users-service, add-ons are not actively used by other services in the system.

---

## Architecture

The **users-service** is part of a microservices-based architecture and is responsible for **user identity, authentication, authorization, and profile management**. All external access to the service is routed through the **API Gateway (Kong)**, which acts as the single entry point to the system and handles cross-cutting concerns such as routing and security.


```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│    Kong     │────▶│  Users     │
│             │     │   Gateway   │     │   Service   │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
        ┌────────────────────────────────────────────────────────────────────────────────┐
        │                            │                         │                         │
        ▼                            ▼                         ▼                         ▼
    ┌─────────────┐           ┌─────────────┐           ┌─────────────┐           ┌─────────────┐
    │   MongoDB   │           │    Redis    │           │  Supabase   │           │ Notification│
    │(User Data)  │           │   (Cache &  │           │  Storage &  │           │  Service    │
    └─────────────┘           │ Throttling )│           │ DiceBear API│           └─────────────┘
                              └─────────────┘           │  (avatars)  │       
                                                        └─────────────┘
```

**Redis** is used to improve performance and resilience through caching internal user reads and enforcing login throttling to protect the authentication endpoint.

**DiceBear API** is used to generate a default avatar during user registration.

**Supabase Storage** is used handle user avatar uploads, delegating binary file storage to an external cloud provider and storing only the resulting public URL in the database. 

Communication with the **notifications-service** is protected using a **Circuit Breaker pattern**, ensuring that failures in non-critical external services do not affect the core authentication and user management workflows. 

---

## API Documentation

The users-service exposes its API documentation using **OpenAPI (Swagger)**.

The documentation is available at the following endpoint:

- **OpenAPI / Swagger UI**: `http://localhost:3000/api/v1/docs`

All endpoints, request/response schemas, authentication requirements, and examples are defined and kept up to date directly from the source code using `@hono/zod-openapi`.


---

## Testing

```bash
bun test
```

### Covered Scenarios

- Authentication scenarios are tested in `auth.test.ts`, including successful user registration and login flows, as well as error cases such as duplicate email registration, invalid credentials, and login throttling when the maximum number of attempts is exceeded. These tests verify correct HTTP status codes (`201`, `401`, `409`, `429`) and ensure that security mechanisms behave as expected.

- User management scenarios are covered in `users.test.ts`, where authenticated access to user-related endpoints is validated.

- System availability is validated in `health.test.ts` by testing the health check endpoint, confirming that the service reports a healthy state when running. This endpoint is intended for infrastructure monitoring and deployment validation.

- Resilience and fault tolerance are tested through `circuitBreaker.test.ts`, `registerBreaker.test.ts`, and `notifyPreferencesInit.test.ts`. These tests simulate failures in the external notifications-service and verify that the Circuit Breaker transitions between states correctly. They also confirm that user registration continues successfully even when the external service is unavailable, ensuring that non-critical dependencies do not block core functionality.

---

## Project Structure

```text
users-service/
├── src/
│   ├── db/
│   │   └── mongo.ts       # MongoDB connection
│   ├── docs/
│   │   └── openapi.ts      # OpenAPI / Swagger configuration
│   ├── lib/
│   │   ├── circuitBreaker.ts       # Circuit Breaker implementation
│   │   ├── notificationClient.ts          # Notifications service client
│   │   ├── redis.ts          # Redis client
│   │   └── supabase.ts        # Supabase client (avatar storage)
│   ├── middleware/
│   │   ├── auth.ts          # JWT authentication middleware
│   │   └── requirePlan.ts        # Plan-based feature toggles
│   ├── routes/
│   │   ├── auth.ts          # Auth endpoints 
│   │   └── users.ts        # User endpoints
│   ├── schemas/
│   │   └── errors.ts       # Error schemas
│   ├── tests/
│   │   ├── auth.test.ts       
│   │   ├── circuitBreaker.test.ts         
│   │   ├── health.test.ts         
│   │   ├── notifyPreferencesInit.test.ts         
│   │   ├── registerBreaker.test.ts      
│   │   └── users.test.ts        
│   ├── types/
│   │   └── app.ts       # Types 
│   ├── utils/
│   │   └── jwt.ts       # JWT generation utilities
│   └── index.ts # Application entry point
├── .env.example
├── Dockerfile
├── package.json
├── README.md
└── README.pdf

```

---

## Resilience Patterns

### Circuit Breaker (notifications-service)

- **Purpose**: Protect user registration flow from external service failures
- **Applies to**: Communication with `notifications-service`
- **Behavior**:
  - Service continues if notifications-service is unavailable
  - Prevents cascading failures
- **Fallback**: User registration succeeds without notifications

---

### Cache-Aside (Redis)

- **Purpose**: Improve performance for frequent internal user reads
- **Applies to**: `GET /api/v1/internal/users/{id}`
- **Key**: `user:{id}`
- **TTL**: 60 seconds
- **Graceful Degradation**: Service works without Redis (cache disabled)

---

### Throttling (Redis)

- **Purpose**: Protect login endpoint from brute-force attacks
- **Applies to**: `POST /api/v1/auth/login`
- **Key**: `login_attempts:{email}`
- **Limit**: 5 attempts per minute
- **Response on limit exceeded**: `429 Too Many Requests`
- **Graceful Degradation**: Login works if Redis is unavailable

---

### Feature Toggles (Plan-Based)

- **Purpose**: Enable or restrict features based on user subscription plan
- **Applies to**: Avatar upload functionality
- **Plans Allowed**: `PRO`, `ENTERPRISE`
- **Enforced by**: `requirePlan` middleware
- **Behavior**: Same endpoint, different behavior at runtime

