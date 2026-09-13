#!/usr/bin/env bash
# One-command production deploy for the ClickBook API on a fresh Ubuntu/Debian VPS.
#   sudo ./deploy.sh            # first install (installs docker, obtains TLS cert, starts stack, enables systemd)
#   sudo ./deploy.sh update     # pull latest code from git, rebuild api image, zero-downtime-ish restart
#   sudo ./deploy.sh logs       # tail api logs
#   sudo ./deploy.sh status     # health + container status
set -euo pipefail

DOMAIN="clickbook.world"
APP_DIR="/opt/clickbook"
DEPLOY_DIR="$APP_DIR/backend/deploy"
HERE="$(cd "$(dirname "$0")" && pwd)"
cmd="${1:-install}"

need_root() { [ "$(id -u)" -eq 0 ] || { echo "run with sudo"; exit 1; }; }
dc() { (cd "$DEPLOY_DIR" && docker compose "$@"); }

install_docker() {
  if ! command -v docker >/dev/null; then
    echo "==> Installing Docker"
    curl -fsSL https://get.docker.com | sh
  fi
  docker compose version >/dev/null 2>&1 || { echo "docker compose plugin missing"; exit 1; }
}

sync_code() {
  if [ "$HERE" != "$DEPLOY_DIR" ]; then
    echo "==> Copying repo to $APP_DIR"
    mkdir -p "$APP_DIR"
    rsync -a --delete --exclude storage --exclude .env --exclude __pycache__ --exclude tests "$HERE/../" "$APP_DIR/backend/"
  fi
}

check_env() {
  [ -f "$DEPLOY_DIR/.env" ] || { echo "!! Create $DEPLOY_DIR/.env from deploy/.env.example (Mongo password, email)"; exit 1; }
  [ -f "$APP_DIR/backend/.env.production" ] || { echo "!! Create $APP_DIR/backend/.env.production from .env.production.example (Razorpay, WhatsApp keys)"; exit 1; }
  # shellcheck disable=SC1091
  set -a; . "$DEPLOY_DIR/.env"; set +a
}

obtain_cert() {
  if docker volume inspect clickbook_certbot_etc >/dev/null 2>&1 && \
     docker run --rm -v clickbook_certbot_etc:/etc/letsencrypt alpine test -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem"; then
    echo "==> TLS certificate already present"; return
  fi
  echo "==> Obtaining Let's Encrypt certificate for $DOMAIN (DNS A record must point here)"
  docker volume create clickbook_certbot_etc >/dev/null; docker volume create clickbook_certbot_www >/dev/null
  docker run -d --rm --name cb-bootstrap -p 80:80 \
    -v "$DEPLOY_DIR/nginx/bootstrap.conf:/etc/nginx/conf.d/default.conf:ro" \
    -v clickbook_certbot_www:/var/www/certbot nginx:1.27-alpine >/dev/null
  sleep 2
  docker run --rm -v clickbook_certbot_etc:/etc/letsencrypt -v clickbook_certbot_www:/var/www/certbot certbot/certbot \
    certonly --webroot -w /var/www/certbot -d "$DOMAIN" -d "www.$DOMAIN" \
    --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email --non-interactive
  docker stop cb-bootstrap >/dev/null
}

install_systemd() {
  cp "$DEPLOY_DIR/clickbook.service" /etc/systemd/system/clickbook.service
  systemctl daemon-reload
  systemctl enable clickbook >/dev/null
  # reload nginx daily so renewed certificates are picked up
  cat > /etc/cron.d/clickbook-nginx-reload <<EOF
17 4 * * * root cd $DEPLOY_DIR && /usr/bin/docker compose exec -T nginx nginx -s reload >/dev/null 2>&1
EOF
}

health() {
  for i in $(seq 1 30); do
    if curl -fsS "https://$DOMAIN/api/health" >/dev/null 2>&1; then echo "==> Healthy: https://$DOMAIN/api/health"; return 0; fi
    sleep 3
  done
  echo "!! API not healthy yet; check: $0 logs"; return 1
}

case "$cmd" in
  install)
    need_root; install_docker; sync_code; check_env; obtain_cert
    echo "==> Building and starting stack"; dc up -d --build --remove-orphans
    install_systemd; health
    echo "==> Done. Stack is managed by systemd (clickbook.service) and survives logout/reboot." ;;
  update)
    need_root; sync_code; check_env
    echo "==> Rebuilding api"; dc build api; dc up -d --no-deps api; dc exec -T nginx nginx -s reload || true; health ;;
  logs)   dc logs -f --tail=200 api ;;
  status) dc ps; curl -fsS "https://$DOMAIN/api/health" && echo ;;
  backup)
    need_root; check_env; ts=$(date +%Y%m%d-%H%M)
    mkdir -p "$APP_DIR/backups"
    dc exec -T mongo mongodump --archive -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin --gzip > "$APP_DIR/backups/mongo-$ts.gz"
    docker run --rm -v clickbook_storage_data:/data -v "$APP_DIR/backups":/b alpine tar czf "/b/storage-$ts.tgz" -C /data .
    echo "==> Backups in $APP_DIR/backups" ;;
  *) echo "usage: $0 [install|update|logs|status|backup]"; exit 1 ;;
esac
