# G-05 violation: default disable_on_destroy would disable the API project-wide.
resource "google_project_service" "run" {
  project = var.project_id
  service = "run.googleapis.com"
}
