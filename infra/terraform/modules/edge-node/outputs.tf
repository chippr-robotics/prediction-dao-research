output "instance_id" {
  description = "Instance id."
  value       = google_compute_instance.node.id
}

output "instance_name" {
  description = "Instance name."
  value       = google_compute_instance.node.name
}

output "internal_ip" {
  description = "Primary internal address."
  value       = google_compute_instance.node.network_interface[0].network_ip
}

output "external_ip" {
  description = "Attached external address."
  value       = google_compute_instance.node.network_interface[0].access_config[0].nat_ip
}

output "service_account_email" {
  description = "Service account attached to the node, whether created here or passed in."
  value       = local.sa_email
}
