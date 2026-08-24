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
# ── the QuickNode Multi-Chain RPC credentials ─────────────────────────────────────────────────
#
# ADOPTED, NEVER RECREATED. All four were hand-created at the console on 2026-08-21 and carry no
# `goog-terraform-provisioned` label. Verified 2026-08-23 before writing these blocks: each exists,
# each has exactly one ENABLED version, and each replicates `automatic` — which is what
# `google_secret_manager_secret.managed` declares, so adoption is a plain import with no diff. A
# user-managed replication policy would instead have planned a REPLACEMENT, and replacing a secret
# container destroys every version it holds (which is what `prevent_destroy` is there to refuse).
#
# All four are imported even though only QUICKNODE_POLYGON_API is granted to anything. An
# unmanaged secret is invisible; a managed one with a deliberately empty IAM policy is a recorded
# decision. See terraform.tfvars for why the other three have no reader.

# import {
#   to = google_secret_manager_secret.managed["QUICKNODE_POLYGON_API"]
#   id = "projects/chippr-bots-site-wp/secrets/QUICKNODE_POLYGON_API"
# }
#
# import {
#   to = google_secret_manager_secret.managed["QUICKNODE_POLYGON_WSS"]
#   id = "projects/chippr-bots-site-wp/secrets/QUICKNODE_POLYGON_WSS"
# }
#
# import {
#   to = google_secret_manager_secret.managed["QUICKNODE_AMOY_API"]
#   id = "projects/chippr-bots-site-wp/secrets/QUICKNODE_AMOY_API"
# }
#
# import {
#   to = google_secret_manager_secret.managed["QUICKNODE_AMOY_WSS"]
#   id = "projects/chippr-bots-site-wp/secrets/QUICKNODE_AMOY_WSS"
# }
#
# The accessor bindings are deliberately NOT imported: the four secrets have COMPLETELY EMPTY IAM
# policies today (`gcloud secrets get-iam-policy` returns an etag and nothing else), so
# `module.gateway.google_secret_manager_secret_iam_member.node["QUICKNODE_POLYGON_API"]` and its
# bundler twin are genuine CREATES. Importing a binding that does not exist fails the plan.
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

# ── Phase F: monitoring and the SPA — LIVE, DECLARED, NOT ADOPTED ─────────────────────────────────
#
# Both surfaces are gated OFF (`manage_spa`, `manage_monitoring`) because declaring them without
# adopting them is worse than not declaring them at all, in two different ways:
#
#   - the SPA fails LOUDLY. `prediction-dao-research` serves production; a create returns
#     ALREADY_EXISTS and aborts the apply part-way through a graph that also touches the network.
#   - monitoring fails QUIETLY. Cloud Monitoring accepts duplicates, so the apply SUCCEEDS and the
#     estate ends up with two of every alert policy — paging twice, while the policy that actually
#     fires is still the unmanaged one. This is the more dangerous of the two.
#
# The ids below were read from the live project on 2026-08-24 and are ready to use. Uncomment ONE
# group, bring it to a zero-diff plan, flip its `manage_*` flag in the same PR, then start the next.
#
# ⚠ THE UPTIME ALERTS ARE CREATED, NOT IMPORTED, AND THAT IS DELIBERATE. The estate has ONE
# catch-all policy, "FairWins: origin uptime check failing" (7610110331374984120), whose filter
# names no check_id — it fires for any uptime check in the project. The module declares one alert
# per check. One live policy cannot import into two addresses, so this was a design decision and
# it was taken explicitly: per-check, so an alert says WHICH origin failed.
#
# THE CATCH-ALL MUST THEN BE RETIRED, out of band, because Terraform does not manage it:
#
#     gcloud alpha monitoring policies delete 7610110331374984120 --project=chippr-bots-site-wp
#
# Until that runs, every origin failure pages TWICE — once from the catch-all and once from the
# per-check policy. Retiring it also gives up its automatic coverage of any FUTURE uptime check,
# which is the real cost of the choice: a new check now needs its alert declared here.
#
# ⚠ THE FIVE VM POLICIES AND THE PROBE POLICY ARE NOT ADOPTED. They are left commented below
# because the module cannot express what is live: "VM not reporting" and "Ops Agent not reporting"
# use conditionAbsent where the module emits a conditionThreshold — a different condition type, not
# a different number — and the CPU policy runs 0.7/900s with REDUCE_MEAN against the module's
# 0.9/defaults. Importing them would rewrite live alerting while reporting an adoption. They stay
# unmanaged, and `vm_alert_policies = {}` in main.tf is what keeps this PR honest about that.
#
# import {
#   to = module.spa[0].google_cloud_run_v2_service.this
#   id = "projects/chippr-bots-site-wp/locations/us-central1/services/prediction-dao-research"
# }
#
import {
  to = module.monitoring[0].google_monitoring_notification_channel.email["cody.w.burns@gmail.com"]
  id = "projects/chippr-bots-site-wp/notificationChannels/2280034247916649810"
}
#
import {
  to = module.monitoring[0].google_monitoring_uptime_check_config.this["gateway"]
  id = "projects/chippr-bots-site-wp/uptimeCheckConfigs/fairwins-gateway-origin-K8nmzOn_h10"
}
#
import {
  to = module.monitoring[0].google_monitoring_uptime_check_config.this["bundler"]
  id = "projects/chippr-bots-site-wp/uptimeCheckConfigs/fairwins-bundler-origin-xhuYsm1BGYE"
}
#
# import {
#   to = module.monitoring[0].google_monitoring_alert_policy.vm["vm-memory-high"]
#   id = "projects/chippr-bots-site-wp/alertPolicies/14357975034822966786"
# }
#
# import {
#   to = module.monitoring[0].google_monitoring_alert_policy.vm["vm-disk-filling"]
#   id = "projects/chippr-bots-site-wp/alertPolicies/14540079270659295497"
# }
#
# import {
#   to = module.monitoring[0].google_monitoring_alert_policy.vm["vm-agent-not-reporting"]
#   id = "projects/chippr-bots-site-wp/alertPolicies/7049084972209223880"
# }
#
# import {
#   to = module.monitoring[0].google_monitoring_alert_policy.vm["vm-instance-down"]
#   id = "projects/chippr-bots-site-wp/alertPolicies/7127003534497995938"
# }
#
# import {
#   to = module.monitoring[0].google_monitoring_alert_policy.vm["vm-cpu-high"]
#   id = "projects/chippr-bots-site-wp/alertPolicies/7127003534497996286"
# }
#
# import {
#   to = module.monitoring[0].google_monitoring_alert_policy.probe_failing[0]
#   id = "projects/chippr-bots-site-wp/alertPolicies/15034287693947745231"
# }
