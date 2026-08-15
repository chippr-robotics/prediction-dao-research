/**
 * Staging environment (spec 087, and spec 076 FR-023/FR-026).
 *
 * TWO SERVICES FROM ONE COMMIT, and that is the design rather than an accident of convenience.
 * Vite folds VITE_NETWORK_ID into the bundle at build time, so ONE IMAGE RESOLVES EXACTLY ONE
 * cohort. Reaching every cohort therefore means two images and two services — not one service with
 * a runtime cohort switch, which would put a testnet/mainnet seam into code that also ships to
 * production and would make constitution III's boundary a runtime value instead of a build-time
 * fact.
 *
 *   staging          mainnet cohort (Polygon 137)  — the promotion mirror, what main will run next
 *   staging-testnet  testnet cohort (Amoy 80002)   — safe rehearsal, no real funds
 *
 * ⚠ THE MAINNET STAGING SERVICE TOUCHES REAL FUNDS. It has its own funded accounts, gas wallet,
 * paymaster deposit and origin-lock secret, and holds NO admin or deployer key — but the
 * transactions it sends are real.
 *
 * Staging has NO nodes, NO VPC and NO edge configuration: the long-running gasless nodes exist once,
 * in prod. State is a separate prefix, so a staging apply cannot reach prod state at all.
 */

module "staging_mainnet" {
  source = "git::https://github.com/chippr-robotics/chippr-tf-modules.git//modules/cloud-run-service?ref=70498e2a2860f2e65cd2ce3919ca85d29678a1e3"

  project_id = var.project_id
  region     = var.region
  name       = "staging"

  # Required by the provider, then ignored — Cloud Build owns the artifact.
  image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_repository}/prediction-dao-research/staging:latest"

  min_instances         = 0
  max_instances         = var.staging_max_instances
  cpu                   = "1"
  memory                = "512Mi"
  cpu_idle              = true
  allow_unauthenticated = true

  secret_env = var.staging_secret_env
}

module "staging_testnet" {
  source = "git::https://github.com/chippr-robotics/chippr-tf-modules.git//modules/cloud-run-service?ref=70498e2a2860f2e65cd2ce3919ca85d29678a1e3"

  project_id = var.project_id
  region     = var.region
  name       = "staging-testnet"

  image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_repository}/prediction-dao-research/staging-testnet:latest"

  min_instances         = 0
  max_instances         = var.staging_max_instances
  cpu                   = "1"
  memory                = "512Mi"
  cpu_idle              = true
  allow_unauthenticated = true

  secret_env = var.staging_testnet_secret_env
}
