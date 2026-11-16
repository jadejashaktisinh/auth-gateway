# Auth Service

A lightweight API gateway that authenticates clients, maps their routes to upstream services, and reverse-proxies requests with rate limiting and logging.

It sits in front of one or more backend services and lets each registered client expose its own upstream APIs under either a subdomain (`acme.example.com/...`) or a path prefix (`/p/acme/...`).

## Live demo

The project includes a small EJS site for the hosted demo:

| Page | Purpose |
| ---- | ------- |
| `/` | Project overview, architecture diagram, and request flow |
| `/try` | Interactive register → add route → get token → call proxy flow |
| `/docs` | Endpoint reference, status codes, rate limits, and security notes |
| `/health` | Lightweight liveness response for Render |

> **Render free tier:** the service sleeps after a period of inactivity. The first request can take roughly **30 seconds** to wake it up. The home and Try it pages show this note too.

Subdomain routing is disabled on `*.onrender.com` because you do not control wildcard subdomains there. The hosted demo uses path-prefix mode (`/p/acme/...`) only. See [Subdomain routing on Render](#subdomain-routing-on-render).

## Features

- **Client registration** with automatically generated API keys
- **JWT access tokens** issued in exchange for an API key (15-minute expiry)
- **Dynamic reverse proxy** routed per client and per path
  - Subdomain routing: `*.DOMAIN` (via `vhost`)
  - Subdirectory routing: `/p/:companyname/*route`
- **Redis-backed rate limiting** (100 requests per minute per client route)
- **Request logging** of proxied calls and errors in PostgreSQL
- **Fallback upstream** when a route cannot be resolved
- **Public-demo safeguards**: demo target allowlist, private-address validation, API-key-protected route creation, and registration rate limiting
- Dummy backends for local proxy testing

## Tech Stack

- TypeScript (ESM, NodeNext)
- Express 5
- EJS pages
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

### Subdomain routing on Render

Subdomain routing needs wildcard DNS for `*.DOMAIN`. On `*.onrender.com` you do not control wildcard subdomains, so the hosted demo can only use path-prefix mode. The EJS pages (`/`, `/try`, `/docs`) sit outside `/p/:companyname/*route`, and the vhost middleware skips the service's own hostname (`RENDER_EXTERNAL_HOSTNAME` or `PUBLIC_HOST`) so the public site and proxy do not clash.

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
| `PORT`         | HTTP port (Render sets this automatically)          | `3000`                                                        |
| `DOMAIN`       | Base domain for subdomain-based proxy routing       | `authservice.com`                                             |
| `DEMO_MODE`    | Restrict routes to the two built-in demo backends   | `true`                                                        |
| `ENABLE_DEMO_BACKENDS` | Start the dummy backends inside the main process | `true`                                                     |
| `DEMO_ORDERS_PORT` | Port for the Orders dummy backend              | `3001`                                                        |
| `DEMO_INVENTORY_PORT` | Port for the Inventory dummy backend        | `3002`                                                        |

`DEMO_MODE=true` is the safe default for the public demo. Set it to `false` only for a trusted deployment that needs arbitrary upstreams; target URLs are then validated against private, loopback, link-local, and reserved address ranges before they are saved.

The two dummy backends start automatically with the main service. Set `ENABLE_DEMO_BACKENDS=false` if you want to run them separately.

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

The server listens on `http://localhost:3000` by default (or `PORT`). Open `/` for the home page, `/try` for the interactive demo, and `/docs` for the API reference.

## Usage

### Register a client

```bash
curl -X POST http://localhost:3000/client/register \
  -H "Content-Type: application/json" \
  -d '{"companyName":"acme"}'
```

The response contains the generated client `id` and `apiKey` (`auth_sec_...`). Keep the API key secret.

### Register a route for the client

Route creation requires the API key belonging to that client. In the default demo mode the target must be one of the two built-in dummy backends.

```bash
curl -X POST http://localhost:3000/client/<client-id>/routes \
  -H "Content-Type: application/json" \
  -H "x-api-key: auth_sec_<your-api-key>" \
  -d '{"path":"orders","targeturl":"http://127.0.0.1:3001"}'
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

### `GET /health`

Returns a lightweight liveness response. It does not query PostgreSQL or Redis.

```json
{
  "status": "ok",
  "service": "auth-service",
  "uptime": 42,
  "timestamp": "2026-11-16T00:00:00.000Z"
}
```

### `POST /client/register`

Registers a new client. Registration is rate-limited to 5 requests per 15 minutes per IP address; excess requests receive `429` with a `Retry-After` header.

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

Creates a route mapping for a client. Requires the client's API key.

| Header      | Required | Description                    |
| ----------- | -------- | ------------------------------ |
| `x-api-key` | yes      | API key belonging to the client |

| Body        | Type   | Required | Description                              |
| ----------- | ------ | -------- | ---------------------------------------- |
| `path`      | string | yes      | Client path to match (e.g. `orders`)     |
| `targeturl` | string | yes      | Upstream base URL (e.g. `http://127.0.0.1:3001`) |

In the default demo mode, `targeturl` must be one of the built-in dummy backends. With `DEMO_MODE=false`, private, loopback, link-local, and reserved address ranges are rejected.

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
| `400`  | Invalid body or disallowed target URL    |
| `401`  | Missing/invalid token, or wrong API key  |
| `403`  | Saved target is not allowed by demo mode |
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
├── config/          # Redis client and demo target configuration
├── controllers/     # Client and token handlers
├── db/              # Drizzle client and schema
├── middleware/      # Validation, auth, rate limit, and proxy middleware
├── models/          # Data access helpers
├── routes/          # Express routes, EJS pages, and proxy setup
├── types/           # Shared TypeScript types
├── utils/           # Validators, proxy, and target URL security helpers
├── dummy-backend.ts           # Orders upstream on port 3001
├── inventory-dummy-backend.ts # Inventory upstream on port 3002
└── index.ts         # Application entry point
views/               # EJS pages and partials
public/              # Static CSS
```

## Testing the Proxy Locally

The Orders (`127.0.0.1:3001`) and Inventory (`127.0.0.1:3002`) dummy backends start automatically with the main service. If you set `ENABLE_DEMO_BACKENDS=false`, run them separately:

```bash
npx tsx src/dummy-backend.ts
npx tsx src/inventory-dummy-backend.ts
```

Then register a route pointing at `http://127.0.0.1:3001` (orders) or `http://127.0.0.1:3002` (inventory), obtain a token, and call the proxy endpoint. Open `/try` to run the same flow in the browser.

## Public Demo Security

If you deploy this publicly:

- Keep `DEMO_MODE=true` so routes can only target the two built-in dummy backends.
- The proxy re-checks the saved target on every request, so existing database rows cannot bypass the allowlist.
- Route creation requires the API key that belongs to the client.
- Client registration is rate-limited per IP address.
- With `DEMO_MODE=false`, target URLs pointing at private, loopback, link-local, or reserved addresses are rejected at save time. DNS names are resolved and all returned addresses are checked.

## License

ISC
