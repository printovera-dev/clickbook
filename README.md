# ClickBook — premium 8×8″ photo books

Monorepo: **Expo (React Native + web)** customer app · **FastAPI** backend · **MongoDB** · VPS file storage.
One backend, one database, one image store — every client (Expo Go, iOS/Android builds, web at https://clickbook.world) sees the same accounts, albums, orders and payments.

```
frontend/         Expo Router app (customer flow + protected /admin area, not linked from customer login)
backend/          FastAPI API (/api/*), image processing (Pillow), PDF renderer, storage manager, seed
backend/deploy/   Production stack: Docker Compose, gunicorn/uvicorn, nginx + Let's Encrypt, systemd, deploy.sh, README
memory/           Product requirements (PRD.md) and test credentials
```

## Run locally
```bash
cd backend && cp .env.example .env && pip install -r requirements.txt && uvicorn server:app --host 0.0.0.0 --port 8001 --reload
cd frontend && cp .env.example .env && yarn && yarn expo start
```
Seed admin: `admin / clickbook@2026` at `/admin/login` — change it after first login.

## Deploy to your VPS (https://clickbook.world)
Follow **`backend/deploy/README.md`**: `sudo ./deploy.sh` installs Docker, obtains TLS, starts nginx → API → Mongo, enables systemd auto-restart, log rotation, health checks and backups.
API on the same domain under `/api/*`; Razorpay webhook `https://clickbook.world/api/payments/razorpay/webhook`.
Web client: `cd frontend && npx expo export -p web` → copy `dist/` into the nginx `web_root` volume (see deploy README).

## Secrets
`.env`, `backend/.env.production`, `backend/deploy/.env` are git-ignored. Templates: `backend/.env.example`, `frontend/.env.example`, `backend/.env.production.example`, `backend/deploy/.env.example`.

## Data model (summary)
- `albums.pages[]`: `photo_ids`, `images{slot → {photo_id, scale, ox, oy, fit}}` (non-destructive crop), `texts[]`, `background`, `layout_id`
- `albums.cover_design {style, photo_id, image, frame, background, texts}`, `albums.design_style`, `albums.locked` (after payment)
- `design_versions` kinds: auto / edit / cover / approved; `orders.album_snapshot` = frozen production design; `orders.album_name` = "Cover Title / dd-mm-yyyy" or "Client / dd-mm-yyyy"
- Files: `storage/clickbook/customers/{cid}/albums/{aid}/{originals,thumbnails,previews,print,pdf}` — Mongo stores paths only
