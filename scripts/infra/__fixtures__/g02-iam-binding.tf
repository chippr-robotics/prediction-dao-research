# G-02 violation: authoritative for this role across the whole project.
resource "google_project_iam_binding" "run_viewer" {
  project = var.project_id
  role    = "roles/run.viewer"
  members = ["serviceAccount:fairwins-bundler@example.iam.gserviceaccount.com"]
}
