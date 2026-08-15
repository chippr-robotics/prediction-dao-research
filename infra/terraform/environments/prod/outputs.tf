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

output "workstation_service_account" {
  description = "Operator workstation identity. Export as FW_SECRETS_IMPERSONATE on the machine so `npm run sec` mints short-lived tokens instead of using a key file."
  value       = module.workstation.service_account_email
}

output "workstation_readable_secrets" {
  description = "Every secret the operator workstation can read. This is the blast radius of that machine being compromised — worth reading on every diff."
  value       = module.workstation.readable_secret_ids
}
