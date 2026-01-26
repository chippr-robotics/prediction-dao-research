#!/bin/bash
#
# Perpetual Futures Funding Settlement - Cron Wrapper Script
#
# This script wraps the Node.js settlement script for cron execution.
# It handles environment setup, logging, and error notifications.
#
# Installation:
#   1. Copy this file to your preferred location (e.g., /opt/perp-funding/)
#   2. Edit the configuration section below
#   3. Make executable: chmod +x settle-funding.sh
#   4. Add to crontab:
#      */30 * * * * /opt/perp-funding/settle-funding.sh >> /var/log/perp-funding.log 2>&1
#
# Alternatively, create /etc/cron.d/perp-funding:
#   */30 * * * * root /opt/perp-funding/settle-funding.sh >> /var/log/perp-funding.log 2>&1
#

set -e

# =============================================================================
# CONFIGURATION - Edit these values for your environment
# =============================================================================

# Path to the project directory
# Can be overridden via environment variable or auto-detected
if [ -z "$PROJECT_DIR" ]; then
    # Try to auto-detect project root (script is in scripts/cron/)
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

# Network to use (mordor, mainnet, etc.)
NETWORK="mordor"

# Floppy keystore password (loaded from file for security)
# Create this file with: echo "your-password" > /etc/perp-funding/keystore-password
# chmod 600 /etc/perp-funding/keystore-password
KEYSTORE_PASSWORD_FILE="/etc/perp-funding/keystore-password"

# Optional: Path to floppy mount point (if using floppy keystore)
FLOPPY_MOUNT_POINT="/mnt/floppy"

# Optional: Alert webhook URL (Slack, Discord, etc.)
# ALERT_WEBHOOK=""

# Dry run mode (set to "true" for testing)
DRY_RUN="false"

# =============================================================================
# SCRIPT LOGIC - Generally no need to edit below
# =============================================================================

SCRIPT_NAME=$(basename "$0")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

log() {
    echo "[$TIMESTAMP] [$SCRIPT_NAME] $1"
}

log_error() {
    echo "[$TIMESTAMP] [$SCRIPT_NAME] [ERROR] $1" >&2
}

send_alert() {
    local message="$1"
    if [ -n "$ALERT_WEBHOOK" ]; then
        curl -s -X POST "$ALERT_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"text\": \"Perp Funding Alert: $message\"}" \
            >/dev/null 2>&1 || true
    fi
}

# Validate project directory
if [ ! -d "$PROJECT_DIR" ]; then
    log_error "Project directory not found: $PROJECT_DIR"
    exit 2
fi

# Load keystore password if file exists
if [ -f "$KEYSTORE_PASSWORD_FILE" ]; then
    export FLOPPY_KEYSTORE_PASSWORD=$(cat "$KEYSTORE_PASSWORD_FILE")
    log "Loaded keystore password from file"
else
    log "Warning: Keystore password file not found, using environment variable if set"
fi

# Check if floppy is mounted (optional)
if [ -d "$FLOPPY_MOUNT_POINT" ] && [ "$(ls -A $FLOPPY_MOUNT_POINT 2>/dev/null)" ]; then
    log "Floppy disk detected at $FLOPPY_MOUNT_POINT"
else
    log "Floppy disk not mounted (may use env var fallback)"
fi

# Change to project directory
cd "$PROJECT_DIR"

# Set dry run mode
export DRY_RUN="$DRY_RUN"

log "Starting funding settlement"
log "Network: $NETWORK"
log "Dry run: $DRY_RUN"

# Run the settlement script
EXIT_CODE=0
npx hardhat run scripts/cron/settle-funding.js --network "$NETWORK" || EXIT_CODE=$?

# Handle exit codes
case $EXIT_CODE in
    0)
        log "Settlement completed successfully"
        ;;
    1)
        log_error "Some settlements failed"
        send_alert "Some funding settlements failed on $NETWORK. Check logs for details."
        ;;
    2)
        log_error "All settlements failed or critical error"
        send_alert "CRITICAL: All funding settlements failed on $NETWORK!"
        ;;
    *)
        log_error "Unknown exit code: $EXIT_CODE"
        send_alert "Unexpected error in funding settlement on $NETWORK (exit code: $EXIT_CODE)"
        ;;
esac

log "Finished with exit code: $EXIT_CODE"
exit $EXIT_CODE
