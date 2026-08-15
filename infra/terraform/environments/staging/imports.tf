/**
 * Declarative adoption for staging (spec 086 FR-004/FR-005).
 *
 * Same rules as prod: enable one surface at a time, confirm the plan reports "will be imported" and
 * never "must be replaced", and reach a clean plan before moving on. These blocks stay after
 * adoption as the audit record and the state-loss recovery path.
 */

# import {
#   to = module.staging_mainnet.google_cloud_run_v2_service.this
#   id = "projects/chippr-bots-site-wp/locations/us-central1/services/staging"
# }
#
# import {
#   to = module.staging_testnet.google_cloud_run_v2_service.this
#   id = "projects/chippr-bots-site-wp/locations/us-central1/services/staging-testnet"
# }
