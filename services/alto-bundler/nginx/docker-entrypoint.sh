#!/bin/sh
# Render the bundler origin-lock nginx config at container start (mirrors the SPA's entrypoint).
#
# ORIGIN_LOCK_ENABLED is DERIVED, never set by hand: the lock turns on iff ORIGIN_LOCK_SECRET is a
# non-empty value. So a deploy without the secret (pre-Cloudflare, or a deliberate open rollout) is
# behaviour-neutral, and mounting the Secret-Manager `origin-lock-secret` is the single switch that
# arms enforcement — you can never half-configure it into a 403-everything brick.
set -eu

# Cloud Run injects Secret Manager values VERBATIM, including any trailing newline the secret file was
# created with. nginx does an EXACT string match in the origin-lock map, so a stray newline (or space)
# makes the ARMED lock 403 every request — the X-Origin-Auth header Cloudflare sends carries no newline.
# The secret is `openssl rand -hex 32` (no internal whitespace), so stripping all whitespace is safe and
# is a no-op for an already-clean value. (This is why the Node relay-gateway works but raw nginx didn't.)
ORIGIN_LOCK_SECRET="$(printf '%s' "${ORIGIN_LOCK_SECRET:-}" | tr -d '[:space:]')"

if [ -n "${ORIGIN_LOCK_SECRET:-}" ]; then
    export ORIGIN_LOCK_ENABLED=1
    echo "[bundler-nginx] origin lock ENABLED (X-Origin-Auth required)"
else
    export ORIGIN_LOCK_ENABLED=0
    export ORIGIN_LOCK_SECRET="__unset__"   # placeholder so envsubst leaves a syntactically valid map
    echo "[bundler-nginx] origin lock DISABLED (ORIGIN_LOCK_SECRET unset) — dev/pre-Cloudflare mode"
fi

# Only substitute our own vars — never touch nginx's runtime $-variables.
envsubst '${ORIGIN_LOCK_ENABLED} ${ORIGIN_LOCK_SECRET}' \
    < /etc/nginx/templates/bundler.conf.template \
    > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
