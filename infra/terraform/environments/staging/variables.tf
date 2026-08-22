variable "project_id" {
  description = "GCP project. SHARED with unrelated Chippr workloads and with the prod environment — staging state is a separate prefix, so a staging apply cannot reach prod state."
  type        = string
}

variable "region" {
  description = "Primary region."
  type        = string
  default     = "us-central1"
}

variable "artifact_registry_repository" {
  description = "Artifact Registry repository holding the service images."
  type        = string
  default     = "cloud-run-source-deploy"
}

variable "staging_max_instances" {
  description = "Scaling ceiling for the two staging SPA services. Lower than production on purpose — staging is a mirror, not a load test. The MCP server states its own ceiling, mirroring prod."
  type        = number
  default     = 10
}

variable "staging_secret_env" {
  description = "Secret-sourced environment variables for the mainnet-cohort staging service. It has its OWN origin-lock secret and funded accounts, never production's."
  type = map(object({
    secret  = string
    version = string
  }))
  default = {}
}

variable "staging_testnet_secret_env" {
  description = "Secret-sourced environment variables for the testnet-cohort staging service."
  type = map(object({
    secret  = string
    version = string
  }))
  default = {}
}
