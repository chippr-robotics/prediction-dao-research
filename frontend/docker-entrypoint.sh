#!/bin/sh
# Docker entrypoint script for nginx with runtime environment variable substitution
# This allows VITE_PINATA_JWT to be passed at runtime (from Cloud Run secrets)
# and injected into the nginx configuration

set -e

# Substitute environment variables in nginx config template
# Only substitute VITE_PINATA_JWT to avoid replacing other $ variables in nginx
envsubst '${VITE_PINATA_JWT}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Log configuration status (mask the actual JWT)
if [ -n "$VITE_PINATA_JWT" ]; then
    echo "Pinata JWT configured (${#VITE_PINATA_JWT} chars)"
else
    echo "WARNING: VITE_PINATA_JWT is not set - Pinata uploads will fail"
fi

# Start nginx
exec nginx -g 'daemon off;'
