#!/usr/bin/env bash
#
# SUPERSEDED BY TERRAFORM (spec 085). The VPC, subnet, static IPs, firewall rules, VMs and IAM below
# are now declared in infra/terraform/environments/prod (modules `network` and `edge-node`), and were
# adopted by import rather than recreated — the static IPs are pinned in Cloudflare DNS.
#
# This script is retained for reference: its comments record WHY each rule and grant is shaped the
# way it is, and several of those reasons are carried into the Terraform. It is NOT the source of
# truth. Running it now would create nothing (every step checks for existing state first) but a
# change made here and not in Terraform is reverted on the next apply.
#
# infra/vm/provision.sh — create the two FairWins VMs, their network edge, and their IAM.
#
# IDEMPOTENT: every step checks for existing state first, so it is safe to re-run.
# READ THE RUNBOOK FIRST: docs/runbooks/vm-migration.md. This script does NOT cut traffic over and
# does NOT touch Cloud Run; it only builds the target so cutover is a DNS change.
#
# Usage:  bash infra/vm/provision.sh [network|iam|vms|all]
#
set -euo pipefail

PROJECT="${FW_PROJECT:-chippr-bots-site-wp}"
REGION="${FW_REGION:-us-central1}"
ZONE="${FW_ZONE:-us-central1-a}"
NET="fairwins-infra"
SUBNET="fairwins-infra-usc1"
MACHINE="${FW_MACHINE:-e2-small}"
STEP="${1:-all}"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
have() { gcloud "$@" >/dev/null 2>&1; }

# ---------------------------------------------------------------------------------------------
# 1. NETWORK — a dedicated custom-mode VPC.
#    Custom-mode VPCs get NO default firewall rules, so the project's `default-allow-ssh`
#    (0.0.0.0/0 on :22) and `default-allow-internal` (10.128.0.0/9, every port, no target tags —
#    the same network the public WordPress VM sits on) simply do not apply. There are no deny
#    rules to get wrong, because the default for an unmatched ingress is already deny.
# ---------------------------------------------------------------------------------------------
provision_network() {
  say "VPC ${NET}"
  have compute networks describe "$NET" --project "$PROJECT" \
    || gcloud compute networks create "$NET" --project "$PROJECT" --subnet-mode=custom

  have compute networks subnets describe "$SUBNET" --region "$REGION" --project "$PROJECT" \
    || gcloud compute networks subnets create "$SUBNET" --project "$PROJECT" \
         --network="$NET" --region="$REGION" --range=10.10.0.0/24 \
         --enable-private-ip-google-access

  say "Static external IPs (an ephemeral IP changes on any stop/start and would silently break the Cloudflare origin)"
  for n in fairwins-bundler-ip fairwins-gateway-ip; do
    have compute addresses describe "$n" --region "$REGION" --project "$PROJECT" \
      || gcloud compute addresses create "$n" --project "$PROJECT" --region "$REGION"
  done

  say "Firewall: :443 from Cloudflare ranges only"
  # Cloudflare publishes its egress ranges; fetch them rather than pinning a stale copy.
  local cf_v4 cf_v6
  cf_v4="$(curl -fsS https://www.cloudflare.com/ips-v4 | paste -sd, -)"
  cf_v6="$(curl -fsS https://www.cloudflare.com/ips-v6 | paste -sd, -)"
  [ -n "$cf_v4" ] || { echo "could not fetch Cloudflare IPv4 ranges" >&2; exit 1; }

  gcloud compute firewall-rules delete fairwins-allow-cloudflare --project "$PROJECT" --quiet 2>/dev/null || true
  gcloud compute firewall-rules create fairwins-allow-cloudflare --project "$PROJECT" \
    --network="$NET" --direction=INGRESS --action=ALLOW --rules=tcp:443,tcp:80 \
    --source-ranges="$cf_v4" --target-tags=fairwins-edge \
    --description="Cloudflare -> origin TLS. The origin lock is enforced downstream."
  gcloud compute firewall-rules delete fairwins-allow-cloudflare-v6 --project "$PROJECT" --quiet 2>/dev/null || true
  gcloud compute firewall-rules create fairwins-allow-cloudflare-v6 --project "$PROJECT" \
    --network="$NET" --direction=INGRESS --action=ALLOW --rules=tcp:443,tcp:80 \
    --source-ranges="$cf_v6" --target-tags=fairwins-edge 2>/dev/null || true

  say "Firewall: :443 from Google's uptime probers"
  # Cloudflare's zone-wide WAF geo gate answers 451 to US-sourced requests
  # (infra/cloudflare/waf-geo.md:21) and Google's probers are largely US-based, so checks routed
  # through Cloudflare would be permanently red. The probers hit the origin IP directly instead,
  # restricted here AND by an nginx allow-list on the /__probe/ location.
  local probers
  probers="$(gcloud monitoring uptime list-ips --format='value(ipAddress)' | sed 's#$#/32#' | paste -sd, -)"
  gcloud compute firewall-rules delete fairwins-allow-uptime-probers --project "$PROJECT" --quiet 2>/dev/null || true
  gcloud compute firewall-rules create fairwins-allow-uptime-probers --project "$PROJECT" \
    --network="$NET" --direction=INGRESS --action=ALLOW --rules=tcp:443 \
    --source-ranges="$probers" --target-tags=fairwins-edge \
    --description="Google uptime probers -> /__probe/health, bypassing the Cloudflare geo gate."

  say "Firewall: SSH via IAP only (never 0.0.0.0/0)"
  gcloud compute firewall-rules delete fairwins-allow-iap-ssh --project "$PROJECT" --quiet 2>/dev/null || true
  gcloud compute firewall-rules create fairwins-allow-iap-ssh --project "$PROJECT" \
    --network="$NET" --direction=INGRESS --action=ALLOW --rules=tcp:22 \
    --source-ranges=35.235.240.0/20 --target-tags=fairwins-edge \
    --description="IAP TCP forwarding range only."
}

# ---------------------------------------------------------------------------------------------
# 2. IAM — a NEW minimal SA for the bundler.
#    The bundler runs today as 266380754692-compute@, which holds roles/editor, roles/run.admin,
#    roles/artifactregistry.writer and roles/iam.serviceAccountUser. roles/editor includes
#    iam.serviceAccountKeys.create and iam.serviceAccounts.actAs, so a container escape on the
#    bundler can mint a key for the gateway's SA and sign with the paymaster HSM key. Two VMs buy
#    nothing against that. This SA is a STRICTLY SMALLER grant than what runs in production today.
#    The gateway keeps fairwins-relay-engine@, which already holds ZERO project-level roles.
# ---------------------------------------------------------------------------------------------
provision_iam() {
  local BSA="fairwins-bundler@${PROJECT}.iam.gserviceaccount.com"
  say "Service account ${BSA}"
  have iam service-accounts describe "$BSA" --project "$PROJECT" \
    || gcloud iam service-accounts create fairwins-bundler --project "$PROJECT" \
         --display-name="FairWins alto bundler (VM)" \
         --description="Minimal: read two secrets, pull images, write logs/metrics. No project-level editor."

  # A freshly created service account is not immediately visible to the IAM binding APIs; binding
  # against it fails with "Service account ... does not exist" for a few seconds. Wait for it rather
  # than making the operator re-run the step (this cost one run).
  say "Waiting for ${BSA} to propagate"
  for _ in $(seq 1 30); do
    gcloud iam service-accounts describe "$BSA" --project "$PROJECT" >/dev/null 2>&1 && break
    sleep 2
  done

  say "Resource-scoped secret access (NOT project-wide)"
  for s in alto-executor-key-137 origin-lock-secret; do
    for attempt in 1 2 3 4 5; do
      if gcloud secrets add-iam-policy-binding "$s" --project "$PROJECT" \
           --member="serviceAccount:${BSA}" --role=roles/secretmanager.secretAccessor --quiet >/dev/null 2>&1; then
        break
      fi
      [ "$attempt" = 5 ] && { echo "FATAL: could not bind ${BSA} to secret ${s}" >&2; exit 1; }
      sleep 5
    done
  done

  local GSA="fairwins-relay-engine@${PROJECT}.iam.gserviceaccount.com"

  # Image pull is REPOSITORY-scoped, not project-scoped. Both images live in the same repo:
  #   us-central1-docker.pkg.dev/<proj>/cloud-run-source-deploy/alto:v1.2.7
  #   us-central1-docker.pkg.dev/<proj>/cloud-run-source-deploy/prediction-dao-research/fairwins-relay-gateway
  # so one grant covers both VMs. On Cloud Run the *service agent* pulled images, so neither runtime
  # SA needed this; on a VM the attached SA does the pull. Granting it project-wide would hand both
  # SAs read over every repo in the project — and would destroy the property that makes
  # fairwins-relay-engine@ worth keeping: it holds ZERO project-level roles today.
  say "Artifact Registry read — scoped to the 'cloud-run-source-deploy' repo only"
  for sa in "$BSA" "$GSA"; do
    gcloud artifacts repositories add-iam-policy-binding cloud-run-source-deploy \
      --location="$REGION" --project "$PROJECT" \
      --member="serviceAccount:${sa}" --role=roles/artifactregistry.reader --quiet >/dev/null
  done

  # roles/run.viewer, PROJECT-level, for the bundler SA only. single-alto-gate.sh must be able to
  # read whether the Cloud Run bundler is disarmed, and it FAILS CLOSED when it cannot — so without
  # this the VM's alto can never start. It must be project-level, not service-scoped: gcloud reports
  # a genuine 404 and a permission denial identically ("or resource may not exist") to a caller
  # without read access, and a service-scoped binding disappears with the service at decommission,
  # which would leave the gate unable to tell "deleted" from "forbidden" exactly when it matters.
  # read-only on Cloud Run: no data access, no deploy, no escalation path.
  say "roles/run.viewer for the bundler SA (required by single-alto-gate.sh)"
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${BSA}" --role=roles/run.viewer --quiet >/dev/null

  # Telemetry roles have no resource-scoped equivalent — logWriter/metricWriter are inherently
  # project-level. They grant write-only on logs and metrics: no read, no data access, no escalation
  # path. This is the minimum a monitored VM can run with.
  say "Telemetry (write-only, no resource-scoped equivalent exists)"
  for sa in "$BSA" "$GSA"; do
    for r in roles/logging.logWriter roles/monitoring.metricWriter; do
      gcloud projects add-iam-policy-binding "$PROJECT" \
        --member="serviceAccount:${sa}" --role="$r" --quiet >/dev/null
    done
  done
}

# ---------------------------------------------------------------------------------------------
# 3. VMs — Debian 12 + docker-ce. Chosen over Container-Optimized OS deliberately: COS has no
#    package manager, which makes installing the host nginx TLS terminator and the Ops Agent
#    awkward, and it is materially harder to debug at 3am. `pull_policy: missing` in the compose
#    files removes the boot-time registry dependency COS was buying against.
# ---------------------------------------------------------------------------------------------
provision_vms() {
  local BSA="fairwins-bundler@${PROJECT}.iam.gserviceaccount.com"
  local GSA="fairwins-relay-engine@${PROJECT}.iam.gserviceaccount.com"

  create_vm() {  # create_vm <name> <role> <sa> <ip-name>
    local name="$1" role="$2" sa="$3" ipname="$4"
    if have compute instances describe "$name" --zone "$ZONE" --project "$PROJECT"; then
      say "VM ${name} already exists — skipping"; return 0
    fi
    say "Creating VM ${name} (role=${role}, sa=${sa})"
    gcloud compute instances create "$name" --project "$PROJECT" --zone "$ZONE" \
      --machine-type="$MACHINE" \
      --network-interface="subnet=${SUBNET},address=${ipname}" \
      --service-account="$sa" \
      --scopes=cloud-platform \
      --image-family=debian-12 --image-project=debian-cloud \
      --boot-disk-size=20GB --boot-disk-type=pd-standard \
      --tags=fairwins-edge \
      --labels="app=fairwins,role=${role}" \
      --metadata="fairwins-role=${role}" \
      --metadata-from-file=startup-script=infra/vm/startup.sh \
      --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring
  }

  create_vm fairwins-bundler bundler "$BSA" fairwins-bundler-ip
  create_vm fairwins-gateway gateway "$GSA" fairwins-gateway-ip

  say "Reserved origin IPs (point Cloudflare at these at cutover, NOT before)"
  for n in fairwins-bundler-ip fairwins-gateway-ip; do
    printf '  %-24s %s\n' "$n" "$(gcloud compute addresses describe "$n" --region "$REGION" --project "$PROJECT" --format='value(address)')"
  done
}

case "$STEP" in
  network) provision_network ;;
  iam)     provision_iam ;;
  vms)     provision_vms ;;
  all)     provision_network; provision_iam; provision_vms ;;
  *) echo "usage: $0 [network|iam|vms|all]" >&2; exit 1 ;;
esac

cat <<'EOF'

Next, in order (see docs/runbooks/vm-migration.md):
  1. Install the Cloudflare Origin CA cert on each VM      (MANUAL — Cloudflare dashboard)
  2. bash ops/monitoring/apply.sh                          (uptime checks + alert policies)
  3. Cut the GATEWAY over, soak, then the BUNDLER          (bundler LAST — it has no fallback rail)
EOF
