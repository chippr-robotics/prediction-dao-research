# Contract: CI Identities and Permissions

**Satisfies**: FR-031, FR-032, FR-033, FR-034, FR-035, SC-013

Under automatic apply, human review approves *diffs*, not *permissions*. The permission boundary is
therefore the real control: a merged mistake must fail at the API, not succeed quietly.

## Two identities, deliberately

| | `fairwins-tf-plan@` | `fairwins-tf-apply@` |
|---|---|---|
| Used by | `infra-plan.yml` (pull requests) | `infra-apply.yml` (merge to `main`), `infra-drift.yml` |
| WIF attribute condition | repo == `chippr-robotics/prediction-dao-research` | repo == same **and** ref == `refs/heads/main` |
| Mutating permissions | none | scoped set below |
| State bucket | object read + lock write | object read/write |

Pull requests come from branches, including forks. A single identity would mean any branch that can
trigger a workflow can mutate production. The ref condition on the apply identity is what makes
"only merged, reviewed code applies" an authentication fact rather than a workflow convention.

## `fairwins-tf-plan@` — roles

| Role | Scope | Why |
|---|---|---|
| `roles/viewer` | project | read every resource the plan refreshes |
| `roles/storage.objectUser` | state bucket only | read state, write the lock object |

No `secretmanager.versions.access`. The plan does not need payloads; the one data-source read that
does (the origin-lock header, plan.md Complexity Tracking) runs under the apply identity in the
drift/apply jobs only.

## `fairwins-tf-apply@` — roles

Granted at the **narrowest** scope that works. Where a resource-scoped role exists, it is used.

| Role | Scope | Covers |
|---|---|---|
| `roles/compute.networkAdmin` | project | VPC, subnet, firewall rules |
| `roles/compute.instanceAdmin.v1` | project | VM lifecycle, metadata, labels |
| `roles/iam.serviceAccountUser` | the two node SAs only | attaching an SA to a VM |
| `roles/run.admin` | project | Cloud Run shape + invoker bindings |
| `roles/artifactregistry.admin` | the `cloud-run-source-deploy` repo only | repo IAM bindings |
| `roles/monitoring.editor` | project | channels, uptime checks, alert policies |
| `roles/logging.configWriter` | project | log-based metrics |
| `roles/secretmanager.admin` | **each managed secret individually** | create containers, manage access bindings |
| `roles/storage.objectUser` | state bucket only | state read/write + locking |
| custom `fairwins.tfServiceAccountManager` | project | `iam.serviceAccounts.{create,get,list,update}` and `*.setIamPolicy` — **no** `iam.serviceAccounts.delete`, **no** `iam.serviceAccountKeys.create` |

## Roles that MUST NOT be granted

Each line is a specific failure this prevents, not a general caution.

| Never granted | Because |
|---|---|
| `roles/owner`, `roles/editor` | `editor` includes `iam.serviceAccountKeys.create` and `serviceAccounts.actAs` — a CI compromise mints a key for the gateway SA and signs with the paymaster HSM key |
| `roles/resourcemanager.projectIamAdmin` | the guardrail gate blocks authoritative IAM resources in *code*; this blocks them at the *API*, which is the layer that still holds when the gate is bypassed or wrong |
| `roles/cloudkms.admin`, any role with `cloudkms.cryptoKeyVersions.destroy` | a destroyed key version is unrecoverable; state restore cannot bring it back |
| `roles/secretmanager.admin` **at project scope** | would grant access to every secret in a shared project, including other workloads' |
| any role with `compute.addresses.delete` beyond what `networkAdmin` requires | the origin IPs are pinned in Cloudflare DNS; deletion is a silent outage |
| `roles/resourcemanager.projectDeleter` | FR-007 — whole-estate teardown must be unreachable |
| `roles/iam.serviceAccountKeyAdmin` | no long-lived key may be minted by automation (FR-032) |

`compute.instanceAdmin.v1` does include instance deletion. That is accepted: VMs are the one node
class the design treats as cattle (User Story 5 requires recreating one), and no VM is on the
`protected` list. Nothing else destructive is reachable.

## Cloudflare

Cloudflare offers no OIDC federation, so its API token is a GitHub Actions secret — the one
long-lived credential in the design. Bounded by:

- **Zone-scoped**, never account-scoped: only the zones this project owns.
- Permissions: `Zone.DNS:Edit`, `Zone.WAF:Edit`, `Zone.Zone:Read`. Nothing else — no account
  membership, no billing, no Workers, no zone creation or deletion.
- Available only to the `main`-ref apply job and the drift job, via GitHub environment protection.
- Rotation is an out-of-band operational task, documented in the operations runbook.

## Apply mechanics

1. **PR** — plan under `fairwins-tf-plan@`; write `tfplan`, the infra-tree digest
   (`git rev-parse HEAD:infra/terraform`), and the state serial. Post a redacted human-readable
   summary to the PR (FR-027). `tfplan` is a short-retention, non-public artifact — it embeds prior
   state values.
2. **Merge** — recompute the merged tree's `infra/terraform` digest. Apply the saved `tfplan`
   verbatim only if the digest **and** the state serial both match. Otherwise **fail** and report the
   divergence (FR-034). Never compute-and-apply a fresh plan.
3. **Concurrency** — a GitHub Actions concurrency group on the apply job, queue not cancel. Combined
   with the state-serial check, a race becomes a clean "re-plan required" rather than a partial
   change.
4. **Failure** — no retry on the apply step, ever (FR-035). A partial apply is reported loudly and
   handed to a human; the runbook requires a re-plan and inspection before further action.

## Verification (SC-013)

Not read from configuration — **attempted and observed**, recorded in `quickstart.md` scenario 9:

1. Impersonate `fairwins-tf-apply@` and attempt to destroy a KMS key version → expect `PERMISSION_DENIED`.
2. Attempt to delete a managed secret container → expect `PERMISSION_DENIED`.
3. Attempt to modify a resource belonging to another workload → expect `PERMISSION_DENIED`.
4. Attempt to set a project-level IAM policy → expect `PERMISSION_DENIED`.

A green result on all four is what SC-013 means. A configuration review is not a substitute: the
whole point is that the boundary holds when the configuration is wrong.
