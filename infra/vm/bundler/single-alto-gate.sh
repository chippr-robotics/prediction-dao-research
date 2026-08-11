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
#
# THIS BLOCK FAILS CLOSED. An earlier version ran `describe ... 2>/dev/null || true` and treated
# EMPTY OUTPUT as "the service was decommissioned, safe to proceed". That is wrong: describe returns
# empty on a permission error, an expired credential, an API outage and a network failure just as
# readily as on a genuine 404. The bundler VM's service account had no Cloud Run read permission, so
# the gate concluded "decommissioned" and started a second executor against a live Cloud Run bundler.
# Nothing was emitted (verified: nonce and balance unchanged), but the gate had already failed.
#
# A safety gate must never read "I could not determine the state" as "the state is safe". Only an
# unambiguous NOT_FOUND counts as decommissioned; everything else refuses.
err_file="$(mktemp)"
trap 'rm -f "$err_file"' EXIT
set +e
# Parse JSON, NOT --format='value(a,b)'. gcloud omits absent fields entirely rather than emitting an
# empty column, so when minScale is absent (which is the SAFE state — it means 0) the ingress value
# shifts into $1 and the gate read "minScale=internal". It failed closed, so nothing unsafe happened,
# but it blocked a legitimate cutover. Positional parsing of possibly-empty fields is ambiguous by
# construction; read the document instead.
desc="$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT" \
          --format=json 2>"$err_file" \
        | python3 -c '
import sys, json
d = json.load(sys.stdin)
t = d.get("spec", {}).get("template", {}).get("metadata", {}).get("annotations", {}) or {}
s = d.get("metadata", {}).get("annotations", {}) or {}
# Absent minScale means 0; absent ingress means "all" (Cloud Run default, the UNSAFE one).
print(t.get("autoscaling.knative.dev/minScale", "0"), s.get("run.googleapis.com/ingress", "all"))
' 2>>"$err_file")"
rc=$?
set -e

if [ "$rc" -ne 0 ]; then
  # These strings are gcloud's WORDING for a genuine 404, verified against the live SDK -- notably
  # "Cannot find service [...]", which is what it actually prints and which an obvious
  # NOT_FOUND-only pattern misses. Anything not matched here (PERMISSION_DENIED, network, quota,
  # expired credentials) is treated as UNKNOWN and refuses. Note gcloud deliberately conflates 403
  # and 404 as "(or resource may not exist)" when the caller lacks read permission, which is exactly
  # why project-level roles/run.viewer is required for this branch to be reachable at all.
  if grep -qiE 'NOT_FOUND|could not be found|does not exist|Cannot find service' "$err_file"; then
    log "Cloud Run service '$SERVICE' returns NOT_FOUND — decommissioned. Safe."
  else
    fail "cannot determine Cloud Run state for '$SERVICE' (exit $rc): $(tr '\n' ' ' <"$err_file" | head -c 300)
       This is NOT proof the service is gone. Grant this VM's service account roles/run.viewer, or
       delete the Cloud Run service outright. Refusing to start alto while the state is unknown."
  fi
elif [ -z "$desc" ]; then
  fail "Cloud Run describe for '$SERVICE' succeeded but returned no data — cannot confirm it is disarmed. Refusing."
else
  min_scale="$(printf '%s' "$desc" | awk '{print $1}')"
  ingress="$(printf '%s' "$desc"  | awk '{print $2}')"
  : "${min_scale:=0}"
  : "${ingress:=all}"

  [ "$min_scale" = "0" ] || fail "Cloud Run '$SERVICE' has minScale=$min_scale — it is running an alto against the SAME executor key. Set --min-instances=0 first."
  [ "$ingress" = "internal" ] || fail "Cloud Run '$SERVICE' ingress=$ingress — any public request cold-starts a second alto (the origin lock runs INSIDE the instance, so even a 403 has already started one). Set --ingress=internal."

  # ADVISORY ONLY — a warm instance may still be draining at minScale=0. Unlike the checks above,
  # an unreadable result here is NOT treated as proof of anything: it warns rather than passing
  # silently. The structural guarantee is minScale=0 + ingress=internal, already asserted above;
  # this only shortens the window where a draining instance overlaps the VM's alto.
  active="$(gcloud monitoring time-series list \
      --project "$PROJECT" \
      --filter="metric.type=\"run.googleapis.com/container/instance_count\" AND resource.labels.service_name=\"$SERVICE\"" \
      --format='value(points[0].value.int64Value)' 2>/dev/null | head -1 || true)"
  if [ -z "${active:-}" ]; then
    # This fired in the real cutover and the overlap it exists to catch happened anyway: the VM's
    # service account has roles/run.viewer but NOT roles/monitoring.viewer, so the metric read
    # returned nothing and this degraded to a notice. Two altos ran for ~4 minutes.
    # It stays advisory (the structural checks are the guarantee, and they held), but the wording
    # must not imply the check passed — it did not run. Grant roles/monitoring.viewer to make it real.
    log "WARNING: instance_count is UNREADABLE — this check did NOT run (likely missing roles/monitoring.viewer)."
    log "         A draining Cloud Run instance would be invisible here. Note that 'services update'"
    log "         itself starts an instance to health-check the new revision, so a disarm performed"
    log "         moments ago may still be draining. Prefer deleting the service outright."
  elif [ "$active" != "0" ]; then
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
