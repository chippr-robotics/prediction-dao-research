# G-13 violation: no .terraform.lock.hcl committed beside this root.
terraform {
  required_version = "~> 1.15.0"

  backend "gcs" {
    bucket = "fairwins-tfstate-chippr-bots-site-wp"
    prefix = "nolock"
  }
}
