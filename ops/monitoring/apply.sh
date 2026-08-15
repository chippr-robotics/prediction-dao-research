#!/usr/bin/env bash
#
# SUPERSEDED BY TERRAFORM (spec 087). Monitoring is now declared in
# infra/terraform/modules/monitoring, and the thresholds, uptime targets and content matchers below
# were ported there WITH their reasoning comments — those comments are the point, and a port that
# kept the numbers and dropped them would invite someone to "simplify" the matchers back into the
# form that stayed green through a real outage.
#
# This script is retained for reference and as a break-glass path if Terraform is unavailable. It is
# NOT the source of truth: a change made here and not in Terraform is reverted on the next apply,
# and will show up as drift in the meantime.
#
# ops/monitoring/apply.sh — close the monitoring gap. The project has ZERO uptime checks and ZERO
# alert policies today; verify with `bash ops/monitoring/apply.sh verify`.
#
# WHY THE CHECKS TARGET ORIGIN IPs, NOT HOSTNAMES
# Cloudflare runs a zone-wide WAF geo gate on fairwins.app in allowlist posture whose deny set
# includes US, answering 451 (infra/cloudflare/waf-geo.md:21). Google's uptime probers are largely
# US-based, so any check routed through Cloudflare is permanently red and pages constantly. The
# checks therefore hit the VM origin IPs directly on a dedicated /__probe/health path that is
# exempt from the origin lock and restricted, in both the GCP firewall and nginx, to the 54
# published prober IPs. SSL validation is disabled because the origin serves a Cloudflare Origin CA
# certificate, which is deliberately not publicly trusted.
#
# WHY THE CONTENT MATCHERS ARE WHAT THEY ARE
#   bundler: matches 0x5FF137D4 in an eth_supportedEntryPoints response. A plain 200 proves nothing —
#            the origin-lock nginx's own /healthz is a static `return 200` that never touches alto
#            (bundler.conf.template:52-55), i.e. exactly the check that stayed green through the
#            2026-07-12 outage.
#   gateway: matches "rpc":"up". It must NOT match "status":"ok" — server.js:302 returns that
#            unconditionally even when every chain is down.
# Numeric thresholds (gas-wallet runway) cannot be expressed as a string match and are handled by
# the on-VM probe + the fairwins_probe_failures log metric below.
#
set -euo pipefail
PROJECT="${FW_PROJECT:-chippr-bots-site-wp}"
REGION="${FW_REGION:-us-central1}"
EMAIL="${FW_ALERT_EMAIL:-cody.w.burns@gmail.com}"
BILLING="${FW_BILLING_ACCOUNT:-0166E9-FC2238-00E06F}"
STEP="${1:-all}"
# MUST write to stderr. channel() is consumed via command substitution, so a banner on stdout ends
# up inside $chan and every policy is created with a malformed (i.e. absent) notification channel —
# alerts that fire and page nobody, which looks identical to alerts that never fire.
say() { printf '\n\033[1m==> %s\033[0m\n' "$*" >&2; }

ip_of() { gcloud compute addresses describe "$1" --region "$REGION" --project "$PROJECT" --format='value(address)' 2>/dev/null; }

verify() {
  say "Current state"
  echo "uptime checks: $(gcloud monitoring uptime list-configs --project "$PROJECT" --format='value(name)' 2>/dev/null | wc -l)"
  echo "alert policies: $(gcloud alpha monitoring policies list --project "$PROJECT" --format='value(name)' 2>/dev/null | wc -l)"
  echo "notification channels: $(gcloud alpha monitoring channels list --project "$PROJECT" --format='value(name)' 2>/dev/null | wc -l)"
}

channel() {
  say "Notification channel (email ${EMAIL})"
  local existing
  existing="$(gcloud alpha monitoring channels list --project "$PROJECT" \
      --filter="type=email AND labels.email_address=${EMAIL}" --format='value(name)' 2>/dev/null | head -1)"
  if [ -n "$existing" ]; then echo "$existing"; return; fi
  gcloud alpha monitoring channels create --project "$PROJECT" \
    --display-name="FairWins ops (${EMAIL})" --type=email \
    --channel-labels="email_address=${EMAIL}" --format='value(name)'
}

uptime_checks() {
  local bip gip
  bip="$(ip_of fairwins-bundler-ip)"; gip="$(ip_of fairwins-gateway-ip)"
  [ -n "$bip" ] && [ -n "$gip" ] || { echo "reserve the static IPs first: bash infra/vm/provision.sh network" >&2; exit 1; }

  say "Uptime check: bundler origin ${bip}"
  # NOTE the flag names: the SDK takes --matcher-content / --matcher-type. There is no
  # --content-matcher-content; an earlier draft used it and every command aborted.
  gcloud monitoring uptime create fairwins-bundler-origin --project "$PROJECT" \
    --resource-type=uptime-url --resource-labels="host=${bip},project_id=${PROJECT}" \
    --path="/__probe/health" --port=443 --protocol=https \
    --matcher-content="0x5FF137D4" --matcher-type=contains-string \
    --period=5 --timeout=30 \
    --regions=usa-oregon,usa-virginia,europe,asia-pacific 2>&1 | tail -2 || echo "  (exists?)"

  say "Uptime check: gateway origin ${gip}"
  gcloud monitoring uptime create fairwins-gateway-origin --project "$PROJECT" \
    --resource-type=uptime-url --resource-labels="host=${gip},project_id=${PROJECT}" \
    --path="/__probe/health" --port=443 --protocol=https \
    --matcher-content='"rpc":"up"' --matcher-type=contains-string \
    --period=5 --timeout=30 \
    --regions=usa-oregon,usa-virginia,europe,asia-pacific 2>&1 | tail -2 || echo "  (exists?)"
}

log_metric() {
  say "Log-based metric: fairwins_probe_failures"
  # The on-VM probe emits 'fairwins-probe FAIL <role> <detail>' to journald; the Ops Agent ships it.
  # This is the only path that can express numeric thresholds (gas-wallet runway) and the only one
  # that sees a crash-looping engine, which the public surface hides.
  gcloud logging metrics describe fairwins_probe_failures --project "$PROJECT" >/dev/null 2>&1 \
    || gcloud logging metrics create fairwins_probe_failures --project "$PROJECT" \
         --description="Count of failing FairWins on-VM functional probes (engine down, chain rpc down, gas runway <48h, second-executor risk)" \
         --log-filter='resource.type="gce_instance" AND textPayload:"fairwins-probe FAIL"'
}

policies() {
  local chan; chan="$(channel)"
  say "Alert policies (notifying ${chan})"
  for f in ops/monitoring/policies/*.json; do
    local name; name="$(python3 -c "import json,sys;print(json.load(open('$f'))['displayName'])")"
    if gcloud alpha monitoring policies list --project "$PROJECT" --filter="displayName='${name}'" --format='value(name)' | grep -q .; then
      echo "  exists: ${name}"; continue
    fi
    gcloud alpha monitoring policies create --project "$PROJECT" \
      --policy-from-file="$f" --notification-channels="$chan" --format='value(name)' \
      && echo "  created: ${name}"
  done
}

budget() {
  say "Budget alert on billing account ${BILLING}"
  # The bill was previously unknowable programmatically — no export, no budget. This makes a silent
  # drift impossible. $60/mo is ~2x the projected two-VM steady state (~$32) and well under the
  # $103.81 the Cloud Run pair costs post-right-sizing, so it fires if the migration regresses.
  gcloud billing budgets create --billing-account="$BILLING" \
    --display-name="FairWins infra" --budget-amount=60USD \
    --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0 \
    2>&1 | tail -2 || echo "  (exists, or needs roles/billing.admin on the billing account)"
}

case "$STEP" in
  verify)  verify ;;
  uptime)  uptime_checks ;;
  metric)  log_metric ;;
  policy)  policies ;;
  budget)  budget ;;
  all)     verify; log_metric; uptime_checks; policies; budget; echo; verify ;;
  *) echo "usage: $0 [verify|uptime|metric|policy|budget|all]" >&2; exit 1 ;;
esac
