#!/usr/bin/env bash
#
# infra/vm/bundler/single-alto-gate.sh — make "exactly one alto" MECHANICAL, not procedural.
#
# WHY THIS EXISTS
# ALTO_EXECUTOR_PRIVATE_KEYS and ALTO_UTILITY_PRIVATE_KEY both resolve to the same secret
# (alto-executor-key-137), so a second alto is a second executor on ONE EOA: colliding nonces, stuck
# bundles, and — because ALTO_DEPLOY_SIMULATIONS_CONTRACT=true — even a cold start can emit a
# transaction from that wallet. There is no in-band detection: both instances look healthy.
#
# THREE INDEPENDENT RE-ARMING PATHS EXIST. min-instances=0 alone is NOT sufficient.
#   (a) --min-instances=0 still cold-starts an instance on ANY inbound request, and the Cloud Run
#       service is `run.googleapis.com/ingress: all` with a public *.run.app URL. The origin lock runs
#       INSIDE the instance, so a request that gets 403'd has already started an alto.
#       => the service must ALSO be --ingress=internal (or deleted).
#   (b) .claude/skills/fairwins-infra/manage.sh `cmd_scale up` runs
#       `gcloud run services update --min-instances=1`, which starts an instance regardless of
#       ingress. The skill's own description tells the operator to run it before testing gasless
#       transactions. => it must be neutered before cutover, not at decommission.
#   (c) cloudbuild.yaml renders services/alto-bundler/deploy/service.yaml and runs
#       `gcloud run services replace` on EVERY merge to main. That manifest restores BOTH
#       minScale: "1" AND ingress: all. => the build step must be removed in the cutover commit.
#
# This gate runs as ExecStartPre of the bundler stack AND every 60s from probe.sh, so a merge that
# re-arms Cloud Run is caught within a minute even though it cannot un-start this VM.
#
# Exit 0 = safe to run the VM's alto. Any other exit = do not start / page.
#
set -euo pipefail

PROJECT="${FW_PROJECT:-chippr-bots-site-wp}"
REGION="${FW_REGION:-us-central1}"
SERVICE="${FW_CLOUD_RUN_BUNDLER:-fairwins-alto-bundler}"

log()  { printf '[single-alto-gate] %s\n' "$*" >&2; }
fail() { printf '[single-alto-gate] REFUSE: %s\n' "$*" >&2; exit 1; }

# ---- 1. Cloud Run must be structurally unable to serve a bundler --------------------------------
desc="$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT" \
          --format='value(spec.template.metadata.annotations["autoscaling.knative.dev/minScale"],metadata.annotations["run.googleapis.com/ingress"])' 2>/dev/null || true)"

if [ -z "$desc" ]; then
  log "Cloud Run service '$SERVICE' does not exist — decommissioned. Safe."
else
  min_scale="$(printf '%s' "$desc" | awk '{print $1}')"
  ingress="$(printf '%s' "$desc"  | awk '{print $2}')"
  : "${min_scale:=0}"
  : "${ingress:=all}"

  [ "$min_scale" = "0" ] || fail "Cloud Run '$SERVICE' has minScale=$min_scale — it is running an alto against the SAME executor key. Set --min-instances=0 first."
  [ "$ingress" = "internal" ] || fail "Cloud Run '$SERVICE' ingress=$ingress — any public request cold-starts a second alto (the origin lock runs INSIDE the instance, so even a 403 has already started one). Set --ingress=internal."

  # A revision may still be serving from a warm instance even at minScale=0.
  active="$(gcloud monitoring time-series list \
      --project "$PROJECT" \
      --filter="metric.type=\"run.googleapis.com/container/instance_count\" AND resource.labels.service_name=\"$SERVICE\"" \
      --format='value(points[0].value.int64Value)' 2>/dev/null | head -1 || true)"
  if [ -n "${active:-}" ] && [ "$active" != "0" ]; then
    fail "Cloud Run '$SERVICE' still reports $active live instance(s). Wait for them to drain."
  fi
  log "Cloud Run '$SERVICE': minScale=0, ingress=internal, no live instances. Safe."
fi

# ---- 2. The manage.sh re-arming path must be disarmed -------------------------------------------
# Checked on the VM copy of the repo if present; advisory (warn, do not block) because the skill lives
# on the operator's workstation, not here.
SKILL="${FW_REPO:-/opt/fairwins/repo}/.claude/skills/fairwins-infra/manage.sh"
if [ -f "$SKILL" ] && grep -q 'min-instances' "$SKILL" && ! grep -q 'MIGRATED_TO_VM' "$SKILL"; then
  log "WARNING: $SKILL still has a --min-instances lever and no MIGRATED_TO_VM guard. Running 'manage.sh up' would start a second executor."
fi

# ---- 3. No other alto on THIS host --------------------------------------------------------------
# Compose recreates rather than duplicates, but a hand-run `docker run` would not.
others="$(docker ps --filter 'ancestor=us-central1-docker.pkg.dev/chippr-bots-site-wp/cloud-run-source-deploy/alto:v1.2.7' --format '{{.Names}}' 2>/dev/null | grep -v '^fairwins-bundler-alto' || true)"
[ -z "$others" ] || fail "another alto container is already running on this host: $others"

log "OK — exactly one alto may run."
exit 0
