# G-06 violation: a DNS-pinned static IP with no prevent_destroy.
resource "google_compute_address" "gateway" {
  name    = "fairwins-gateway-ip"
  project = var.project_id
  region  = var.region
}
