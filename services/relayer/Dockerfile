# FairWins ZK-Wager Pool gas relayer.
# GAS INFRASTRUCTURE ONLY (see README). Minimal, non-root, no build step.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
# No lockfile is committed for this standalone service; install prod deps deterministically by version.
RUN npm install --omit=dev --no-audit --no-fund

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Drop privileges: the node image ships a non-root `node` user.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
USER node
EXPOSE 8787
# Liveness probe hits the no-secret health endpoint.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
