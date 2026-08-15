# Module: `monitoring`

Notification channels, uptime checks, alert policies, and the on-VM probe log metric.

Ported from `ops/monitoring/apply.sh`. Thresholds are unchanged — this module changes how they are
declared, not what they alert on.

## Why the checks look strange (and must stay that way)

**Targets are origin IPs, not hostnames.** Cloudflare runs a zone-wide WAF geo gate in allowlist
posture whose deny set includes the US, and Google's uptime probers are largely US-based. Any check
routed through Cloudflare is permanently red and pages constantly. The checks hit the origin
directly on `/__probe/health`, a path exempt from the origin lock and restricted — in both the GCP
firewall and nginx — to the published prober addresses.

**`validate_ssl` is false.** The origin serves a Cloudflare Origin CA certificate, which is
deliberately not publicly trusted.

**The content matchers are not arbitrary:**

| Check | Matches | Why not the obvious thing |
|---|---|---|
| bundler | `0x5FF137D4` in an `eth_supportedEntryPoints` response | A plain 200 proves nothing — the origin-lock nginx's own `/healthz` is a static `return 200` that never touches alto. That is exactly the check that stayed green through the 2026-07-12 outage. |
| gateway | `"rpc":"up"` | It must **not** match `"status":"ok"` — the server returns that unconditionally even when every chain is down. |

Numeric conditions (gas-wallet runway) cannot be expressed as a string match at all, which is why
the on-VM probe writes a structured failure line and `probe_metric_filter` counts it.

## Inputs

| Name | Type | Default |
|---|---|---|
| `project_id` | string | — |
| `notification_emails` | list(string) | `[]` |
| `uptime_targets` | list(object) | `[]` |
| `vm_alert_policies` | map(object) | `{}` |
| `thresholds` | object | see variables.tf |
| `probe_metric_enabled` | bool | `true` |
| `probe_metric_name` | string | `fairwins_probe_failures` |
| `probe_metric_filter` | string | see variables.tf |

## Outputs

`notification_channel_ids`, `uptime_check_ids`, `alert_policy_ids`.

## One class of bug this module removes entirely

`apply.sh` had to warn that a banner printed to stdout instead of stderr would land inside the
channel id via command substitution, producing policies that fire and page nobody — indistinguishable
from policies that never fire. A channel is now a resource reference, so that cannot happen.

## Things that will bite you

- **Do not "simplify" a content matcher.** Both were chosen against a real failure. A matcher that
  looks cleaner and matches a static 200 is a check that cannot fail.
- **Do not switch targets to hostnames.** They will be permanently red.
- **A policy with an empty `notification_channels` fires and pages nobody.** Pass at least one
  address in `notification_emails`.
