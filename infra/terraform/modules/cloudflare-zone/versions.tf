# Provider REQUIREMENTS only — no `provider` block. A module carrying its own provider block cannot
# be used with for_each or count and cannot be cleanly versioned, which is why guardrail G-09
# rejects one. Configuration is passed in by the root.
terraform {
  required_version = "~> 1.15.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.23"
    }
  }
}
