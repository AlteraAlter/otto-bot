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

Backend URLs:
- `http://127.0.0.1:8000/health`
- `http://127.0.0.1:8000/docs`

## Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Default frontend URL:
- `http://127.0.0.1:3000`

## Project Structure

- `app/api/routes/products.py`: OTTO products + creation workflow endpoints
- `app/services/product_creation_service.py`: upload/prepare/validate/create pipeline
- `app/mapper/category_mapper.py`: reusable category mapping engine
- `app/mapper/normalizer.py`: normalized OTTO payload entrypoint
- `app/mapper/seo.py`: SEO description generation entrypoint
- `normalize_product_to_schema.py`: schema transformation implementation
- `generate_seo_descriptions.py`: SEO generation implementation
- `frontend/app/creator/page.tsx`: JSON upload, edit, prepare, create UI

## Notes

- Mapper category data lives in `app/mapper/available_cats.json`.
- Legacy standalone uploader route/page were removed; product file flow is under `/v1/products/*`.
