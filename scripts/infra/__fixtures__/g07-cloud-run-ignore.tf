# G-07 violation: no ignore_changes, so every pipeline deploy reports drift.
resource "google_cloud_run_v2_service" "spa" {
  name     = "prediction-dao-research"
  project  = var.project_id
  location = var.region

  template {
    containers {
      image = "us-central1-docker.pkg.dev/p/r/i:latest"
    }
  }
}
