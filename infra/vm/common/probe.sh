#!/usr/bin/env bash
#
# infra/vm/common/probe.sh — periodic functional probe, run every 60s by fairwins-probe.timer.
#
# Emits single-line records to stderr -> journald -> Ops Agent -> Cloud Logging, where the log-based
# metric `fairwins_probe_failures` counts every "fairwins-probe FAIL" line and an alert policy pages.
#
# This covers what the uptime checks structurally CANNOT:
#   * numeric thresholds (gas-wallet runway) — a string matcher cannot express "< 24 hours"
#   * a crash-looping engine (the gateway serves /status, the paymaster and the proxies without it,
#     so an uptime check stays green while relaying is dead)
#   * a Cloud Run bundler re-armed by a merge to main — two executors on one EOA, invisible in-band
#
# Secrets are NEVER placed on a command line (/proc/<pid>/cmdline is world-readable). Where the
# origin-lock header is needed, it is passed via a curl config file on stdin.
set -uo pipefail
ROLE="${1:?role required}"

ok()   { printf 'fairwins-probe OK %s %s\n'   "$ROLE" "$*" >&2; }
bad()  { printf 'fairwins-probe FAIL %s %s\n' "$ROLE" "$*" >&2; RC=1; }
RC=0

case "$ROLE" in
  bundler)
    if curl -fsS -m 10 -X POST http://127.0.0.1:8080/ -H 'Content-Type: application/json' \
         -d '{"jsonrpc":"2.0","id":1,"method":"eth_supportedEntryPoints","params":[]}' 2>/dev/null \
         | grep -q 0x5FF137D4; then ok entrypoints; else bad "alto not serving eth_supportedEntryPoints"; fi

    # Re-check the single-alto invariant every minute: a merge to main can re-arm Cloud Run at any
    # time and this VM cannot prevent that — it can only detect it fast.
    if /opt/fairwins/bundler/single-alto-gate.sh >/dev/null 2>&1; then
      ok single-alto
    else
      bad "SECOND EXECUTOR RISK — Cloud Run bundler appears re-armed; run single-alto-gate.sh for detail"
    fi
    ;;

  gateway)
    # Ask for the disclosed view so runway numbers are present. The secret is read from tmpfs and
    # handed to curl via a config file on stdin, never argv.
    status="$(
      { printf 'header = "X-Origin-Auth: '
        sed -n "s/^ORIGIN_AUTH_SECRET='\(.*\)'$/\1/p" /run/fairwins/gateway.env | tr -d '\n'
        printf '"\n'
      } | curl -fsS -m 25 --config - http://127.0.0.1:8788/status 2>/dev/null
    )" || status=""

    if [ -z "$status" ]; then
      bad "gateway /status unreachable"
    else
      ok status
      # Per-chain rpc reachability.
      for chain in 63 137; do
        if printf '%s' "$status" | python3 -c "
import sys,json
d=json.load(sys.stdin); c=d.get('chains',{}).get('$chain')
sys.exit(0 if c and c.get('rpc')=='up' else 1)" 2>/dev/null; then
          ok "chain-$chain-rpc-up"
        else
          bad "chain $chain rpc not up"
        fi
      done
      # Gas-wallet runway — the numeric check no string matcher can do. If the relay gas wallet runs
      # dry, gasless relaying stops platform-wide and members silently fall back to paying their own
      # gas. Threshold is generous because topping up is a manual, human-latency operation.
      printf '%s' "$status" | python3 -c "
import sys,json
d=json.load(sys.stdin)
bad=[]
for cid,c in (d.get('chains') or {}).items():
    r=c.get('gasWalletRunwayHrs')
    if r is not None and r < 48: bad.append(f'{cid}:{r}h')
    p=c.get('paymasterDepositRunwayHrs')
    if p is not None and p < 48: bad.append(f'{cid}-paymaster:{p}h')
print(' '.join(bad))
sys.exit(1 if bad else 0)" >/tmp/.probe_runway 2>/dev/null \
        && ok runway \
        || bad "runway below 48h: $(cat /tmp/.probe_runway 2>/dev/null)"
    fi

    # The engine is the piece whose death is invisible from the public surface: the gateway keeps
    # serving /status, the paymaster and the proxies without it, so every outside-in check stays green
    # while relaying is dead.
    #
    # Two things this check must get right, both learned the hard way:
    #   1. The engine's port is NOT published to the host. Only the namespace owner (gateway) publishes
    #      (127.0.0.1:8788); engine and redis join that namespace, so :8080 is reachable only from
    #      inside it. A host-side curl returns 000 no matter how healthy the engine is.
    #   2. /api/v1/health is the ONLY unauthenticated engine route (matching the client's /api/v1/...
    #      base, engine/client.js:61). /health, /v1/health and / all return 401 -- and `curl -fsS`
    #      treats 401 as failure, so probing those reports a healthy engine as down.
    # Getting either wrong makes this a permanent false page.
    if docker exec fairwins-gateway-gateway \
         wget -qO- --timeout=8 http://127.0.0.1:8080/api/v1/health >/dev/null 2>&1; then
      ok engine
    else
      bad "OZ relayer engine not answering — relaying is down (intents will self-submit)"
    fi
    ;;
  *) bad "unknown role"; ;;
esac

exit $RC
