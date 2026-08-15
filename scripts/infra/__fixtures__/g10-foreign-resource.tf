# G-10 violation: reaches a workload this project does not own.
resource "google_cloud_run_v2_service_iam_member" "foreign" {
  name     = "clearpath-api"
  project  = var.project_id
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
