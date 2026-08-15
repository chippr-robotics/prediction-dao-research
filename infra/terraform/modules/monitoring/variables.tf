variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "notification_emails" {
  description = "Email addresses to notify. Each becomes a channel referenced by every policy."
  type        = list(string)
  default     = []
}

variable "uptime_targets" {
  description = <<-EOT
    Uptime checks. `host` MUST be an origin IP, not a hostname: the Cloudflare geo gate answers 451
    to US-sourced traffic and Google's probers are largely US-based, so a hostname check is
    permanently red. `validate_ssl` is false because the origin serves a Cloudflare Origin CA
    certificate that is deliberately not publicly trusted. `content_match` must assert something
    only a healthy upstream can produce — see the module README.
  EOT
  type = list(object({
    name            = string
    display_name    = string
    host            = string
    path            = string
    content_match   = string
    port            = optional(number, 443)
    use_ssl         = optional(bool, true)
    validate_ssl    = optional(bool, false)
    request_method  = optional(string, "GET")
    body            = optional(string, null)
    timeout_seconds = optional(number, 10)
    period_seconds  = optional(number, 300)
  }))
  default = []
}

variable "vm_alert_policies" {
  description = "VM health policies keyed by id. Thresholds carry over from ops/monitoring/apply.sh unchanged."
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

variable "thresholds" {
  description = "Shared alerting thresholds."
  type = object({
    uptime_failure_count    = optional(number, 1)
    uptime_duration_seconds = optional(number, 300)
    probe_failure_count     = optional(number, 0)
    probe_duration_seconds  = optional(number, 600)
  })
  default = {}
}

variable "probe_metric_enabled" {
  description = "Create the on-VM probe log metric and its policy. This is how numeric conditions (gas-wallet runway) are covered, since an uptime content matcher can only compare strings."
  type        = bool
  default     = true
}

variable "probe_metric_name" {
  description = "Log-based metric name."
  type        = string
  default     = "fairwins_probe_failures"
}

variable "probe_metric_filter" {
  description = "Logging filter matching the on-VM probe's structured failure line."
  type        = string
  default     = "resource.type=\"gce_instance\" AND jsonPayload.probe=\"fairwins\" AND jsonPayload.status=\"fail\""
}
