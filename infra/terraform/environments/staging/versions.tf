terraform {
  # Pinned so the same commit produces the same plan on any machine (FR-026). 1.5+ is required for
  # the declarative `import` blocks in imports.tf, which are the basis of the non-destructive
  # adoption story.
  required_version = "~> 1.15.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.44"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 7.44"
    }
    cloudflare = {
      source = "cloudflare/cloudflare"
      # v5 was regenerated from Cloudflare's OpenAPI schema: v4's `cloudflare_record` is now
      # `cloudflare_dns_record`, and several schemas changed shape. Writing against v4 names fails
      # immediately; writing against v4 schemas under v5 fails subtly.
      version = "~> 5.23"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# CLOUDFLARE_API_TOKEN comes from the environment. It is zone-scoped (Zone.DNS:Edit, Zone.WAF:Edit,
# Zone.Zone:Read) and never account-scoped — see contracts/ci-identity.md. It is the one long-lived
# credential in this design, because Cloudflare offers no OIDC federation.
provider "cloudflare" {}
