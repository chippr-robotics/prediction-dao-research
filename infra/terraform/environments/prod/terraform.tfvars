# Production values (spec 085).
#
# No secret values here — only identifiers. Payloads live in Secret Manager and are never declared.

project_id = "chippr-bots-site-wp"
region     = "us-central1"
zone       = "us-central1-a"

artifact_registry_repository = "cloud-run-source-deploy"

# spec 095 MCP server. FALSE, and stated rather than left to the variable's default so that turning
# it on is a one-line diff a reviewer cannot miss. It stays false until
# `.../cloud-run-source-deploy/fairwins-mcp-server/fairwins-mcp-server:latest` exists — no pipeline
# publishes it, and apply on merge is unattended, so a true here would try to create a Cloud Run
# service from an image that is not there. See main.tf's module comment and
# docs/runbooks/member-api-operations.md §3.8.
manage_mcp_server = false

# The gateway keeps its existing account, which holds zero project-level roles beyond telemetry.
gateway_service_account_email = "fairwins-relay-engine@chippr-bots-site-wp.iam.gserviceaccount.com"

# Secrets the gateway node may read, granted per secret. A missing OPTIONAL feature credential
# (OpenSea, Polymarket, Bitcoin) must leave that feature failing closed with 503 rather than taking
# down the gasless relay path — the never-stranded rule.
gateway_secret_ids = [
  "origin-lock-secret",
  "relay-webhook-secret",
  "relay-engine-api-key",
  # FinOps exporter + Alloy (spec 089). All OPTIONAL: an absent vendor credential makes that source
  # `not-configured`, which is a first-class honest state, never a fabricated zero (FR-006).
  "finops-cloudflare-token",
  "finops-quicknode-key",
  "finops-grafana-cloud-token",
  # spec 095. OPTIONAL: absent ⇒ the assistant route answers 503 assistant_unconfigured while the
  # rest of the member API (and the gasless relay path) keeps serving — the never-stranded rule.
  "anthropic-api-key",
  # The keyed Polygon archive endpoint, delivered as RPC_URL_PRIMARY_137 to BOTH containers on this
  # node that read chain 137 (the gateway and the FinOps exporter). OPTIONAL: absent ⇒ both fall back
  # to the public endpoints already listed in RPC_URLS_137, so the gasless relay path keeps serving.
  #
  # ONLY the Polygon HTTP credential is granted here, and the other three QuickNode secrets are
  # deliberately NOT in this list. QUICKNODE_POLYGON_WSS has no consumer (nothing in this estate
  # opens a WebSocket RPC), and the two AMOY secrets have no reader either — there is no Amoy-cohort
  # node. Handing a node a credential nothing on it reads is the opposite of least privilege, and
  # the AMOY pair is the same token behind a `matic-amoy` infix, so a node holding it could be
  # pointed at the wrong chain by a four-character typo that returns 200 rather than 401.
  "QUICKNODE_POLYGON_API",
]

# Secret CONTAINERS under management. Versions and payloads are never declared (guardrail G-04).
managed_secret_ids = [
  "origin-lock-secret",
  "alto-executor-key-137",
  "relay-webhook-secret",
  "relay-engine-api-key",
  # spec 089. Containers only — payloads are created out of band (guardrail G-04). Every one holds a
  # READ-only vendor credential; the exporter must never hold anything that can move value (FR-026).
  "finops-cloudflare-token",
  "finops-quicknode-key",
  "finops-grafana-cloud-token",
  # spec 095. Container only — the payload (the Anthropic API key for the member assistant) is
  # created out of band (guardrail G-04) and read solely by the gateway container.
  "anthropic-api-key",
  # QuickNode Multi-Chain RPC. ALL FOUR are declared, but only QUICKNODE_POLYGON_API is granted to
  # anything (see gateway_secret_ids above and the bundler module in main.tf). Declaring the other
  # three is not busywork: it puts them under `prevent_destroy`, gives them an import block, and
  # turns their empty IAM policy from an accident into a recorded decision. They were hand-created
  # at the console on 2026-08-21 with no Terraform label and no bindings at all.
  #
  # ⚠ ONE ENDPOINT, ONE TOKEN, CHAIN CHOSEN BY A HOSTNAME INFIX. `<name>.matic.quiknode.pro` is
  # Polygon and `<name>.matic-amoy.quiknode.pro` is Amoy, on the SAME credential. A mis-set variable
  # therefore returns valid data FROM THE WRONG CHAIN instead of a 401 — which is why the gateway
  # asserts eth_chainId against every configured endpoint at boot and refuses to start on a mismatch.
  "QUICKNODE_POLYGON_API",
  "QUICKNODE_POLYGON_WSS",
  "QUICKNODE_AMOY_API",
  "QUICKNODE_AMOY_WSS",


  # Workstation secrets (spec 097). Mirrors scripts/secrets/registry.js — the parity test keeps
  # these in step; do not edit one list without the other.
  "fairwins-creator-key",
  "fairwins-deployer-key",
  "fairwins-etherscan-api-key",
  "fairwins-floppy-keystore-password",
  "fairwins-floppy-mordor-password",
  "fairwins-floppy-nazgul-prime-password",
  "fairwins-graph-api-key",
  "fairwins-graph-deploy-key",
  "fairwins-pinata-jwt",
  "fairwins-quicknode-polygon-token",
  "fairwins-quicknode-polygon-url",
  "fairwins-seed-player-keys",
]

# The billing export the FinOps exporter reads. It is the ONLY source of `billed` (as opposed to
# modelled) cost in the estate — Cloudflare and QuickNode publish no dollar figure at all.
billing_export_dataset = "billing_export"

notification_emails = ["cody.w.burns@gmail.com"]

# VM health policies, carried over from ops/monitoring/apply.sh with thresholds unchanged.
vm_alert_policies = {
  vm-cpu-high = {
    display_name   = "FairWins VM CPU high"
    condition_name = "CPU utilization above 90% for 5 minutes"
    filter         = "metric.type=\"compute.googleapis.com/instance/cpu/utilization\" AND resource.type=\"gce_instance\""
    threshold      = 0.9
  }
  vm-memory-high = {
    display_name   = "FairWins VM memory high"
    condition_name = "Memory utilization above 90% for 5 minutes"
    filter         = "metric.type=\"agent.googleapis.com/memory/percent_used\" AND resource.type=\"gce_instance\" AND metric.label.state=\"used\""
    threshold      = 90
  }
  vm-disk-filling = {
    display_name   = "FairWins VM disk filling"
    condition_name = "Disk utilization above 85%"
    filter         = "metric.type=\"agent.googleapis.com/disk/percent_used\" AND resource.type=\"gce_instance\" AND metric.label.state=\"used\""
    threshold      = 85
  }
  vm-instance-down = {
    display_name      = "FairWins VM instance down"
    condition_name    = "Instance uptime signal absent"
    filter            = "metric.type=\"compute.googleapis.com/instance/uptime\" AND resource.type=\"gce_instance\""
    comparison        = "COMPARISON_LT"
    threshold         = 1
    duration_seconds  = 300
    alignment_seconds = 300
    aligner           = "ALIGN_COUNT"
  }
  vm-agent-not-reporting = {
    display_name      = "FairWins VM Ops Agent not reporting"
    condition_name    = "No agent metrics for 10 minutes"
    filter            = "metric.type=\"agent.googleapis.com/agent/uptime\" AND resource.type=\"gce_instance\""
    comparison        = "COMPARISON_LT"
    threshold         = 1
    duration_seconds  = 600
    alignment_seconds = 600
    aligner           = "ALIGN_COUNT"
  }
}

# ── edge ──────────────────────────────────────────────────────────────────────────────────────
#
# FALSE until plan phase E. Both Cloudflare rulesets are AUTHORITATIVE for their phase: the first
# apply deletes any rule added through the dashboard and not declared here. Enable only once the
# change flow and drift detection are proven, and only after recording the live ruleset ids in
# imports.tf.
manage_edge = false

# STILL FALSE. Adoption was attempted and is BLOCKED — not by risk appetite, but because the live
# service cannot be represented: it defines VITE_NETWORK_ID TWICE (63 and 80002) and the module's
# `env` is a map, which cannot hold a duplicate key. See imports.tf for the full finding.
manage_spa = false

# Monitoring is still UNADOPTED and stays gated. All twelve resources exist live and Cloud
# Monitoring accepts duplicates, so an apply here SUCCEEDS and leaves two of every alert policy —
# paging twice while the policy that actually fires stays unmanaged. Adopted in its own PR.
manage_monitoring = false

# cloudflare_zone_id         = "..."
# geo_gate_allowed_countries = [...]   # a legal control (spec 007) — see infra/cloudflare/waf-geo.md

# ── KMS ───────────────────────────────────────────────────────────────────────────────────────
#
# Null until the live ring and key names are recorded. Keys are imported for the audit record and
# their IAM bindings; key VERSIONS are never managed, because a destroyed version is unrecoverable.
# kms_key_ring    = "..."
# kms_crypto_keys = [...]

# ── operator workstation (spec 097) ───────────────────────────────────────────────────────────
#
# Everyone listed here can read every secret below by impersonating fairwins-ops@. That is the
# whole access-review question in one place: this list times that list.
workstation_operators = ["user:cody.w.burns@gmail.com"]

workstation_secret_ids = [
  "fairwins-creator-key",
  "fairwins-deployer-key",
  "fairwins-etherscan-api-key",
  "fairwins-floppy-keystore-password",
  "fairwins-floppy-mordor-password",
  "fairwins-floppy-nazgul-prime-password",
  "fairwins-graph-api-key",
  "fairwins-graph-deploy-key",
  "fairwins-pinata-jwt",
  "fairwins-quicknode-polygon-token",
  "fairwins-quicknode-polygon-url",
  "fairwins-seed-player-keys",
]
