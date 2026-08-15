/**
 * Monitoring: notification channels, uptime checks, alert policies, log-based metrics.
 *
 * Ported from ops/monitoring/apply.sh. THE REASONING COMMENTS ARE CARRIED OVER DELIBERATELY — they
 * are the tribal knowledge this feature exists to capture, and each one records a way the obvious
 * configuration is wrong. A port that kept the thresholds but dropped the comments would look
 * complete and would invite someone to "simplify" the matchers back into the form that stayed green
 * through a real outage.
 *
 * WHY THE CHECKS TARGET ORIGIN IPs, NOT HOSTNAMES
 * Cloudflare runs a zone-wide WAF geo gate on the zone in allowlist posture whose deny set includes
 * the US (infra/cloudflare/waf-geo.md). Google's uptime probers are largely US-based, so any check
 * routed through Cloudflare is permanently red and pages constantly. The checks therefore hit the
 * origin IPs directly on a dedicated /__probe/health path that is exempt from the origin lock and
 * restricted, in both the GCP firewall and nginx, to the published prober addresses. SSL validation
 * is disabled because the origin serves a Cloudflare Origin CA certificate, which is deliberately
 * not publicly trusted.
 *
 * One clear win over the shell script: a notification channel is now a resource reference. The
 * script had to warn that a banner printed to stdout instead of stderr would end up inside the
 * channel id via command substitution, producing policies that fire and page nobody. That entire
 * class of bug is gone.
 */

resource "google_monitoring_notification_channel" "email" {
  for_each = toset(var.notification_emails)

  project      = var.project_id
  display_name = "FairWins alerts (${each.value})"
  type         = "email"

  labels = {
    email_address = each.value
  }
}

locals {
  channel_ids = [for c in google_monitoring_notification_channel.email : c.id]
}

/**
 * Uptime checks.
 *
 * `content_matchers` is where the care lives:
 *
 *   bundler: matches 0x5FF137D4 in an eth_supportedEntryPoints response. A plain 200 proves
 *            NOTHING — the origin-lock nginx's own /healthz is a static `return 200` that never
 *            touches alto, i.e. exactly the check that stayed green through the 2026-07-12 outage.
 *   gateway: matches "rpc":"up". It must NOT match "status":"ok" — the server returns that
 *            unconditionally even when every chain is down.
 *
 * Numeric thresholds (gas-wallet runway) cannot be expressed as a string match and are handled by
 * the on-VM probe plus the fairwins_probe_failures log metric below.
 */
resource "google_monitoring_uptime_check_config" "this" {
  for_each = { for t in var.uptime_targets : t.name => t }

  project      = var.project_id
  display_name = each.value.display_name
  timeout      = "${each.value.timeout_seconds}s"
  period       = "${each.value.period_seconds}s"

  http_check {
    path           = each.value.path
    port           = each.value.port
    use_ssl        = each.value.use_ssl
    validate_ssl   = each.value.validate_ssl # false: Cloudflare Origin CA is not publicly trusted
    request_method = each.value.request_method

    # USER_PROVIDED only when a body is sent (the bundler's JSON-RPC probe); leaving it set with no
    # body makes the API reject the check.
    content_type = each.value.body == null ? null : "USER_PROVIDED"
    body         = each.value.body
  }

  content_matchers {
    content = each.value.content_match
    matcher = "CONTAINS_STRING"
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = each.value.host # an IP, not a hostname — see the header comment
    }
  }
}

resource "google_monitoring_alert_policy" "uptime" {
  for_each = google_monitoring_uptime_check_config.this

  project      = var.project_id
  display_name = "${each.value.display_name} failing"
  combiner     = "OR"

  conditions {
    display_name = "${each.value.display_name} uptime check failing"

    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"${each.value.uptime_check_id}\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.thresholds.uptime_failure_count
      duration        = "${var.thresholds.uptime_duration_seconds}s"

      aggregations {
        alignment_period     = "1200s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.host"]
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.channel_ids
}

/**
 * VM health policies. Thresholds carry over from ops/monitoring/apply.sh unchanged — this feature
 * changes how they are declared, not what they alert on.
 */
resource "google_monitoring_alert_policy" "vm" {
  for_each = var.vm_alert_policies

  project      = var.project_id
  display_name = each.value.display_name
  combiner     = "OR"

  conditions {
    display_name = each.value.condition_name

    condition_threshold {
      filter          = each.value.filter
      comparison      = each.value.comparison
      threshold_value = each.value.threshold
      duration        = "${each.value.duration_seconds}s"

      aggregations {
        alignment_period   = "${each.value.alignment_seconds}s"
        per_series_aligner = each.value.aligner
      }
    }
  }

  notification_channels = local.channel_ids
}

/**
 * Log-based metric for the on-VM probe. The probe writes a structured failure line; this counts it,
 * and the policy below alerts on it. This is how numeric conditions (gas-wallet runway) are covered,
 * since an uptime content matcher can only compare strings.
 */
resource "google_logging_metric" "probe_failures" {
  count = var.probe_metric_enabled ? 1 : 0

  project = var.project_id
  name    = var.probe_metric_name
  filter  = var.probe_metric_filter

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

resource "google_monitoring_alert_policy" "probe_failing" {
  count = var.probe_metric_enabled ? 1 : 0

  project      = var.project_id
  display_name = "FairWins on-VM probe failing"
  combiner     = "OR"

  conditions {
    display_name = "probe failure count above threshold"

    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.probe_failures[0].name}\" AND resource.type=\"gce_instance\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.thresholds.probe_failure_count
      duration        = "${var.thresholds.probe_duration_seconds}s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_DELTA"
      }
    }
  }

  notification_channels = local.channel_ids
}
