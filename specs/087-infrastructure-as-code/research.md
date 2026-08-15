# Research: Infrastructure as Code (Terraform + Ansible)

**Feature**: 087-infrastructure-as-code | **Date**: 2026-08-14

Phase 0 output. Every decision below resolves a technical unknown in `plan.md`'s Technical Context
or a requirement in `spec.md` that has more than one plausible implementation. Findings marked
**HAZARD** describe a way the obvious implementation would silently do the wrong thing.

---

## R1. Provisioning tool and version

**Decision**: Terraform, pinned to `1.15.x` (`required_version = "~> 1.15.0"`, latest at time of
writing 1.15.8), with the provider lock file (`.terraform.lock.hcl`) committed and provider versions
pinned with `~>` minor constraints: `hashicorp/google ~> 7.44`, `hashicorp/google-beta ~> 7.44`,
`cloudflare/cloudflare ~> 5.23`.

**Rationale**: The brief names Terraform. 1.5+ is required for declarative `import` blocks (R2),
which are the whole basis of the non-destructive adoption story. Committing
`.terraform.lock.hcl` with recorded provider hashes is what makes FR-026 true — the same commit
resolves to the same provider binaries on any machine, including CI.

**Licensing note**: Terraform ≥1.6 is BUSL-1.1. The licence restricts offering a competing hosted
Terraform service; internal infrastructure management by the organisation that owns the
infrastructure is unaffected. OpenTofu is a drop-in alternative if that posture ever changes — the
configuration in this feature is compatible with both, and nothing in it uses a Terraform-only
feature beyond `import` blocks, which OpenTofu also implements.

**Alternatives considered**: *Pulumi* — rejected; the brief names Terraform, and it would add a
language runtime to the infra toolchain. *OpenTofu now* — rejected as the default only because the
brief said Terraform; noted as a supported fallback. *Unpinned versions* — rejected outright, it
makes FR-026 unachievable and turns a provider release into an unreviewed change to production.

---

## R2. Non-destructive adoption of live resources

**Decision**: Adopt with declarative `import` blocks (Terraform 1.5+), not the imperative
`terraform import` CLI. Each block names the target address and the provider-specific resource ID:

```hcl
import {
  to = module.network.google_compute_network.vpc
  id = "projects/chippr-bots-site-wp/global/networks/fairwins-infra"
}
```

Configuration bodies are generated once with `terraform plan -generate-config-out=generated.tf`,
then hand-reviewed, reshaped into modules, and committed. `import` blocks stay in the repository
after adoption (they are no-ops once the resource is in state) so the adoption is auditable at any
future commit.

**Rationale**: This is what makes FR-004/FR-005 provable rather than asserted. An `import` block is
visible in the plan before anything happens: the plan output literally says
`will be imported` vs `must be replaced`, so a reviewer sees a destructive adoption *before*
approving it. The CLI equivalent mutates state as a side effect of a command nobody reviewed.

**HAZARD — generated config is not correct config.** `-generate-config-out` emits every attribute
the provider read back, including server-populated defaults and, for some resources, computed
fields that cannot legally be set. Committing it unedited produces a configuration that either
fails to apply or shows permanent diffs. The generated file is a *starting point to be reviewed*,
which is why the plan's task breakdown has a separate review step per surface rather than one bulk
import.

**HAZARD — import does not validate semantics.** Importing a resource with a subtly wrong
configuration body succeeds, and the *next* plan proposes "fixing" the live resource to match the
wrong body. FR-005 (a clean plan on unchanged infrastructure) is the gate that catches this, and it
is why each surface must reach zero-diff before the next is adopted.

**Alternatives considered**: *Terraformer / bulk import tooling* — rejected; it generates
unreviewed configuration for everything it can see, which in a shared project means generating
configuration for other people's workloads. *Greenfield recreate-and-cut-over* — rejected; the
static IPs are pinned in Cloudflare DNS and the KMS keys are unrecoverable.

---

## R3. Blast-radius containment in a shared GCP project

**Decision**: Three enforced rules, checked by an automated guardrail gate (R13), not by convention:

1. **IAM is additive only.** `google_project_iam_member`, `google_secret_manager_secret_iam_member`,
   `google_artifact_registry_repository_iam_member`, `google_service_account_iam_member` are
   permitted. `google_project_iam_policy`, `google_project_iam_binding`,
   `google_organization_iam_policy`, `google_organization_iam_binding`,
   `google_folder_iam_policy`, `google_folder_iam_binding` and every other `*_iam_policy` /
   `*_iam_binding` resource are **forbidden**.
2. **No project resource.** `google_project` is forbidden — the project is an input
   (`var.project_id`), never a managed resource. Terraform must be unable to delete the project.
3. **No service enablement churn.** `google_project_service` is permitted only with
   `disable_on_destroy = false` and `disable_dependent_services = false`, because the enabled API
   set is shared with workloads this repo does not own.

**Rationale — this is the single highest-severity finding in the research.** The difference between
`google_project_iam_member` and `google_project_iam_binding` is not stylistic:

| Resource | Semantics | Effect in a shared project |
|---|---|---|
| `google_project_iam_member` | Additive; manages one (role, member) pair | Safe |
| `google_project_iam_binding` | **Authoritative for that role** | Silently removes every other member holding that role, project-wide |
| `google_project_iam_policy` | **Authoritative for the entire project policy** | Removes every grant not declared here — including the owners' own access |

`chippr-bots-site-wp` hosts a public WordPress VM plus `clearpath-*`, `fukuii-*` and `kings-edge-*`
workloads. A single `google_project_iam_binding` for, say, `roles/run.viewer` — a role the bundler
service account genuinely needs (`infra/vm/provision.sh:150`) — would strip that role from every
other principal in the project. The plan output for this reads as an ordinary small diff. Under
FR-031's automatic apply, nobody has to click anything for it to happen.

This is also why FR-033 exists: the CI identity must not hold `roles/resourcemanager.projectIamAdmin`
or `roles/owner`, so even a merged mistake of this shape fails at the API rather than succeeding.

**HAZARD — `google_project_service` on destroy.** Its default `disable_on_destroy = true` means
removing a service block *disables the API project-wide*. Disabling, say, `run.googleapis.com`
because this repo stopped needing it would take down every other project workload using Cloud Run.

**Alternatives considered**: *A dedicated GCP project for FairWins* — genuinely the correct
long-term answer and it would make most of this section unnecessary, but it is a migration of live
production (new project = new KMS keys = re-signing, new IPs = DNS cutover) and is out of scope for
this feature. Recorded in `plan.md` Complexity Tracking as deferred. *Relying on code review to
catch authoritative resources* — rejected; the failure is invisible in review precisely because the
resource names differ by one word.

---

## R4. Protecting irreplaceable resources

**Decision**: Two independent layers, because either alone is insufficient.

1. **`lifecycle { prevent_destroy = true }`** on: KMS key rings and crypto keys, Secret Manager
   secret containers, `google_compute_address` (the Cloudflare-pinned origin IPs), the state bucket,
   and the Artifact Registry repository. This makes `terraform plan` **error** — not warn — if
   anything would destroy or replace them.
2. **Permission denial on the CI identity** (FR-033). The automation service account is granted no
   role containing `cloudkms.cryptoKeyVersions.destroy`, `secretmanager.secrets.delete`, or
   `compute.addresses.delete`.

**Rationale**: `prevent_destroy` is a *configuration* guard. A change that removes the resource
block also removes its `prevent_destroy`, and Terraform will then happily destroy the resource —
this is a documented, frequently-encountered gap, not a subtlety. Layer 2 is the one that holds
when layer 1 is deleted. FR-033's wording ("enforced by the identity's granted roles, not only by
declared intent") exists because of exactly this.

**HAZARD — `prevent_destroy` and replacement.** Several attribute changes force replacement rather
than update (e.g. changing a `google_compute_address`'s `address_type` or region). `prevent_destroy`
does block these, which is correct, but it surfaces as a confusing plan-time error rather than a
clear "you cannot change this". Each protected resource gets a comment naming which attributes are
replace-forcing.

**Alternatives considered**: *GCP Ivan/deletion liens* — a project-level lien blocks project
deletion only, not resource deletion; useful but orthogonal. *Relying on state backups* — rejected;
state restore cannot restore a destroyed KMS key version.

---

## R5. Cloud Run: ownership split between Terraform and Cloud Build

**Decision**: `google_cloud_run_v2_service` declares the service shape, with a `lifecycle`
`ignore_changes` list covering everything the deployment pipeline owns:

```hcl
lifecycle {
  ignore_changes = [
    template[0].containers[0].image,   # Cloud Build deploys the artifact
    template[0].revision,              # revision names are pipeline-generated
    client, client_version,            # gcloud stamps these on every deploy
  ]
}
```

Terraform owns: scaling bounds (`min_instance_count`/`max_instance_count`), CPU allocation and
throttling, memory, concurrency, timeout, ingress posture, the runtime service account, Secret
Manager volume/env wiring, VPC connectivity, IAM invoker bindings, and domain mappings.
Cloud Build keeps owning: the image tag, and nothing else.

**Rationale**: Two writers on one attribute is the classic IaC failure and it degrades exactly as
FR-038 predicts — the scheduled drift check reports the image as drifted on every merge, everyone
learns to ignore drift alerts, and then a real drift arrives. `ignore_changes` gives each attribute
exactly one owner (FR-022a).

**HAZARD — the initial import needs a real image.** `google_cloud_run_v2_service` requires an
`image` value in configuration even though it is ignored afterwards. The value must be a currently
valid reference at import time, or the very first apply (before `ignore_changes` has a prior state
to compare against) proposes a change. Convention adopted: declare `:latest`, which the pipeline
already publishes alongside the SHA tag (`cloudbuild.yaml` pushes both).

**HAZARD — this fixes an existing standing trap, and must not undo it.** `cloudbuild.yaml` carries a
long comment explaining that the alto bundler's `gcloud run services replace` step was *deleted*
because re-running it would silently re-arm a Cloud Run bundler alongside the VM bundler — two
executors on one EOA, colliding nonces, both instances reporting healthy. Bringing Cloud Run under
Terraform must not resurrect that service. The decommissioned Cloud Run bundler is therefore
explicitly **not** imported and **not** declared; `services/alto-bundler/deploy/service.yaml` is
marked non-authoritative in the same change. FR-022b (the pipeline stops setting shape) is satisfied
here by leaving the deletion in place, not by adding anything.

**HAZARD — the relay gateway is a multi-container service.** `docs/architecture/relayer-infrastructure.md`
records that a single-container `gcloud run deploy` would clobber its sidecars. It has since moved to
a VM, so the Cloud Run service no longer exists — but if any multi-container Cloud Run service is
adopted later, `ignore_changes` on `template[0].containers[0].image` is index-fragile and must be
revisited.

**Alternatives considered**: *Terraform owns the image too* — rejected by the issue author (recorded
clarification); it puts every app release behind the infra approval gate. *Cloud Run out of scope* —
rejected by the issue author; it leaves the largest surface undeclared.

---

## R6. Cloudflare provider and edge resource mapping

**Decision**: `cloudflare/cloudflare ~> 5.23`. Resource mapping, verified against the v5 provider's
published resource list:

| Today (manual, prose runbook) | Terraform resource | Phase / notes |
|---|---|---|
| DNS A records → origin IPs | `cloudflare_dns_record` | Proxied (`proxied = true`); value wired from the `google_compute_address` outputs so a changed IP cannot desync |
| WAF geo gate → HTTP 451 (`infra/cloudflare/waf-geo.md`) | `cloudflare_ruleset` | `phase = "http_request_firewall_custom"`, `kind = "zone"` |
| Origin lock header injection (`infra/cloudflare/origin-lock.md`) | `cloudflare_ruleset` | `phase = "http_request_late_transform"`, `kind = "zone"` |

**Rationale**: v4's `cloudflare_record` was renamed to `cloudflare_dns_record` in the v5 rewrite
(the provider was regenerated from Cloudflare's OpenAPI schema, with widespread schema changes).
Writing against v4 names would fail immediately; writing against v4 *schemas* under a v5 provider
fails subtly. Pinning `~> 5.23` and stating the mapping here prevents both.

**HAZARD — rulesets are authoritative for their phase.** A `cloudflare_ruleset` at a given
zone+phase replaces the entire rule list for that phase. Any rule added through the dashboard and
not present in configuration is deleted on the next apply. For `http_request_firewall_custom` this
means an out-of-band WAF rule — the kind someone adds during an incident at 3am — disappears
silently on the next merge. This is stated in the runbook and is the reason the edge surface is
adopted **last**, after the change flow and drift detection are proven.

**HAZARD — the geo gate is a legal control, not a config value.** `waf-geo.md` documents an
allowlist posture whose deny set includes the US and which answers HTTP 451. Terraform makes this
editable by anyone with merge rights. Mitigation: the edge module is placed under a CODEOWNERS
entry and the guardrail gate flags any diff touching the firewall ruleset as compliance-affecting
(FR-039), so it cannot ride along unnoticed inside an unrelated change.

**HAZARD — the origin-lock secret.** The transform rule injects a shared secret header whose value
must equal `ORIGIN_LOCK_SECRET` in Secret Manager. That value must not enter Terraform
configuration or state (FR-014). Resolved in R7.

**Alternatives considered**: *Keep the edge manual* — rejected; it is the surface with the weakest
current story (prose only) and the highest compliance stakes. *Cloudflare provider v4* — rejected;
it is superseded and the v5 schema is what the current API documents.

---

## R7. Values that must not enter state, and freshness of derived lists

**Decision**:

- **Secret payloads**: Terraform manages `google_secret_manager_secret` (the container) and
  `*_iam_member` access bindings only. `google_secret_manager_secret_version` is **forbidden by the
  guardrail gate** — declaring a version writes the payload into state in plaintext.
- **The origin-lock header value** (R6): read at plan time from the existing secret via the
  `google_secret_manager_secret_version` **data source**, marked `sensitive`, and referenced only in
  the ruleset expression. It still lands in state — data-source results are stored — so this is
  recorded as an accepted, documented exception in `plan.md` Complexity Tracking, with the state
  bucket's access restricted accordingly (FR-010). The alternative (a placeholder plus a manual
  dashboard step) reintroduces exactly the manual drift this feature exists to remove.
- **Cloudflare edge ranges**: the `cloudflare_ip_ranges` **data source**, not a pinned copy. It
  re-reads on every plan, so a range change shows up as a firewall diff in the next scheduled drift
  check rather than as a silent outage (FR-040).
- **Google uptime prober IPs**: no Terraform data source exists. `provision.sh` shells out to
  `gcloud monitoring uptime list-ips`. Decision: a small generator script writes the list to a
  committed, dated JSON file, and the drift job re-runs the generator and fails if the committed
  copy is stale. This keeps the list reviewable and makes staleness loud, satisfying FR-040 for a
  source with no data source.

**Rationale**: FR-014/FR-015 draw the line at payloads, not at the existence of secrets. Terraform
is very good at describing "this secret exists, and these three identities may read it" — which is
the audit question — and very bad at holding the value.

**HAZARD — data sources are stored in state.** A common misconception is that only `resource` blocks
persist. `data` block results are written to state too, so `sensitive = true` hides the value from
*output*, not from *state*. Hence the explicit exception above rather than a silent assumption.

**HAZARD — plan artifacts contain state values.** A saved plan file (`-out=tfplan`) embeds the prior
state of everything it touches. It must never be published as an unrestricted CI artifact. See R8.

---

## R8. Automatic apply on merge, executing the reviewed plan

**Decision**: GitHub Actions with Workload Identity Federation (no stored GCP key), and a
plan-continuity check that makes "apply the plan that was reviewed" true across the merge boundary.

**Authentication**: `google-github-actions/auth` with WIF, exchanging the workflow's OIDC token for
short-lived credentials on a dedicated `fairwins-tf-apply@` service account. The WIF pool's
attribute condition restricts it to this repository *and* to the `main` ref for the apply identity;
pull-request plans use a separate, strictly read-only `fairwins-tf-plan@` identity. Cloudflare has
no OIDC federation, so its API token remains a GitHub secret — scoped to the specific zones, with
`Zone.DNS:Edit` and `Zone.WAF:Edit` and nothing else, and never account-level.

**Plan continuity across merge** — the mechanism, because this is the part that is easy to get
wrong:

1. On a PR touching `infra/terraform/**`, plan runs and produces `tfplan` plus a human-readable
   summary posted to the PR (FR-027).
2. `tfplan` is uploaded as a **short-retention, non-public artifact** (see R7 hazard), alongside a
   digest of the infra tree (`git rev-parse HEAD:infra/terraform`) and the state serial the plan was
   computed against.
3. On merge to `main`, the apply job recomputes the merged tree's `infra/terraform` digest. If it
   matches the approved PR's digest **and** the state serial is unchanged, the saved `tfplan` is
   applied verbatim. Otherwise the job **fails and reports the divergence** (FR-034) rather than
   computing a fresh plan.

**Rationale**: Terraform already refuses to apply a saved plan against a moved state (it stores the
state serial). What it does *not* check is that the configuration being merged is the configuration
that was planned — squash merges, rebases, and concurrent infra PRs all change the tree. Comparing
the tree digest closes that gap. The failure mode is a hard stop requiring a re-plan, which is the
correct outcome: a fresh unreviewed plan applying automatically is precisely what FR-034 forbids.

**HAZARD — the identity is the real control.** Under automatic apply, review is the only human gate
and reviewers approve diffs, not permissions. The `fairwins-tf-apply@` role set is therefore
enumerated explicitly (see `contracts/ci-identity.md`) with no `roles/owner`, no `roles/editor`, no
`roles/resourcemanager.projectIamAdmin`, no `roles/cloudkms.admin`, and secret access at the
resource level rather than project level.

**HAZARD — concurrency.** Two infra PRs merging close together would race for the state lock; the
loser fails on lock contention having already passed review. Resolved with a GitHub Actions
`concurrency` group on the apply job (queue, do not cancel) plus the state-serial check, which turns
the race into a clean "re-plan required" rather than a partially applied change.

**HAZARD — a failed apply leaves partial state.** Terraform writes state incrementally, so a
mid-apply failure leaves some resources created. FR-035 is satisfied by: failing loudly, never
auto-retrying (no `retry` on the apply step), and the runbook instructing a human to re-plan and
inspect before any further action.

**Alternatives considered**: *Plan-in-CI with human apply* — recommended in the clarification but
declined by the issue author; the risk it addresses is instead bounded by FR-033/034/035.
*Long-lived service account key in a GitHub secret* — rejected, violates FR-032 and is the single
most common cause of cloud compromise via CI. *Terraform Cloud / Spacelift* — rejected; adds an
external system holding state and credentials, contrary to the per-repo state requirement (FR-009).

---

## R9. Root module layout and blast radius

**Decision**: One root configuration per *environment*, each with its own state prefix, plus a
one-time bootstrap root:

```
infra/terraform/
  bootstrap/            # state bucket + WIF pool + CI service accounts. Local state, committed. Run once.
  environments/
    prod/               # state prefix: prod
    staging/            # state prefix: staging
  modules/              # local, extractable (R10)
```

**Rationale**: FR-030 requires that a change to one service does not require applying unrelated
services. Environment-scoped roots give a hard boundary (a prod apply cannot touch staging state at
all), which is stronger than `-target` flags — those are documented by HashiCorp as an exceptional
recovery tool, not a workflow, and they silently skip dependency updates.

**Bootstrap chicken-and-egg (FR-011)**: the state bucket cannot store the state that creates it.
`bootstrap/` runs with local state, which is then **committed to the repository**. This is safe
because bootstrap manages only the bucket, the WIF pool, and the two CI service accounts — no
secrets, no payloads. It is run manually, rarely, by a human with owner rights, and the committed
state file is the audit record of how the trust root was established. After bootstrap,
`terraform init -migrate-state` is *not* used; the local state stays local by design so the trust
root never depends on itself.

**HAZARD — `-target` as a workflow.** Tempting for FR-030 and wrong: it applies a subgraph without
refreshing the rest, so the recorded state stops describing reality — the exact failure this feature
exists to prevent.

**Alternatives considered**: *Terraform workspaces* — rejected; workspaces share one configuration
and one backend, so a prod/staging divergence becomes conditional logic inside the configuration,
and a wrong `terraform workspace select` applies staging config to prod. *One root for everything* —
rejected; violates FR-030 and makes every plan a whole-estate plan.

---

## R10. Module design for later extraction

**Decision**: Local modules under `infra/terraform/modules/`, written to the constraints that make
extraction mechanical (FR-024/FR-024a):

- No `provider` blocks inside modules (providers are passed in by the root, per HashiCorp guidance —
  a module with its own provider block cannot be used with `for_each` and cannot be cleanly versioned).
- No repository paths, no hardcoded project/zone/region — every environment-specific value is an
  input variable with a type constraint and a description.
- Every value a consumer might need is a declared `output`; consumers never reach into a module's
  internals.
- Each module has its own `README.md` documenting inputs, outputs, and the resources it creates.
- No `data` lookups of resources the module does not own; those are inputs.

Extraction path documented in `infra/terraform/modules/README.md`: move the directory to
`chippr-tf-modules`, tag it, and change consumers from `source = "../../modules/x"` to
`source = "git::https://github.com/chippr-robotics/chippr-tf-modules.git//x?ref=vX.Y.Z"`. Nothing in
the module body changes — that is what the constraints above buy.

**Rationale**: `chippr-tf-modules` did not exist in the `chippr-robotics` organisation when this was
written. Building against a non-existent source would have blocked this feature on a separate
repository; building non-extractable modules would have made the eventual move a rewrite.

**UPDATE (2026-08-15): the repository now exists and the modules have been extracted to it**, before
any import ran — the cheapest possible moment, since the zero-diff gate protects against an
extraction that changes a *live* plan and there was no live plan yet. Every module body crossed
byte-identical (verified with `cmp`, then again against the copy `terraform init` fetched). Consumers
pin by commit SHA rather than tag, because a tag can be repointed and a commit cannot; G-16 enforces
it. The constraints below are what made the move mechanical, and they still bind anything added to
the shared repository.

**Alternatives considered**: *Create the shared repo now* — declined by the issue author. *Skip
modules, write flat configuration* — rejected; the bundler and gateway VMs are the same pattern
twice, and per-tenant Cloud Run services are the same pattern N times (FR-024, SC-011).

---

## R11. Ansible: reaching the nodes, and staying idempotent

**Decision**:

- **Connection**: SSH over **IAP TCP forwarding**. The VMs have no public SSH — `provision.sh:77`
  opens :22 to `35.235.240.0/20` (the IAP range) only, and `:443/:80` to Cloudflare ranges only. The
  inventory sets `ansible_ssh_common_args` to proxy through
  `gcloud compute start-iap-tunnel`, so the existing firewall posture is unchanged. **This is a
  hard constraint, not a preference**: a playbook written for direct SSH cannot reach these hosts at
  all, and the fix is not to open the firewall.
- **Inventory**: the `google.cloud.gcp_compute` dynamic inventory plugin, keyed on the labels the
  VMs already carry (`app=fairwins`, `role=bundler|gateway`). A static inventory would need editing
  every time a VM is recreated — and would silently target a stale IP.
- **Idempotency**: native modules only (`ansible.builtin.apt`, `template`, `systemd_service`,
  `sysctl`, `lineinfile` with anchors) and never `shell`/`command` without `creates`/`removes` or a
  `changed_when` that reflects real change. CI runs the playbook twice in check mode against a test
  host and asserts the second run reports zero changed tasks (SC-005).
- **Restart semantics**: handlers restart the whole systemd unit
  (`systemctl restart fairwins-stack@<role>`), never an individual container. `infra/vm/README.md`
  records why: all containers on a VM share one network namespace
  (`network_mode: service:<owner>`); recreating the namespace owner invalidates the joiners
  (FR-023).
- **Secret delivery**: the playbook invokes the existing, already-hardened
  `infra/vm/common/fetch-secrets.sh` rather than reimplementing it in Ansible. Every task touching
  secrets sets `no_log: true`.

**Rationale for reusing `fetch-secrets.sh` instead of porting it**: the script enforces four
properties that are laborious to reproduce and dangerous to get wrong — per-container scoping
(the internet-facing container must never receive the engine's KMS-signing credential), byte-exact
payloads (escaping a PEM newline breaks KMS signing silently, at first use), refusal to run under
`set -x`, and explicit REQUIRED-vs-OPTIONAL handling so a missing OpenSea credential does not take
down the gasless path. Ansible's job is to place, own and invoke it, not to replace it.

**HAZARD — version pins are load-bearing.** `relay-webhook-secret` and `relay-engine-api-key` are
pinned to version `2` and both have an enabled v1 *and* v2 today, so an "unpinned means latest, and
latest is v2, so it is equivalent" simplification is benign right now and silently wrong after the
next rotation. The pins are inputs to the playbook, asserted, not defaults.

**HAZARD — `apt` and unpinned upgrades.** `ansible.builtin.apt` with `state: latest` is
non-idempotent in the way that matters: it reports changed whenever upstream publishes, and can
upgrade Docker under a running bundler. Decision: `state: present` for packages, with an explicitly
declared version for docker-ce, and OS patching handled as a separate, deliberately-invoked play.

**Alternatives considered**: *Keep configuration in the GCE startup script* — rejected; it only runs
at boot, so the only way to re-apply configuration is to recreate the node, which is the riskiest
operation available (FR-018). *Ansible Pull on the nodes* — rejected; it needs a repository
credential on each node and inverts the audit direction. *Replace the VMs with a managed instance
group and immutable images* — a genuinely good direction, but it is a topology change, which the
spec puts out of scope.

---

## R12. The provisioning / configuration boundary

**Decision**: an explicit, published ownership table (FR-022), reproduced in
`contracts/ownership-boundary.md`. Summary:

| Attribute class | Owner |
|---|---|
| VPC, subnet, firewall rules, static IPs, VM existence, machine type, disk, labels, tags, attached service account, shielded-VM settings | Terraform |
| VM `metadata.startup-script` | Terraform (the file's *contents* are reduced to a minimal bootstrap — see below) |
| Packages, OS hardening, nginx config, systemd units, docker-compose files, runtime secret delivery | Ansible |
| Cloud Run service shape | Terraform |
| Cloud Run image tag / revision | Cloud Build |
| Secret containers + access bindings | Terraform |
| Secret payloads + rotation | Out of band (unchanged) |
| Monitoring channels, uptime checks, alert policies, log metrics | Terraform |
| DNS records, WAF ruleset, transform ruleset | Terraform |

**`startup.sh` is reduced, not deleted.** Today it does everything (packages, docker, repo clone,
nginx, systemd). Under this split it keeps only what must happen before Ansible can connect — and,
critically, it must remain able to bring a recreated node to health on its own, because FR-018's
"without recreating the node" does not repeal the reconstruction requirement (User Story 5). The
resolution: `startup.sh` keeps a minimal bootstrap and then runs the Ansible playbook **locally**
(`ansible-pull`-style local connection from the repo it already clones), so there is one description
of node configuration, used both for on-demand convergence and for cold boot.

**HAZARD — two descriptions of node config is the failure this section exists to prevent.** If
`startup.sh` kept its own package/nginx/systemd logic *and* Ansible gained a copy, a node would boot
into one configuration and converge to another. That is worse than today.

---

## R13. Guardrail and validation gates

**Decision**: four CI gates on `infra/**`, all failing the pipeline on error per constitution
principle IV:

1. **`terraform fmt -check -recursive`** and **`terraform validate`** per root.
2. **`tflint`** with the Google ruleset (catches invalid machine types, deprecated arguments,
   unused declarations).
3. **A repository-specific guardrail script**, `scripts/infra/check-iac-guardrails.js` (Node, matching
   the repo's existing `scripts/` convention and runnable via `npm run check:iac`), asserting the
   rules that generic linters do not know about:
   - no forbidden IAM resource types (R3 rule 1)
   - no `google_project`, no `google_secret_manager_secret_version` resource (R3 rule 2, R7)
   - `google_project_service` always has `disable_on_destroy = false`
   - every resource type on the protected list carries `prevent_destroy` (R4)
   - `project`/`zone`/`region` are variables, never literals, inside modules (R10)
   - no `provider` block inside a module (R10)
   - every Cloud Run service declares the `ignore_changes` set from R5 (R5)
4. **`ansible-lint`** plus the double-run idempotency assertion (R11).

**Rationale**: gates 1, 2 and 4 are table stakes. Gate 3 is where the project-specific hazards live —
no off-the-shelf linter knows that `google_project_iam_binding` is catastrophic *here* because the
project is shared, and none of them know about the two-bundlers-on-one-key hazard. Encoding these as
an executable check rather than a review checklist is what makes SC-009 verifiable "by an automated
check, not by inspection".

**Secret leakage check (SC-008)**: the plan summary posted to the PR is generated from
`terraform show -json` filtered through a redaction step that drops values Terraform marked
sensitive, and the guardrail script asserts no `google_secret_manager_secret_version` *resource*
exists. Raw plan files are never posted as comments.

**Alternatives considered**: *checkov / tfsec / terrascan* — good generic scanners, but they produce
substantial findings against an inherited estate and would require a large baseline of suppressions
to be green on day one, which trains people to suppress. Recorded as a follow-up once the estate is
adopted, not as a launch gate. *OPA/conftest for gate 3* — a reasonable choice; rejected in favour of
a Node script because it adds no new toolchain and matches how this repo already writes gates
(`scripts/deps/check-dependency-hygiene.js`, `scripts/codegen/bytecode-digest.js`).

---

## R14. Monitoring: what `ops/monitoring/apply.sh` becomes

**Decision**: port to `google_monitoring_notification_channel`, `google_monitoring_uptime_check_config`,
`google_monitoring_alert_policy`, and `google_logging_metric`, preserving the existing thresholds and
— importantly — the reasoning comments, which are carried into the Terraform as comments verbatim.

**Rationale**: the comments in `apply.sh` are the tribal knowledge this feature exists to capture,
and they are not decoration:

- Uptime checks target **origin IPs, not hostnames**, because the Cloudflare geo gate answers 451 to
  US-sourced traffic and Google's probers are largely US-based; a hostname-based check is permanently
  red. SSL validation is off because the origin serves a Cloudflare Origin CA certificate, which is
  deliberately not publicly trusted.
- The bundler's content matcher checks for `0x5FF137D4` in an `eth_supportedEntryPoints` response,
  **not** a 200, because the origin-lock nginx's own `/healthz` is a static `return 200` that never
  touches alto — the exact check that stayed green through the 2026-07-12 outage.
- The gateway's matcher checks `"rpc":"up"` and must **not** match `"status":"ok"`, which
  `server.js:302` returns unconditionally even when every chain is down.

A port that keeps the thresholds but drops these comments would look complete and would invite
someone to "simplify" the matchers back into the broken form.

**HAZARD — the notification channel must exist before policies reference it.** `apply.sh` warns that
a banner printed to stdout instead of stderr ends up inside the channel ID via command substitution,
producing policies that fire and page nobody. Terraform removes this class of bug entirely by
referencing the channel resource — one of the clearer wins in this feature.

---

## R15. What is deliberately not adopted

**Decision**, with reasons (FR-003, SC-003 "documented as deliberately excluded"):

| Not adopted | Why |
|---|---|
| The WordPress VM, default VPC, `default-allow-*` firewall rules | Not this project's; FR-003 |
| `clearpath-*`, `fukuii-*`, `kings-edge-*` services | Not this project's; FR-003 |
| The decommissioned Cloud Run bundler | Declaring it risks re-arming a second executor on one EOA (R5) |
| Secret payloads and their rotation | FR-015; out of scope per spec |
| On-chain contract deployments (`deployments/`) | Out of scope per spec |
| The `266380754692-compute@` default compute SA's project roles | Held by, and shared with, other workloads; changing it authoritatively is exactly the R3 hazard |

---

## Summary of decisions

| # | Decision |
|---|---|
| R1 | Terraform `~> 1.15`, providers pinned, lockfile committed |
| R2 | Declarative `import` blocks; generated config reviewed, never committed raw |
| R3 | Additive IAM only; `*_iam_policy`/`*_iam_binding` forbidden and gate-enforced |
| R4 | `prevent_destroy` **plus** permission denial on the CI identity |
| R5 | Terraform owns Cloud Run shape; `ignore_changes` on image/revision/client |
| R6 | Cloudflare provider `~> 5.23`; `cloudflare_dns_record` + two `cloudflare_ruleset`s |
| R7 | No secret-version resources; `cloudflare_ip_ranges` data source; generated prober list with staleness gate |
| R8 | GitHub Actions + WIF; apply the saved plan, gated on tree digest + state serial |
| R9 | Root per environment, separate state prefixes; `bootstrap/` with committed local state |
| R10 | Local extractable modules; documented promotion path to `chippr-tf-modules` |
| R11 | Ansible over IAP tunnel, dynamic inventory by label, reuses `fetch-secrets.sh` |
| R12 | Published ownership table; `startup.sh` reduced to bootstrap + local playbook run |
| R13 | fmt/validate/tflint/ansible-lint + a repo-specific guardrail script |
| R14 | Monitoring ported with its reasoning comments intact |
| R15 | Explicit non-adoption list |
