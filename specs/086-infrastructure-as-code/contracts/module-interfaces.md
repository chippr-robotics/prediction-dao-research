# Contract: Module Interfaces and Extraction Path

**Satisfies**: FR-024, FR-024a, FR-025, SC-011

**Status: extracted.** The modules live in
[`chippr-robotics/chippr-tf-modules`](https://github.com/chippr-robotics/chippr-tf-modules) and are
consumed by pinned commit SHA.

They were written locally first, under constraints that made extraction a mechanical move rather
than a rewrite — and the move proved it: every module body crossed **byte-identical**, verified with
`cmp` at extraction and again against the copy `terraform init` fetched after rewiring.

The move happened *before anything had been imported into Terraform state*, which is the cheapest
moment it will ever have. The zero-diff gate below exists to catch an extraction that changes a live
plan; there was no live plan yet to change.

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

## How it is pinned, and why by SHA rather than tag

```hcl
source = "git::https://github.com/chippr-robotics/chippr-tf-modules.git//modules/network?ref=70498e2a2860f2e65cd2ce3919ca85d29678a1e3"
```

A **40-character commit SHA**, not a tag. A tag can be repointed at a different commit; a SHA cannot,
which makes it the stricter satisfaction of FR-025. Guardrail **G-16** rejects any external module
source that is unpinned or pinned to a branch.

The shared repository also carries a `v0.1.0` annotated tag locally, but pushing tags is blocked
through this session's git proxy so it is not on the remote yet. Nothing depends on it — the pin is
a SHA. Anyone with push access can add the tag later; it changes no plan.

## The shared repository is private

`terraform init` needs a credential to fetch it. The default `GITHUB_TOKEN` in a consumer's Actions
workflow is scoped to that repository alone and **cannot** read the modules repo, so the three infra
workflows rewrite git's config with `TF_MODULES_TOKEN` before `init`:

```yaml
- name: Allow Terraform to fetch private modules
  run: |
    git config --global url."https://x-access-token:${{ secrets.TF_MODULES_TOKEN }}@github.com/".insteadOf "https://github.com/"
```

A missing or wrong token surfaces as **`repository not found`** on the module source, not as a
permission error — GitHub returns 404 rather than 403 for a private repository the caller cannot
see. Read that message as authentication before hunting for a wrong path.

### The token must be owned by the ORGANISATION

A fine-grained PAT's **resource owner** is chosen when the token is created and **cannot be edited
afterwards**. A token owned by a personal account can never see `chippr-robotics` repositories — no
scope setting, no organisation policy, and no approval changes that.

GitHub reports this as **404 Not Found**, not 403, because a repository you cannot see is
indistinguishable from one that does not exist. That reads as "the repo is missing" or "the scope is
wrong", so it sends you to fix things that were never broken. It cost four rounds here.

When creating the token, the **Resource owner** dropdown must be set to `chippr-robotics`. The token
page then shows *"Access on the chippr-robotics organization"*. If it does not say that, the token
cannot be repaired — generate a new one.

Required settings:

| Field | Value |
|---|---|
| Resource owner | `chippr-robotics` |
| Repository access | Only select repositories → `chippr-tf-modules` |
| Repository permissions | Contents: **Read-only** |

The organisation must also permit fine-grained PATs, and may hold the token in a pending-approval
queue. Verify before storing the secret:

```bash
git ls-remote https://x-access-token:<TOKEN>@github.com/chippr-robotics/chippr-tf-modules.git HEAD
```

It should print the commit the modules are pinned to.

### Never paste a token into a screenshot or a chat

Treat any token that has appeared in an image, a transcript, or a log as compromised and revoke it.
The secret store is the only place a token belongs.

## Bumping to a new module version

1. Land the change in `chippr-tf-modules`; its own CI runs module hygiene, `fmt`, `validate` and
   `tflint`.
2. Update the `?ref=` SHA in each consuming root.
3. `terraform init -upgrade`, then confirm a **zero-diff plan** — unless the bump is meant to change
   something, in which case the plan is the review artifact.

Step 3 is the gate. A version bump that silently changes a consumer's plan is the failure shared
modules exist to prevent.

## Adding a module

Add it to `chippr-tf-modules`, not to `infra/terraform/modules/`. A module kept here would be
invisible to the other Chippr projects and would drift from its shared twin.

A genuinely FairWins-only module may live here, and still has to satisfy G-08 (no environment
literals) and G-09 (no `provider` blocks), which remain enforced against that directory.
