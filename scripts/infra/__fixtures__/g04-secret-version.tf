# G-04 violation: writes the payload into state in plaintext.
resource "google_secret_manager_secret_version" "origin_lock" {
  secret      = google_secret_manager_secret.origin_lock.id
  secret_data = var.origin_lock_secret
}
