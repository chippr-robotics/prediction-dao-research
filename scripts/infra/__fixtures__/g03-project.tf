# G-03 violation: the project is an input, never a managed resource.
resource "google_project" "this" {
  name       = "fairwins"
  project_id = "fairwins-new"
}
