variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "region" {
  description = "Cloud Run region."
  type        = string
}

variable "name" {
  description = "Service name."
  type        = string
}

variable "image" {
  description = "Container image. Required by the provider but IGNORED after create — the build pipeline owns the artifact. Use the :latest tag the pipeline already publishes so the value is valid at import time."
  type        = string
}

variable "service_account_email" {
  description = "Runtime service account."
  type        = string
  default     = null
}

variable "min_instances" {
  description = "Scaling floor. Non-zero means an instance is kept warm and billed continuously."
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Scaling ceiling."
  type        = number
  default     = 100
}

variable "cpu" {
  description = "CPU limit."
  type        = string
  default     = "1"
}

variable "memory" {
  description = "Memory limit."
  type        = string
  default     = "512Mi"
}

variable "cpu_idle" {
  description = "true = CPU throttled between requests. false = CPU always allocated, which bills a full vCPU continuously when min_instances > 0."
  type        = bool
  default     = true
}

variable "concurrency" {
  description = "Maximum concurrent requests per instance."
  type        = number
  default     = 80
}

variable "timeout_seconds" {
  description = "Request timeout."
  type        = number
  default     = 300
}

variable "ingress" {
  description = "Ingress posture: INGRESS_TRAFFIC_ALL, INGRESS_TRAFFIC_INTERNAL_ONLY, or INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER."
  type        = string
  default     = "INGRESS_TRAFFIC_ALL"
}

variable "allow_unauthenticated" {
  description = "Grant allUsers the invoker role. This is what --allow-unauthenticated sets, which is why that flag must leave cloudbuild.yaml in the same change that adopts the service."
  type        = bool
  default     = false
}

variable "env" {
  description = "Plain environment variables. Never put a secret here — use secret_env."
  type        = map(string)
  default     = {}
}

variable "secret_env" {
  description = "Environment variables sourced from Secret Manager: var name -> { secret, version }. Terraform wires the reference; the payload never enters state."
  type = map(object({
    secret  = string
    version = string
  }))
  default = {}
}

variable "domain_mappings" {
  description = "Custom domains mapped to this service."
  type        = list(string)
  default     = []
}
