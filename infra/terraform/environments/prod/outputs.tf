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
  value       = one(module.spa[*].service_uri)
}

output "mcp_server_service_uri" {
  description = "MCP server URI (spec 095), or NULL while `manage_mcp_server` is false — null means the service is not declared, which is a different fact from a service that is declared and unreachable. No Cloudflare hostname is declared for it, so this run.app address is what an MCP client is configured with — and unlike the SPA it is not behind the origin lock, because agents call it directly."
  value       = one(module.mcp_server[*].service_uri)
}

output "uptime_check_ids" {
  description = "Uptime check ids, for cross-referencing alert policies."
  value       = one(module.monitoring[*].uptime_check_ids)
}

# Both of these are ALREADY IN PROD STATE, recorded by the unmerged branch that applied this module
# in August. Not declaring them here does not leave them alone — it makes every single plan propose
# to remove them, which is noise on a surface whose value depends on a diff being worth reading.
#
# They are also the two facts an operator actually needs: which identity the workstation acts as,
# and what that identity can read. `impersonation_command` is deliberately not surfaced; it is
# derivable from the account and belongs in the runbook, not in Terraform output.
output "workstation_service_account" {
  description = "Service account the operator workstation impersonates. No key file exists for it (spec 097)."
  value       = module.workstation.service_account_email
}

output "workstation_readable_secrets" {
  description = "Secret ids the workstation identity may read. Mirrors scripts/secrets/registry.js; the parity test fails on drift."
  value       = module.workstation.readable_secret_ids
}
