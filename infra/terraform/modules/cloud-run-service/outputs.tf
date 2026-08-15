output "service_name" {
  description = "Service name."
  value       = google_cloud_run_v2_service.this.name
}

output "service_uri" {
  description = "Default run.app URI. Note the origin lock may 403 direct requests to it — the SPA must use the Cloudflare-fronted host."
  value       = google_cloud_run_v2_service.this.uri
}

output "latest_ready_revision" {
  description = "Latest revision reported ready. Informational only — the pipeline owns revisions."
  value       = google_cloud_run_v2_service.this.latest_ready_revision
}
