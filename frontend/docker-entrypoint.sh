#!/bin/sh
# Docker entrypoint: substitute runtime env vars into the nginx config, then start nginx.
#
# Runtime secrets (from Cloud Run / Secret Manager, NOT build args):
#   - VITE_PINATA_JWT    : Pinata API auth for the /api/pinata proxy
#   - ORIGIN_LOCK_SECRET : Cloudflare-injected X-Origin-Auth value (Spec 007, FR-008)
#
# Origin lock (FR-007/FR-008): Cloudflare injects `X-Origin-Auth: <secret>` on every
# proxied request; nginx serves a request only when it matches ORIGIN_LOCK_SECRET.
# Enforcement is ACTIVE only when the secret is set (ORIGIN_LOCK_ENABLED=1) so local/dev
# and any pre-Cloudflare environment is not bricked. PRODUCTION MUST set the secret.

set -e

if [ -n "$ORIGIN_LOCK_SECRET" ]; then
    export ORIGIN_LOCK_ENABLED=1
else
    export ORIGIN_LOCK_ENABLED=0
fi

# Only substitute the known vars (avoid clobbering nginx's own $variables)
envsubst '${VITE_PINATA_JWT} ${ORIGIN_LOCK_SECRET} ${ORIGIN_LOCK_ENABLED}' \
    < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Status logs — NEVER print the secret values themselves
if [ -n "$VITE_PINATA_JWT" ]; then
    echo "Pinata JWT configured (${#VITE_PINATA_JWT} chars)"
else
    echo "WARNING: VITE_PINATA_JWT is not set - Pinata uploads will fail"
fi

if [ "$ORIGIN_LOCK_ENABLED" = "1" ]; then
    echo "Origin lock ENABLED (X-Origin-Auth required; secret ${#ORIGIN_LOCK_SECRET} chars)"
else
    echo "WARNING: ORIGIN_LOCK_SECRET not set - origin lock DISABLED (dev/local). MUST be set in production."
fi

# Start nginx
exec nginx -g 'daemon off;'
