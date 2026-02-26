FROM node:20-alpine

# Security: run as non-root
RUN addgroup -S tokenmint && adduser -S tokenmint -G tokenmint

WORKDIR /app

# Install dependencies first (Docker layer cache)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source
COPY src/ ./src/

# Switch to non-root user
USER tokenmint

# Default port
EXPOSE 3000

# Health check against the public health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/v1/health || exit 1

CMD ["node", "src/index.js"]
