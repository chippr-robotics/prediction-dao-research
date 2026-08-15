output "staging_service_uri" {
  description = "Mainnet-cohort staging service URI. This service touches real funds."
  value       = module.staging_mainnet.service_uri
}

output "staging_testnet_service_uri" {
  description = "Testnet-cohort staging service URI. Safe rehearsal, no real funds."
  value       = module.staging_testnet.service_uri
}
