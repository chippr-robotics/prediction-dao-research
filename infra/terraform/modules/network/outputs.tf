output "network_id" {
  description = "VPC id."
  value       = google_compute_network.vpc.id
}

output "network_name" {
  description = "VPC name."
  value       = google_compute_network.vpc.name
}

output "subnet_id" {
  description = "Regional subnet id, consumed by the edge-node module."
  value       = google_compute_subnetwork.subnet.id
}

output "static_ips" {
  description = "Map of reserved address name -> IP. Consumed by the Cloudflare module so DNS cannot desync from the origin."
  value       = { for name, addr in google_compute_address.origin : name => addr.address }
}

output "static_ip_self_links" {
  description = "Map of reserved address name -> self_link, for attaching to instances."
  value       = { for name, addr in google_compute_address.origin : name => addr.self_link }
}
