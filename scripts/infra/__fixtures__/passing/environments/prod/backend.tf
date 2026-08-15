terraform {
  required_version = "~> 1.15.0"

  backend "gcs" {
    bucket = "fairwins-tfstate-chippr-bots-site-wp"
    prefix = "prod"
  }
}

# A properly pinned external module: 40-character commit SHA. Stricter than a tag, which can move.
module "network" {
  source = "git::https://github.com/chippr-robotics/chippr-tf-modules.git//modules/network?ref=70498e2a2860f2e65cd2ce3919ca85d29678a1e3"
}
