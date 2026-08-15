# Compliant module: no provider block, no literals, additive IAM only.
resource "google_compute_address" "origin" {
  name    = var.address_name
  project = var.project_id
  region  = var.region

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_project_iam_member" "telemetry" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${var.service_account_email}"
}

resource "google_project_service" "run" {
  project                    = var.project_id
  service                    = "run.googleapis.com"
  disable_on_destroy         = false
  disable_dependent_services = false
}

resource "google_cloud_run_v2_service" "spa" {
  name     = var.service_name
  project  = var.project_id
  location = var.region

  template {
    containers {
      image = var.image
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      template[0].revision,
      client,
      client_version,
    ]
  }
}

# A Cloudflare rule whose `name` is a human-readable label, not an identifier. G-10 must NOT judge
# it: Cloudflare is scoped by zone id and a zone-scoped token, a different boundary from the shared
# GCP project. A gate that fires on correct configuration is a gate someone will switch off.
resource "cloudflare_ruleset" "waf_geo" {
  zone_id = var.zone_id
  name    = "Compliance geo gate"
  kind    = "zone"
  phase   = "http_request_firewall_custom"

  rules = [
    {
      action     = "block"
      expression = "true"
      enabled    = true
    }
  ]
}
