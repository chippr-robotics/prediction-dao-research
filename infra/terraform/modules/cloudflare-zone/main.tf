/**
 * Edge configuration for one Cloudflare zone: DNS records, the geo compliance gate, and the origin
 * lock.
 *
 * ⚠ BOTH RULESETS ARE AUTHORITATIVE FOR THEIR PHASE.
 * A `cloudflare_ruleset` at a given zone+phase replaces the ENTIRE rule list for that phase. Any
 * rule added through the dashboard and not present here is DELETED on the next apply. For
 * `http_request_firewall_custom` that means a WAF rule someone adds during an incident at 3am
 * disappears the next time this applies. If you add a rule at the edge, add it here in the same
 * hour, or it will not survive.
 *
 * ⚠ THE GEO GATE IS A LEGAL CONTROL, NOT A CONFIG VALUE (spec 007).
 * It answers HTTP 451. Opening a gate that must stay shut, or shutting one that must stay open, is
 * a compliance incident rather than an outage. This module is under CODEOWNERS for that reason.
 *
 * The module never reads Secret Manager itself — the origin-lock value is an input, so the module
 * stays portable and its data dependencies stay visible to its caller.
 */

resource "cloudflare_dns_record" "this" {
  for_each = { for r in var.dns_records : "${r.type}:${r.name}" => r }

  zone_id = var.zone_id
  name    = each.value.name
  type    = each.value.type
  content = each.value.value
  ttl     = each.value.proxied ? 1 : each.value.ttl # a proxied record must use TTL 1 (automatic)
  proxied = each.value.proxied
  comment = each.value.comment
}

/**
 * Geo compliance gate (spec 007, infra/cloudflare/waf-geo.md).
 *
 * Allowlist posture: everything outside `allowed_countries` receives the configured status. The
 * expression is built from the input list so the deny set is reviewable as data rather than as a
 * hand-written expression string.
 */
resource "cloudflare_ruleset" "waf_geo" {
  count = var.geo_gate_enabled ? 1 : 0

  zone_id     = var.zone_id
  name        = "FairWins geo compliance gate"
  description = "Spec 007 legal gating. Authoritative for the http_request_firewall_custom phase."
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules = [
    {
      action      = "block"
      description = "Compliance gate: serve ${var.geo_gate_response_code} outside the permitted countries"
      enabled     = true
      expression  = "not (ip.src.country in {${join(" ", formatlist("\"%s\"", var.geo_gate_allowed_countries))}})"

      action_parameters = {
        response = {
          status_code  = var.geo_gate_response_code
          content      = var.geo_gate_response_body
          content_type = "text/html"
        }
      }
    }
  ]
}

/**
 * Origin lock (spec 007 FR-007/FR-008, infra/cloudflare/origin-lock.md).
 *
 * Injects a shared secret header that nginx at the origin verifies, so a request that bypasses
 * Cloudflare — hitting the bare run.app URL or the origin IP — is refused. The value must match
 * ORIGIN_LOCK_SECRET in Secret Manager; it is passed in rather than read here.
 *
 * The /__probe/ path is exempt at the origin, which is how Google's uptime probers reach the node
 * without a Cloudflare-injected header.
 */
resource "cloudflare_ruleset" "origin_lock" {
  count = var.origin_lock_enabled ? 1 : 0

  zone_id     = var.zone_id
  name        = "FairWins origin lock"
  description = "Injects the origin-auth header. Authoritative for the http_request_late_transform phase."
  kind        = "zone"
  phase       = "http_request_late_transform"

  rules = [
    {
      action      = "rewrite"
      description = "Inject ${var.origin_lock_header_name} for origin verification"
      enabled     = true
      expression  = "true"

      action_parameters = {
        headers = {
          (var.origin_lock_header_name) = {
            operation = "set"
            value     = var.origin_lock_secret
          }
        }
      }
    }
  ]
}
