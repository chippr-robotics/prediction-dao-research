/**
 * One Cloud Run service's SHAPE. The running artifact belongs to the build pipeline.
 *
 * THE OWNERSHIP SPLIT IS THE POINT OF THIS MODULE (spec 085 FR-022a, contracts/ownership-boundary.md).
 * Cloud Build deploys a new image on every merge. If Terraform also owned the image, the two would
 * fight and every plan would report drift — and a drift report that is always red is a drift report
 * nobody reads. So:
 *
 *   Terraform owns   scaling, CPU/memory, concurrency, timeout, ingress, runtime service account,
 *                    secret wiring, invoker IAM, domain mapping
 *   Cloud Build owns the image tag and the revision identity, and nothing else
 *
 * The reverse also holds: `cloudbuild.yaml`'s `gcloud run deploy` must not carry shape-setting flags
 * (--min-instances, --cpu, --memory, --ingress, --set-secrets, --allow-unauthenticated, …), or a
 * deploy would silently revert declared shape.
 */

resource "google_cloud_run_v2_service" "this" {
  name     = var.name
  project  = var.project_id
  location = var.region
  ingress  = var.ingress

  template {
    service_account                  = var.service_account_email
    max_instance_request_concurrency = var.concurrency
    timeout                          = "${var.timeout_seconds}s"

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      # Required by the provider, then ignored (see lifecycle below). Use the `:latest` tag the
      # pipeline already publishes alongside the SHA tag, so the value is valid at import time —
      # an invalid reference here makes the very first apply propose a change.
      image = var.image

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
        cpu_idle = var.cpu_idle
      }

      dynamic "env" {
        for_each = var.env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret
              version = env.value.version
            }
          }
        }
      }
    }
  }

  lifecycle {
    # G-07. Changing this list is a change to who owns what — see contracts/ownership-boundary.md
    # before touching it.
    ignore_changes = [
      template[0].containers[0].image,
      template[0].revision,
      client,
      client_version,
    ]
  }
}

/**
 * Public access. This is the IAM binding that `--allow-unauthenticated` sets, which is exactly why
 * that flag must be removed from cloudbuild.yaml in the SAME change that adopts a service — not
 * before (the service would lose public access on the next deploy) and not after (the next deploy
 * would fight Terraform).
 *
 * `_iam_member`, not `_iam_binding`: additive.
 */
resource "google_cloud_run_v2_service_iam_member" "public" {
  count = var.allow_unauthenticated ? 1 : 0

  project  = var.project_id
  location = google_cloud_run_v2_service.this.location
  name     = google_cloud_run_v2_service.this.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_domain_mapping" "this" {
  for_each = toset(var.domain_mappings)

  project  = var.project_id
  location = google_cloud_run_v2_service.this.location
  name     = each.value

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.this.name
  }
}
