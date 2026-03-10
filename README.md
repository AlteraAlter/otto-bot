# Otto Data Service Starter (Go)

Starter template for a Go service that:
- requires incoming auth (`Bearer` token + client id/key)
- forwards data to Otto (`POST`)
- retrieves data from Otto (`GET`)

## 1) Setup

```bash
cp .env.example .env
set -a; source .env; set +a
go run .
```

## 2) Configure Credentials

Edit `.env` and replace placeholder values:
- `SERVICE_BEARER_TOKEN`, `ALLOWED_CLIENT_ID`, `ALLOWED_CLIENT_KEY`: credentials required to call your service
- `OTTO_BASE_URL`, `OTTO_API_TOKEN`, `OTTO_CLIENT_ID`, `OTTO_CLIENT_KEY`: credentials your service uses when calling Otto

## 3) Health Check

```bash
curl http://localhost:3000/health
```

## 4) Upload Data (POST)

```bash
curl -X POST http://localhost:3000/v1/otto/data \
  -H "Authorization: Bearer replace_with_service_token" \
  -H "x-client-id: replace_with_client_id" \
  -H "x-client-key: replace_with_client_key" \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "abc-123",
    "name": "Sample",
    "metadata": { "source": "starter-template" }
  }'
```

## 5) Retrieve Data (GET)

```bash
curl http://localhost:3000/v1/otto/data/abc-123 \
  -H "Authorization: Bearer replace_with_service_token" \
  -H "x-client-id: replace_with_client_id" \
  -H "x-client-key: replace_with_client_key"
```

## Notes

- If your Otto API paths differ, update `main.go` routes from `/v1/data` to your real endpoint.
- Use HTTPS and a secrets manager for production.
