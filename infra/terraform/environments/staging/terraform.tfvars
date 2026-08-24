# Staging values (spec 085). Identifiers only — no secret values.

project_id = "chippr-bots-site-wp"
region     = "us-central1"

artifact_registry_repository = "cloud-run-source-deploy"

# Lower than production on purpose: staging is a promotion mirror, not a load test.
staging_max_instances = 10

# spec 095 MCP server. FALSE, and stated rather than left to the variable's default so that turning
# it on is a one-line diff a reviewer cannot miss. It stays false until
# `.../cloud-run-source-deploy/fairwins-mcp-server/fairwins-mcp-server-staging:latest` exists — no
# pipeline publishes it, and apply on merge is unattended. See
# docs/runbooks/member-api-operations.md §3.8.
manage_mcp_server = false

# ADOPTED. Both services are imported by the blocks in imports.tf rather than created — the plan
# must read "will be imported" for each and never "must be replaced". The names here are the LIVE
# service names; they were `staging` / `staging-testnet` until the fix that preceded this, which is
# why adoption had to wait for a corrected declaration rather than just a flipped flag.
manage_staging_services = true
