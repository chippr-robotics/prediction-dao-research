# G-11 violation: re-arms a second executor against the VM bundler's EOA.
resource "google_cloud_run_v2_service" "bundler" {
  name     = "fairwins-alto-bundler"
  project  = var.project_id
  location = var.region

  template {
    containers {
      image = "us-central1-docker.pkg.dev/p/r/alto:v1.2.7"
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
