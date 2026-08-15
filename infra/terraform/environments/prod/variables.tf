variable "project_id" {
  description = "GCP project. SHARED with unrelated Chippr workloads — never declare a resource outside this project's inventory (data-model.md)."
  type        = string
}

variable "region" {
  description = "Primary region."
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "Zone for the long-running nodes."
  type        = string
  default     = "us-central1-a"
}

variable "artifact_registry_repository" {
  description = "Artifact Registry repository holding the service images."
  type        = string
  default     = "cloud-run-source-deploy"
}

variable "gateway_service_account_email" {
  description = "Existing service account the gateway node keeps. It holds zero project-level roles beyond telemetry, which is a property worth preserving."
  type        = string
}

variable "gateway_secret_ids" {
  description = "Secrets the gateway node may read. Granted per secret. A missing OPTIONAL feature credential must leave that feature failing closed with 503 rather than taking down the gasless path."
  type        = list(string)
  default     = []
}

variable "managed_secret_ids" {
  description = "Secret CONTAINERS managed here. Payloads are never declared (guardrail G-04) and continue to be created and rotated out of band."
  type        = list(string)
  default     = []
}

variable "kms_key_ring" {
  description = "KMS key ring for the relay and paymaster signing keys. Null to leave KMS unmanaged."
  type        = string
  default     = null
}

variable "kms_crypto_keys" {
  description = "Crypto keys in the ring. Key VERSIONS are never managed — a destroyed version is unrecoverable."
  type        = list(string)
  default     = []
}

variable "kms_signing_algorithm" {
  description = "Signing algorithm for the managed keys. secp256k1 for EVM transaction signing."
  type        = string
  default     = "EC_SIGN_SECP256K1_SHA256"
}

variable "spa_secret_env" {
  description = "Secret-sourced environment variables for the SPA service: name -> { secret, version }. The reference is declared; the payload never enters state."
  type = map(object({
    secret  = string
    version = string
  }))
  default = {}
}

variable "manage_edge" {
  description = <<-EOT
    Manage the Cloudflare zone. FALSE until the edge surface is adopted (plan phase E, deliberately
    last): both rulesets are AUTHORITATIVE for their phase, so an apply deletes any rule added
    through the dashboard and not declared here. Set true only once the change flow and drift
    detection are proven.
  EOT
  type        = bool
  default     = false
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone id for the primary domain."
  type        = string
  default     = null
}

variable "geo_gate_allowed_countries" {
  description = "Countries permitted through the spec 007 compliance gate. This is a legal control — changing it is a compliance decision, not a config tweak."
  type        = list(string)
  default     = []
}

variable "notification_emails" {
  description = "Alert notification addresses. An empty list produces policies that fire and page nobody."
  type        = list(string)
  default     = []
}

variable "vm_alert_policies" {
  description = "VM health policies, carried over from ops/monitoring/apply.sh with thresholds unchanged."
  type = map(object({
    display_name      = string
    condition_name    = string
    filter            = string
    comparison        = optional(string, "COMPARISON_GT")
    threshold         = number
    duration_seconds  = optional(number, 300)
    alignment_seconds = optional(number, 300)
    aligner           = optional(string, "ALIGN_MEAN")
  }))
  default = {}
}

# ── operator workstation (spec 088) ───────────────────────────────────────────────────────────

variable "workstation_operators" {
  description = "IAM principals permitted to impersonate the operator workstation account. Each entry is a named human who can then read every secret in workstation_secret_ids, so this list is the access-review artifact — keep it short and remove leavers."
  type        = list(string)
  default     = []
}

variable "workstation_secret_ids" {
  description = "Secret ids the operator workstation may read. Mirrors scripts/secrets/registry.js; parity is enforced by scripts/secrets/__tests__/terraform-parity.test.js rather than by discipline."
  type        = list(string)
  default     = []
}
