# Multi-stage build for React frontend with Vite
# Stage 1: Build the React application
FROM node:20-alpine AS build

WORKDIR /app/frontend

# Copy package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY frontend/ .

# Build arguments for environment variables
ARG VITE_WALLETCONNECT_PROJECT_ID
ARG VITE_APP_URL
ARG VITE_NETWORK_ID
ARG VITE_RPC_URL
ARG VITE_IPFS_GATEWAY
ARG VITE_PINATA_JWT

# Set environment variables from build args
ENV VITE_WALLETCONNECT_PROJECT_ID=${VITE_WALLETCONNECT_PROJECT_ID}
ENV VITE_APP_URL=${VITE_APP_URL}
ENV VITE_NETWORK_ID=${VITE_NETWORK_ID}
ENV VITE_RPC_URL=${VITE_RPC_URL}
ENV VITE_IPFS_GATEWAY=${VITE_IPFS_GATEWAY}
ENV VITE_PINATA_JWT=${VITE_PINATA_JWT}

# Build the application
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy built assets from build stage
COPY --from=build /app/frontend/dist /usr/share/nginx/html

# Copy nginx configuration
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 8080 (Google Cloud Run default)
EXPOSE 8080

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
