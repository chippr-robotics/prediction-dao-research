# Staging values (spec 085). Identifiers only — no secret values.

project_id = "chippr-bots-site-wp"
region     = "us-central1"

artifact_registry_repository = "cloud-run-source-deploy"

# Lower than production on purpose: staging is a promotion mirror, not a load test.
staging_max_instances = 10
