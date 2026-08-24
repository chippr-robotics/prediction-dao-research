# Feature Specification: Workstation secrets and local observability

**Feature Branch**: `claude/workstation-secrets-observability`

**Created**: 2026-08-15

**Status**: Implemented (pending Terraform apply — see Open items)

**Depends on**: spec 087 (Infrastructure as Code). This branch is cut from
`claude/infrastructure-as-code-setup-w3cb7o` because the Terraform root and the Ansible tree it
extends do not exist on `main` yet.

**Input**: "We are storing too many things in our local `.env` which should be properly held in our
Google secrets vault, and we should use that when we need to access any secrets. Configure the
system to integrate with GCP so we can follow best practice. This server should also be considered
in the `chippr-tf-modules` repo so it is a properly maintained deployment surface where we do
things such as deployment and administration of the platform. We can also run Prometheus locally to
view stats and logs."

## Context: what was already true

Spec 087 brought the **cloud** estate under declarative management, and the production VMs were
already clean: `infra/vm/common/fetch-secrets.sh` pulls payloads from Secret Manager into tmpfs,
scoped per container, byte-exact, never on argv.

The gap was the machine the platform is administered *from*. Its `.env` held 34 variables, of which
**15 were live credentials**, including a funded deploy key that is also the spec-050 paymaster
deployer and holds admin authority on live contracts. Nothing declared what that machine could
reach; the answer was whatever happened to be in the operator's home directory.

Three findings from the inventory shaped the design:

- **`POLYGON_RPC_URL`, `QUICKNODE_POLYGON_RPC_URL` and `ALTO_RPC_URL` were byte-identical** — three
  copies of one credentialed QuickNode URL that would rotate independently.
- **`frontend/.env`'s `VITE_PINATA_JWT` cannot be secured by moving it.** It is compiled into the
  client bundle and is public once shipped.
- **The two Graph credentials are not interchangeable.** `GRAPH_DEPLOY` publishes a subgraph;
  `GRAPH_API_KEY` only queries one.

## Requirements

### Secret custody

- **FR-001** Every credential the workstation tooling uses is held in Secret Manager and delivered
  to a process's environment at point of use. No secret is written to disk by any path here.
- **FR-002** One registry (`scripts/secrets/registry.js`) is the source of truth for what is a
  secret, where it lives, and which profile includes it.
- **FR-003** Secrets are fetched by **least-privilege profile**, never wholesale.
- **FR-004** A payload feeding several variables is declared as one secret with aliases.
- **FR-005** Key and password material may not fall back to `process.env` on a public network under
  any combination of flags. Any fallback that does occur is reported loudly.
- **FR-006** No secret is ever passed on a command line, logged, or written to a temporary file.
- **FR-007** Migration verifies a byte-exact readback of every payload **before** the local copy is
  removed, and refuses to prune if any verification failed.
- **FR-008** Migration is idempotent: an unchanged payload adds no new version.
- **FR-009** A gate fails the build if a managed credential reappears on disk, or if a
  credential-shaped value appears under an unclassified name.
- **FR-010** No npm dependency is added, because an incremental install in this repo drops the
  platform rolldown binary from the lockfile (npm/cli#4828).

### The workstation as a deployment surface

- **FR-011** The workstation's cloud identity and every grant attached to it are declared in
  Terraform, in a **shared, versioned module** (`chippr-tf-modules//modules/ops-workstation`).
- **FR-012** No service-account key file is created, ever. Operators authenticate as themselves and
  impersonate the workstation account.
- **FR-013** Impersonation is granted on the **service account**, never project-wide.
- **FR-014** Secret access is granted **per secret**; KMS signing **per key**.
- **FR-015** Project-level roles are read-only telemetry, and the escalation roles are rejected at
  plan time.
- **FR-016** The Terraform grant list and the code registry are checked against each other by a test.
- **FR-017** An Ansible role converges a workstation idempotently, **verifying** rather than
  installing credentials, and never running as root by default.

### Local observability

- **FR-018** A locally-runnable stack shows this host, its containers, the production endpoints,
  the application's own health numbers, and GCP metrics and logs.
- **FR-019** It is **read-only** against production and holds no write path into the estate.
- **FR-020** It binds to loopback only.
- **FR-021** It is a viewing surface, not the paging system — Cloud Monitoring keeps that job,
  because it runs whether or not the workstation is switched on.
- **FR-022** Probes assert on **content**, not status codes, wherever a status code can be right
  while the service is broken.
- **FR-023** A failed scrape emits an explicit `_up 0`; a `null` upstream value is dropped rather
  than coerced to zero.

## Success criteria

| ID | Criterion | Status |
|---|---|---|
| SC-001 | No credential value remains in any tracked or untracked `.env` | **met** — `check:env-hygiene` passes; 24 managed variables pruned |
| SC-002 | Every migrated payload reads back byte-identical | **met** — 12/12 verified, then re-verified by `secrets:doctor` |
| SC-003 | Re-running the migration adds no versions | **met** — second run reported "already current" for all 12 |
| SC-004 | A tool can run with only the secrets its profile declares | **met** — `--profile verify` delivered exactly `ETHERSCAN_API_KEY` |
| SC-005 | The module hygiene gate genuinely covers the new module | **met** — removing its README produces a targeted `M-05` naming it |
| SC-006 | The registry/Terraform parity gate genuinely fails on drift | **met** — removing one grant produced a targeted failure naming the secret |
| SC-007 | `npm run check:iac` passes with the new Terraform | **met** — PASS, one pre-existing documented warning |
| SC-008 | The observability stack runs and every target is up | **met** — 7/7 active targets up; 9 alert rules loaded |
| SC-009 | The stack reports real values, not placeholders | **met** — gas runway 198h/1059h, deployer 25.09 POL, paymaster 836h |
| SC-010 | Terraform reports no changes after adoption | **not yet** — requires an apply; see Open items |

## Rotation checklist

Migration moved the values. It did **not** undo the exposure: these sat in a plaintext file and are
very likely in shell history, editor swap files, and any backup that touched the home directory.
Rotation is what fixes that, and it is deliberately a separate, human-driven job.

| Priority | Credential | Why | Notes |
|---|---|---|---|
| **1 — now** | `fairwins-pinata-jwt` | Its value was echoed into a terminal transcript during this migration by a command whose URL-matching regex fell through and printed the whole payload. Treat as disclosed. | Revoke the scoped key in the Pinata console and add a new version. Cheap and immediate. |
| **2 — high** | `fairwins-deployer-key` | Funded (25.09 POL), the spec-050 paymaster deployer, and holds admin authority on live contracts. Exposure here is not recoverable by rotation alone. | Not a quick swap: move funds and hand off roles. Do it deliberately, not under time pressure. Track separately from this feature. |
| 3 | `fairwins-etherscan-api-key`, `fairwins-graph-deploy-key`, `fairwins-graph-api-key`, `fairwins-quicknode-polygon-token` + `-url` | Vendor credentials, cheap to rotate, no on-chain consequence | Console-issued; rotate together and re-run `secrets:doctor`. |
| 4 | `fairwins-floppy-*-password` | Unlock keystores held on physical media; exposure requires the disk too | Rotating means re-encrypting the keystores. |
| 5 | `fairwins-creator-key`, `fairwins-seed-player-keys` | Testnet only | Rotate when convenient. |
| n/a | `VITE_PINATA_JWT` (frontend) | **Cannot be secured by rotation into a vault** — it ships in the client bundle | Make it a scoped, least-privilege, publicly-safe key. Distinct from the root Pinata JWT. |

## Open items

- **Terraform has not been applied.** Terraform is not installed on this machine, so the config is
  written and gated but unapplied. Until it is, `fairwins-ops@` does not exist and operators read
  secrets as themselves. The 12 secret containers exist and carry import blocks, so adoption is an
  import, never a create.
- **SC-010 (zero-diff plan)** is inherited from spec 087's own open adoption tasks (T028–T029) and
  cannot be met before those run.
- **`/chipprbots` is at 95% capacity** (84 GB free) — found by this feature's own disk rule on first
  bring-up, and unrelated to it.
