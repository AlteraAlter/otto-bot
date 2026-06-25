# OTTO Product Integration Service

FastAPI backend + Next.js frontend for OTTO product retrieval, normalization, mapping, and creation.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Environment

```bash
cp .env.example .env
```

Required values:

```bash
export OTTO_CLIENT_ID="your_client_id"
export OTTO_CLIENT_SECRET="your_client_secret"
export OTTO_SCOPE="orders products"
```

Optional mapper override:

```bash
export OTTO_CATEGORIES_FILE="/absolute/path/to/available_cats.json"
```

## Run Backend

```bash
uvicorn app.main:app --reload
```

## Lightweight Local Docker Dev

For local development on a laptop, prefer the lightweight stack instead of the full production-like compose setup:

```bash
cp docker.env.example docker.env
docker compose -f docker-compose.dev.yml up --build
```

This mode is lighter because it:
- skips `nginx`
- skips the ARQ `worker` unless you really need background jobs
- disables Redis AOF disk writes
- uses Docker volumes instead of Windows bind mounts for uploads and logs

Useful URLs:
- `http://127.0.0.1:3000`
- `http://127.0.0.1:8000/docs`
- `http://127.0.0.1:8000/uploads/<filename>`

## Run Redis + ARQ Worker

```bash
docker compose up -d redis worker
```

Default Redis URL:
- `redis://127.0.0.1:6379/0`

Inside Docker Compose the worker connects to Redis using the service hostname:
- `redis://redis:6379/0`

## Run ARQ Worker Manually

```bash
arq app.tasks.WorkerSettings
```

Queued factory jobs are processed by this ARQ worker.

## Sync OTTO Product Images And Descriptions Into Local DB

After running the latest migration, you can enrich local products with OTTO media asset URLs and save the upstream product description into `product_descriptions`:

```bash
alembic upgrade head
python scripts/sync_product_media_assets.py --only-missing
```

Useful options:
- `--sku YOUR-SKU`
- `--limit 100`

Note:
- If your PostgreSQL database is running on the host machine rather than in Docker, the worker container may need `DB_HOST=host.docker.internal` instead of `localhost`.

Backend URLs:
- `http://127.0.0.1:8000/health`
- `http://127.0.0.1:8000/docs`

## OTTO Direct Products API

The backend exposes a direct proxy for OTTO `GET /v5/products` in Swagger:

- `GET /v5/products`
- `GET /v1/products/otto`

Supported query params:
- `controller`: OTTO controller account, defaults to `JV`
- `page`: page number, defaults to `0`
- `limit`: page size, defaults to `30`
- `sku`, `productReference`, `ean`, `moin`: optional product filters

## Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Default frontend URL:
- `http://127.0.0.1:3000`

## Full Docker Stack

If you specifically want the production-like local stack with `worker` and `nginx`, keep using:

```bash
docker compose up --build
```

## Production Deploy Behind Host Nginx

The production compose file does not bind public `80` or `443`, so it will not
interfere with other projects or the host nginx. It exposes this app only on the
server loopback interface:

```bash
docker compose up -d --build
```

Local upstream URL for the host reverse proxy:

```text
http://127.0.0.1:18080
```

The public `https://okb.automatonsoft.de` certificate and domain routing should
stay in the existing host nginx. That host nginx can proxy the subdomain to
`http://127.0.0.1:18080`.

## Project Structure

- `app/api/routes/products.py`: OTTO products + creation workflow endpoints
- `app/services/product_creation_service.py`: upload/prepare/validate/create pipeline
- `app/mapper/normalizer.py`: normalized OTTO payload entrypoint
- `app/normalize_product_to_schema.py`: schema transformation implementation
- `frontend/app/creator/page.tsx`: JSON upload, edit, prepare, create UI

## Notes

- Legacy standalone uploader route/page were removed; product file flow is under `/v1/products/*`.
