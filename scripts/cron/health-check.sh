#!/bin/bash
#
# Health Check Script for Cron Operations
#
# Checks if operational scripts are running correctly.
# Suitable for integration with monitoring systems (Nagios, Prometheus, etc.)
#
# Exit codes:
#   0 - OK (all checks passed)
#   1 - WARNING (minor issues)
#   2 - CRITICAL (major issues requiring attention)
#
# Usage:
#   ./health-check.sh                    # Check all scripts
#   ./health-check.sh settle-funding     # Check specific script
#   ./health-check.sh --json             # JSON output for APIs
#

set -e

# =============================================================================
# CONFIGURATION
# =============================================================================

LOG_DIR="${LOG_DIR:-/var/log/perp-funding}"

# Path to the project directory
# Can be overridden via environment variable or auto-detected
if [ -z "$PROJECT_DIR" ]; then
    # Try to auto-detect project root (script is in scripts/cron/)
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

# Thresholds
MAX_LOG_AGE_MINUTES=60       # Alert if no logs in this time
MAX_ERRORS_THRESHOLD=5       # Warning if more errors than this in recent logs
MIN_BALANCE_ETC="0.1"        # Warning if operator balance below this

# Scripts to check
declare -A SCRIPTS=(
    ["settle-funding"]="settle-funding.log"
)

# =============================================================================
# OUTPUT HELPERS
# =============================================================================

JSON_OUTPUT=false
if [[ "$1" == "--json" ]] || [[ "$2" == "--json" ]]; then
    JSON_OUTPUT=true
fi

declare -A RESULTS
OVERALL_STATUS=0

output_result() {
    local name="$1"
    local status="$2"
    local message="$3"

    RESULTS["$name"]="$status:$message"

    if [ "$status" == "CRITICAL" ] && [ $OVERALL_STATUS -lt 2 ]; then
        OVERALL_STATUS=2
    elif [ "$status" == "WARNING" ] && [ $OVERALL_STATUS -lt 1 ]; then
        OVERALL_STATUS=1
    fi

    if [ "$JSON_OUTPUT" == "false" ]; then
        echo "[$status] $name: $message"
    fi
}

output_json() {
    echo "{"
    echo '  "status": "'$([ $OVERALL_STATUS -eq 0 ] && echo "OK" || ([ $OVERALL_STATUS -eq 1 ] && echo "WARNING" || echo "CRITICAL"))'",'
    echo '  "exit_code": '$OVERALL_STATUS','
    echo '  "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",'
    echo '  "checks": {'

    local first=true
    for name in "${!RESULTS[@]}"; do
        IFS=':' read -r status message <<< "${RESULTS[$name]}"
        [ "$first" == "true" ] || echo ","
        echo -n "    \"$name\": {\"status\": \"$status\", \"message\": \"$message\"}"
        first=false
    done

    echo ""
    echo "  }"
    echo "}"
}

# =============================================================================
# CHECK FUNCTIONS
# =============================================================================

check_cron_daemon() {
    if systemctl is-active --quiet cron 2>/dev/null; then
        output_result "cron_daemon" "OK" "Cron daemon is running"
    elif systemctl is-active --quiet crond 2>/dev/null; then
        output_result "cron_daemon" "OK" "Cron daemon is running (crond)"
    else
        output_result "cron_daemon" "CRITICAL" "Cron daemon is not running"
    fi
}

check_log_freshness() {
    local script_name="$1"
    local log_file="$2"
    local full_path="$LOG_DIR/$log_file"

    if [ ! -f "$full_path" ]; then
        output_result "${script_name}_log" "WARNING" "Log file not found: $full_path"
        return
    fi

    # Get last timestamp from log
    local last_entry=$(grep -oP '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}' "$full_path" | tail -1)

    if [ -z "$last_entry" ]; then
        output_result "${script_name}_log" "WARNING" "No timestamped entries in log"
        return
    fi

    local last_epoch=$(date -d "$last_entry" +%s 2>/dev/null || echo 0)
    local now_epoch=$(date +%s)
    local age_minutes=$(( (now_epoch - last_epoch) / 60 ))

    if [ $age_minutes -gt $MAX_LOG_AGE_MINUTES ]; then
        output_result "${script_name}_log" "CRITICAL" "No activity for ${age_minutes} minutes (threshold: ${MAX_LOG_AGE_MINUTES})"
    else
        output_result "${script_name}_log" "OK" "Last activity ${age_minutes} minutes ago"
    fi
}

check_recent_errors() {
    local script_name="$1"
    local log_file="$2"
    local full_path="$LOG_DIR/$log_file"

    if [ ! -f "$full_path" ]; then
        return  # Already reported in log freshness check
    fi

    local error_count=$(tail -200 "$full_path" | grep -c "ERROR\|CRITICAL\|FAILED" || echo 0)

    if [ $error_count -gt $MAX_ERRORS_THRESHOLD ]; then
        output_result "${script_name}_errors" "WARNING" "${error_count} errors in recent logs"
    else
        output_result "${script_name}_errors" "OK" "${error_count} errors in recent logs"
    fi
}

check_last_success() {
    local script_name="$1"
    local log_file="$2"
    local full_path="$LOG_DIR/$log_file"

    if [ ! -f "$full_path" ]; then
        return
    fi

    local last_success=$(grep "SUCCESS\|completed successfully" "$full_path" | tail -1 | grep -oP '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}' || echo "")

    if [ -z "$last_success" ]; then
        output_result "${script_name}_success" "WARNING" "No successful runs found in logs"
    else
        local last_epoch=$(date -d "$last_success" +%s 2>/dev/null || echo 0)
        local now_epoch=$(date +%s)
        local age_hours=$(( (now_epoch - last_epoch) / 3600 ))

        if [ $age_hours -gt 24 ]; then
            output_result "${script_name}_success" "WARNING" "Last success ${age_hours} hours ago"
        else
            output_result "${script_name}_success" "OK" "Last success ${age_hours} hours ago"
        fi
    fi
}

check_operator_balance() {
    if [ ! -d "$PROJECT_DIR" ]; then
        output_result "operator_balance" "WARNING" "Project directory not found"
        return
    fi

    cd "$PROJECT_DIR"

    # Quick balance check using hardhat
    local balance=$(npx hardhat run --network mordor -e "
        const [signer] = await ethers.getSigners();
        const bal = await ethers.provider.getBalance(signer.address);
        console.log(ethers.formatEther(bal));
    " 2>/dev/null | tail -1 || echo "0")

    if [ -z "$balance" ] || [ "$balance" == "0" ]; then
        output_result "operator_balance" "WARNING" "Could not check balance"
        return
    fi

    # Compare balance (using bc for float comparison)
    local is_low=$(echo "$balance < $MIN_BALANCE_ETC" | bc -l 2>/dev/null || echo "0")

    if [ "$is_low" == "1" ]; then
        output_result "operator_balance" "WARNING" "Low balance: ${balance} ETC"
    else
        output_result "operator_balance" "OK" "Balance: ${balance} ETC"
    fi
}

# =============================================================================
# MAIN
# =============================================================================

# Determine which scripts to check
SCRIPTS_TO_CHECK=()
if [ -n "$1" ] && [ "$1" != "--json" ]; then
    SCRIPTS_TO_CHECK+=("$1")
else
    for script in "${!SCRIPTS[@]}"; do
        SCRIPTS_TO_CHECK+=("$script")
    done
fi

# Run checks
check_cron_daemon

for script in "${SCRIPTS_TO_CHECK[@]}"; do
    if [ -n "${SCRIPTS[$script]}" ]; then
        log_file="${SCRIPTS[$script]}"
        check_log_freshness "$script" "$log_file"
        check_recent_errors "$script" "$log_file"
        check_last_success "$script" "$log_file"
    else
        output_result "$script" "WARNING" "Unknown script"
    fi
done

# Optional: Check operator balance (slower, requires network call)
if [ "${CHECK_BALANCE:-false}" == "true" ]; then
    check_operator_balance
fi

# Output results
if [ "$JSON_OUTPUT" == "true" ]; then
    output_json
else
    echo ""
    echo "Overall: $([ $OVERALL_STATUS -eq 0 ] && echo "OK" || ([ $OVERALL_STATUS -eq 1 ] && echo "WARNING" || echo "CRITICAL"))"
fi

exit $OVERALL_STATUS
