/**
 * One long-running GCE node role (bundler or gateway): the instance, optionally its service
 * account, and that account's RESOURCE-SCOPED IAM.
 *
 * EVERY IAM RESOURCE HERE IS `*_iam_member` — additive. `*_iam_binding` is authoritative for its
 * role and `*_iam_policy` for the entire policy; in a project shared with the WordPress VM and the
 * clearpath / fukuii / kings-edge workloads, either would strip access from principals this
 * repository has never heard of. The guardrail gate rejects both, and the CI identity is not
 * granted project IAM admin, so the same mistake also fails at the API.
 *
 * Debian 12 + docker-ce rather than Container-Optimized OS: COS has no package manager, which makes
 * installing the host nginx TLS terminator and the Ops Agent awkward and is materially harder to
 * debug at 3am.
 */

locals {
  create_sa = var.create_service_account
  sa_email  = local.create_sa ? google_service_account.node[0].email : var.service_account_email
}

resource "google_service_account" "node" {
  count = local.create_sa ? 1 : 0

  project      = var.project_id
  account_id   = var.service_account_id
  display_name = var.service_account_display_name
  description  = var.service_account_description
}

resource "google_compute_instance" "node" {
  name         = var.name
  project      = var.project_id
  zone         = var.zone
  machine_type = var.machine_type

  tags   = var.network_tags
  labels = merge(var.labels, { role = var.role })

  boot_disk {
    initialize_params {
      image = var.boot_image
      size  = var.boot_disk_size_gb
      type  = var.boot_disk_type
    }
  }

  network_interface {
    subnetwork = var.subnet_id

    access_config {
      nat_ip = var.static_ip_address
    }
  }

  service_account {
    email = local.sa_email

    # cloud-platform, narrowed by the service account's own roles. Scopes are a legacy second
    # dimension of authorisation; the roles above are the real boundary.
    scopes = ["cloud-platform"]
  }

  metadata = merge(
    {
      # The startup script reads this to decide which playbook to run.
      fairwins-role = var.role
    },
    var.metadata
  )

  metadata_startup_script = var.startup_script

  dynamic "shielded_instance_config" {
    for_each = var.shielded_vm ? [1] : []
    content {
      enable_secure_boot          = true
      enable_vtpm                 = true
      enable_integrity_monitoring = true
    }
  }

  # The startup script re-reads the repository on every boot, so a script change must not force the
  # instance to be recreated — recreating a node is the riskiest operation available here, and it is
  # never the right response to a configuration edit. Convergence is Ansible's job.
  lifecycle {
    ignore_changes = [metadata_startup_script]
  }
}

# ── IAM: resource-scoped wherever a resource-scoped role exists ────────────────────────────────

/**
 * Secret access is granted PER SECRET. A project-wide grant would hand this node every secret in a
 * shared project, and would destroy the property that makes the gateway's service account worth
 * keeping: it holds ZERO project-level roles today.
 */
resource "google_secret_manager_secret_iam_member" "node" {
  for_each = toset(var.secret_accessor_secrets)

  project   = var.project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.sa_email}"
}

/**
 * Image pull is REPOSITORY-scoped, not project-scoped. On Cloud Run the service agent pulled
 * images, so neither runtime account needed this; on a VM the attached account does the pull.
 */
resource "google_artifact_registry_repository_iam_member" "node" {
  count = var.artifact_registry_repository == null ? 0 : 1

  project    = var.project_id
  location   = var.region
  repository = var.artifact_registry_repository
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${local.sa_email}"
}

/**
 * Project-level roles, for the cases where no resource-scoped equivalent exists.
 *
 * logWriter/metricWriter are inherently project-level and are write-only: no read, no data access,
 * no escalation path. That is the minimum a monitored VM can run with.
 *
 * roles/run.viewer (bundler only) is required by single-alto-gate.sh, which must be able to read
 * whether a Cloud Run bundler is armed and FAILS CLOSED when it cannot. It must be project-level
 * rather than service-scoped: gcloud reports a genuine 404 and a permission denial identically
 * ("or resource may not exist"), and a service-scoped binding disappears with the service at
 * decommission — leaving the gate unable to tell "deleted" from "forbidden" exactly when it matters.
 */
resource "google_project_iam_member" "node" {
  for_each = toset(var.project_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${local.sa_email}"
}
