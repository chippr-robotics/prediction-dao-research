# Contract: Guardrail Rules

**Satisfies**: FR-003, FR-012, FR-015, FR-022a, SC-008, SC-009

Machine-checkable rules enforced by `scripts/infra/check-iac-guardrails.js`, run in CI as
`npm run check:iac` and failing the pipeline on any violation (constitution IV).

These are the rules a generic Terraform linter does not know about, because each depends on a fact
about *this* estate: the project is shared, some resources are unrecoverable, and one decommissioned
service must stay decommissioned.

## Rules

| ID | Rule | Rationale | Failure if violated |
|---|---|---|---|
| **G-01** | No `*_iam_policy` resource anywhere | Authoritative for the entire policy on its target | Revokes every grant not declared here — including other workloads' and the owners' own |
| **G-02** | No `*_iam_binding` resource anywhere | Authoritative for that role on its target | Strips the role from every principal outside this repo, project-wide |
| **G-03** | No `google_project` resource | The project is an input, not a managed resource | Terraform could delete a project hosting unrelated workloads |
| **G-04** | No `google_secret_manager_secret_version` **resource** (the data source is permitted, and flagged) | A version resource writes the payload into state in plaintext | Secret payload in state — violates FR-014/FR-015 |
| **G-05** | Every `google_project_service` sets `disable_on_destroy = false` and `disable_dependent_services = false` | The enabled API set is shared | Removing a service block disables the API project-wide, breaking other workloads |
| **G-06** | Every resource of a protected type carries `lifecycle { prevent_destroy = true }`. Protected types: `google_kms_key_ring`, `google_kms_crypto_key`, `google_secret_manager_secret`, `google_compute_address`, `google_storage_bucket`, `google_artifact_registry_repository` | These are unrecoverable or DNS-pinned | A destroy or replace proceeds without a plan-time error |
| **G-07** | Every `google_cloud_run_v2_service` declares the full `ignore_changes` set: `template[0].containers[0].image`, `template[0].revision`, `client`, `client_version` | The pipeline owns the artifact | Permanent false drift on every merge, which trains reviewers to ignore drift |
| **G-08** | No literal `chippr-bots-site-wp`, `us-central1`, or `us-central1-a` inside `modules/**` | Modules must be environment-agnostic to be extractable | Extraction to `chippr-tf-modules` becomes a rewrite (FR-024/FR-024a) |
| **G-09** | No `provider` block inside `modules/**` | A module with its own provider cannot be used with `for_each` or cleanly versioned | Blocks both reuse and extraction |
| **G-10** | No resource references an identifier on the non-adoption list (R15): the WordPress VM, the default VPC, `default-allow-*` firewall rules, `clearpath-*`/`fukuii-*`/`kings-edge-*` services | FR-003 | Configuration reaches another workload |
| **G-11** | No `google_cloud_run_v2_service` (or v1) named `fairwins-alto-bundler` | Re-arming it puts two executors on one EOA | Colliding nonces and stuck bundles, with both instances reporting healthy and no in-band detection |
| **G-12** | Every root has a `backend "gcs"` block; no root uses local state except `bootstrap/` | FR-008/FR-009 | State on a laptop, or state shared across environments |
| **G-13** | `.terraform.lock.hcl` exists and is committed for every root | FR-026 | The same commit resolves to different provider versions on different machines |
| **G-14** | No `-target` in any committed script or workflow | It applies a subgraph without refreshing the rest | Recorded state stops describing reality — the exact failure this feature prevents |
| **G-15** | Plan summaries posted to PRs are generated from redacted `terraform show -json`; raw plan files are never posted as comments | SC-008 | Plan files embed prior state values |

## Notes on specific rules

**G-01/G-02 are the highest-severity pair.** `google_project_iam_member` (additive, safe) and
`google_project_iam_binding` (authoritative for the role, catastrophic here) differ by one word, and
the resulting plan diff looks small and ordinary. `chippr-bots-site-wp` hosts a public WordPress VM
plus `clearpath-*`, `fukuii-*` and `kings-edge-*`. A binding on `roles/run.viewer` — a role the
bundler SA genuinely needs — would strip it from every other principal in the project. Under
automatic apply, nobody has to click anything for that to happen.

The gate is one of **two** layers. The other is `fairwins-tf-apply@` not holding
`roles/resourcemanager.projectIamAdmin`, so the same mistake fails at the API even if the gate is
bypassed or wrong (`contracts/ci-identity.md`).

**G-04 permits the data source, and flags it.** The one accepted use — reading the origin-lock header
value for the Cloudflare transform rule — is documented in plan.md Complexity Tracking. The gate
emits a warning listing every data-source use so the exception stays visible and countable rather
than becoming a habit. Data-source results *are* written to state; `sensitive = true` hides a value
from output, not from state.

**G-06 is not sufficient on its own.** A change that deletes the resource block also deletes its
`prevent_destroy`, and Terraform will then destroy the resource. The permission layer is what holds
in that case. G-06 catches the common case; ci-identity.md catches the rest.

**G-11 encodes a deletion.** The rule protects the *absence* of a build step: `cloudbuild.yaml` no
longer deploys the Cloud Run bundler, and that absence is the only thing preventing a second executor
against the VM bundler's EOA. `single-alto-gate.sh` detects the condition within 60s and refuses to
start the VM's alto, but it cannot prevent it.

## Testing the gate

The guardrail script is itself tested (constitution II) against fixture HCL under
`scripts/infra/__fixtures__/`: one fixture per rule that must fail, plus a passing fixture. A gate
that silently passes everything is worse than no gate, because it is cited as evidence.
