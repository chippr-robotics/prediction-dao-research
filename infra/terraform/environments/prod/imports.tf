/**
 * Declarative adoption of the live estate (spec 087 FR-004/FR-005, research.md R2).
 *
 * WHY `import` BLOCKS AND NOT `terraform import`
 * An import block is visible in the plan BEFORE anything happens: the output literally says
 * "will be imported" versus "must be replaced", so a reviewer sees a destructive adoption before
 * approving it. The CLI equivalent mutates state as a side effect of a command nobody reviewed.
 *
 * THESE BLOCKS STAY AFTER ADOPTION. They are no-ops once the resource is in state, and they are:
 *   - the audit record of how each resource came under management, at any commit
 *   - the recovery path if state is ever lost (re-run them; adoption is reproducible)
 *
 * ⚠ ADOPTION IS GATED. Bring one surface at a time to a clean plan before starting the next. If a
 * plan is not clean, the CONFIGURATION is wrong — fix it here. NEVER apply to force live
 * infrastructure to match a generated body.
 *
 * ⚠ GENERATED CONFIG IS NOT CORRECT CONFIG. `terraform plan -generate-config-out=` emits every
 * attribute the provider read back, including server-populated defaults and computed fields that
 * cannot legally be set. It is a starting point to review and reshape, never something to commit
 * unedited.
 *
 * Enable a surface by uncommenting its group. The real IDs are recorded in data-model.md.
 */

# ── Phase B: network ──────────────────────────────────────────────────────────────────────────

# import {
#   to = module.network.google_compute_network.vpc
#   id = "projects/chippr-bots-site-wp/global/networks/fairwins-infra"
# }
#
# import {
#   to = module.network.google_compute_subnetwork.subnet
#   id = "projects/chippr-bots-site-wp/regions/us-central1/subnetworks/fairwins-infra-usc1"
# }
#
# import {
#   to = module.network.google_compute_address.origin["fairwins-bundler-ip"]
#   id = "projects/chippr-bots-site-wp/regions/us-central1/addresses/fairwins-bundler-ip"
# }
#
# import {
#   to = module.network.google_compute_address.origin["fairwins-gateway-ip"]
#   id = "projects/chippr-bots-site-wp/regions/us-central1/addresses/fairwins-gateway-ip"
# }
#
# import {
#   to = module.network.google_compute_firewall.allow_cloudflare
#   id = "projects/chippr-bots-site-wp/global/firewalls/fairwins-allow-cloudflare"
# }
#
# import {
#   to = module.network.google_compute_firewall.allow_cloudflare_v6
#   id = "projects/chippr-bots-site-wp/global/firewalls/fairwins-allow-cloudflare-v6"
# }
#
# import {
#   to = module.network.google_compute_firewall.allow_uptime_probers
#   id = "projects/chippr-bots-site-wp/global/firewalls/fairwins-allow-uptime-probers"
# }
#
# import {
#   to = module.network.google_compute_firewall.allow_iap_ssh
#   id = "projects/chippr-bots-site-wp/global/firewalls/fairwins-allow-iap-ssh"
# }

# ── Phase B: nodes ────────────────────────────────────────────────────────────────────────────
#
# The firewall names above are the LIVE names from infra/vm/provision.sh (`fairwins-allow-*`), which
# is why main.tf passes `firewall_name_prefix = "fairwins"` rather than letting the module derive
# them from the network name (`fairwins-infra`). Confirm every derived name matches the live name
# before importing.

# import {
#   to = module.bundler.google_compute_instance.node
#   id = "projects/chippr-bots-site-wp/zones/us-central1-a/instances/fairwins-bundler"
# }
#
# import {
#   to = module.bundler.google_service_account.node[0]
#   id = "projects/chippr-bots-site-wp/serviceAccounts/fairwins-bundler@chippr-bots-site-wp.iam.gserviceaccount.com"
# }
#
# import {
#   to = module.gateway.google_compute_instance.node
#   id = "projects/chippr-bots-site-wp/zones/us-central1-a/instances/fairwins-gateway"
# }

# ── Phase D1: secret containers, registry, KMS ────────────────────────────────────────────────
#
# Secret VERSIONS are never imported — only containers and access bindings (guardrail G-04).

# import {
#   to = google_secret_manager_secret.managed["origin-lock-secret"]
#   id = "projects/chippr-bots-site-wp/secrets/origin-lock-secret"
# }
#
# import {
#   to = google_secret_manager_secret.managed["alto-executor-key-137"]
#   id = "projects/chippr-bots-site-wp/secrets/alto-executor-key-137"
# }
#
# import {
#   to = google_artifact_registry_repository.cloud_run_source_deploy
#   id = "projects/chippr-bots-site-wp/locations/us-central1/repositories/cloud-run-source-deploy"
# }

# ── Phase D2: Cloud Run ───────────────────────────────────────────────────────────────────────
#
# The decommissioned alto bundler service is deliberately absent — see main.tf and guardrail G-11.

# import {
#   to = module.spa.google_cloud_run_v2_service.this
#   id = "projects/chippr-bots-site-wp/locations/us-central1/services/prediction-dao-research"
# }

# `module.mcp_server` (spec 095) has NO import block, and that absence is deliberate rather than an
# omission: `fairwins-mcp-server` has never been deployed by hand, so there is nothing to adopt. The
# apply that first sets `manage_mcp_server = true` CREATES it, and its correctness condition is the
# ordinary one — the plan that follows reports no changes. An import block for a resource that does
# not exist fails the plan outright, which is the second reason there is none here: the module is
# gated off, so `module.mcp_server[0]` does not exist to import INTO either.
#
# If the service is ever deployed out of band before that apply, adopt it here instead of letting
# Terraform create a second one. Note the index — the module carries `count`:
#
# import {
#   to = module.mcp_server[0].google_cloud_run_v2_service.this
#   id = "projects/chippr-bots-site-wp/locations/us-central1/services/fairwins-mcp-server"
# }

# ── Phase E: edge ─────────────────────────────────────────────────────────────────────────────
#
# Adopted LAST, on purpose: both rulesets are authoritative for their phase, so the first apply
# deletes any dashboard rule not declared here. Record the live ruleset ids before enabling.

# import {
#   to = module.edge[0].cloudflare_ruleset.waf_geo[0]
#   id = "<zone_id>/<ruleset_id>"
# }
#
# import {
#   to = module.edge[0].cloudflare_ruleset.origin_lock[0]
#   id = "<zone_id>/<ruleset_id>"
# }
