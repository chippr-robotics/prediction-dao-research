output "origin_ips" {
  description = "Reserved origin addresses. These are pinned in Cloudflare DNS; releasing one yields a different address."
  value       = module.network.static_ips
}

output "node_service_accounts" {
  description = "Service accounts attached to the long-running nodes."
  value = {
    bundler = module.bundler.service_account_email
    gateway = module.gateway.service_account_email
  }
}

output "spa_service_uri" {
  description = "Default run.app URI for the SPA. The origin lock 403s direct requests to it — the app must use the Cloudflare-fronted host."
  value       = module.spa.service_uri
}

output "uptime_check_ids" {
  description = "Uptime check ids, for cross-referencing alert policies."
  value       = module.monitoring.uptime_check_ids
}
