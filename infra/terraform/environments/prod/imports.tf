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

import {
  to = module.network.google_compute_network.vpc
  id = "projects/chippr-bots-site-wp/global/networks/fairwins-infra"
}
#
import {
  to = module.network.google_compute_subnetwork.subnet
  id = "projects/chippr-bots-site-wp/regions/us-central1/subnetworks/fairwins-infra-usc1"
}
#
import {
  to = module.network.google_compute_address.origin["fairwins-bundler-ip"]
  id = "projects/chippr-bots-site-wp/regions/us-central1/addresses/fairwins-bundler-ip"
}
#
import {
  to = module.network.google_compute_address.origin["fairwins-gateway-ip"]
  id = "projects/chippr-bots-site-wp/regions/us-central1/addresses/fairwins-gateway-ip"
}
#
import {
  to = module.network.google_compute_firewall.allow_cloudflare
  id = "projects/chippr-bots-site-wp/global/firewalls/fairwins-allow-cloudflare"
}
#
import {
  to = module.network.google_compute_firewall.allow_cloudflare_v6
  id = "projects/chippr-bots-site-wp/global/firewalls/fairwins-allow-cloudflare-v6"
}
#
import {
  to = module.network.google_compute_firewall.allow_uptime_probers
  id = "projects/chippr-bots-site-wp/global/firewalls/fairwins-allow-uptime-probers"
}
#
import {
  to = module.network.google_compute_firewall.allow_iap_ssh
  id = "projects/chippr-bots-site-wp/global/firewalls/fairwins-allow-iap-ssh"
}

# ── Phase B: nodes ────────────────────────────────────────────────────────────────────────────
#
# The firewall names above are the LIVE names from infra/vm/provision.sh (`fairwins-allow-*`), which
# is why main.tf passes `firewall_name_prefix = "fairwins"` rather than letting the module derive
# them from the network name (`fairwins-infra`). Confirm every derived name matches the live name
# before importing.

import {
  to = module.bundler.google_compute_instance.node
  id = "projects/chippr-bots-site-wp/zones/us-central1-a/instances/fairwins-bundler"
}
#
import {
  to = module.bundler.google_service_account.node[0]
  id = "projects/chippr-bots-site-wp/serviceAccounts/fairwins-bundler@chippr-bots-site-wp.iam.gserviceaccount.com"
}
#
import {
  to = module.gateway.google_compute_instance.node
  id = "projects/chippr-bots-site-wp/zones/us-central1-a/instances/fairwins-gateway"
}

# ── Phase D1: secret containers, registry, KMS ────────────────────────────────────────────────
#
# Secret VERSIONS are never imported — only containers and access bindings (guardrail G-04).

import {
  to = google_secret_manager_secret.managed["origin-lock-secret"]
  id = "projects/chippr-bots-site-wp/secrets/origin-lock-secret"
}
#
import {
  to = google_secret_manager_secret.managed["alto-executor-key-137"]
  id = "projects/chippr-bots-site-wp/secrets/alto-executor-key-137"
}
#
import {
  to = google_secret_manager_secret.managed["relay-webhook-secret"]
  id = "projects/chippr-bots-site-wp/secrets/relay-webhook-secret"
}
#
import {
  to = google_secret_manager_secret.managed["relay-engine-api-key"]
  id = "projects/chippr-bots-site-wp/secrets/relay-engine-api-key"
}
#
import {
  to = google_artifact_registry_repository.cloud_run_source_deploy
  id = "projects/chippr-bots-site-wp/locations/us-central1/repositories/cloud-run-source-deploy"
}

# ── Phase D1b: workstation secret containers (spec 088) ───────────────────────────────────────
#
# These containers were created out of band by `npm run secrets:migrate -- --apply` when the
# credentials were moved off a developer's .env. They EXIST, so adoption is an import, not a create
# — importing them is what puts `prevent_destroy` in front of live payloads. A plan that offers to
# CREATE any of these means the import did not run, and applying it would fail on an
# already-exists error rather than quietly duplicating anything.
#
# Payload versions are never imported (guardrail G-04).

import {
  to = google_secret_manager_secret.managed["fairwins-creator-key"]
  id = "projects/chippr-bots-site-wp/secrets/fairwins-creator-key"
}
#
import {
  to = google_secret_manager_secret.managed["fairwins-deployer-key"]
  id = "projects/chippr-bots-site-wp/secrets/fairwins-deployer-key"
}
#
import {
  to = google_secret_manager_secret.managed["fairwins-etherscan-api-key"]
  id = "projects/chippr-bots-site-wp/secrets/fairwins-etherscan-api-key"
}
#
import {
  to = google_secret_manager_secret.managed["fairwins-floppy-keystore-password"]
  id = "projects/chippr-bots-site-wp/secrets/fairwins-floppy-keystore-password"
}
#
import {
  to = google_secret_manager_secret.managed["fairwins-floppy-mordor-password"]
  id = "projects/chippr-bots-site-wp/secrets/fairwins-floppy-mordor-password"
}
#
import {
  to = google_secret_manager_secret.managed["fairwins-floppy-nazgul-prime-password"]
  id = "projects/chippr-bots-site-wp/secrets/fairwins-floppy-nazgul-prime-password"
}
#
import {
  to = google_secret_manager_secret.managed["fairwins-graph-api-key"]
  id = "projects/chippr-bots-site-wp/secrets/fairwins-graph-api-key"
}
#
import {
  to = google_secret_manager_secret.managed["fairwins-graph-deploy-key"]
  id = "projects/chippr-bots-site-wp/secrets/fairwins-graph-deploy-key"
}
#
import {
  to = google_secret_manager_secret.managed["fairwins-pinata-jwt"]
  id = "projects/chippr-bots-site-wp/secrets/fairwins-pinata-jwt"
}
#
import {
  to = google_secret_manager_secret.managed["fairwins-quicknode-polygon-token"]
  id = "projects/chippr-bots-site-wp/secrets/fairwins-quicknode-polygon-token"
}
#
import {
  to = google_secret_manager_secret.managed["fairwins-quicknode-polygon-url"]
  id = "projects/chippr-bots-site-wp/secrets/fairwins-quicknode-polygon-url"
}
#
import {
  to = google_secret_manager_secret.managed["fairwins-seed-player-keys"]
  id = "projects/chippr-bots-site-wp/secrets/fairwins-seed-player-keys"
}
#

# ── Phase D2: Cloud Run ───────────────────────────────────────────────────────────────────────
#
# The decommissioned alto bundler service is deliberately absent — see main.tf and guardrail G-11.

# Re-enable together with `manage_spa = true`, once the declaration matches the live service
# (spec 087 T038-T040). While manage_spa is false the module has count 0 and this address does not
# exist, so an active block here fails the plan outright.
# import {
#   to = module.spa[0].google_cloud_run_v2_service.this
#   id = "projects/chippr-bots-site-wp/locations/us-central1/services/prediction-dao-research"
# }

# ── Phase D3: monitoring (spec 087 T052) ──────────────────────────────────────────────────────
#
# These 11 resources were created by `ops/monitoring/apply.sh` and are LIVE. None of them has a
# natural key, so without these blocks the plan CREATES second copies: duplicate alert policies
# (every incident pages twice), duplicate uptime checks (double probing and double cost), and a
# duplicate email channel. That is the single most damaging thing this adoption could do, and it
# would look like an ordinary 11-resource create.
#
# MAPPED BY CONDITION METRIC TYPE, NOT BY DISPLAY NAME. The live names and the declared names differ
# ("FairWins: VM memory above 85%" vs "FairWins VM memory high"), so matching on the string would
# have mismapped several — pointing an imported policy at a condition it was never watching. The
# apply renames them in place, which is a harmless in-place update.

# import {
#   to = module.monitoring.google_monitoring_notification_channel.email["cody.w.burns@gmail.com"]
#   id = "projects/chippr-bots-site-wp/notificationChannels/2280034247916649810"
# }

# import {
#   to = module.monitoring.google_logging_metric.probe_failures[0]
#   id = "fairwins_probe_failures"
# }

# import {
#   to = module.monitoring.google_monitoring_uptime_check_config.this["bundler"]
#   id = "projects/chippr-bots-site-wp/uptimeCheckConfigs/fairwins-bundler-origin-xhuYsm1BGYE"
# }

# import {
#   to = module.monitoring.google_monitoring_uptime_check_config.this["gateway"]
#   id = "projects/chippr-bots-site-wp/uptimeCheckConfigs/fairwins-gateway-origin-K8nmzOn_h10"
# }

# agent.googleapis.com/memory/percent_used
# import {
#   to = module.monitoring.google_monitoring_alert_policy.vm["vm-memory-high"]
#   id = "projects/chippr-bots-site-wp/alertPolicies/14357975034822966786"
# }

# agent.googleapis.com/disk/percent_used
# import {
#   to = module.monitoring.google_monitoring_alert_policy.vm["vm-disk-filling"]
#   id = "projects/chippr-bots-site-wp/alertPolicies/14540079270659295497"
# }

# agent.googleapis.com/agent/uptime
# import {
#   to = module.monitoring.google_monitoring_alert_policy.vm["vm-agent-not-reporting"]
#   id = "projects/chippr-bots-site-wp/alertPolicies/7049084972209223880"
# }

# compute.googleapis.com/instance/uptime
# import {
#   to = module.monitoring.google_monitoring_alert_policy.vm["vm-instance-down"]
#   id = "projects/chippr-bots-site-wp/alertPolicies/7127003534497995938"
# }

# compute.googleapis.com/instance/cpu/utilization
# import {
#   to = module.monitoring.google_monitoring_alert_policy.vm["vm-cpu-high"]
#   id = "projects/chippr-bots-site-wp/alertPolicies/7127003534497996286"
# }

# logging.googleapis.com/user/fairwins_probe_failures
# import {
#   to = module.monitoring.google_monitoring_alert_policy.probe_failing[0]
#   id = "projects/chippr-bots-site-wp/alertPolicies/15034287693947745231"
# }

# ONE live policy, TWO declared. The live "FairWins: origin uptime check failing" watches
# uptime_check/check_passed across both origins; the configuration splits that into a per-origin
# policy so an incident names which origin is down. The live policy is adopted as the BUNDLER one
# and rewritten in place; the gateway policy is genuinely new. Net effect: two correct policies,
# zero duplicates, and no window in which nothing is alerting. Adopting it as "bundler" rather than
# "gateway" is arbitrary — what matters is that it is adopted rather than left to become a third,
# overlapping policy nobody removes.
# import {
#   to = module.monitoring.google_monitoring_alert_policy.uptime["bundler"]
#   id = "projects/chippr-bots-site-wp/alertPolicies/7610110331374984120"
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
