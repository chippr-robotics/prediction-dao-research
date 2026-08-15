/**
 * Trust root for spec 087 (contracts/state-backend.md, contracts/ci-identity.md).
 *
 * RUN ONCE, BY A HUMAN WITH OWNER RIGHTS. This root is deliberately excluded from the automatic
 * apply workflow: it needs privileges the CI identities do not have, and a mistake here is the one
 * that could sever CI's access entirely.
 *
 * STATE IS LOCAL AND COMMITTED. There is no backend block, and `terraform init -migrate-state` is
 * NOT run afterwards. The bucket cannot store the state that creates it, and the trust root must
 * not depend on itself. Committing `terraform.tfstate` is safe here because this root manages only
 * a bucket, a federation pool and two service accounts — no secrets, no payloads — and it makes the
 * establishment of the trust root auditable at any commit.
 */

terraform {
  required_version = "~> 1.15.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.44"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ── state backend ─────────────────────────────────────────────────────────────────────────────

resource "google_storage_bucket" "tfstate" {
  name     = var.state_bucket_name
  project  = var.project_id
  location = var.region

  # Versioning is the audit record (SC-010) and the recovery path for a corrupted apply.
  versioning {
    enabled = true
  }

  # Per-object ACLs would make the access claim in FR-010 unauditable.
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  # State describes the whole estate, and carries the one accepted sensitive value (the origin-lock
  # header, read through a data source). Bounded history, no unbounded growth.
  lifecycle_rule {
    condition {
      num_newer_versions = 30
    }
    action {
      type = "Delete"
    }
  }

  # Destroying this bucket loses the adoption record for the entire estate.
  lifecycle {
    prevent_destroy = true
  }
}

# ── Workload Identity Federation ───────────────────────────────────────────────────────────────
# No long-lived service account key exists anywhere in this design (FR-032). GitHub's OIDC token is
# exchanged for short-lived credentials at job runtime.

/**
 * THE POOL IS SHARED, AND IS AN INPUT RATHER THAN A MANAGED RESOURCE.
 *
 * `github-actions` already existed when this root first ran, and it is not ours: it carries a
 * provider named `github` whose attribute condition is
 * `attribute.repository == 'chippr-robotics/kings_edge'`. Declaring it as a `resource` here would
 * put another workload's federation entry point into THIS repository's state, where deleting the
 * resource block — or a `terraform destroy` — would take out kings_edge's CI authentication
 * entirely, with nothing in the plan naming kings_edge.
 *
 * This is the same principle as guardrail G-03 (no `google_project` resource): in a shared project,
 * a thing you did not create is an input. We add OUR OWN provider inside the pool below, which is
 * purely additive and leaves the existing provider untouched.
 */
data "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = var.wif_pool_id
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = data.google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  # Without this condition ANY GitHub repository in the world could exchange a token against this
  # pool. The per-identity ref restriction is applied separately, on each service account's
  # workloadIdentityUser binding below.
  attribute_condition = "assertion.repository == \"${var.github_repository}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# ── CI identities ─────────────────────────────────────────────────────────────────────────────
# Two, deliberately. Pull requests come from branches, including forks; a single identity would mean
# any branch that can trigger a workflow can mutate production. The ref restriction on the apply
# identity is what makes "only merged, reviewed code applies" an authentication fact rather than a
# workflow convention.

resource "google_service_account" "tf_plan" {
  project      = var.project_id
  account_id   = "fairwins-tf-plan"
  display_name = "FairWins Terraform plan (read-only)"
  description  = "Pull-request plans. Read-only; holds no mutating permission. Spec 085."
}

resource "google_service_account" "tf_apply" {
  project      = var.project_id
  account_id   = "fairwins-tf-apply"
  display_name = "FairWins Terraform apply"
  description  = "Applies reviewed plans on merge to main. Cannot destroy irreplaceable resources. Spec 085."
}

# Any branch of this repository may impersonate the READ-ONLY identity.
resource "google_service_account_iam_member" "tf_plan_wif" {
  service_account_id = google_service_account.tf_plan.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${data.google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# Only the default branch may impersonate the APPLY identity.
resource "google_service_account_iam_member" "tf_apply_wif" {
  service_account_id = google_service_account.tf_apply.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${data.google_iam_workload_identity_pool.github.name}/attribute.ref/refs/heads/${var.default_branch}"
}

# ── plan identity: read-only ───────────────────────────────────────────────────────────────────

resource "google_project_iam_member" "tf_plan_viewer" {
  project = var.project_id
  role    = "roles/viewer"
  member  = "serviceAccount:${google_service_account.tf_plan.email}"
}

resource "google_storage_bucket_iam_member" "tf_plan_state" {
  bucket = google_storage_bucket.tfstate.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.tf_plan.email}"
}

# ── apply identity: the narrowest set that works ───────────────────────────────────────────────
#
# Every role here is deliberate. See contracts/ci-identity.md for the roles that must NEVER be
# granted and the specific failure each one prevents. In summary:
#
#   roles/owner, roles/editor                     editor includes iam.serviceAccountKeys.create and
#                                                 serviceAccounts.actAs — a CI compromise mints a
#                                                 key for the gateway SA and signs with the
#                                                 paymaster HSM key
#   roles/resourcemanager.projectIamAdmin         the guardrail gate blocks authoritative IAM in
#                                                 CODE; this absence blocks it at the API, which is
#                                                 the layer that still holds when the gate is wrong
#   roles/cloudkms.admin                          a destroyed key version is unrecoverable
#   roles/secretmanager.admin at PROJECT scope    would grant every secret in a shared project
#   roles/iam.serviceAccountKeyAdmin              no long-lived key may be minted by automation

locals {
  tf_apply_project_roles = [
    "roles/compute.networkAdmin",     # VPC, subnet, firewall rules
    "roles/compute.instanceAdmin.v1", # VM lifecycle, metadata, labels
    "roles/run.admin",                # Cloud Run shape + invoker bindings
    "roles/monitoring.editor",        # channels, uptime checks, alert policies
    "roles/logging.configWriter",     # log-based metrics
  ]
}

resource "google_project_iam_member" "tf_apply" {
  for_each = toset(local.tf_apply_project_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.tf_apply.email}"
}

# Custom role rather than roles/iam.serviceAccountAdmin: that role carries
# iam.serviceAccounts.delete, and deleting a service account orphans every binding that references
# it — including bindings on resources this repository does not own.
resource "google_project_iam_custom_role" "tf_service_account_manager" {
  project     = var.project_id
  role_id     = "fairwins.tfServiceAccountManager"
  title       = "FairWins Terraform service account manager"
  description = "Create/read/update service accounts and set their IAM. No delete, no key creation. Spec 085."

  permissions = [
    "iam.serviceAccounts.create",
    "iam.serviceAccounts.get",
    "iam.serviceAccounts.list",
    "iam.serviceAccounts.update",
    "iam.serviceAccounts.getIamPolicy",
    "iam.serviceAccounts.setIamPolicy",
  ]
}

resource "google_project_iam_member" "tf_apply_sa_manager" {
  project = var.project_id
  role    = google_project_iam_custom_role.tf_service_account_manager.id
  member  = "serviceAccount:${google_service_account.tf_apply.email}"
}

resource "google_storage_bucket_iam_member" "tf_apply_state" {
  bucket = google_storage_bucket.tfstate.name
  role   = "roles/storage.objectUser" # not objectAdmin: no bucket configuration rights at runtime
  member = "serviceAccount:${google_service_account.tf_apply.email}"
}

# Artifact Registry admin is REPOSITORY-scoped. Granting it project-wide would hand the CI identity
# every repository in a shared project.
resource "google_artifact_registry_repository_iam_member" "tf_apply" {
  project    = var.project_id
  location   = var.region
  repository = var.artifact_registry_repository
  role       = "roles/artifactregistry.admin"
  member     = "serviceAccount:${google_service_account.tf_apply.email}"
}

# Secret admin is granted PER SECRET, never at project scope.
resource "google_secret_manager_secret_iam_member" "tf_apply" {
  for_each = toset(var.managed_secret_ids)

  project   = var.project_id
  secret_id = each.value
  role      = "roles/secretmanager.admin"
  member    = "serviceAccount:${google_service_account.tf_apply.email}"
}

# actAs is scoped to the node service accounts only — the CI identity must be able to attach them to
# a VM, and nothing more.
resource "google_service_account_iam_member" "tf_apply_act_as" {
  for_each = toset(var.node_service_account_emails)

  service_account_id = "projects/${var.project_id}/serviceAccounts/${each.value}"
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.tf_apply.email}"
}
