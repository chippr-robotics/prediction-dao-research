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

variable "manage_mcp_server" {
  description = <<-EOT
    Whether Terraform declares the spec-095 staging MCP server Cloud Run service.

    DEFAULT FALSE for the same reason as prod: `infra-apply.yml` applies on push to main with no
    human in the loop, and no pipeline publishes the `fairwins-mcp-server-staging` image, so a
    create here would fail against an image that does not exist. The apply matrix is fail-fast and
    is never retried unattended (FR-035).

    Flip it only after the image is published and verified present, in its own reviewed PR.
    See docs/runbooks/member-api-operations.md §3.8.
  EOT
  type        = bool
  default     = false
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
