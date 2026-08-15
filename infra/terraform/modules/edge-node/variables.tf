variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "region" {
  description = "Region, used for the Artifact Registry binding."
  type        = string
}

variable "zone" {
  description = "Zone for the instance."
  type        = string
}

variable "name" {
  description = "Instance name."
  type        = string
}

variable "role" {
  description = "Node role. Becomes the fairwins-role metadata key and the role label, both of which the Ansible inventory keys on."
  type        = string
}

variable "subnet_id" {
  description = "Subnet to attach to, from the network module."
  type        = string
}

variable "static_ip_address" {
  description = "Reserved external address to attach. An ephemeral address would change on any stop/start and silently break the Cloudflare origin."
  type        = string
}

variable "machine_type" {
  description = "Instance machine type."
  type        = string
  default     = "e2-small"
}

variable "boot_image" {
  description = "Boot image. Debian rather than Container-Optimized OS: COS has no package manager, which makes the host nginx and Ops Agent awkward and is harder to debug under pressure."
  type        = string
  default     = "debian-cloud/debian-12"
}

variable "boot_disk_size_gb" {
  description = "Boot disk size."
  type        = number
  default     = 20
}

variable "boot_disk_type" {
  description = "Boot disk type."
  type        = string
  default     = "pd-standard"
}

variable "network_tags" {
  description = "Network tags. Must include the tag the firewall rules target, or the node is unreachable."
  type        = list(string)
  default     = ["fairwins-edge"]
}

variable "labels" {
  description = "Instance labels. A `role` label is merged in automatically; the Ansible dynamic inventory keys on it."
  type        = map(string)
  default     = { app = "fairwins" }
}

variable "metadata" {
  description = "Extra instance metadata, merged with fairwins-role."
  type        = map(string)
  default     = {}
}

variable "startup_script" {
  description = "Startup script contents. Reduced to a bootstrap that runs the Ansible playbook locally, so cold boot and on-demand convergence share one description."
  type        = string
  default     = null
}

variable "shielded_vm" {
  description = "Enable secure boot, vTPM and integrity monitoring."
  type        = bool
  default     = true
}

variable "create_service_account" {
  description = "Create a dedicated service account. False when reusing an existing one (the gateway keeps fairwins-relay-engine@, which holds zero project-level roles)."
  type        = bool
  default     = false
}

variable "service_account_email" {
  description = "Existing service account to attach when create_service_account is false."
  type        = string
  default     = null
}

variable "service_account_id" {
  description = "Account id to create when create_service_account is true."
  type        = string
  default     = null
}

variable "service_account_display_name" {
  description = "Display name for a created service account."
  type        = string
  default     = null
}

variable "service_account_description" {
  description = "Description for a created service account."
  type        = string
  default     = null
}

variable "secret_accessor_secrets" {
  description = "Secret ids this node may read. Granted PER SECRET — a project-wide grant would hand the node every secret in a shared project."
  type        = list(string)
  default     = []
}

variable "artifact_registry_repository" {
  description = "Artifact Registry repository this node may pull from. Repository-scoped; null to skip."
  type        = string
  default     = null
}

variable "project_roles" {
  description = "Project-level roles for cases with no resource-scoped equivalent (logWriter, metricWriter, and run.viewer for the bundler). Keep this list as short as it can be."
  type        = list(string)
  default     = []
}
