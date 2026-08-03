#!/usr/bin/env bash
# infra/vm/common/poststart.sh — functional verification after `docker compose up`.
#
# `up -d` (and even `--wait`) proves only that containers are running. It cannot see that alto has
# bound its listener (it binds only AFTER a successful eth_chainId round trip, measured 8.79s) or
# that the gateway can actually reach a chain. Both are asserted here, so a broken start fails the
# unit instead of looking green.
set -euo pipefail
ROLE="${1:?role required}"
DEADLINE=$(( $(date +%s) + 120 ))

log()  { printf '[poststart] %s\n' "$*" >&2; }
fail() { printf '[poststart] FAIL: %s\n' "$*" >&2; exit 1; }

wait_for() {  # wait_for <description> <command...>
  local desc="$1"; shift
  until "$@" >/dev/null 2>&1; do
    [ "$(date +%s)" -lt "$DEADLINE" ] || fail "$desc did not become healthy within the deadline"
    sleep 3
  done
  log "OK: $desc"
}

case "$ROLE" in
  bundler)
    wait_for "alto serving eth_supportedEntryPoints" bash -c \
      'curl -fsS -m 10 -X POST http://127.0.0.1:8080/ -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_supportedEntryPoints\",\"params\":[]}" | grep -q 0x5FF137D4'
    # Proves the RPC round trip alto depends on, not just that it is listening.
    wait_for "alto reporting chainId 0x89 (Polygon)" bash -c \
      'curl -fsS -m 10 -X POST http://127.0.0.1:8080/ -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_chainId\",\"params\":[]}" | grep -q 0x89'
    ;;
  gateway)
    wait_for "gateway /status responding" bash -c \
      'curl -fsS -m 20 http://127.0.0.1:8788/status | grep -q "\"status\":\"ok\""'
    # /status returns ok unconditionally, so assert real chain reachability separately.
    wait_for "at least one chain reporting rpc:up" bash -c \
      'curl -fsS -m 20 http://127.0.0.1:8788/status | grep -q "\"rpc\":\"up\""'
    # The engine is allowed to still be booting (~25s) and gasless intents self-submit until it is
    # up (never-stranded), so this is a WARNING, not a failure.
    # Reached via docker exec, not a host curl: the engine joins the gateway's network namespace and
    # its :8080 is never published to the host. /api/v1/health is the only unauthenticated route
    # (/health, /v1/health and / all 401).
    if ! docker exec fairwins-gateway-gateway \
           wget -qO- --timeout=8 http://127.0.0.1:8080/api/v1/health >/dev/null 2>&1; then
      log "WARNING: engine not answering yet — intents will self-submit until it is up"
    fi
    ;;
  *) fail "unknown role ${ROLE}" ;;
esac

log "${ROLE} stack verified functional"
