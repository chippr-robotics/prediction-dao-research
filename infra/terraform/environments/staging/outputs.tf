output "staging_service_uri" {
  description = "Mainnet-cohort staging service URI. This service touches real funds."
  value       = one(module.staging_mainnet[*].service_uri)
}

output "staging_testnet_service_uri" {
  description = "Testnet-cohort staging service URI. Safe rehearsal, no real funds."
  value       = one(module.staging_testnet[*].service_uri)
}

output "staging_mcp_server_service_uri" {
  description = "Staging MCP server URI, or NULL while `manage_mcp_server` is false — null means not declared, which is a different fact from declared-and-unreachable. No Cloudflare hostname is declared for it, so this run.app address is what an MCP client is configured with."
  value       = one(module.mcp_server_staging[*].service_uri)
}
