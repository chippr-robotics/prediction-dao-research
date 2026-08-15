variable "zone_id" {
  description = "Cloudflare zone id."
  type        = string
}

variable "dns_records" {
  description = "DNS records for this zone. Wire `value` from the network module's static_ips output, never from a literal, so DNS cannot desync from the origin."
  type = list(object({
    name    = string
    type    = string
    value   = string
    proxied = optional(bool, true)
    ttl     = optional(number, 300)
    comment = optional(string, null)
  }))
  default = []
}

variable "geo_gate_enabled" {
  description = "Manage the geo compliance gate. Disabling this does not remove the gate at the edge — it removes it from management, which is a different and more dangerous thing. Change deliberately."
  type        = bool
  default     = true
}

variable "geo_gate_allowed_countries" {
  description = "Two-letter country codes permitted through the gate. Everything else receives geo_gate_response_code. This is a legal control (spec 007) — changing it is a compliance decision."
  type        = list(string)
  default     = []
}

variable "geo_gate_response_code" {
  description = "Status served to blocked requests. 451 = Unavailable For Legal Reasons."
  type        = number
  default     = 451
}

variable "geo_gate_response_body" {
  description = "Response body served to blocked requests."
  type        = string
  default     = "<!doctype html><title>451</title><h1>Unavailable For Legal Reasons</h1>"
}

variable "origin_lock_enabled" {
  description = "Manage the origin-lock transform rule."
  type        = bool
  default     = true
}

variable "origin_lock_header_name" {
  description = "Header injected by Cloudflare and verified by nginx at the origin."
  type        = string
  default     = "X-Origin-Auth"
}

variable "origin_lock_secret" {
  description = "Shared secret value for the origin-lock header. Must equal ORIGIN_LOCK_SECRET in Secret Manager. Passed in by the root; this module never reads Secret Manager itself."
  type        = string
  sensitive   = true
  default     = null
}
