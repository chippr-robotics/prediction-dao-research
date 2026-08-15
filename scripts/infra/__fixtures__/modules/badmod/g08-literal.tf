# G-08 violation: a hardcoded project and zone inside a module body.
resource "google_compute_instance" "node" {
  name    = var.name
  project = "chippr-bots-site-wp"
  zone    = "us-central1-a"
}
