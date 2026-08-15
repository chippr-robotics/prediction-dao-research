output "record_ids" {
  description = "Map of \"type:name\" -> record id."
  value       = { for k, r in cloudflare_dns_record.this : k => r.id }
}

output "waf_ruleset_id" {
  description = "Geo compliance ruleset id, or null when not managed."
  value       = var.geo_gate_enabled ? cloudflare_ruleset.waf_geo[0].id : null
}

output "transform_ruleset_id" {
  description = "Origin-lock transform ruleset id, or null when not managed."
  value       = var.origin_lock_enabled ? cloudflare_ruleset.origin_lock[0].id : null
}
