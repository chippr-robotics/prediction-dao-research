# FairWins relay gateway (spec 036) — intent policy front-end for the OSS submission engine.
#
# BUILD CONTEXT = REPO ROOT (the image bakes in deployments/ for the FR-025 startup check):
#   docker build -f services/relay-gateway/Dockerfile -t fairwins-relay-gateway .
#
# Holds NO keys: the gas hot key lives in the engine (Secret Manager); this container only
# needs the origin-lock + webhook shared secrets injected at runtime (never baked in).
FROM node:20-alpine AS deps
WORKDIR /app
COPY services/relay-gateway/package.json services/relay-gateway/package-lock.json* ./
# Prefer the lockfile when present; fall back to a plain install for local builds.
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; \
    else npm install --omit=dev --no-audit --no-fund; fi

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY services/relay-gateway/package.json ./
COPY services/relay-gateway/src ./src
# Version-pinned target set (FR-025): the deployments records are baked into the image so the
# startup consistency check validates against the exact addresses this build was shipped with.
COPY deployments ./deployments
ENV DEPLOYMENTS_DIR=/app/deployments
# Drop privileges: the node image ships a non-root `node` user.
USER node
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8788)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
