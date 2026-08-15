# G-10 violation: the company website — a workload this repository does not own, and whose name
# appears in no deny-list anywhere. The allow-list catches it precisely because nobody had to
# anticipate it.
resource "google_cloud_run_v2_service" "website" {
  name     = "chippr-company-site"
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
