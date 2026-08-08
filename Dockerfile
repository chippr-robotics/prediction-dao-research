# Multi-stage build for React frontend with Vite
# Stage 1: Build the React application
FROM node:22-alpine AS build

# Build from the REPO ROOT, not frontend/ (spec 075). There is one root lockfile now, so
# `COPY frontend/package*.json` matched only package.json and `npm ci` failed outright with
# "can only install with an existing package-lock.json". Restoring a child lockfile is not the
# fix either: frontend/package.json declares @fairwins/intent-types and @fairwins/miniapp-build,
# which are `private: true` workspace packages that can never resolve from the registry.
WORKDIR /app

# Manifests first, so a source-only change does not invalidate the install layer.
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY packages/intent-types/package.json ./packages/intent-types/
COPY tools/miniapp-build/package.json ./tools/miniapp-build/

RUN npm ci --workspace frontend --include-workspace-root=false

# The linked workspace SOURCES. `npm ci` writes a workspace link whether or not the target
# directory exists — a missing one yields a DANGLING symlink and an install that looks clean,
# which is exactly how the relay-gateway image built successfully and then crashed on boot.
COPY packages/intent-types/ ./packages/intent-types/
COPY tools/miniapp-build/ ./tools/miniapp-build/

# Source + tenant manifests (spec 072 — the tenant-branding plugin resolves tenants/ as a
# sibling of the frontend tree; the build fails loudly if the directory is missing).
COPY frontend/ ./frontend/
COPY tenants/ ./tenants/

WORKDIR /app/frontend

# Build arguments for environment variables (baked into JS bundle at build time)
# Note: VITE_PINATA_JWT is NOT included here - it's handled at runtime via nginx proxy
# Tenant selection (spec 072): one image = one tenant. Unset => the default
# (fairwins) tenant, byte-identical to the pre-072 build.
ARG VITE_TENANT_ID
ARG VITE_WALLETCONNECT_PROJECT_ID
ARG VITE_APP_URL
ARG VITE_NETWORK_ID
ARG VITE_RPC_URL
ARG VITE_IPFS_GATEWAY
# v2 WagerRegistry subgraph (Spec 017 / #707) — public, build-time only.
ARG VITE_SUBGRAPH_URL
ARG VITE_WAGER_SOURCE
# Gasless relayer base URL (spec 036). Unset => gasless disabled, everything self-submits.
ARG VITE_RELAYER_URL
# Passkey ERC-4337 bundler URL(s), comma-separated (spec 041). Unset => passkeyConfig(137) is null,
# so passkey smart accounts stay disabled on Polygon.
ARG VITE_BUNDLER_URLS_POLYGON
# Sponsored-paymaster endpoint (spec 050): the relay-gateway's /v1/paymaster. Set => passkey UserOps
# are gasless (FairWins sponsors gas); unset => the account self-funds and the UI discloses honestly.
ARG VITE_SPONSOR_PAYMASTER_POLYGON

# Set environment variables from build args
ENV VITE_TENANT_ID=${VITE_TENANT_ID}
ENV VITE_WALLETCONNECT_PROJECT_ID=${VITE_WALLETCONNECT_PROJECT_ID}
ENV VITE_APP_URL=${VITE_APP_URL}
ENV VITE_NETWORK_ID=${VITE_NETWORK_ID}
ENV VITE_RPC_URL=${VITE_RPC_URL}
ENV VITE_IPFS_GATEWAY=${VITE_IPFS_GATEWAY}
ENV VITE_SUBGRAPH_URL=${VITE_SUBGRAPH_URL}
ENV VITE_WAGER_SOURCE=${VITE_WAGER_SOURCE}
ENV VITE_RELAYER_URL=${VITE_RELAYER_URL}
ENV VITE_BUNDLER_URLS_POLYGON=${VITE_BUNDLER_URLS_POLYGON}
ENV VITE_SPONSOR_PAYMASTER_POLYGON=${VITE_SPONSOR_PAYMASTER_POLYGON}

# Build the application
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Install envsubst for runtime environment variable substitution
RUN apk add --no-cache gettext

# Copy built assets from build stage
COPY --from=build /app/frontend/dist /usr/share/nginx/html

# Copy nginx configuration template (JWT will be substituted at runtime)
COPY frontend/nginx.conf.template /etc/nginx/conf.d/default.conf.template

# Copy entrypoint script
COPY frontend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose port 8080 (Google Cloud Run default)
EXPOSE 8080

# Use entrypoint script to substitute env vars and start nginx
ENTRYPOINT ["/docker-entrypoint.sh"]
