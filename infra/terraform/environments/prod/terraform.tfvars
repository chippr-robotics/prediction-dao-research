# Production values (spec 085).
#
# No secret values here — only identifiers. Payloads live in Secret Manager and are never declared.

project_id = "chippr-bots-site-wp"
region     = "us-central1"
zone       = "us-central1-a"

artifact_registry_repository = "cloud-run-source-deploy"

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

# cloudflare_zone_id         = "..."
# geo_gate_allowed_countries = [...]   # a legal control (spec 007) — see infra/cloudflare/waf-geo.md

# ── KMS ───────────────────────────────────────────────────────────────────────────────────────
#
# Null until the live ring and key names are recorded. Keys are imported for the audit record and
# their IAM bindings; key VERSIONS are never managed, because a destroyed version is unrecoverable.
# kms_key_ring    = "..."
# kms_crypto_keys = [...]
