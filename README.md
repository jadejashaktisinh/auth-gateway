# Auth Service

A lightweight API gateway that authenticates clients, maps their routes to upstream services, and reverse-proxies requests with rate limiting and logging.

It sits in front of one or more backend services and lets each registered client expose its own upstream APIs under either a subdomain (`acme.example.com/...`) or a path prefix (`/p/acme/...`).

## Features

- **Client registration** with automatically generated API keys
- **JWT access tokens** issued in exchange for an API key (15-minute expiry)
- **Dynamic reverse proxy** routed per client and per path
  - Subdomain routing: `*.DOMAIN` (via `vhost`)
  - Subdirectory routing: `/p/:companyname/*route`
- **Redis-backed rate limiting** (100 requests per minute per client route)
- **Request logging** of proxied calls and errors in PostgreSQL
- **Fallback upstream** when a route cannot be resolved
- Dummy backends for local proxy testing

## Tech Stack

- TypeScript (ESM, NodeNext)
- Express 5
- PostgreSQL + Drizzle ORM
- Redis
- `http-proxy-middleware`
- `jsonwebtoken`
- `tsx` for development

## Architecture

```
                        ┌─────────────────────┐
Client request ────────▶│     auth-service    │
  (Bearer JWT)          │                     │
                        │  vhost / /p/:company│
                        │         │           │
                        │  ProxyMiddleware    │
                        │  - resolve client   │
                        │  - verify JWT       │
                        │  - rate limit (Redis│
                        │  - log (Postgres)   │
                        │         │           │
                        └─────────┼───────────┘
                                  ▼
                         Upstream service
                         (registered target_url)
```

Each registered client owns:
- a unique `company_name`
- an API key
- one or more routes, each mapping a client path to an absolute `target_url`

### Proxy routing modes

1. **Subdomain** — a request to `acme.example.com/orders/1` resolves the client from the vhost (`acme`) and proxies to the registered target for the `orders` route.
2. **Subdirectory** — a request to `example.com/p/acme/orders/1` resolves the client from the `companyname` path parameter and proxies to the same target.

The resolved target URL is passed internally to the proxy middleware via the `targeturl` header, and the remaining request path is appended to it.

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (for PostgreSQL and Redis) or existing instances of both

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and adjust the values:

```bash
cp .env.example .env
```

| Variable       | Description                                         | Example                                                       |
| -------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| `DATABASE_URL` | PostgreSQL connection string                        | `postgresql://myuser:mysecretpassword@localhost:5432/authservice` |
| `JWT_SECRET`   | Secret used to sign and verify JWTs                 | `replace-with-a-long-random-secret`                           |
| `REDIS_URL`    | Redis connection string                             | `redis://localhost:6379`                                      |
| `FALLBACK_URL` | Upstream used when a route cannot be resolved       | `http://localhost:3000`                                       |
| `DOMAIN`       | Base domain for subdomain-based proxy routing       | `authservice.com`                                             |

### 3. Start PostgreSQL and Redis

```bash
docker compose up -d
```

### 4. Run database migrations

```bash
npm run db:generate   # generate SQL from schema changes (when schema changes)
npm run db:migrate    # apply migrations
```

### 5. Start the service

```bash
npm run dev
```

The server listens on `http://localhost:3000`.

## Usage

### Register a client

```bash
curl -X POST http://localhost:3000/client/register \
  -H "Content-Type: application/json" \
  -d '{"companyName":"acme"}'
```

The response contains the generated client `id` and `apiKey` (`auth_sec_...`). Keep the API key secret.

### Register a route for the client

```bash
curl -X POST http://localhost:3000/client/<client-id>/routes \
  -H "Content-Type: application/json" \
  -d '{"path":"orders","targeturl":"http://localhost:3001"}'
```

### Obtain an access token

```bash
curl -X POST http://localhost:3000/oauth/token \
  -H "x-api-key: auth_sec_<your-api-key>"
```

The response contains a JWT valid for 15 minutes.

### Call a proxied endpoint

Subdirectory mode:

```bash
curl http://localhost:3000/p/acme/orders/123 \
  -H "Authorization: Bearer <access-token>"
```

Subdomain mode (requires DNS or `/etc/hosts` entry such as `127.0.0.1 acme.authservice.com`):

```bash
curl http://acme.authservice.com:3000/orders/123 \
  -H "Authorization: Bearer <access-token>"
```

## API Reference

### `POST /client/register`

Registers a new client.

| Body          | Type   | Required | Description          |
| ------------- | ------ | -------- | -------------------- |
| `companyName` | string | yes      | Unique client name   |

**Response** `200 OK`

```json
{
  "success": true,
  "message": "Registration Successfull",
  "client": [
    {
      "id": "uuid",
      "companyName": "acme",
      "apiKey": "auth_sec_..."
    }
  ]
}
```

### `POST /client/:clientid/routes`

Creates a route mapping for a client.

| Body        | Type   | Required | Description                              |
| ----------- | ------ | -------- | ---------------------------------------- |
| `path`      | string | yes      | Client path to match (e.g. `orders`)     |
| `targeturl` | string | yes      | Upstream base URL (e.g. `http://localhost:3001`) |

**Response** `200 OK`

```json
{
  "success": true,
  "message": "Route created successfully",
  "client_route": true
}
```

### `POST /oauth/token`

Exchanges an API key for a JWT.

| Header      | Required | Description          |
| ----------- | -------- | -------------------- |
| `x-api-key` | yes      | Client API key       |

**Response** `200 OK`

```json
{
  "success": true,
  "token": "<jwt>"
}
```

### Proxy endpoints

| Route                     | Description                                  |
| ------------------------- | -------------------------------------------- |
| `*.<DOMAIN>/*route`       | Subdomain-based proxy for registered clients |
| `/p/:companyname/*route`  | Subdirectory-based proxy                     |

Proxy requests require:

- `Authorization: Bearer <token>` — a valid JWT
- A registered client matching the subdomain or `companyname`
- A registered route matching the requested path

| Status | Meaning                                  |
| ------ | ---------------------------------------- |
| `401`  | Missing route, token, subdomain, or invalid token |
| `404`  | Client or route not found                |
| `429`  | Rate limit exceeded (100 req/min)        |
| `502`  | Upstream server unreachable              |

## Database Schema

| Table           | Purpose                                             |
| --------------- | --------------------------------------------------- |
| `clients`       | Registered clients (`company_name`, `api_key`)      |
| `client_routes` | Path → target URL mappings per client               |
| `proxy_logs`    | Proxied request metadata, status, and error details |

Migrations live in `drizzle/`.

## Scripts

| Command             | Description                              |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Start in watch mode with `tsx`           |
| `npm run build`     | Apply migrations and compile TypeScript  |
| `npm start`         | Run the compiled build from `dist/`      |
| `npm run db:generate` | Generate Drizzle migrations            |
| `npm run db:migrate`  | Apply Drizzle migrations               |

## Project Structure

```
src/
├── config/          # Redis client
├── controllers/     # Client and token handlers
├── db/              # Drizzle client and schema
├── middleware/      # Validation and proxy auth middleware
├── models/          # Data access helpers
├── routes/          # Express routes and proxy setup
├── types/           # Shared TypeScript types
├── utils/           # Validators, proxy and general helpers
├── dummy-backend.ts           # Sample upstream on port 3001
├── inventory-dummy-backend.ts # Sample upstream on port 3002
└── index.ts         # Application entry point
```

## Testing the Proxy Locally

Start the dummy backends in separate terminals:

```bash
npx tsx src/dummy-backend.ts
npx tsx src/inventory-dummy-backend.ts
```

Then register a route pointing at `http://localhost:3001` (orders) or `http://localhost:3002` (inventory), obtain a token, and call the proxy endpoint.

## License

ISC
