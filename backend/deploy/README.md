# ClickBook API — Production deployment on your VPS (https://clickbook.world)

Everything runs under Docker Compose and is supervised by **systemd**, so it keeps running after you log out and restarts on reboot/crash.

| Concern | How it is handled |
|---|---|
| Production server | `gunicorn` process manager with `uvicorn` workers (`deploy/gunicorn.conf.py`), **no** `--reload`/debug |
| Process manager / auto-restart | Docker `restart: unless-stopped` + `clickbook.service` (systemd) |
| Reverse proxy + HTTPS | nginx (TLS 1.2/1.3, HSTS, rate limits, 25 MB uploads) + Let's Encrypt via certbot (auto-renew every 12 h) |
| Domain routing | `clickbook.world` → API under `/api/*`, files under `/api/files/*`, optional web build at `/`; `www` redirects to apex |
| Environment variables | `backend/.env.production` (API secrets) + `deploy/.env` (Mongo password, email) — never committed |
| Database | MongoDB 7 in Docker, auth enabled, persistent volume `mongo_data`, health-checked |
| File storage | VPS disk volume `storage_data` mounted at `/data/storage` (originals / thumbnails / previews / print / pdf) |
| Image processing | Pillow + pillow-heif inside the API image (thumbnail 400px, preview 1200px, print 3000px) |
| PDF generation | Pillow renderer, 8×8 in @ 300 dpi from the frozen approved design, stored on the storage volume |
| Background jobs | CPU work runs in a threadpool per worker; no queue needed at current scale (add Celery/RQ later if PDF volume grows) |
| Logging | gunicorn access/error logs → Docker json-file logs, rotated (20 MB × 5); nginx access/error logs |
| Error handling | FastAPI HTTP errors as JSON; workers recycled every ~2000 requests; unhandled errors → 500 + logged |
| Health check | `GET /api/health` (Docker healthcheck + nginx unthrottled route + deploy script waits for it) |

## 1. Prerequisites
- Ubuntu 22.04/24.04 (or Debian 12) VPS, 2 vCPU / 2 GB RAM minimum, ports **80** and **443** open.
- DNS: `A` records for `clickbook.world` and `www.clickbook.world` → your VPS IP (wait until `dig +short clickbook.world` shows it).
- Your repo (this folder) copied to the VPS, e.g. `git clone … /opt/clickbook` (the script also syncs from wherever you run it).

## 2. Configure secrets (once)
```bash
cd /opt/clickbook/backend
cp .env.production.example .env.production      # Razorpay LIVE keys, WhatsApp keys, DB name
cp deploy/.env.example deploy/.env              # MONGO_ROOT_PASSWORD=$(openssl rand -base64 24), LETSENCRYPT_EMAIL
nano .env.production deploy/.env
```
`MONGO_URL` is injected automatically by compose (`mongodb://user:pass@mongo:27017/?authSource=admin`).

## 3. Install & start (one command)
```bash
cd /opt/clickbook/backend/deploy
chmod +x deploy.sh
sudo ./deploy.sh            # installs Docker, gets the TLS cert, builds, starts, enables systemd, waits for health
```
Verify: `curl https://clickbook.world/api/health` → `{"ok":true,...}`.

## 4. Day-2 operations
```bash
sudo ./deploy.sh update     # after git pull: rebuild + restart API only
sudo ./deploy.sh status     # containers + health
sudo ./deploy.sh logs       # tail API logs
sudo ./deploy.sh backup     # Mongo dump + storage tarball into /opt/clickbook/backups
sudo systemctl restart clickbook      # restart whole stack
docker compose exec -T nginx nginx -s reload   # after editing nginx config
```
Admin seed account: `admin / clickbook@2026` — **change it** after first login (`db.admins.updateOne` or add an admin password endpoint).

## 5. Razorpay
- Dashboard → Webhooks → URL `https://clickbook.world/api/payments/razorpay/webhook`, events `payment.captured`, `payment.failed`, `order.paid`; put the webhook *secret* in `RAZORPAY_WEBHOOK_SECRET`.
- The API verifies checkout signatures (HMAC-SHA256) and webhook signatures; orders are idempotently marked paid and the album design is **locked**.

## 6. Mobile app / web pointing to production
- In `frontend/.env` set `EXPO_PUBLIC_BACKEND_URL=https://clickbook.world` before building the app (Publish → build).
- Optional web: `cd frontend && npx expo export -p web` and copy `dist/*` into the `web_root` volume:
  `docker run --rm -v clickbook_web_root:/w -v $PWD/dist:/src alpine sh -c "cp -r /src/* /w/"`.

## 7. Permanent object storage (S3-compatible)

**Do not switch production to S3 until the bucket exists and the current storage has been backed up and migrated.** Keep local storage enabled while preparing the bucket.

1. In Kuberns, create a private S3-compatible bucket and credentials with permission to list/read/write objects in that bucket. Add these backend environment variables through the Kuberns secret/environment UI (never commit real values): `STORAGE_DRIVER=s3`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION` (if required by the provider), and `S3_ENDPOINT` (for S3-compatible providers; leave empty for AWS S3).
2. Before changing `STORAGE_DRIVER`, take the existing database backup and a complete storage-volume backup. Confirm the actual mounted directory in Kuberns and set `STORAGE_BASE` to that directory for the migration command. The migration script defaults to `/data/storage`; this must match the live source directory.
3. Run a dry run from the backend environment where the old storage directory is mounted and the S3 credentials are available:
   ```bash
   python scripts/migrate_storage_to_s3.py
   ```
   Review the listed files and counts. It does not upload anything by default.
4. Run the verified copy:
   ```bash
   python scripts/migrate_storage_to_s3.py --apply
   ```
   The script never deletes local files, verifies uploaded contents, skips identical objects, and stops if an existing bucket key has different content. Resolve any conflict before proceeding.
5. Verify the migration report and test several existing customer albums, originals, previews, print files, PDFs, production downloads, and home/admin assets. Only after successful verification, set `STORAGE_DRIVER=s3` in Kuberns and deploy/restart during a controlled window. Keep the old storage volume and backup untouched until production is verified.
6. Confirm new uploads still open after a backend restart/redeploy. Then arrange regular database backups and object-storage retention/versioning with the provider.

The backend now fails rather than silently writing to local disk when `STORAGE_DRIVER=s3` is selected without its required access key, secret, and bucket. S3 permission/service failures are surfaced instead of being misreported as missing files.

## 8. Scaling notes
- More API capacity: set `WEB_CONCURRENCY` in `.env.production` (≈ CPU cores) and restart.
