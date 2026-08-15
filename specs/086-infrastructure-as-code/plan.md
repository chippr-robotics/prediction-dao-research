# Implementation Plan: Infrastructure as Code (Terraform + Ansible)

**Branch**: `claude/infrastructure-as-code-setup-w3cb7o` | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/086-infrastructure-as-code/spec.md` (issue #1177)

## Summary

Bring the live GCP + Cloudflare estate under declarative management without disturbing it.
Terraform provisions (network, VMs, Cloud Run shape, IAM, secret containers, edge, monitoring);
Ansible converges node interiors (packages, hardening, nginx, systemd, container stack, runtime
secret delivery). Adoption is by declarative `import` blocks, surface by surface, each surface
proving a zero-diff plan before the next begins. Approved changes apply automatically on merge under
a keyless, least-privilege identity that cannot destroy the irreplaceable resources.

The hard constraint shaping every decision: **`chippr-bots-site-wp` is shared** with unrelated Chippr
workloads and contains resources whose loss is unrecoverable (KMS signing keys, secret payloads,
Cloudflare-pinned static IPs). The design therefore treats "correctly declared" as insufficient and
puts a permission boundary underneath it.

## Technical Context

**Language/Version**: HCL (Terraform `~> 1.15`, latest 1.15.8); YAML (Ansible-core `~> 2.18`);
Node 20 for the guardrail gate (matches the repo's existing `scripts/` convention)

**Primary Dependencies**: `hashicorp/google ~> 7.44`, `hashicorp/google-beta ~> 7.44`,
`cloudflare/cloudflare ~> 5.23`, `google.cloud` Ansible collection (dynamic inventory over IAP),
`community.docker`

**Storage**: Terraform state in a versioned, CMEK-free but Google-managed-encrypted GCS bucket,
uniform bucket-level access, per-environment prefix, object versioning on, lifecycle rule retaining
old versions. Bootstrap state is local and committed (R9).

**Testing**: `terraform fmt -check` + `terraform validate` + `tflint` per root; `ansible-lint`;
double-run idempotency assertion (second run reports zero changed); `npm run check:iac` guardrail
script; plan-must-be-clean check against production (SC-002)

**Target Platform**: GCP project `chippr-bots-site-wp`, region `us-central1`, zone `us-central1-a`;
Cloudflare zone `fairwins.app` (plus per-tenant zones); Debian 12 GCE nodes

**Project Type**: Infrastructure — no application code paths change. The only repository-code change
is the guardrail gate, its npm script, the CI workflows, and the reduction of `infra/vm/startup.sh`.

**Performance Goals**: A plan against one environment completes within CI's practical limits
(target < 5 min); a full node convergence run completes without dropping the gasless path

**Constraints**:
- Non-destructive adoption: zero resource replacement during adoption (FR-004)
- No authoritative IAM resources anywhere (R3) — the highest-severity constraint
- No secret payloads in state (FR-014/FR-015)
- Nodes are reachable only via IAP TCP forwarding; the firewall posture must not be relaxed to suit
  the tooling (R11)
- The Cloud Run bundler must stay decommissioned — declaring it risks two executors on one EOA (R5)

**Scale/Scope**: ~60–80 managed resources across 2 environments; 2 node roles; 1 primary Cloudflare
zone; 5 local modules

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Applies? | Assessment |
|---|---|---|
| **I. Security-First Smart Contracts** | Indirectly | No `contracts/` change. The relevant analogue — adversarial-by-default, least privilege on fund-adjacent paths — is honoured: the KMS keys that sign paymaster and relay transactions are `prevent_destroy` protected *and* outside the CI identity's permissions (R4). The bundler-executor hazard is explicitly preserved, not re-armed (R5). **PASS** |
| **II. Test-First and Comprehensive Coverage** | Yes, adapted | Infrastructure's equivalent of a failing test is a plan that shows an unintended diff. Every surface is gated on a zero-diff plan before adoption is considered done (FR-005); idempotency is asserted by a double run, not assumed; the guardrail script is itself unit-tested against fixture HCL. **PASS** |
| **III. Honest State, No Mocks or Placeholders** | Yes | Directly on point. No placeholder values in shipped configuration; the drift check reports real divergence; the "no false drift" requirement (FR-038) exists so drift reporting stays honest enough to act on. Testnet/mainnet separation is preserved by environment-scoped roots (R9). **PASS** |
| **IV. Fail Loudly in CI** | Yes | All four gates fail the pipeline on error; no `continue-on-error` on fmt/validate/lint/guardrail/apply. A failed apply is loud and never auto-retried (FR-035). **PASS** |
| **V. Accessible, Consistent Frontend** | No | No frontend surface. **N/A** |
| **Key management** (Additional Constraints) | Yes | No secret payload enters the repository or state (FR-014/FR-015); no long-lived cloud credential is stored (FR-032, WIF). The floppy-keystore flow for on-chain keys is untouched and out of scope. **PASS** with one documented exception — see Complexity Tracking. |
| **Deployments** (Additional Constraints) | Yes | `deployments/` remains the source of truth for on-chain addresses; this feature does not touch contract deployment. **PASS** |
| **Simplicity / YAGNI** | Yes | Two deferred simplifications are recorded rather than silently adopted (dedicated GCP project; immutable-image node topology). Five modules, not fifteen. **PASS** |

**Post-Phase-1 re-check**: The design adds one accepted deviation (origin-lock secret value reaching
state via a data source) and defers two structural improvements. Both are recorded below with
justification. No principle is violated. **GATE PASSES.**

## Project Structure

### Documentation (this feature)

```text
specs/086-infrastructure-as-code/
├── plan.md                        # This file
├── spec.md                        # Feature specification
├── research.md                    # Phase 0 — R1..R15 decisions and hazards
├── data-model.md                  # Phase 1 — managed-resource inventory and its schema
├── quickstart.md                  # Phase 1 — runnable validation scenarios
├── contracts/
│   ├── ownership-boundary.md      # Which layer owns which attribute (FR-022)
│   ├── ci-identity.md             # Exact roles for the plan/apply identities (FR-033)
│   ├── state-backend.md           # State layout, access, locking, bootstrap (FR-008..FR-011)
│   ├── module-interfaces.md       # Module inputs/outputs + extraction path (FR-024a)
│   └── guardrails.md              # Machine-checkable rules the gate enforces (R13)
├── checklists/
│   └── requirements.md            # Spec quality checklist
└── tasks.md                       # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
infra/
├── terraform/
│   ├── README.md                        # Entry point: what is managed, how to run, bootstrap order
│   ├── bootstrap/                       # Run-once trust root. Local state, COMMITTED (R9).
│   │   ├── main.tf                      #   state bucket, WIF pool + provider, tf-plan/tf-apply SAs
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── terraform.tfstate            #   committed on purpose — audit record, no secrets
│   ├── modules/
│   │   ├── README.md                    # Extraction path to chippr-tf-modules (FR-024a)
│   │   ├── network/                     # VPC, subnet, static IPs, firewall rules
│   │   ├── edge-node/                   # One GCE node role: VM + SA + its scoped IAM
│   │   ├── cloud-run-service/           # Cloud Run shape, image/revision ignored (R5)
│   │   ├── cloudflare-zone/             # DNS records, WAF geo ruleset, origin-lock ruleset
│   │   └── monitoring/                  # channels, uptime checks, alert policies, log metrics
│   └── environments/
│       ├── prod/                        # state prefix: prod
│       │   ├── main.tf  variables.tf  outputs.tf  backend.tf
│       │   ├── imports.tf               #   declarative import blocks (R2), kept after adoption
│       │   └── terraform.tfvars
│       └── staging/                     # state prefix: staging
│           └── (same shape)
├── ansible/
│   ├── README.md
│   ├── ansible.cfg
│   ├── requirements.yml                 # pinned collections
│   ├── inventory/
│   │   └── gcp.yml                      # google.cloud.gcp_compute plugin, IAP proxy args (R11)
│   ├── group_vars/
│   │   ├── all.yml
│   │   ├── bundler.yml
│   │   └── gateway.yml
│   ├── site.yml                         # converge all roles
│   ├── playbooks/
│   │   ├── bundler.yml
│   │   ├── gateway.yml
│   │   └── harden.yml                   # OS hardening, separately invocable
│   └── roles/
│       ├── common/                      # base packages, ops agent, sysctl, unattended-upgrades
│       ├── hardening/                   # SSH policy, kernel params, file permissions
│       ├── docker/                      # docker-ce at a pinned version
│       ├── nginx/                       # host TLS terminator, templated per role
│       ├── fairwins_secrets/            # owns + invokes common/fetch-secrets.sh, no_log (R11)
│       └── fairwins_stack/              # compose files, systemd units, whole-unit restart (R11)
├── cloudflare/                          # existing prose runbooks — re-scoped to procedure (FR-042)
└── vm/                                  # existing scripts; startup.sh reduced to bootstrap (R12)

scripts/infra/
└── check-iac-guardrails.js              # the repo-specific gate (R13), npm run check:iac

.github/workflows/
├── infra-plan.yml                       # PR: fmt, validate, tflint, guardrails, plan + summary
├── infra-apply.yml                      # merge to main: apply the reviewed plan (R8)
└── infra-drift.yml                      # scheduled: drift detection + prober-list staleness

docs/
├── developer-guide/infrastructure-as-code.md
└── runbooks/infrastructure-operations.md
```

**Structure Decision**: `infra/` already exists and already holds the imperative equivalents
(`infra/vm/`, `infra/cloudflare/`), so the IaC lands beside them rather than in a new top-level
directory — this keeps the migration legible, one surface at a time, and lets the superseded script
sit next to its replacement until it is retired. Terraform is split by environment root (R9) so a
prod apply cannot reach staging state. Ansible is split by role, mirroring the `fairwins-role`
instance metadata the VMs already carry. `infra/` is **not** an npm workspace member — it contributes
no JavaScript; the one Node file lives under the existing `scripts/` tree, which is already covered
by the root package.

## Implementation Phases

Ordered so that each phase is independently valuable and each proves its predecessor. Phase A must
complete before any automatic apply is enabled (spec Dependencies: an unverified surface applying
unattended is the one combination the design does not permit).

| Phase | Surface | Delivers | Gate to exit |
|---|---|---|---|
| **A. Foundation** | bootstrap, state, CI identities, guardrail gate, plan workflow | Trust root + a plan that runs in CI | `check:iac` green; plan runs on a PR; identities hold only the documented roles |
| **B. Network + nodes** | VPC, subnet, IPs, firewall, 2 VMs, their SAs and scoped IAM | US1 for the riskiest surface | Zero-diff plan on prod (FR-005); `prevent_destroy` proven by an attempted destroy failing |
| **C. Node configuration** | Ansible roles, inventory, IAP connectivity; `startup.sh` reduced | US3 | Double-run reports zero changed; gateway + bundler stay healthy through a run |
| **D. Secrets + Cloud Run** | Secret containers + bindings; SPA prod/staging/staging-testnet shape | US2 | Zero-diff plan; a pipeline image deploy produces no drift (SC-014) |
| **E. Edge** | DNS records, WAF geo ruleset, origin-lock ruleset | Compliance surface declared | Zero-diff plan; CODEOWNERS on the edge module; compliance-affecting diffs flagged |
| **F. Monitoring** | channels, uptime checks, alert policies, log metrics | `apply.sh` superseded | Zero-diff plan; alerts still fire (verified by forcing one) |
| **G. Automation + drift** | Auto-apply on merge; scheduled drift job; docs and runbooks | US4, US5 | A merged change applies unattended; injected drift is reported within one interval |

Adoption order is deliberate: the edge (E) comes late because `cloudflare_ruleset` is authoritative
for its phase — an out-of-band WAF rule vanishes on the next apply (R6) — so it is adopted only once
the change flow and drift detection are trustworthy.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| **Origin-lock secret value reaches Terraform state** via a `google_secret_manager_secret_version` *data source*, read to populate the Cloudflare transform rule header (R6/R7) | The edge rule and the nginx origin check must carry the same value. Any design where Terraform does not know the value leaves a manual dashboard step — reintroducing precisely the drift this feature removes | A placeholder value plus a documented manual step: keeps a live compliance control outside IaC and violates the feature's own goal. Mitigated by restricting state-bucket access to the two CI identities and named humans (FR-010), and by the value being a shared header secret rather than a signing key |
| **Bootstrap state is committed to the repository** (R9) | The state backend cannot store the state that creates it. Committing it makes the trust root auditable at any commit | Manual, undocumented bootstrap: exactly the tribal knowledge this feature exists to eliminate. Safe because bootstrap manages only the bucket, WIF pool and two service accounts — no secrets, no payloads |
| **Two node-configuration entry points** — `startup.sh` at cold boot and an on-demand playbook run — sharing one description (R12) | FR-018 requires convergence without recreating the node; User Story 5 requires a recreated node to reach health unattended. Both are needed | A single entry point cannot satisfy both. The risk (two divergent descriptions) is removed by making `startup.sh` *run the playbook* rather than reimplement it |
| **Deferred: a dedicated GCP project for FairWins** | Would eliminate most of the shared-project hazard class (R3) at a stroke | It is a live-production migration — new project means new KMS keys (re-signing), new IPs (DNS cutover), and a rebuild of every binding. Out of scope for this feature; recorded so the constraint is understood as inherited, not chosen |
| **Deferred: immutable node images / managed instance group** | Would make node configuration a build-time artifact and remove convergence drift entirely | A topology change, which spec.md places out of scope. The Ansible layer is a prerequisite for it either way — the roles become the image build |
| **Deferred: checkov/tfsec as a launch gate** (R13) | Generic scanners add real value on a mature estate | Against an inherited estate they produce a large day-one finding set requiring mass suppression, which trains reviewers to suppress. Adopted after the estate is declared, not before |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| An authoritative IAM resource reaches production and strips another workload's access | Low after gating, **catastrophic** without it | Cross-project outage | Guardrail gate rejects the resource types (R3); CI identity lacks project IAM admin (FR-033) — two independent layers |
| Automatic apply executes an unreviewed plan | Medium without the digest check | Unreviewed production change | Saved-plan apply gated on infra-tree digest + state serial; divergence fails the job (R8) |
| Import misconfiguration proposes "fixing" a live resource to a wrong body | Medium | Service disruption | Zero-diff gate per surface before the surface is considered adopted (FR-005); generated config reviewed, never committed raw (R2) |
| Cloud Run bundler silently re-armed | Low | Two executors on one EOA, stuck bundles, both healthy-looking | Explicitly not imported, not declared; recorded in R5 and R15 |
| WAF ruleset apply removes an incident-time rule added by hand | Medium | Compliance/legal exposure | Edge adopted last, CODEOWNERS gate, compliance-affecting diffs flagged in review (FR-039); documented in the operations runbook |
| Ansible run restarts a healthy gasless service | Medium | Gasless path interruption | Handlers restart only on real change; idempotency asserted by double run; whole-unit restarts respect the shared namespace (R11) |
| Provider major upgrade changes plan semantics | Medium | Unexpected diffs | Versions pinned with `~>` minor constraints, lockfile committed; provider bumps arrive as their own reviewable PR with a plan attached |
| Terraform state bucket deleted or corrupted | Low | Loss of adoption record | Object versioning on, `prevent_destroy`, access restricted to two CI identities and named humans |

## Success Criteria Traceability

| Spec criterion | Proven by |
|---|---|
| SC-001 inventory from repo alone | `data-model.md` + `infra/terraform/environments/*` + `infra/terraform/README.md` |
| SC-002 zero-diff plan | Phase B–F exit gate; `quickstart.md` scenario 2 |
| SC-003 100% coverage or documented exclusion | `data-model.md` inventory + R15 non-adoption list |
| SC-004 single-service change | Environment roots + module boundaries (R9); `quickstart.md` scenario 4 |
| SC-005 idempotent second run | `ansible-lint` + double-run assertion in CI (R11) |
| SC-006 node reconstruction | `startup.sh` runs the playbook (R12); `quickstart.md` scenario 6 |
| SC-007 drift reported within an interval | `infra-drift.yml`; `quickstart.md` scenario 7 |
| SC-008 no secrets anywhere | Guardrail gate forbids version resources; plan summary redaction (R13) |
| SC-009 cannot destroy or reach outside | `prevent_destroy` + CI identity roles (`contracts/ci-identity.md`); `quickstart.md` scenario 9 |
| SC-010 auditable history | Committed bootstrap state, `import` blocks retained, apply records linked to commits |
| SC-011 modules not duplicated | `contracts/module-interfaces.md`; guardrail rule on inline duplication |
| SC-012 applied plan == reviewed plan | Tree digest + state serial check (R8) |
| SC-013 identity insufficient to destroy | `quickstart.md` scenario 9 — attempted, denied, observed |
| SC-014 pipeline deploy causes no drift | `ignore_changes` set (R5); next scheduled drift run is clean |
