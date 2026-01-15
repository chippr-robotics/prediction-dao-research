#!/bin/bash

# Build frontend for IPFS deployment
# Creates a timestamped archive for easy auditing
#
# Usage: ./scripts/frontend/build-for-ipfs.sh
#
# Output: frontend/dist-archive/fairwins-frontend-YYYYMMDD-HHMMSS.tar.gz

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
ARCHIVE_DIR="$FRONTEND_DIR/dist-archive"

# Generate timestamp for filename (UTC for consistency)
TIMESTAMP=$(date -u +"%Y%m%d-%H%M%S")
ARCHIVE_NAME="fairwins-frontend-${TIMESTAMP}"

echo "=============================================="
echo "Building Frontend for IPFS Deployment"
echo "=============================================="
echo "Timestamp: $TIMESTAMP (UTC)"
echo "Archive name: ${ARCHIVE_NAME}.tar.gz"
echo ""

# Change to frontend directory
cd "$FRONTEND_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Build the frontend
echo "Building frontend..."
npm run build

# Create archive directory if it doesn't exist
mkdir -p "$ARCHIVE_DIR"

# Create the archive
echo "Creating archive..."
cd dist
tar -czvf "$ARCHIVE_DIR/${ARCHIVE_NAME}.tar.gz" .

# Create a latest symlink for convenience
cd "$ARCHIVE_DIR"
rm -f latest.tar.gz
ln -s "${ARCHIVE_NAME}.tar.gz" latest.tar.gz

# Generate a manifest file with build info
cat > "$ARCHIVE_DIR/${ARCHIVE_NAME}.manifest.json" << EOF
{
  "name": "fairwins-frontend",
  "version": "${ARCHIVE_NAME}",
  "buildTimestamp": "${TIMESTAMP}",
  "buildTimestampISO": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "gitCommit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "gitBranch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
  "archiveFile": "${ARCHIVE_NAME}.tar.gz"
}
EOF

# Also create a latest manifest symlink
rm -f latest.manifest.json
ln -s "${ARCHIVE_NAME}.manifest.json" latest.manifest.json

echo ""
echo "=============================================="
echo "Build Complete!"
echo "=============================================="
echo "Archive: $ARCHIVE_DIR/${ARCHIVE_NAME}.tar.gz"
echo "Manifest: $ARCHIVE_DIR/${ARCHIVE_NAME}.manifest.json"
echo ""
echo "To upload to IPFS (using ipfs-car or pinata):"
echo "  ipfs add -r $FRONTEND_DIR/dist"
echo "  # or"
echo "  pinata upload $ARCHIVE_DIR/${ARCHIVE_NAME}.tar.gz"
echo ""
echo "Latest symlinks created:"
echo "  $ARCHIVE_DIR/latest.tar.gz -> ${ARCHIVE_NAME}.tar.gz"
echo "  $ARCHIVE_DIR/latest.manifest.json -> ${ARCHIVE_NAME}.manifest.json"
echo "=============================================="
