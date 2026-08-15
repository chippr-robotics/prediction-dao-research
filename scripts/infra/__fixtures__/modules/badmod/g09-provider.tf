# G-09 violation: a provider block inside a module blocks for_each and versioning.
provider "google" {
  project = var.project_id
}
