# Basic FastAPI Template

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Environment

Create `.env` from `.env.example` and set your credentials.

```bash
cp .env.example .env
```

Export env vars before running (or use your own env loader):

```bash
export OTTO_CLIENT_ID="your_client_id"
export OTTO_CLIENT_SECRET="your_client_secret"
export OTTO_SCOPE="orders products"
```

## Run

```bash
uvicorn app.main:app --reload
```

App URLs:
- `http://127.0.0.1:8000/`
- `http://127.0.0.1:8000/health`
- `http://127.0.0.1:8000/docs`
- `http://127.0.0.1:8000/auth/token`
- `http://127.0.0.1:8000/auth/token/with-claims`

## Otto Token Request (equivalent curl)

```bash
curl --request POST \
  --url 'https://api.otto.market/v1/token' \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data grant_type=client_credentials \
  --data client_id="$OTTO_CLIENT_ID" \
  --data client_secret="$OTTO_CLIENT_SECRET" \
  --data 'scope=orders products'
```
