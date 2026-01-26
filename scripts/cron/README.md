# Cron Operations Scripts

Backend operational scripts that run on a schedule to maintain the prediction markets system. These scripts handle recurring tasks like funding settlements, price updates, and market maintenance.

## Overview

```
scripts/cron/
├── README.md                    # This documentation
├── settle-funding.js            # Perpetual futures funding settlement
├── settle-funding.sh            # Shell wrapper for cron
└── (future scripts...)
```

## Design Principles

1. **Resilient**: Scripts check on-chain state, not wall-clock time. Safe to run multiple times.
2. **Self-healing**: Run frequently enough that missed runs are caught quickly.
3. **Observable**: Detailed logging, health checks, and alerting on failures.
4. **Minimal intervention**: Should run indefinitely without human oversight.
5. **Frontend independent**: Backend operations don't burden the user-facing application.

---

## Funding Settlement Script

### Purpose
Settles funding fees for perpetual futures markets every 8 hours. Funding payments flow between long and short position holders to keep perp prices anchored to index prices.

### Schedule
- **Cron frequency**: Every 30 minutes
- **Actual settlements**: ~3 times per day (when 8-hour intervals elapse)
- **Why 30 min**: Provides redundancy - if one run fails, next catches it within 30 min

### Files
- `settle-funding.js` - Main Node.js script
- `settle-funding.sh` - Shell wrapper handling environment setup

### Exit Codes
| Code | Meaning |
|------|---------|
| 0 | Success (settlements executed or none due) |
| 1 | Partial failure (some markets failed) |
| 2 | Critical failure (all failed or script error) |

---

## Deployment Guide

### 1. System Requirements

```bash
# Required
- Node.js 18+
- npm/npx
- Access to Mordor RPC endpoint
- Private key with ETC for gas

# Recommended
- systemd (for service management)
- logrotate (for log management)
```

### 2. Directory Setup

```bash
# Create operations directories
sudo mkdir -p /etc/perp-funding
sudo mkdir -p /var/log/perp-funding
sudo mkdir -p /opt/perp-ops

# Set permissions
sudo chown $USER:$USER /var/log/perp-funding
sudo chmod 700 /etc/perp-funding
```

### 3. Credential Storage

**Option A: Floppy Keystore (Production)**
```bash
# Mount floppy disk with encrypted keystore
npm run floppy:mount

# Password stored securely
echo "your-keystore-password" | sudo tee /etc/perp-funding/keystore-password
sudo chmod 600 /etc/perp-funding/keystore-password
```

**Option B: Environment Variable (Development)**
```bash
# Add to /etc/perp-funding/env
PRIVATE_KEY=0x...
```

### 4. Cron Installation

```bash
# Edit crontab
crontab -e

# Add this line (runs every 30 minutes)
*/30 * * * * /chipprbots/NAS/github/prediction-dao-research/scripts/cron/settle-funding.sh >> /var/log/perp-funding/settle-funding.log 2>&1
```

**Alternative: /etc/cron.d/perp-funding**
```bash
# Create system cron file
sudo tee /etc/cron.d/perp-funding << 'EOF'
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin

# Funding settlement - every 30 minutes
*/30 * * * * root /chipprbots/NAS/github/prediction-dao-research/scripts/cron/settle-funding.sh >> /var/log/perp-funding/settle-funding.log 2>&1
EOF

sudo chmod 644 /etc/cron.d/perp-funding
```

### 5. Log Rotation

```bash
# Create logrotate config
sudo tee /etc/logrotate.d/perp-funding << 'EOF'
/var/log/perp-funding/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 root root
}
EOF
```

---

## Monitoring & Health Checks

### Manual Health Check

```bash
# Check if cron is running
systemctl status cron

# View recent logs
tail -100 /var/log/perp-funding/settle-funding.log

# Check last successful run
grep "SUCCESS" /var/log/perp-funding/settle-funding.log | tail -5

# Check for recent failures
grep "ERROR\|FAILED" /var/log/perp-funding/settle-funding.log | tail -10
```

### Dry Run Test

```bash
# Test without executing transactions
cd /chipprbots/NAS/github/prediction-dao-research
DRY_RUN=true npx hardhat run scripts/cron/settle-funding.js --network mordor
```

### Automated Health Monitoring

Create a health check script that can be called by external monitoring:

```bash
# /opt/perp-ops/health-check.sh
#!/bin/bash

LOG_FILE="/var/log/perp-funding/settle-funding.log"
MAX_AGE_MINUTES=60  # Alert if no log entries in 60 minutes

# Check if log file exists
if [ ! -f "$LOG_FILE" ]; then
    echo "CRITICAL: Log file not found"
    exit 2
fi

# Check last log entry age
LAST_ENTRY=$(tail -1 "$LOG_FILE" | grep -oP '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}')
if [ -z "$LAST_ENTRY" ]; then
    echo "WARNING: No recent log entries"
    exit 1
fi

LAST_EPOCH=$(date -d "$LAST_ENTRY" +%s 2>/dev/null || echo 0)
NOW_EPOCH=$(date +%s)
AGE_MINUTES=$(( (NOW_EPOCH - LAST_EPOCH) / 60 ))

if [ $AGE_MINUTES -gt $MAX_AGE_MINUTES ]; then
    echo "CRITICAL: No log entries for ${AGE_MINUTES} minutes"
    exit 2
fi

# Check for recent errors
RECENT_ERRORS=$(tail -100 "$LOG_FILE" | grep -c "ERROR\|FAILED")
if [ $RECENT_ERRORS -gt 5 ]; then
    echo "WARNING: ${RECENT_ERRORS} errors in recent logs"
    exit 1
fi

echo "OK: Last run ${AGE_MINUTES} minutes ago"
exit 0
```

### Alerting Integration

The shell wrapper supports webhook alerts. Configure in `settle-funding.sh`:

```bash
# Slack webhook
ALERT_WEBHOOK="https://hooks.slack.com/services/xxx/yyy/zzz"

# Discord webhook
ALERT_WEBHOOK="https://discord.com/api/webhooks/xxx/yyy"
```

---

## Operational Workflows

### Daily Operations (Automated)

```
Every 30 minutes:
  1. Cron triggers settle-funding.sh
  2. Script checks all markets for due settlements
  3. If settlement due → execute transaction
  4. If not due → log time remaining and exit
  5. Results logged to /var/log/perp-funding/
```

### Weekly Review (Manual)

```bash
# 1. Check overall health
grep -c "SUCCESS" /var/log/perp-funding/settle-funding.log
grep -c "ERROR" /var/log/perp-funding/settle-funding.log

# 2. Review gas usage
grep "gasUsed" /var/log/perp-funding/settle-funding.log | tail -20

# 3. Check operator balance
npx hardhat run --network mordor -e "
  const [signer] = await ethers.getSigners();
  console.log('Balance:', ethers.formatEther(await ethers.provider.getBalance(signer.address)), 'ETC');
"

# 4. Verify settlements on-chain (spot check)
DRY_RUN=true npx hardhat run scripts/cron/settle-funding.js --network mordor
```

### Incident Response

**Scenario: Script not running**
```bash
# 1. Check cron daemon
systemctl status cron

# 2. Check cron logs
grep CRON /var/log/syslog | tail -20

# 3. Test script manually
cd /chipprbots/NAS/github/prediction-dao-research
./scripts/cron/settle-funding.sh

# 4. If keystore issue
ls -la /mnt/floppy/  # Check floppy mounted
echo $FLOPPY_KEYSTORE_PASSWORD  # Check env var
```

**Scenario: Settlements failing**
```bash
# 1. Check error messages
grep "ERROR" /var/log/perp-funding/settle-funding.log | tail -20

# 2. Check operator balance (out of gas?)
# (see weekly review command above)

# 3. Check contract state
DRY_RUN=true npx hardhat run scripts/cron/settle-funding.js --network mordor

# 4. Check if markets are paused
# (script logs will show "market_paused" reason)
```

**Scenario: Missed settlements (cron was down)**
```bash
# No manual intervention needed!
# The script is idempotent - just restart cron
# Next run will settle any overdue markets

sudo systemctl restart cron
```

### Adding New Markets

When new perpetual markets are deployed:

1. Update deployment file: `deployments/mordor-perpetual-futures-v2.1-deployment.json`
2. Add new market to the `markets` array
3. Script will automatically detect and process new markets on next run
4. No code changes required

---

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| "Floppy not mounted" | Keystore disk not available | Mount floppy or use PRIVATE_KEY env var |
| "Invalid password" | Wrong keystore password | Check /etc/perp-funding/keystore-password |
| "Insufficient balance" | Out of gas | Top up operator wallet with ETC |
| "Funding interval not reached" | Normal - settlement not due | No action needed |
| "Market paused" | Market temporarily disabled | Check with admin if unexpected |
| Script never runs | Cron misconfigured | Check crontab and cron daemon status |
| Old log entries only | Script failing silently | Run manually to see errors |

---

## Future Scripts

This cron infrastructure is designed to support additional operational scripts:

| Script | Purpose | Frequency |
|--------|---------|-----------|
| `settle-funding.js` | Funding fee settlements | Every 30 min |
| `update-prices.js` | Oracle price updates | Every 5 min (future) |
| `check-liquidations.js` | Liquidation monitoring | Every 10 min (future) |
| `backup-state.js` | Off-chain state backup | Daily (future) |

When adding new scripts:
1. Create `script-name.js` with same patterns (logging, exit codes, dry-run)
2. Create `script-name.sh` wrapper (copy settle-funding.sh as template)
3. Add cron entry
4. Add logrotate rule if separate log file
5. Update this README
