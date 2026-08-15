# Contract: Module Interfaces and Extraction Path

**Satisfies**: FR-024, FR-024a, FR-025, SC-011

`chippr-tf-modules` does not exist in the `chippr-robotics` organisation (verified 2026-08-14).
Modules are therefore built locally under `infra/terraform/modules/`, under constraints that make
extraction a mechanical move rather than a rewrite.

## Extraction constraints (gate-enforced where possible)

| Constraint | Gate |
|---|---|
| No `provider` block inside a module — providers are passed by the root | G-09 |
| No literal project / region / zone in a module body | G-08 |
| Every environment-specific value is a `variable` with `type` and `description` | review |
| Every value a consumer needs is a declared `output` — consumers never reach into internals | review |
| No `data` lookup of a resource the module does not own — those are inputs | review |
| Each module has a `README.md` with inputs, outputs, and resources created | review |

The `for_each` consequence of G-09 is worth stating: a module containing its own `provider` block
cannot be instantiated with `for_each` or `count`, which is exactly how `edge-node` is used (two
nodes) and how per-tenant Cloud Run services will be used (N tenants). The constraint pays for
itself before extraction is ever attempted.

## Modules

### `network`

Creates the VPC, subnet, static IPs, and firewall rules for one region.

| Inputs | | |
|---|---|---|
| `project_id` | string | |
| `region` | string | |
| `network_name`, `subnet_name` | string | |
| `subnet_cidr` | string | default `10.10.0.0/24` |
| `edge_target_tags` | list(string) | tags the ingress rules apply to |
| `cloudflare_ipv4_ranges`, `cloudflare_ipv6_ranges` | list(string) | from the `cloudflare_ip_ranges` data source — passed in, never fetched inside |
| `uptime_prober_cidrs` | list(string) | from the generated, staleness-gated list |
| `static_ip_names` | list(string) | |

| Outputs | |
|---|---|
| `network_id`, `network_self_link`, `subnet_id` | |
| `static_ips` | map of name → address; consumed by Cloudflare DNS so an IP change cannot desync |

### `edge-node`

One GCE node role: the instance, optionally its service account, and that account's
resource-scoped IAM. Instantiated once per role.

| Inputs | | |
|---|---|---|
| `project_id`, `zone`, `subnet_id` | string | |
| `name`, `role` | string | `role` becomes the `fairwins-role` metadata and the `role` label |
| `machine_type` | string | default `e2-small` |
| `static_ip_name` | string | |
| `service_account_email` | string | pass an existing SA (the gateway reuses `fairwins-relay-engine@`) |
| `create_service_account` | bool | true for the bundler, false for the gateway |
| `secret_accessor_secrets` | list(string) | resource-scoped grants — never project-wide |
| `artifact_registry_repo` | string | repository-scoped reader grant |
| `project_roles` | list(string) | telemetry roles that have no resource-scoped equivalent |
| `startup_script` | string | |
| `shielded_vm` | bool | default true |

| Outputs | |
|---|---|
| `instance_id`, `instance_name`, `service_account_email`, `internal_ip` | |

Every IAM resource inside is `*_iam_member` (G-01/G-02). The `secret_accessor_secrets` and
`artifact_registry_repo` inputs exist so grants stay resource-scoped: granting Artifact Registry
read at project level would hand both node SAs read over every repository in a shared project, and
would destroy the property that makes `fairwins-relay-engine@` worth keeping — it holds zero
project-level roles today.

### `cloud-run-service`

One Cloud Run service's shape. The artifact is the pipeline's (`contracts/ownership-boundary.md`).

| Inputs | | |
|---|---|---|
| `project_id`, `region`, `name` | string | |
| `image` | string | required by the provider but ignored after create; use the `:latest` tag the pipeline already publishes |
| `service_account_email` | string | |
| `min_instances`, `max_instances` | number | |
| `cpu`, `memory`, `concurrency`, `timeout_seconds` | | |
| `cpu_idle` | bool | `false` == always-allocated CPU |
| `ingress` | string | |
| `allow_unauthenticated` | bool | manages the invoker binding |
| `secret_env` | map | env var → `{secret, version}` |
| `domain_mappings` | list(string) | |

| Outputs | |
|---|---|
| `service_uri`, `service_name`, `latest_ready_revision` | |

Carries the G-07 `ignore_changes` set. `min_instances` and `cpu_idle` are called out because they
are the cost-relevant attributes the `fairwins-infra` skill toggles — under this module they become
a reviewed change rather than a CLI flag whose effect nobody records.

### `cloudflare-zone`

DNS records and the two rulesets for one zone.

| Inputs | | |
|---|---|---|
| `zone_id` | string | |
| `dns_records` | list(object) | name, type, value, proxied |
| `geo_gate_countries` | list(string) | the compliance deny set |
| `geo_gate_response_code` | number | 451 |
| `origin_lock_header_name` | string | `X-Origin-Auth` |
| `origin_lock_secret` | string, `sensitive` | passed in by the root; the module never reads Secret Manager itself |

| Outputs | |
|---|---|
| `record_ids`, `waf_ruleset_id`, `transform_ruleset_id` | |

Both rulesets are **authoritative for their phase**: an out-of-band rule not present here is deleted
on apply. The module README states this at the top, because it is the property most likely to
surprise someone editing it during an incident.

### `monitoring`

Notification channels, uptime checks, alert policies, log metrics.

| Inputs | | |
|---|---|---|
| `project_id` | string | |
| `notification_emails` | list(string) | |
| `uptime_targets` | list(object) | host (an **IP**), path, content matcher, `validate_ssl` |
| `alert_thresholds` | object | CPU, memory, disk, probe-failure thresholds |

| Outputs | |
|---|---|
| `notification_channel_ids`, `uptime_check_ids`, `alert_policy_ids` | |

`uptime_targets` takes IPs and a `validate_ssl` flag rather than hostnames because the Cloudflare geo
gate answers 451 to US-sourced traffic and Google's probers are largely US-based — a hostname check
is permanently red — and the origin serves a Cloudflare Origin CA certificate that is deliberately
not publicly trusted. The content matchers carry their reasoning as comments (research.md R14); a
port that keeps thresholds but drops those comments invites someone to "simplify" the matchers back
into the form that stayed green through a real outage.

## Promotion path to `chippr-tf-modules`

When the shared repository exists:

1. `git mv infra/terraform/modules/<name>` into `chippr-tf-modules/<name>` — **no change to the
   module body**; that is what the constraints above buy.
2. Tag the shared repository (`v0.1.0`).
3. In each consumer, change the source and pin the version:

   ```hcl
   # before
   source = "../../modules/network"

   # after
   source = "git::https://github.com/chippr-robotics/chippr-tf-modules.git//network?ref=v0.1.0"
   ```

4. `terraform init -upgrade`, then confirm a **zero-diff plan**. A non-zero diff means the module
   was not as portable as claimed, and the move is reverted rather than applied.
5. Commit the updated `.terraform.lock.hcl`.

Step 4 is the gate. Extraction that changes the plan is not extraction — it is a rewrite wearing a
`git mv`.

Until then, `source = "../../modules/<name>"` is a relative path within one repository at one commit,
so FR-025's immutability requirement is satisfied by the commit itself; the `ref=` pin becomes
load-bearing only after step 3.
