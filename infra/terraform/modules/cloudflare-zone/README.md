# Module: `cloudflare-zone`

DNS records, the geo compliance gate, and the origin lock for one Cloudflare zone.

## ⚠ Read before editing

**Both rulesets are authoritative for their phase.** A `cloudflare_ruleset` at a given zone+phase
replaces the *entire* rule list for that phase. Any rule added through the dashboard and not present
here is **deleted** on the next apply. For `http_request_firewall_custom` that means a WAF rule
someone adds during an incident at 3am disappears the next time this applies. If you add a rule at
the edge, add it here in the same hour or it will not survive.

**The geo gate is a legal control, not a config value** (spec 007). It answers HTTP 451. Opening a
gate that must stay shut — or shutting one that must stay open — is a compliance incident, not an
outage. This module is under CODEOWNERS so such a change cannot ride along unnoticed inside an
unrelated PR.

## Provider

Requires `cloudflare/cloudflare ~> 5`. The v5 provider was regenerated from Cloudflare's OpenAPI
schema: v4's `cloudflare_record` is now **`cloudflare_dns_record`**, and several schemas changed
shape. Writing against v4 names fails immediately; writing against v4 *schemas* under v5 fails
subtly.

## Inputs

| Name | Type | Default | Notes |
|---|---|---|---|
| `zone_id` | string | — | |
| `dns_records` | list(object) | `[]` | `name`, `type`, `value`, `proxied`, `ttl`, `comment` |
| `geo_gate_enabled` | bool | `true` | |
| `geo_gate_allowed_countries` | list(string) | `[]` | allowlist posture |
| `geo_gate_response_code` | number | `451` | |
| `geo_gate_response_body` | string | minimal 451 page | |
| `origin_lock_enabled` | bool | `true` | |
| `origin_lock_header_name` | string | `X-Origin-Auth` | |
| `origin_lock_secret` | string, sensitive | `null` | passed in; the module never reads Secret Manager |

## Outputs

`record_ids`, `waf_ruleset_id`, `transform_ruleset_id`.

## Things that will bite you

- **Wire `dns_records[*].value` from the `network` module's `static_ips` output**, never from a
  literal. That coupling is what makes it impossible for DNS and the origin to desync.
- **A proxied record must use TTL 1** (automatic). The module forces this; passing a `ttl` alongside
  `proxied = true` is silently overridden.
- **`geo_gate_enabled = false` does not remove the gate at the edge** — it removes it from
  management, which is a different and more dangerous thing: the gate keeps running, unmanaged and
  invisible to drift detection.
- **`origin_lock_secret` reaches Terraform state.** It arrives from a `google_secret_manager_secret_version`
  data source in the root, and data-source results *are* written to state — `sensitive = true` hides
  a value from output, not from state. This is the one accepted exception in the feature
  (`plan.md` Complexity Tracking); the state bucket's access is restricted accordingly.
- **The `/__probe/` path must stay exempt at the origin**, or Google's uptime probers — which arrive
  without a Cloudflare-injected header — are locked out and every check goes red.
