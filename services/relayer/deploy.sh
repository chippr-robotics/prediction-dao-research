#!/usr/bin/env bash
#
# Build + run the FairWins ZK-Wager Pool gas relayer.
# GAS INFRASTRUCTURE ONLY (see README). Reads config from ./.env (copy from .env.example first).
#
# Usage:
#   ./deploy.sh up        # build image + start via docker compose (default)
#   ./deploy.sh down      # stop + remove
#   ./deploy.sh logs      # follow logs
#   ./deploy.sh local     # run directly with node (no docker), for dev
#
set -euo pipefail
cd "$(dirname "$0")"

CMD="${1:-up}"

if [[ "$CMD" != "local" && ! -f .env ]]; then
  echo "error: .env not found. Copy .env.example to .env and fill in RELAYER_PRIVATE_KEY + per-chain config." >&2
  exit 1
fi

# Prefer the modern `docker compose`; fall back to legacy `docker-compose`.
compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

case "$CMD" in
  up)
    compose up -d --build
    echo "relayer started. Health: curl -s http://localhost:\${PORT:-8787}/healthz"
    ;;
  down)
    compose down
    ;;
  logs)
    compose logs -f relayer
    ;;
  local)
    # Dev-only: run with node directly. Loads .env if present.
    if [[ -f .env ]]; then
      set -a; . ./.env; set +a
    fi
    exec node src/server.js
    ;;
  *)
    echo "usage: $0 {up|down|logs|local}" >&2
    exit 2
    ;;
esac
