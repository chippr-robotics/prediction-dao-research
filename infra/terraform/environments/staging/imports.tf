/**
 * Declarative adoption for staging (spec 087 FR-004/FR-005).
 *
 * Same rules as prod: enable one surface at a time, confirm the plan reports "will be imported" and
 * never "must be replaced", and reach a clean plan before moving on. These blocks stay after
 * adoption as the audit record and the state-loss recovery path.
 */

import {
  to = module.staging_mainnet[0].google_cloud_run_v2_service.this
  id = "projects/chippr-bots-site-wp/locations/us-central1/services/prediction-dao-research-staging"
}

import {
  to = module.staging_testnet[0].google_cloud_run_v2_service.this
  id = "projects/chippr-bots-site-wp/locations/us-central1/services/prediction-dao-research-staging-testnet"
}

# `module.mcp_server_staging` (spec 095) is deliberately absent here: the service is new, created by
# the apply that first sets `manage_mcp_server = true`, with nothing to adopt — and while the module
# is gated off there is no `[0]` instance to import into either. Same note as prod: if it is ever
# deployed out of band first, adopt it rather than letting Terraform create a second one. Note the
# index — the module carries `count`:
#
# import {
#   to = module.mcp_server_staging[0].google_cloud_run_v2_service.this
#   id = "projects/chippr-bots-site-wp/locations/us-central1/services/fairwins-mcp-server-staging"
# }
