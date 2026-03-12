# Utils API

## Setup

```bash
bun install
bun run start
```

## Auth Endpoints

- `POST /api/v1/auth/signup`
- `POST /api/v1/auth/verify-account/request`
- `POST /api/v1/auth/verify-account/confirm`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/reset-password/request`
- `POST /api/v1/auth/reset-password/confirm`
- `GET /api/v1/auth/me` (requires `Authorization: Bearer <token>`)

## Example Requests

```bash
curl -X POST http://localhost:3003/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"phone":"+919876543210","password":"strongPass123"}'
```

```bash
curl -X POST http://localhost:3003/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+919876543210","password":"strongPass123"}'
```
