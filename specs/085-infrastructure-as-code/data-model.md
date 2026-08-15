# Data Model: Infrastructure as Code

**Feature**: 085-infrastructure-as-code | **Phase 1**

There is no application data model here. The "data" is the **managed-resource inventory**: the set of
cloud objects this project owns, each with an owner, a protection level, and an adoption state. This
document defines that record's schema and enumerates the inventory, which is what makes FR-002
("attributable to this project from the repository alone") and SC-003 (100% coverage or documented
exclusion) checkable.

---

## Entity: Managed Resource

| Field | Meaning | Values |
|---|---|---|
| `address` | Terraform address, or `n/a` for Ansible-owned attributes | e.g. `module.network.google_compute_network.vpc` |
| `real_id` | Provider-side identifier used by the `import` block | e.g. `projects/chippr-bots-site-wp/global/networks/fairwins-infra` |
| `owner` | Which layer owns the attribute set | `terraform` \| `ansible` \| `cloudbuild` \| `out-of-band` |
| `environment` | Lifecycle grouping | `prod` \| `staging` \| `shared` |
| `protection` | What may happen to it | `replaceable` \| `protected` (`prevent_destroy` + denied to the CI identity) |
| `adoption` | Where it is in the rollout | `live-unmanaged` → `imported` → `zero-diff` |
| `phase` | Plan phase that adopts it | `A`–`G` (see plan.md) |

**State transitions** (`adoption`):

```
live-unmanaged ──import block + reviewed config──▶ imported ──plan shows no diff──▶ zero-diff
                                                       │
                                                       └── plan shows a diff ──▶ back to config review
                                                           (never "apply to make it match")
```

The invariant that matters: a resource is only **done** at `zero-diff`. `imported` with an
outstanding diff means the configuration is wrong, not that the infrastructure is wrong — the
correction goes into the repository, never into the cloud. Applying to force live infrastructure to
match an unreviewed generated body is the failure mode R2 warns about.

---

## Entity: Environment

| Field | Value (prod) | Value (staging) |
|---|---|---|
| `state_prefix` | `prod` | `staging` |
| `root` | `infra/terraform/environments/prod` | `infra/terraform/environments/staging` |
| `cohort` | mainnet (Polygon 137) | mainnet mirror + testnet (Amoy 80002) |
| `blast radius` | own state only | own state only |

Environments never share state and never reference each other's resources. This is the mechanism
behind FR-030, and it also preserves constitution III's testnet/mainnet boundary at the
infrastructure layer.

---

## Entity: Node Role

| Field | `bundler` | `gateway` |
|---|---|---|
| Instance | `fairwins-bundler` | `fairwins-gateway` |
| Service account | `fairwins-bundler@` | `fairwins-relay-engine@` |
| Labels (inventory key) | `app=fairwins, role=bundler` | `app=fairwins, role=gateway` |
| Metadata | `fairwins-role=bundler` | `fairwins-role=gateway` |
| Public host | `bundler.fairwins.app` | `relay.fairwins.app` |
| Static IP | `fairwins-bundler-ip` | `fairwins-gateway-ip` |
| Namespace owner | `alto` | `gateway` |
| Secret env files | `nginx.env`, `alto.env` | `gateway.env`, `engine.env` |
| systemd unit | `fairwins-stack@bundler` | `fairwins-stack@gateway` |

The namespace-owner row is load-bearing: containers share one network namespace, so the Ansible
handler restarts `fairwins-stack@<role>` as a unit and never an individual container (FR-023).

---

## Entity: Secret Reference

Terraform records the container and who may read it; **never the value** (FR-015).

| Secret | Version pin | Readers | Consumer |
|---|---|---|---|
| `alto-executor-key-137` | `latest` | `fairwins-bundler@` | alto (bundler VM) |
| `origin-lock-secret` | `latest` | `fairwins-bundler@`, `fairwins-relay-engine@` | nginx (both), Cloudflare transform rule |
| `relay-webhook-secret` | **`2`** | `fairwins-relay-engine@` | gateway + engine |
| `relay-engine-api-key` | **`2`** | `fairwins-relay-engine@` | gateway + engine |
| gateway feature credentials (OpenSea, Polymarket, Bitcoin, …) | `latest` | `fairwins-relay-engine@` | gateway; **optional** — absence must fail closed with 503, never abort boot |

The two `2` pins are asserted inputs, not defaults. Both secrets currently have an enabled v1 *and*
v2, so treating an unpinned `latest` as equivalent is benign today and silently wrong after the next
rotation (R11).

The `required` / `optional` column is behavioural, not documentary: a missing required secret aborts
node boot; a missing optional one leaves the variable unset so that feature's routes fail closed
while the gasless relay path stays up (the never-stranded rule).

---

## Inventory

Coverage claim for SC-003. `protection: protected` means `prevent_destroy = true` **and** the CI
identity lacks the delete permission.

### Networking — module `network`, phase B

| Resource | Real ID | Protection |
|---|---|---|
| `google_compute_network.vpc` | `fairwins-infra` | replaceable |
| `google_compute_subnetwork.usc1` | `fairwins-infra-usc1` (10.10.0.0/24, PGA on) | replaceable |
| `google_compute_address.bundler` | `fairwins-bundler-ip` | **protected** — pinned in Cloudflare DNS |
| `google_compute_address.gateway` | `fairwins-gateway-ip` | **protected** — pinned in Cloudflare DNS |
| `google_compute_firewall.allow_cloudflare` | `fairwins-allow-cloudflare` (tcp 80,443 ← `cloudflare_ip_ranges` v4) | replaceable |
| `google_compute_firewall.allow_cloudflare_v6` | `fairwins-allow-cloudflare-v6` | replaceable |
| `google_compute_firewall.allow_uptime_probers` | `fairwins-allow-uptime-probers` (tcp 443 ← generated prober list) | replaceable |
| `google_compute_firewall.allow_iap_ssh` | `fairwins-allow-iap-ssh` (tcp 22 ← 35.235.240.0/20) | replaceable |

`allow_iap_ssh` is also Ansible's only route in (R11). Removing it does not merely close SSH — it
makes node configuration unreachable.

### Nodes — module `edge-node` ×2, phase B

| Resource | Real ID | Protection |
|---|---|---|
| `google_compute_instance.node` (bundler) | `fairwins-bundler`, e2-small, Debian 12, shielded VM | replaceable |
| `google_compute_instance.node` (gateway) | `fairwins-gateway`, e2-small, Debian 12, shielded VM | replaceable |
| `google_service_account.node` (bundler) | `fairwins-bundler@` | replaceable |
| `google_project_iam_member` ×5 | `run.viewer` (bundler only), `logging.logWriter` ×2, `monitoring.metricWriter` ×2 | replaceable |
| `google_secret_manager_secret_iam_member` ×N | resource-scoped secret access | replaceable |
| `google_artifact_registry_repository_iam_member` ×2 | `artifactregistry.reader` on `cloud-run-source-deploy` | replaceable |

`fairwins-relay-engine@` is imported but holds **zero** project-level roles today; that property is
preserved and is why its Artifact Registry grant is repository-scoped rather than project-scoped.

Every `*_iam_member` above is additive by construction. No `*_iam_binding` or `*_iam_policy` appears
anywhere in this inventory, and the guardrail gate rejects them (R3).

### Secrets — phase D

`google_secret_manager_secret` containers plus `google_secret_manager_secret_iam_member` bindings for
every secret in the Secret Reference table. **No `google_secret_manager_secret_version` resources** —
forbidden by the guardrail gate.

Protection: **protected** (destroying a container destroys every version).

### Cloud Run — module `cloud-run-service`, phase D

| Service | Environment | Owned attributes | Ignored |
|---|---|---|---|
| `prediction-dao-research` | prod | scaling, CPU/memory, concurrency, timeout, ingress, SA, secret env wiring, invoker IAM, domain mapping | image, revision, client, client_version |
| `staging` | staging | same | same |
| `staging-testnet` | staging | same | same |
| per-tenant services (spec 072) | prod | same, one instance per tenant manifest | same |

**Not declared**: the decommissioned Cloud Run alto bundler. Declaring it risks re-arming a second
executor against the one EOA the VM bundler already uses (R5, R15).

### Artifact Registry & KMS — phase D

| Resource | Protection |
|---|---|
| `google_artifact_registry_repository.cloud_run_source_deploy` | **protected** |
| `google_kms_key_ring` (relay/paymaster signing) | **protected** |
| `google_kms_crypto_key` ×N | **protected** |

KMS keys are imported for the audit record and for their IAM bindings. Their versions are never
managed — a destroyed key version cannot be restored from state.

### Edge — module `cloudflare-zone`, phase E

| Resource | Notes |
|---|---|
| `cloudflare_dns_record.bundler` | `bundler.fairwins.app` → bundler static IP, proxied |
| `cloudflare_dns_record.relay` | `relay.fairwins.app` → gateway static IP, proxied |
| `cloudflare_dns_record.*` | apex + tenant domains → Cloud Run |
| `cloudflare_ruleset.waf_geo` | phase `http_request_firewall_custom` — **authoritative for the phase** |
| `cloudflare_ruleset.origin_lock` | phase `http_request_late_transform` — injects `X-Origin-Auth` |

Record values are wired from the `google_compute_address` outputs, so a changed origin IP cannot
desync from DNS. Both rulesets replace their whole phase on apply — an out-of-band rule is deleted
(R6), which is why this surface is adopted last and gated by CODEOWNERS.

### Monitoring — module `monitoring`, phase F

| Resource | Count |
|---|---|
| `google_monitoring_notification_channel` | 1 (email) |
| `google_monitoring_uptime_check_config` | 2 (bundler, gateway — **origin IPs, SSL validation off**) |
| `google_monitoring_alert_policy` | 7 (uptime, probe-failing, VM down, agent-not-reporting, CPU, memory, disk) |
| `google_logging_metric` | 1 (`fairwins_probe_failures`) |

Content matchers carry their reasoning as comments, verbatim from `ops/monitoring/apply.sh`: the
bundler matches `0x5FF137D4` from `eth_supportedEntryPoints` rather than a 200 (the origin-lock
nginx's `/healthz` is a static `return 200` that never touches alto — the check that stayed green
through the 2026-07-12 outage), and the gateway matches `"rpc":"up"` and must **not** match
`"status":"ok"` (returned unconditionally even when every chain is down).

### Trust root — `bootstrap/`, phase A, environment `shared`

| Resource | Protection |
|---|---|
| `google_storage_bucket.tfstate` | **protected** — versioned, uniform access, Google-managed encryption |
| `google_iam_workload_identity_pool` + provider | replaceable |
| `google_service_account.tf_plan` | replaceable — read-only |
| `google_service_account.tf_apply` | replaceable — roles per `contracts/ci-identity.md` |

State: **local, committed**. It manages no secrets and no payloads; committing it makes the trust
root auditable at any commit (R9, plan.md Complexity Tracking).

### Ansible-owned (no Terraform address)

Packages and versions; OS hardening (SSH policy, kernel params, file permissions); nginx site
configs (`fairwins-gateway.conf`, `fairwins-bundler.conf`); systemd units (`fairwins-stack@`,
`fairwins-secrets@`, `fairwins-probe@` + timer); docker-compose files; `/run/fairwins` tmpfs and the
per-container env files; probe/preflight/gate/poststart scripts.

### Deliberately excluded (FR-003, SC-003)

The WordPress VM, the default VPC and its `default-allow-*` rules, `clearpath-*` / `fukuii-*` /
`kings-edge-*` services, the `266380754692-compute@` default SA's project roles, secret payloads and
rotation, on-chain deployments, and the decommissioned Cloud Run bundler. Reasons in research.md R15.

---

## Validation Rules

1. Every resource in the inventory has an `import` block until it reaches `zero-diff`; blocks are
   retained afterwards as the adoption audit record (R2).
2. No resource outside this inventory appears in any plan. A plan proposing an undeclared resource
   fails review — in a shared project it means the configuration reached somebody else's workload.
3. `protected` resources carry `prevent_destroy = true` **and** are absent from the CI identity's
   permissions. Either alone is insufficient (R4).
4. No `google_secret_manager_secret_version` resource exists anywhere.
5. No `*_iam_policy` or `*_iam_binding` resource exists anywhere.
6. Every Cloud Run service declares the full `ignore_changes` set from R5.
7. Every module input that is environment-specific is a variable with a type and description; no
   literal project, region, or zone inside a module body (R10).
