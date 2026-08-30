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
  # QuickNode Multi-Chain RPC. Only QUICKNODE_POLYGON_API is granted to anything (see
  # gateway_secret_ids above and the bundler module in main.tf) and only it still exists — all
  # four were hand-created on 2026-08-21, and the operator deleted the other three on 2026-08-24
  # (Cloud Audit Log, cody.w.burns@gmail.com), leaving only the one this estate reads. The three
  # absent ones stay DECLARED anyway (not busywork: it's what makes a stray future hand-create at
  # the console show up as drift instead of vanishing into an unmanaged secret), and imports.tf
  # is explicit that they are creates, not imports, for exactly that reason.
  #
  # ⚠ ONE ENDPOINT, ONE TOKEN, CHAIN CHOSEN BY A HOSTNAME INFIX. `<name>.matic.quiknode.pro` is
  # Polygon and `<name>.matic-amoy.quiknode.pro` is Amoy, on the SAME credential. A mis-set variable
  # therefore returns valid data FROM THE WRONG CHAIN instead of a 401 — which is why the gateway
  # asserts eth_chainId against every configured endpoint at boot and refuses to start on a mismatch.
  "QUICKNODE_POLYGON_API",
  "QUICKNODE_POLYGON_WSS",
  "QUICKNODE_AMOY_API",
  "QUICKNODE_AMOY_WSS",

  # QuickNode MULTICHAIN endpoints (created at the console 2026-08-30, adopted by import — see
  # imports.tf). One endpoint name + one token serves every network enabled on it; the chain is
  # selected by the hostname infix (`<name>.<network>.quiknode.pro/<token>`, with Ethereum mainnet
  # omitting the infix entirely). The payload stored in each secret is the BASE-network URL; per-
  # chain URLs are derived by swapping the infix — scripts/secrets/quicknode-chains.js holds the
  # slug map and verifies a derived URL answers the right eth_chainId before anyone configures it,
  # because a wrong infix returns 200 with another chain's state, not 401.
  #
  #   001 = base eth   → serves Ethereum 1, Optimism 10, Base 8453, Arbitrum 42161 (frontend
  #         VITE_RPC_URL_* build primaries; the VM nodes read only 63/137 today, so NO node is
  #         granted this — see the commented wiring in infra/vm/common/fetch-secrets.sh for the
  #         day ENABLED_CHAIN_IDS grows)
  #   002 = base matic → same chains as the QUICKNODE_POLYGON/AMOY pair above, which stays the
  #         live credential (alto's ONLY RPC is REQUIRED on it — consolidating onto 002 is a
  #         deliberate future rotation, never a side effect)
  #   003 = base sol   → spec 100 (Solana) is spec+plan only; no consumer exists yet
  #   004 = base btc   → NO CURRENT CONSUMER AND NOT A DROP-IN: the spec-061 gateway module reads
  #         an Esplora-compatible REST API (BTC_ESPLORA_URL, mempool.space shape), not Bitcoin
  #         Core JSON-RPC, which is what this endpoint speaks
  #   005 = base zec   → spec 101 (Zcash) is spec+plan only; no consumer exists yet
  #
  # Declared (not busywork): management is what makes these show as drift instead of vanishing
  # into unmanaged secrets, and prevent_destroy is what stops a container deletion destroying the
  # token. NONE of them is granted to any node — an env var nothing reads is a credential sitting
  # in a container for no benefit (the same reasoning as the WSS/AMOY block above).
  "QUICKNODE_ADMIN_API",
  "QUICKNODE_RPC_001_API",
  "QUICKNODE_RPC_001_WSS",
  "QUICKNODE_RPC_002_API",
  "QUICKNODE_RPC_002_WSS",
  "QUICKNODE_RPC_003_API",
  "QUICKNODE_RPC_003_WSS",
  "QUICKNODE_RPC_004_API",
  "QUICKNODE_RPC_005_API",


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
# EMPTY, deliberately — the five live VM policies are NOT adopted (see the module block in main.tf).
# The module cannot describe them: "VM not reporting" and "Ops Agent not reporting" use
# conditionAbsent where it emits a conditionThreshold, and the CPU policy runs 0.7 over 900s with
# REDUCE_MEAN against 0.9 and defaults here. Importing them would rewrite live alerting while
# reporting an adoption, so they stay live and unmanaged, exactly as they are today.
#
# The intended design is kept below verbatim. It becomes real in the follow-up that teaches the
# module conditionAbsent and per-condition aggregation — at which point these values must ALSO be
# reconciled against the live policies before anything is imported.
vm_alert_policies = {}

# vm_alert_policies = {
#   vm-cpu-high = {
#     display_name   = "FairWins VM CPU high"
#     condition_name = "CPU utilization above 90% for 5 minutes"
#     filter         = "metric.type=\"compute.googleapis.com/instance/cpu/utilization\" AND resource.type=\"gce_instance\""
#     threshold      = 0.9
#   }
#   vm-memory-high = {
#     display_name   = "FairWins VM memory high"
#     condition_name = "Memory utilization above 90% for 5 minutes"
#     filter         = "metric.type=\"agent.googleapis.com/memory/percent_used\" AND resource.type=\"gce_instance\" AND metric.label.state=\"used\""
#     threshold      = 90
#   }
#   vm-disk-filling = {
#     display_name   = "FairWins VM disk filling"
#     condition_name = "Disk utilization above 85%"
#     filter         = "metric.type=\"agent.googleapis.com/disk/percent_used\" AND resource.type=\"gce_instance\" AND metric.label.state=\"used\""
#     threshold      = 85
#   }
#   vm-instance-down = {
#     display_name      = "FairWins VM instance down"
#     condition_name    = "Instance uptime signal absent"
#     filter            = "metric.type=\"compute.googleapis.com/instance/uptime\" AND resource.type=\"gce_instance\""
#     comparison        = "COMPARISON_LT"
#     threshold         = 1
#     duration_seconds  = 300
#     alignment_seconds = 300
#     aligner           = "ALIGN_COUNT"
#   }
#   vm-agent-not-reporting = {
#     display_name      = "FairWins VM Ops Agent not reporting"
#     condition_name    = "No agent metrics for 10 minutes"
#     filter            = "metric.type=\"agent.googleapis.com/agent/uptime\" AND resource.type=\"gce_instance\""
#     comparison        = "COMPARISON_LT"
#     threshold         = 1
#     duration_seconds  = 600
#     alignment_seconds = 600
#     aligner           = "ALIGN_COUNT"
#   }
# }

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

# Monitoring is PARTIALLY adopted: the notification channel and the two uptime checks are imported
# and get per-check uptime alerts. The five VM policies and the probe policy are deliberately NOT
# adopted — see the module block, they use condition types this module cannot express. They stay
# live and unmanaged until the module can describe them.
manage_monitoring = true

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
