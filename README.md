# migration-lab: V1 API

Bun + TypeScript + Postgres API, the target for a live-traffic migration (done later with GitHub Actions).
V1 schema: `users(id, name, email, password_hash, created_at)` and `posts(id, user_id, title, content, created_at)`.

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/signup` | no | `{name, email, password}` (password 8+ chars). 201, or 409 if the email exists |
| POST | `/auth/login` | no | `{email, password}` returns `{token, user_id}` (JWT, 1 h) |
| POST | `/posts` | Bearer | `{title, content}` returns the post (201) |
| GET | `/posts` | no | newest first. `?limit=20` (max 100), `?before=<id>` for keyset paging |
| GET | `/posts/:id` | no | 404 if missing |
| GET | `/health`, `/ready` | no | liveness / readiness (`/ready` checks the DB) |

IDs are returned as strings (they are `bigint` in Postgres).

## Run

Needs Bun and an empty Postgres database. Bun loads `.env` from the current folder automatically.

```bash
bun install
cp .env.example .env              # set DATABASE_URL and JWT_SECRET
psql "$DATABASE_URL" -f schema.sql   # once
bun run start
```

## Mock traffic (`traffic.ts`)

One plain TypeScript file. Creates a few users and posts, then sends a fixed number of requests per second
(it does not slow down when the API does) and prints one line per second plus a summary.
Exit code is 1 if the error rate or p95 goes over the limits.

```bash
BASE_URL=http://localhost:3000 RATE=50 DURATION=120 bun traffic.ts
```

| Env var | Default | Meaning |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | target |
| `RATE` | 50 | requests per second |
| `DURATION` | 60 | seconds |
| `USERS` | 10 | users created before the run |
| `WRITE_RATIO` | 0.2 | share of `POST /posts` |
| `LIST_RATIO` | 0.4 | share of `GET /posts` (the rest is `GET /posts/:id`) |
| `TIMEOUT_MS` | 5000 | per-request timeout; timeouts count as errors (status 0) |
| `MAX_ERROR_RATE` | 0.01 | fail the run above this |
| `P95_MS` | 500 | fail the run above this |
