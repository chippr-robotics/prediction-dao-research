output "notification_channel_ids" {
  description = "Channel ids referenced by every policy."
  value       = local.channel_ids
}

output "uptime_check_ids" {
  description = "Map of target name -> uptime check id."
  value       = { for k, c in google_monitoring_uptime_check_config.this : k => c.uptime_check_id }
}

output "alert_policy_ids" {
  description = "All alert policy ids created by this module."
  value = concat(
    [for p in google_monitoring_alert_policy.uptime : p.id],
    [for p in google_monitoring_alert_policy.vm : p.id],
    google_monitoring_alert_policy.probe_failing[*].id,
  )
}
