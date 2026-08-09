# Feature Specification: Monorepo Semantic Versioning & Release Promotion

**Feature Branch**: `076-monorepo-semantic-versioning`

**Created**: 2026-08-09

**Status**: Draft

**Input**: User description: "the monorepo needs to follow best practices for semantic versioning in order to make development and troubleshooting easier. we currently have a main(where the live app is built from), a staging we branch from main and sweep features into as we work, and feature branches we build off staging. Ideally, we will have a second cloud run built off staging so we can test prior to pushing to main. we need to make use of gh actions to enforce the version control across the monorepo"

## Problem

Nothing in this repository currently answers the question *"what is running in production, and what changed since the last thing that worked?"*

- **No release has ever been cut.** The repository has **zero git tags**. Release Drafter has been drafting `v$RESOLVED_VERSION` notes since it was added, but no draft has ever been published, so the draft's version number has never been anchored to a real release.
- **Workspace versions are decorative and already inconsistent.** The eight workspace members carry `0.0.0`, `0.1.0`, and `1.0.0` with no rule about which changes when; the root says `1.0.0`. None of these numbers has ever been incremented by a merge.
- **Deployed surfaces are anonymous.** The production service runs an image tagged with a commit SHA, but neither the SPA nor the relay gateway reports which build it is serving. Reproducing a member's bug report therefore starts by guessing which commit they were served.
- **There is no pre-production environment.** `main` merges deploy straight to the live service; the only place a release candidate can be exercised is production.
- **The branch model is convention, not enforcement.** `staging` does not yet exist on the remote, several workflows still name a long-gone `develop` branch, and nothing prevents a feature branch from merging directly into `main`.

The goal is a versioning and promotion scheme that makes a defect traceable from a member's report to a version, to the commits in it, to the artifacts it deployed — enforced by CI rather than by discipline.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Name the version that is running (Priority: P1)

An operator receives a bug report. They open the production app and the staging app, read a version identifier off each, and immediately know which release is live where, which commit it was built from, and what changed between the two. When the report predates the current release, they can look up the release history and find the version that was live at the time.

**Why this priority**: This is the troubleshooting payoff the whole feature exists for, and it is the one piece that delivers value even if no other story ships. Version identity on deployed surfaces requires no branch changes, no second environment, and no merge gates — but without it, every other story produces numbers nobody can observe.

**Independent Test**: Deploy the current build, open the app, and read the version. Confirm it matches the release record and the commit that produced the build. Change one line, redeploy, and confirm the displayed identity changes with it.

**Acceptance Scenarios**:

1. **Given** a build deployed to production, **When** an operator inspects the running app, **Then** it reports the release version and the exact source revision it was built from.
2. **Given** the same build deployed to production, **When** an operator inspects the relay gateway's health surface, **Then** it reports the same release version and revision.
3. **Given** a release version, **When** an operator looks it up in the release history, **Then** they see the full list of changes it contains and the previous version it succeeded.
4. **Given** an environment running a build that is not a published release (for example an out-of-band redeploy), **When** an operator inspects it, **Then** the surface says so honestly rather than displaying a stale or invented release number.

---

### User Story 2 - Exercise a release candidate before it reaches members (Priority: P2)

Work sweeps from feature branches into `staging`. Every merge into `staging` produces a release candidate that is deployed automatically to a second, member-facing-in-shape-but-not-in-audience environment. The team exercises the candidate there. Promoting `staging` into `main` publishes that same candidate as a production release; nothing is built fresh for production that was not first exercised on staging.

**Why this priority**: Second-highest value and the user's explicit ask. It converts production from "the first place a change is ever run" into "the second place". It depends on Story 1 only for legibility, not for function.

**Independent Test**: Merge a change into `staging`, confirm the staging environment serves it within the deploy window and reports a release-candidate version, then promote to `main` and confirm production serves an equivalent build carrying the corresponding release version.

**Acceptance Scenarios**:

1. **Given** a merge into `staging`, **When** the pipeline completes, **Then** the staging environment serves that build and reports a release-candidate identity distinct from any production release.
2. **Given** a staging environment, **When** anyone outside the team reaches it, **Then** it is not presented or discoverable as the production app.
3. **Given** `staging` is promoted into `main`, **When** the production pipeline completes, **Then** the production release contains exactly the changes that were on staging, and the release record names the candidate it was promoted from.
4. **Given** a change that has never been on `staging`, **When** it is proposed directly into `main`, **Then** the pipeline refuses it unless it is an explicitly declared hotfix.
5. **Given** a hotfix merged directly into `main`, **When** the release completes, **Then** the pipeline requires or verifies that the same fix returns to `staging`, so the next promotion cannot silently revert it.

---

### User Story 3 - Version bumps are earned, computed, and enforced (Priority: P3)

Every pull request declares what kind of change it is. CI refuses to let a pull request merge without that declaration. The release version is then *computed* from the accumulated declarations — nobody hand-edits a version number, and nobody can merge a breaking change that ships as a patch.

**Why this priority**: This is what makes the numbers from Stories 1 and 2 mean something. It is ranked below them because a version that is merely honest about *what* is deployed already helps troubleshooting, even before it is honest about *how much* changed.

**Independent Test**: Open a pull request with no change classification and confirm the merge is blocked with an actionable message. Add the classification, confirm the gate passes and the pull request reports the version it would produce. Merge, and confirm the release version matches that prediction.

**Acceptance Scenarios**:

1. **Given** a pull request with no recognizable change classification, **When** CI runs, **Then** the required check fails and the message states exactly what to add.
2. **Given** a pull request classified as a breaking change, **When** it is merged and a release is cut, **Then** the released version increments its most significant component.
3. **Given** a pull request that only changes documentation, **When** it is merged, **Then** it contributes to the release but does not by itself force a more significant increment than a patch.
4. **Given** several pull requests merged since the last release with mixed classifications, **When** the release is cut, **Then** the version reflects the most significant classification among them, not the last one merged.
5. **Given** a pull request that a contributor has hand-edited a version number into, **When** CI runs, **Then** the check fails, because versions are computed at release time and a hand-written one will disagree.

---

### User Story 4 - Trace a release to the artifacts it actually shipped (Priority: P4)

This repository deploys more than one image. A release may also carry a contract upgrade behind a stable proxy address, a newly published mini-app package pinned at an immutable content address and recorded on-chain, or a subgraph deployed to its own versioned endpoint. An operator investigating a defect can open a release and see which of these it moved, and which it left alone.

**Why this priority**: Highest troubleshooting leverage per incident, but the smallest number of incidents. It also has the most surface area, so it is the right thing to defer if scope must be cut.

**Independent Test**: Cut a release from a range of commits that includes a contract upgrade and a mini-app package update, then confirm the release record names the new implementation and the new content address alongside the application images.

**Acceptance Scenarios**:

1. **Given** a release whose range contains a contract upgrade, **When** an operator opens the release record, **Then** it names the affected proxy and the implementation it now points at.
2. **Given** a release whose range contains no contract change, **When** an operator opens the release record, **Then** it states that the on-chain estate is unchanged rather than omitting the section ambiguously.
3. **Given** a release whose range publishes a new mini-app package, **When** an operator opens the release record, **Then** it names the package, its own version, and the immutable content address that was committed on-chain.
4. **Given** an artifact that is versioned in a namespace this scheme does not own (the subgraph's deployed endpoint version), **When** a release changes which one the app consumes, **Then** the release record names the old and new value.

---

### Edge Cases

- **A promotion that changes nothing.** `staging` is promoted to `main` with no new commits since the last release. The pipeline must not cut an empty release, and must not silently redeploy an unchanged version under a new number.
- **Staging ahead of production for a long stretch.** Several release candidates accumulate before a promotion. The production release must account for all of them at once, not just the last.
- **Hotfix divergence.** A hotfix lands on `main` while `staging` holds unrelated unreleased work. Production's version must move, and the next promotion must not regress the hotfix.
- **A revert.** A change is released, then reverted. The revert is itself a release; the version moves forward, never backward, and the record must make the reversal legible rather than showing two releases with contradictory notes.
- **Dependabot volume.** Dependency bumps are the highest-frequency pull requests here. The classification gate must be satisfiable by automation without a human retitling every one of them, and must not let a dependency change that alters deployed bytecode pass as a trivial patch.
- **A failed deploy after a successful tag.** The release is recorded but the environment did not come up. The version an environment *reports* must reflect what is actually serving, never what was intended.
- **An environment redeployed out of band.** Two services here are deliberately deployed outside the main pipeline. If one is running something the release record does not describe, the surface must say "unreleased build" rather than claim the last known release.
- **A merge into `staging` while a promotion is in flight.** The candidate being promoted must be a fixed point; a late merge must not change what production receives.
- **Only-non-deployable changes.** A pull request touching only specs, agent guides, or runbooks still merges and still needs a classification, but should not force an application redeploy.
- **First release with no predecessor.** The repository has no tags at all; the first release must establish a starting version deliberately rather than inheriting an arbitrary one from a workspace manifest.

## Requirements *(mandatory)*

### Functional Requirements

#### Version scheme

- **FR-001**: The repository MUST have exactly one release version identifying the deployable estate produced from a given commit, expressed as three ordered numeric components (major, minor, patch).
- **FR-002**: A release candidate produced from the integration branch MUST be identified by the version it would become, marked as a pre-release and distinguishable at a glance from the production release of the same number.
- **FR-003**: Version components MUST be assigned by meaning: a component signalling incompatible change, one signalling backward-compatible addition, one signalling backward-compatible fix. The definition of "incompatible" MUST be written down for this repository specifically and MUST cover, at minimum: a change to an EIP-712 intent struct or domain, a contract storage-layout or external-interface change, a mini-app host-object change, and a removal of a member-facing capability.
- **FR-004**: Release versions MUST be recorded as immutable git tags. A published tag MUST never be moved or reused.
- **FR-005**: Versions MUST only increase. No release may carry a version less than or equal to any previously published release.
- **FR-006**: The starting version for the first release MUST be chosen deliberately and recorded, and MUST NOT be inherited implicitly from an existing workspace manifest value.
- **FR-007**: The mini-app packages MUST each carry their own version, independent of the repository release version, because they are published at immutable content addresses and curated on-chain on a schedule the repository release does not control.
- **FR-007a**: Every other workspace member — the private, workspace-internal ones (`frontend`, `@fairwins/abi`, `@fairwins/intent-types`, `@fairwins/miniapp-build`, the two services, the subgraph package) — MUST track the single repository release version. They have no consumer outside this repository that could read an independent number, so an independently maintained version would drift without anyone noticing it had.
- **FR-007b**: A mini-app package version MUST be incremented whenever its published bytes change, and the release record MUST pair that version with the content address actually committed on-chain. A package version that moves without a new content address, or a new content address without a version move, MUST be reported as a defect.
- **FR-008**: Version numbers MUST NOT be hand-edited in a pull request. The value stored in any manifest MUST be produced by the release process, and CI MUST reject a pull request that edits one by hand.

#### Change classification and enforcement

- **FR-009**: Every pull request MUST declare the kind of change it makes, in a form a machine can read.
- **FR-010**: CI MUST enforce the declaration as a required, merge-blocking check. Per the project's fail-loudly rule, this check MUST NOT be advisory and MUST NOT be permitted to pass on error.
- **FR-011**: When the declaration is missing or unrecognized, the failure message MUST state the accepted values and the exact edit that would fix it.
- **FR-012**: The computed next version MUST be visible on the pull request before merge, so the author sees the consequence of their classification.
- **FR-013**: The release version MUST be derived from the most significant classification among all changes since the previous release, not from the most recent one.
- **FR-014**: Automated dependency pull requests MUST be able to satisfy the classification gate without human retitling, while a dependency change that alters deployed contract bytecode or a published package's bytes MUST NOT be classifiable as a trivial change. The existing byte-neutrality gates are the signal for that distinction.
- **FR-015**: The existing release-notes labelling configuration and the classification gate MUST agree on what each classification means; a change classified one way for notes and another way for versioning is a defect.

#### Branch model and promotion

- **FR-016**: The branch topology MUST be: feature branches cut from the integration branch; the integration branch (`staging`) cut from and merged back into the production branch (`main`); `main` as the sole source of production deployments.
- **FR-017**: The integration branch MUST exist on the remote and MUST be protected to the same standard as `main`.
- **FR-018**: CI MUST refuse a pull request into `main` whose source is neither the integration branch nor an explicitly declared hotfix branch.
- **FR-019**: A hotfix merged into `main` MUST be returned to the integration branch, and the system MUST detect and report when `main` contains a release that the integration branch does not.
- **FR-020**: Promotion MUST operate on a fixed candidate: the production release MUST contain exactly the commits that the promoted candidate contained, and a merge into the integration branch during a promotion MUST NOT change what production receives.
- **FR-021**: A promotion that introduces no new commits MUST NOT produce a new release.
- **FR-022**: Workflow triggers MUST name the branches this model actually uses. References to branches that do not exist in the model MUST be removed, and a base-branch filter MUST NOT be used to decide whether code is tested — path filters are the scoping tool. (This preserves the correction made in the previous spec, where base-branch filters let pull requests merge with no tests run.)

#### Environments

- **FR-023**: A second application environment MUST be deployed automatically from the integration branch, in addition to the existing production environment deployed from `main`.
- **FR-024**: The staging environment MUST be configured from the same declarative source as production, differing only in explicitly enumerated values, so that a difference between the two is a listed decision rather than a drift.
- **FR-025**: The staging environment MUST NOT be presented to members as the production app, MUST NOT be indexed by search engines, and MUST be visually or textually identifiable as non-production from within the app.
- **FR-026**: The staging environment MUST be a **faithful mirror of the build that will next be promoted to production**: same tenant, same contract estate, same networks, same feature set, same resolved configuration — differing only in the values enumerated under FR-024 (service identity, hostname, secrets, and its non-production labelling). Its purpose is to answer "will this work in production", which it can only do by being production in every respect except audience.
- **FR-026a**: Staging MUST reach **every cohort the product supports**, not one of them. Testnet networks MUST be exercisable there, and the mainnet estate MUST resolve exactly as it will after promotion, so that a mainnet-only configuration defect is caught before release rather than by members.
- **FR-026b**: The project's chain rules derive a build's cohort from build-time configuration, and a single build resolves exactly one cohort. Satisfying FR-026a therefore requires an explicit mechanism for staging to reach both cohorts **without weakening the boundary itself** — network-scoped data MUST still never leak across the testnet/mainnet line, and the mechanism MUST NOT be a change that also loosens the production build. How this is achieved is a design decision for the plan; that it must not be achieved by relaxing the cohort rule for everyone is a requirement.
- **FR-026c**: Because staging carries real mainnet reach, its blast radius MUST be bounded independently of production: staging MUST use its own funded accounts, its own relayer gas wallet, and its own sponsorship deposit, sized for testing. A defect exercised on staging MUST NOT be able to drain, exhaust, or rate-limit a resource production depends on.
- **FR-026d**: Actions taken on staging against the mainnet estate are **real on-chain actions**. The environment MUST disclose this to whoever is using it, and MUST NOT present mainnet activity as a simulation or dry run.
- **FR-027**: Secrets MUST NOT be shared between the two environments; each MUST hold its own credentials. This is load-bearing under FR-026: staging's credentials are mainnet-capable, so sharing one would make a staging compromise a production compromise.
- **FR-027a**: The promotion step MUST verify that the staging and production build configurations differ **only** in the values enumerated under FR-024. An unenumerated difference means staging did not rehearse what production will run, and MUST block the promotion.
- **FR-028**: A deploy failure MUST fail loudly and MUST NOT leave an environment reporting a release it is not running.

#### Observable version identity

- **FR-029**: The application MUST expose, on a member-reachable surface, the release version it was built from and the source revision that produced it.
- **FR-030**: The relay gateway MUST report the same two values on its existing health surface.
- **FR-031**: When a running build does not correspond to a published release, both surfaces MUST report it as an unreleased build rather than displaying the nearest release. Reporting a version the build is not is a violation of the project's honest-state rule.
- **FR-032**: Version identity MUST be derived from the build, not hardcoded, and MUST NOT require a manual edit to stay correct.

#### Release record

- **FR-033**: Each release MUST produce a durable record listing its version, the previous version, the commit range, and the changes it contains, grouped by classification.
- **FR-034**: The release record MUST state which deployable artifacts moved: the application image, the gateway image, any contract implementation behind a stable proxy, any newly published mini-app package with its own version and immutable content address, and the subgraph endpoint version the application consumes.
- **FR-035**: When a category of artifact did not change in a release, the record MUST say so explicitly rather than omitting the section.
- **FR-036**: The release record MUST name the release candidate the production release was promoted from.
- **FR-037**: A human-readable changelog MUST be maintained in the repository and MUST be produced by the release process, not written by hand.

### Key Entities

- **Release version**: The three-component identifier for one deployable state of the repository. Produced only at release time; recorded as an immutable tag.
- **Release candidate**: A pre-release identity for a build on the integration branch, carrying the version it would become on promotion.
- **Change classification**: The machine-readable declaration attached to a pull request describing the significance of its change. Inputs to version computation; also drives release-note grouping.
- **Release record**: The durable, per-release document listing version, predecessor, commit range, grouped changes, and the artifact set the release moved.
- **Environment**: A deployed instance of the application with a branch it tracks, a configuration set, its own secrets, and a currently-serving version. Exactly two are in scope: production (tracks `main`) and staging (tracks the integration branch).
- **Artifact**: An independently deployable or publishable output — application image, gateway image, contract implementation behind a proxy, mini-app package at a content address, subgraph deployment. Each has its own identity that a release record maps to a release version.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Given a bug report naming a time, an operator can identify the exact version that was serving members at that time in under 2 minutes, without reading source control history.
- **SC-002**: 100% of production deploys are traceable to a published release version; zero production builds are serving code that no release record describes.
- **SC-003**: 100% of merged pull requests carry a change classification; zero merge without one after the gate is enforced.
- **SC-004**: 100% of changes reaching production have first run on the staging environment, excluding declared hotfixes, which are individually accounted for.
- **SC-005**: Zero releases are published with a version equal to or lower than a previous release, and zero published tags are moved after publication.
- **SC-006**: A change merged into the integration branch is serving on staging within 30 minutes without human intervention.
- **SC-007**: Zero hand-edited version numbers reach the default branch.
- **SC-008**: For any release, the set of artifacts it moved can be enumerated from its record alone, with no category left ambiguous.
- **SC-009**: A hotfix that lands on `main` is detected as absent from the integration branch within one pipeline run, and no promotion has ever silently reverted one.
- **SC-010**: No deployed surface reports a version it is not running, in any environment, at any time.
- **SC-011**: Zero promotions proceed with an unenumerated configuration difference between staging and production; every difference between the two environments is a listed decision.
- **SC-012**: Zero credentials, funded accounts, gas wallets, or sponsorship deposits are shared between staging and production, verified at each deploy.
- **SC-013**: Zero mainnet-only configuration defects reach production, because staging resolves the same estate the promoted build will.
- **SC-014**: Zero incidents in which activity on staging degraded, drained, or rate-limited a resource production depends on.

## Assumptions

- The integration branch is named `staging` and the production branch `main`, matching the user's description. The `develop` branch named in several existing workflow triggers is defunct and its references are removed by this feature.
- The team squash-merges pull requests, so the pull request title becomes the commit subject on the target branch and is a sound place to carry the change classification.
- Both existing release tooling inputs stay: the Release Drafter label taxonomy already in the repository is the starting vocabulary for change classification rather than a new scheme invented here.
- The second environment is a Cloud Run service in the same project as production, built by the same container pipeline, differing in build arguments, service name, and secrets. Standing up cloud infrastructure and DNS is in scope for the specification but the actual provisioning is an operational step, not a code change.
- Staging is a full mirror of the next production build, reaching every cohort including mainnet (FR-026, FR-026a). This is a deliberate trade: fidelity is chosen over isolation, so a release candidate is rehearsed against the exact estate it will serve. The accepted cost is that an unreleased build has real reach over real funds. FR-026c (independent funding and credentials) and FR-026d (honest disclosure that mainnet actions are real) are the compensating controls, and they are requirements rather than recommendations for that reason.
- Reaching both cohorts from one environment runs against the build-time cohort derivation established by the project's chain rules, where a build resolves exactly one cohort. FR-026b holds the line that this must be solved without weakening the boundary or loosening the production build; the mechanism itself is left to the plan, because the options differ enough in cost that choosing one here would be guessing.
- Mini-app packages version independently (FR-007) while every other workspace member tracks the repository release (FR-007a). The practical consequence is that a contributor never edits a version number for the application estate, but a mini-app change carries its own bump alongside the on-chain publication it already requires.
- Production continues to deploy from `main` through the existing container build pipeline; this feature adds a staging path alongside it rather than replacing the production path.
- The two services that are deliberately deployed out of band — the multi-container relay gateway and the alto bundler — remain out of band. This feature makes their running version *observable*, not automatically released.
- Contract deployments and upgrades keep their existing gating (storage-layout checks, bytecode digest gates, recorded `deployments/` artifacts). This feature records what a release moved on-chain; it does not change how an upgrade is authorized or performed.
- Mini-app package publication keeps its existing on-chain curation flow. This feature adds the package's own version to the release record; it does not change how a package is approved.
- The subgraph's endpoint version lives in a namespace The Graph owns. This feature records which endpoint version the application consumes; it does not renumber the subgraph.
- No member-facing behavior changes. Aside from a version identifier becoming visible and a staging environment existing, members see the same application.
- Existing `contracts/` deliberately remains outside the workspace member list; it is not a versioned package and its release identity is its deployed implementation address plus bytecode digest.

## Out of Scope

- Publishing any package to a public registry. All workspace members are private and stay private.
- Changing how contract upgrades are authorized, executed, or recorded.
- Changing the mini-app on-chain curation or approval flow.
- Renumbering or redeploying the subgraph.
- Per-tenant release trains. White-label tenants build from the same commit; a tenant-specific release cadence is a separate feature.
- Automated rollback. This feature makes the currently-serving version observable and the previous version identifiable; deciding and executing a rollback remains an operator action.
- Any change to the test suites themselves, beyond the workflow trigger corrections required by FR-022.
