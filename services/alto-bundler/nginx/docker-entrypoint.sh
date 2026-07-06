#!/bin/sh
# Render the bundler origin-lock nginx config at container start (mirrors the SPA's entrypoint).
#
# ORIGIN_LOCK_ENABLED is DERIVED, never set by hand: the lock turns on iff ORIGIN_LOCK_SECRET is a
# non-empty value. So a deploy without the secret (pre-Cloudflare, or a deliberate open rollout) is
# behaviour-neutral, and mounting the Secret-Manager `origin-lock-secret` is the single switch that
# arms enforcement — you can never half-configure it into a 403-everything brick.
set -eu

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
