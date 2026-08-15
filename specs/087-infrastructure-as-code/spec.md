# Feature Specification: Infrastructure as Code (Terraform + Ansible)

**Feature Branch**: `claude/infrastructure-as-code-setup-w3cb7o`

**Created**: 2026-08-14

**Status**: Draft

**Input**: Issue #1177 — "our infrastructure needs to be predictably deployed, versioned, and managed
without losing sync across agents". User description: Terraform provisions and manages all cloud
resources (GCP project resources, Cloud Run services, networking, IAM roles/bindings, Cloudflare
DNS/WAF rules, Secret Manager) with remote-backed, per-repo state scoped to this project's GCP
project only, favouring versioned shared modules (`chippr-tf-modules`) over inline duplication.
Ansible handles configuration management for anything Terraform provisions but does not fully
configure — OS-level hardening, service/package installation, config file templating, secrets
injection at runtime, and node-level setup for long-running services not served via Cloud Run.
Playbooks must be idempotent and safely re-runnable. Goal: infra state and config are fully
declarative and reproducible from repo contents alone — no manual console changes, no undocumented
drift — so the environment can be reconstructed or audited at any point without tribal knowledge.

## Context: what exists today

The estate is real, live, and holds production value. It is currently described by **imperative
shell scripts and prose runbooks**, not by declarative state:

| Surface | Today's source of truth | Problem |
|---|---|---|
| VPC, subnet, static IPs, firewall rules | `infra/vm/provision.sh` (idempotent bash + `gcloud`) | Reads as IaC, but nothing records intended state; a manual console change is invisible |
| Two GCE VMs (`fairwins-bundler`, `fairwins-gateway`) | `infra/vm/provision.sh` + `infra/vm/startup.sh` | Node config is a 200-line startup script that re-runs on boot only |
| VM node config (packages, docker, nginx, systemd, secret delivery) | `infra/vm/startup.sh`, `infra/vm/common/*.sh`, `infra/vm/systemd/*` | Not re-runnable on demand; no way to prove a running node matches the repo |
| Cloud Run services (SPA prod, staging, staging-testnet, per-tenant) | `cloudbuild.yaml`, `cloudbuild.staging.yaml` | Service *shape* (scaling, ingress, secret wiring) is partly CLI flags, partly undocumented console state |
| Cloudflare DNS, WAF geo rule (HTTP 451), origin-lock transform rule | `infra/cloudflare/*.md` — **prose runbooks for manual dashboard configuration** | The compliance gate (spec 007) is legally significant and lives only in someone's browser history |
| Secret Manager secrets + IAM bindings | Ad-hoc `gcloud` commands, documented in runbooks | No inventory; version pins (`relay-webhook-secret:2`) survive only as comments |
| Monitoring: uptime checks, alert policies, log metrics, notification channels | `ops/monitoring/apply.sh` (imperative bash) | The project had **zero** alerting until this script was written by hand |
| KMS signing keys, Artifact Registry | Manual creation | Undocumented; deletion is unrecoverable |

Two facts constrain everything below:

1. **The GCP project `chippr-bots-site-wp` is shared.** It hosts unrelated Chippr workloads — a
   public WordPress VM on the default network, plus `clearpath-*`, `fukuii-*`, and `kings-edge-*`
   services. This repo's IaC must be able to describe its own resources without any possibility of
   destroying, or authoritatively overwriting the permissions of, workloads it does not own.
2. **Several resources cannot be recreated.** KMS signing keys (the paymaster and relay gas keys),
   Secret Manager payloads, and the static external IPs pinned in Cloudflare DNS are all
   destroy-and-you-are-done resources. Adoption must be non-destructive.

## Clarifications

### Session 2026-08-14

- **Q: The brief names `chippr-tf-modules` as the shared module source, but no repository by that
  name exists in the `chippr-robotics` organisation.**
  **A (initial): build modules locally, written to be extractable, and document the promotion path.**
  **A (revised, same session): the repository was created and the modules were extracted to it.**
  The issue author judged an org-wide shared source the more correct move, and it was taken
  immediately — *before any import had run*, which is the cheapest moment extraction will ever have:
  the zero-diff gate protects against an extraction that changes a live plan, and there was no live
  plan yet. Every module body crossed byte-identical. Consumers pin by commit SHA rather than tag,
  since a tag can be repointed and a commit cannot. Encoded as FR-024, FR-024a, FR-025, and enforced
  by guardrail G-16.

- **Q: The build pipeline deploys a new image to Cloud Run on every merge. If the declarative layer
  also owns the deployed image, the two systems fight and every plan reports drift.**
  **A: The declarative layer owns service *shape*; the pipeline owns the *artifact*.** Scaling,
  ingress, resource limits, service identity, secret wiring and domain routing are declared; the
  image tag and revision identity are explicitly not. The reverse also holds — the pipeline stops
  setting shape attributes, which additionally removes the documented hazard where a merge could
  silently re-arm a service manifest nobody intended to deploy. Encoded as FR-022a, FR-022b.

- **Q: Who or what actually changes production infrastructure?**
  **A: Approved changes apply automatically on merge to the default branch.** The reviewed plan is
  the artifact that gets applied — not a freshly computed one — and the applying identity
  authenticates without a stored long-lived credential and is denied the permissions needed to
  destroy the irreplaceable resources. Encoded as FR-031 through FR-035.

  *Recorded concern, and how it is answered.* Automatic apply places a mutating identity in a GCP
  project shared with unrelated workloads and containing unrecoverable signing keys. The spec does
  not treat "we declared it correctly" as the safety mechanism: FR-033 requires the identity to lack
  the permissions in the first place, FR-034 forbids applying an unreviewed plan, FR-035 forbids
  unattended destructive retry, and FR-007 keeps a whole-estate teardown unreachable. Those four
  requirements exist specifically because the apply is unattended.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Adopt the live estate without disturbing it (Priority: P1)

A deployment engineer brings the existing, running infrastructure under declarative management. They
run the plan against production and it reports **no changes** — proving the repo now describes
reality exactly, with nothing created, replaced, or destroyed.

**Why this priority**: Nothing else in this feature is safe or believable until the declarative
description provably matches what is running. An IaC rollout that "looks right" but would replace a
static IP or a KMS key on first apply is worse than no IaC at all — it converts a documentation gap
into an outage. This story alone delivers the audit value in the issue: a single reviewable manifest
of what exists.

**Independent Test**: Run the plan against the live project with no code changes. Fully tested by
observing a clean "no changes" result and a resource inventory that a reviewer can diff against a
console export.

**Acceptance Scenarios**:

1. **Given** the live estate is unchanged, **When** an engineer runs the plan, **Then** it reports
   zero resources to add, change, or destroy.
2. **Given** an engineer runs the plan, **When** they inspect the output, **Then** no secret payload,
   private key, or credential appears in it.
3. **Given** the adoption is complete, **When** an engineer inspects the repo, **Then** every managed
   resource is discoverable from repo contents alone, with no console lookup required.
4. **Given** a destroy-protected resource (signing key, static IP, secret container), **When** any
   operation would remove or replace it, **Then** the operation fails and names the resource rather
   than proceeding.
5. **Given** the shared GCP project hosts unrelated workloads, **When** any plan or apply runs,
   **Then** no resource outside this project's declared inventory appears in the plan, and no
   permission held by another workload is revoked.

---

### User Story 2 - Change one service, and only that service changes (Priority: P2)

An engineer changes a single service's configuration — a scaling floor, an environment variable, a
DNS record — and the change reaches production through a reviewed, recorded path. The plan shows
precisely which resources are affected; unrelated services are untouched.

**Why this priority**: This is the issue's second acceptance scenario and the day-to-day value.
Once state is trustworthy (P1), bounded change is what makes it usable instead of frightening.

**Independent Test**: Modify one service's declared configuration, run the plan, and confirm the
affected-resource list contains only that service and its dependents.

**Acceptance Scenarios**:

1. **Given** a change to exactly one service's configuration, **When** an engineer runs the plan,
   **Then** only that service's resources appear as changing.
2. **Given** a proposed infrastructure change, **When** it is opened for review, **Then** the
   resulting plan is attached to the review so an approver sees the blast radius before approving.
3. **Given** an approved change, **When** it is applied, **Then** the applied result is recorded with
   the commit that produced it, forming an audit trail from change to running state.
4. **Given** a change that would replace rather than update a resource, **When** the plan is
   reviewed, **Then** the replacement is called out distinctly from an in-place update.

---

### User Story 3 - Node configuration is declarative and re-runnable (Priority: P2)

An engineer converges a long-running node (the bundler or gateway VM) to its declared configuration
on demand — packages, hardening, nginx config, systemd units, container stack, runtime secret
delivery — without rebuilding the VM. Running it twice changes nothing the second time.

**Why this priority**: Terraform can create a VM but cannot keep its interior true. Today the
interior is a boot-time script, so the only way to re-apply config is to destroy the node — which is
exactly the operation that is riskiest. Equal priority with P2 because the VMs carry the gasless
path.

**Independent Test**: Run the playbook against a node, then run it again. The second run reports no
changes, and the service stays healthy throughout both runs.

**Acceptance Scenarios**:

1. **Given** a node already at its declared configuration, **When** the playbook runs, **Then** it
   reports zero changes and does not restart healthy services.
2. **Given** a node whose configuration has been changed by hand, **When** the playbook runs,
   **Then** it restores the declared configuration and reports what it corrected.
3. **Given** the playbook delivers runtime secrets, **When** it completes, **Then** secret material
   exists only in the node's ephemeral in-memory location with per-service scoping, and never in the
   repository, in state, in process arguments, or in logs.
4. **Given** a secret is pinned to a specific version, **When** the playbook runs, **Then** it
   delivers that exact version rather than the newest one.
5. **Given** a service's configuration changed, **When** the playbook applies it, **Then** it
   restarts the affected unit as a whole rather than individual co-located containers.
6. **Given** the playbook is interrupted mid-run, **When** it is re-run, **Then** it completes
   successfully without manual cleanup.

---

### User Story 4 - Drift is detected, not discovered (Priority: P3)

The system checks, on a schedule, whether running infrastructure still matches the repository, and
reports any difference to the team with enough detail to see what changed.

**Why this priority**: The goal in the issue is "no undocumented drift". Detection is what makes
that claim checkable rather than aspirational. It is P3 because it depends on P1 being true first.

**Independent Test**: Change one resource out-of-band, wait for the scheduled check, and confirm it
reports that specific difference.

**Acceptance Scenarios**:

1. **Given** an out-of-band change to a managed resource, **When** the scheduled check runs,
   **Then** it reports the drift and names the resource and the differing attributes.
2. **Given** no drift exists, **When** the scheduled check runs, **Then** it reports clean and does
   not raise a false alarm.
3. **Given** the check detects drift, **When** the report is produced, **Then** it does not reveal
   secret values in the diff.

---

### User Story 5 - Reconstruct the environment from the repository (Priority: P3)

An engineer rebuilds a lost node, or stands up an equivalent environment, from repository contents
alone — no tribal knowledge, no console clicking, no undocumented step.

**Why this priority**: This is the durable "compliance-ready" outcome, and the ultimate test of the
other stories. P3 because it is proven by exercise rather than needed daily.

**Independent Test**: Destroy and recreate a single non-critical node from the repo, and confirm it
returns to health without any step that is not in the repository.

**Acceptance Scenarios**:

1. **Given** a node is destroyed, **When** an engineer recreates it from the repository, **Then** it
   returns to a healthy, serving state with no manual configuration step.
2. **Given** a reconstruction is attempted, **When** it requires a piece of information not in the
   repository, **Then** that gap is treated as a defect in this feature, not as expected practice.
3. **Given** an auditor asks what the environment looked like on a given date, **When** they inspect
   the repository at that commit, **Then** they can answer from repo contents plus the recorded
   apply history.

---

### Edge Cases

- **Accidental teardown in a shared project.** What prevents a full-destroy operation from reaching
  resources this repo does not own — or from removing this repo's own irreplaceable resources?
- **Authoritative permission resources.** A project-wide permissions declaration that lists only
  this repo's grants would silently revoke every other workload's access. What forbids it?
- **A pipeline and the declarative state disagreeing.** The image tag deployed by the build pipeline
  changes on every merge. If the same attribute is also declared, every plan reports drift and the
  two systems fight. Which one owns it?
- **Cloudflare edge ranges change.** The origin firewall today fetches Cloudflare's published ranges
  at provision time. A pinned stale copy either blocks legitimate edge traffic or leaves the origin
  reachable by ranges Cloudflare has released. How is freshness kept honest?
- **The compliance gate is a live legal control.** The WAF geo rule answers HTTP 451 (spec 007). A
  bad apply either opens a gate that must stay shut, or shuts one that must stay open. Both are
  compliance incidents, not outages.
- **Two bundler instances on one signing key.** The estate has a standing hazard: two live bundlers
  sharing one executor account produce colliding nonces and stuck bundles, with both instances
  reporting healthy. Does the declarative description make that state expressible?
- **Secret payload in state.** If secret *values* are declared, they land in state in the clear.
  What keeps payloads out while still describing the secret's existence and access?
- **State backend bootstrap.** The state store itself must exist before anything can be stored in
  it. How is that first resource described without a circular dependency?
- **Concurrent operations.** Two engineers (or an engineer and a scheduled check) act at once.
- **Partial apply.** An apply fails halfway. Is the recorded state still a truthful description of
  what is running?
- **Node recreated while its network namespace has dependents.** Co-located containers share one
  namespace; recreating the owner invalidates the joiners.

## Requirements *(mandatory)*

### Functional Requirements

#### Scope and inventory

- **FR-001**: The repository MUST contain a declarative description of every cloud resource this
  project owns, covering at minimum: the dedicated VPC and subnet, static external IP addresses,
  firewall rules, the two long-running compute nodes, Cloud Run services (production SPA, both
  staging cohorts, and per-tenant instances), Artifact Registry repositories, service accounts and
  their role bindings, Secret Manager secret containers and their access bindings, KMS key rings and
  keys, monitoring notification channels, uptime checks, alert policies, log-based metrics, and the
  Cloudflare DNS records, WAF rules, and transform rules for this project's zones.
- **FR-002**: Every resource in FR-001 MUST be attributable to this project from the repository
  alone — a reader MUST be able to determine which resources in the shared GCP project this repo
  owns without querying the cloud provider.
- **FR-003**: Resources this project does not own MUST NOT be described, referenced as managed, or
  modifiable by any operation this feature introduces.

#### Non-destructive adoption

- **FR-004**: Existing live resources MUST be adopted into managed state without being recreated,
  replaced, or interrupted. Adoption MUST NOT produce a new instance of any resource that already
  exists.
- **FR-005**: After adoption of a given surface, a plan against the unchanged live estate MUST
  report zero additions, changes, and destructions for that surface.
- **FR-006**: Resources whose loss is unrecoverable — signing keys, secret containers, static IP
  addresses reachable from public DNS, and state storage — MUST be protected such that any operation
  that would destroy or replace them fails and names the resource.
- **FR-007**: A whole-estate teardown operation MUST NOT be reachable through any documented or
  automated path in this repository.

#### State

- **FR-008**: Managed state MUST be stored remotely, versioned, and encrypted at rest, with
  concurrent-operation locking so two simultaneous operations cannot corrupt it.
- **FR-009**: State MUST be scoped per repository and MUST NOT be shared with, or readable by, other
  Chippr projects' infrastructure.
- **FR-010**: Read and write access to state MUST be restricted to the identities that need it, and
  those identities MUST be enumerated in the repository.
- **FR-011**: The state store itself MUST be creatable from the repository via a documented,
  one-time bootstrap that does not require the state store to already exist.

#### Permission safety in a shared project

- **FR-012**: Permission grants MUST be expressed additively — describing only the grants this
  project makes — and MUST NOT use any form that replaces the complete set of grants on a shared
  resource, project, or organisation.
- **FR-013**: Every service identity this project creates MUST be described with the specific roles
  it holds and a stated reason, so an auditor can evaluate least privilege from the repository.

#### Secrets

- **FR-014**: Secret values MUST NEVER appear in the repository, in managed state, in plan or apply
  output, in logs, or in process arguments.
- **FR-015**: The declarative description MUST cover secret *containers* and who may access them,
  but MUST NOT cover secret payloads.
- **FR-016**: Secrets consumed by a service MUST be delivered at runtime from the secret store, and
  where a specific version is required, that version pin MUST be declared and delivered exactly.
- **FR-017**: Runtime secret delivery MUST scope each secret to the single service that needs it; a
  service MUST NOT receive credentials belonging to another service colocated with it.

#### Configuration management

- **FR-018**: Node configuration — OS hardening, package and service installation, config file
  templating, systemd units, container stack composition, and runtime secret delivery — MUST be
  described declaratively and applied on demand without recreating the node.
- **FR-019**: Configuration application MUST be idempotent: a second consecutive run against an
  unchanged node MUST report zero changes and MUST NOT restart healthy services.
- **FR-020**: Configuration application MUST be safely re-runnable after an interrupted run, without
  manual cleanup.
- **FR-021**: Configuration application MUST correct hand-made changes back to the declared state and
  report what it corrected.
- **FR-022**: The boundary between provisioning and configuration MUST be explicit: each managed
  attribute MUST have exactly one owner, and the repository MUST state which.
- **FR-022a**: For services whose running artifact is published by the build pipeline, the
  declarative layer MUST own the service's *shape* (scaling bounds, ingress posture, resource
  limits, service identity, secret wiring, domain routing) and MUST NOT own the deployed artifact
  version or the revision identity. The declarative layer MUST be configured to ignore those
  attributes so that a pipeline deployment never registers as drift.
- **FR-022b**: The converse MUST also hold: the build pipeline MUST NOT set attributes the
  declarative layer owns. Where a pipeline currently sets a shape attribute, that setting MUST be
  removed as part of adopting the service, so a deployment cannot silently revert declared shape.
- **FR-023**: Where co-located services share a network namespace, configuration changes MUST act on
  the whole service group rather than individual members.

#### Reuse and versioning

- **FR-024**: Infrastructure patterns that repeat across Chippr projects MUST be expressed as
  reusable modules rather than duplicated inline. Modules live in this repository for now (no shared
  module source exists yet — see Clarifications), and MUST be written so that extraction to a shared
  source is a mechanical move: no repository-specific assumptions baked into module bodies, every
  environment-specific value passed as an input, and every consumer coupling expressed as a declared
  output.
- **FR-024a**: The repository MUST document the promotion path from a local module to the future
  shared module source, including how consumers would switch from a local path to a pinned version.
- **FR-025**: Every module dependency that resolves outside this repository MUST be pinned to an
  immutable version, so a given commit of this repository resolves to exactly one module
  implementation.
- **FR-026**: Provider and tooling versions MUST be pinned and recorded, so the same commit produces
  the same plan on any machine.

#### Change flow and audit

- **FR-027**: A proposed infrastructure change MUST produce a plan visible in its review, showing
  every resource affected, with replacements distinguished from in-place updates.
- **FR-028**: An applied change MUST be recorded with the commit that produced it, forming a
  retrievable history of what changed, when, and by whose approval.
- **FR-029**: Infrastructure validation (syntax, formatting, policy checks, plan generation) MUST
  fail the pipeline on error, consistent with the project's fail-loudly CI policy.
- **FR-030**: A change affecting one service MUST NOT require applying unrelated services.
- **FR-031**: Approved changes MUST apply automatically on merge to the default branch, so a merged
  change is a deployed change and the repository is never ahead of reality.
- **FR-032**: The automation identity that applies changes MUST authenticate without any long-lived
  credential stored in the repository or in the CI provider's secret store.
- **FR-033**: The automation identity MUST hold the narrowest permission set that satisfies FR-031,
  and MUST NOT hold permission to delete or replace the irreplaceable resources named in FR-006, nor
  any permission over resources this project does not own. This MUST be enforced by the identity's
  granted roles, not only by declared intent — so that a defect in the declarative description cannot
  become an irreversible loss.
- **FR-034**: An automatic apply MUST execute the exact plan that was reviewed. If the estate has
  changed such that the reviewed plan no longer applies, the apply MUST fail and report the
  divergence rather than computing and applying a fresh plan nobody reviewed.
- **FR-035**: A failed automatic apply MUST leave a truthful recorded state, surface the failure
  loudly, and MUST NOT retry destructive operations unattended.

#### Drift

- **FR-036**: The system MUST check on a schedule whether the running estate matches the repository,
  and report differences with the resource and attributes that differ.
- **FR-037**: Drift reports MUST NOT disclose secret values.
- **FR-038**: A clean check MUST report clean, and MUST NOT produce recurring false drift for
  attributes the system does not own (see FR-022a).

#### Compliance-sensitive resources

- **FR-039**: The edge compliance controls (the geo gate returning HTTP 451 and the origin-lock
  header injection) MUST be described declaratively, and any change to them MUST be identifiable as
  compliance-affecting in review.
- **FR-040**: Edge allowlists derived from an upstream provider's published ranges MUST have a
  declared refresh mechanism, and a stale list MUST be detectable rather than silently wrong.

#### Documentation and reconstruction

- **FR-041**: The repository MUST document how to reconstruct each managed surface from scratch,
  including the bootstrap order and any one-time manual step that genuinely cannot be automated —
  with each such step justified.
- **FR-042**: Prose runbooks that currently serve as the source of truth for manually configured
  resources MUST either be superseded by the declarative description or be explicitly re-scoped to
  operational procedure, so no resource has two competing sources of truth.

### Key Entities

- **Managed resource**: A single cloud object this project owns, with a declared configuration, an
  owner (provisioning or configuration layer), and a protection level (replaceable / protected).
- **Environment**: A named grouping of resources sharing a lifecycle — production, staging-mainnet,
  staging-testnet — each with its own values and its own blast radius.
- **State**: The recorded description of what the provisioning layer believes exists, stored
  remotely, versioned, locked, and scoped to this repository.
- **Shared module**: A versioned, reusable description of a repeating infrastructure pattern,
  consumed by pinned version.
- **Node role**: A class of long-running compute node (bundler, gateway) with a declared package
  set, service set, config templates, and secret scope.
- **Secret reference**: The identity, access policy, version pin, and consuming service of a secret —
  never its value.
- **Drift report**: A dated record of the difference between the repository and the running estate.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An engineer can determine every cloud resource this project owns, and its intended
  configuration, from the repository alone — with zero console lookups.
- **SC-002**: Running the plan against the unchanged production estate reports zero changes.
- **SC-003**: 100% of the resources listed in FR-001 are under declarative management, or are
  documented as deliberately excluded with a stated reason.
- **SC-004**: A single-service configuration change reaches production through one reviewed change,
  affecting only that service's resources.
- **SC-005**: A second consecutive configuration run against an unchanged node reports zero changes,
  and no healthy service restarts during it.
- **SC-006**: A destroyed non-critical node is restored to a healthy, serving state from repository
  contents with no step performed outside the repository.
- **SC-007**: An out-of-band change to a managed resource is reported by the scheduled check within
  one scheduled interval.
- **SC-008**: Zero secret values appear in the repository, in state, in plan or apply output, in
  drift reports, or in logs — verified by an automated check, not by inspection.
- **SC-009**: No operation available in this repository can destroy or replace an irreplaceable
  resource, or alter a resource this project does not own — verified by an automated check.
- **SC-010**: An auditor can answer "what did the environment look like on date X, and who approved
  the last change before it?" from repository history and recorded applies alone.
- **SC-011**: Every repeating infrastructure pattern is consumed as a module; zero copies of the
  same pattern are maintained inline, and each module's inputs and outputs are complete enough that
  extracting it to a shared source requires no change to the module body.
- **SC-012**: A merged infrastructure change is applied without human intervention, and the applied
  plan is byte-identical to the plan that was reviewed.
- **SC-013**: The automation identity's granted permissions are insufficient to destroy any
  irreplaceable resource or to modify any resource outside this project's inventory — demonstrated
  by attempting one of each and observing a permission denial, not by reading the configuration.
- **SC-014**: A pipeline deployment of a new application artifact produces zero drift in the next
  scheduled check.

## Assumptions

- The GCP project remains `chippr-bots-site-wp` in region `us-central1`, shared with unrelated Chippr
  workloads that this feature must not touch.
- Cloudflare remains the edge for `fairwins.app` and per-tenant zones, and API credentials with
  sufficient scope for the managed zones can be provisioned for automation.
- Adoption is delivered surface by surface in priority order (network and nodes, then secrets and
  IAM, then Cloud Run, then edge, then monitoring) rather than in a single change — each surface
  independently satisfying FR-005 before the next begins.
- Existing imperative scripts (`infra/vm/provision.sh`, `infra/vm/startup.sh`, `ops/monitoring/apply.sh`)
  remain in place and functional until the surface they cover is adopted and verified, then are
  retired or reduced to a documented bootstrap role. They are not deleted speculatively.
- Secret payloads continue to live in Secret Manager and continue to be rotated out of band; this
  feature describes their containers, access, and version pins only.
- The floppy-keystore workflow for on-chain deployer and admin keys is unchanged and out of scope —
  this feature covers cloud infrastructure credentials only.
- On-chain contract deployment (`scripts/deploy/`, `deployments/`) remains the source of truth for
  contract addresses and is out of scope; the issue's "Primary affected area: Contracts" is read as
  the issue author selecting a default, not as a request to bring contract deployment into Terraform.
- Monitoring alert *thresholds* and their justifications carry over from `ops/monitoring/apply.sh`
  unchanged; this feature changes how they are declared, not what they alert on.
- "Compliance-ready audit trail" means reconstructable history from repository and apply records; no
  external compliance framework (SOC 2, ISO 27001) certification requirement is assumed.
- Node configuration (User Story 3) is applied deliberately by an operator or an explicitly
  triggered run, not automatically on merge. FR-031's automatic apply covers the provisioning layer;
  converging a live node that is serving the gasless path is an operational act with its own timing.

## Dependencies

- A remote state backend must exist before any surface can be adopted (FR-011 bootstrap).
- A keyless automation identity with scoped GCP permissions, and a Cloudflare API token scoped to
  the managed zones, must be provisioned before automatic apply (FR-031/FR-032) can run.
- Adoption of a surface must complete and satisfy FR-005 before that surface is placed under
  automatic apply; an unverified surface applying unattended is the one combination the design does
  not permit.

## Out of Scope

- On-chain contract deployment and upgrade flows.
- The frontend build pipeline's application-level content (build args, bundled configuration), except
  where it defines the *shape* of the Cloud Run service that runs it.
- Other Chippr projects' infrastructure, even where it shares the GCP project or a module.
- Secret rotation policy and cadence.
- Migrating the compute nodes to a different platform or topology; this feature describes the
  topology that exists.
