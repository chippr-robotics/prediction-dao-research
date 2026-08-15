---
description: "Task list for 085 Infrastructure as Code (Terraform + Ansible)"
---

# Tasks: Infrastructure as Code (Terraform + Ansible)

**Input**: Design documents from `/specs/085-infrastructure-as-code/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included. Constitution principle II applies in its infrastructure form — the guardrail gate
is unit-tested against fixtures, idempotency is asserted by a double run, and every adoption surface
is gated on a zero-diff plan rather than on inspection.


## ⚠ Status: what is delivered, and what needs an operator

This feature was implemented in an environment with **no cloud credentials** — no `gcloud`, no
Terraform state access, no Cloudflare token, no SSH reachability to the nodes. Everything
*authorable* is delivered and verified as far as it can be locally; everything requiring a live
cloud operation is left for an operator and is **not** marked complete.

**Delivered and locally verified**

| | |
|---|---|
| Guardrail gate + 22 tests | `npm run check:iac` PASS, `npm run test:iac-guardrails` 22/22 |
| Terraform: bootstrap, 5 modules, 2 environment roots | `terraform validate` passes on all three roots; `fmt -check` clean; lockfiles committed |
| Ansible: 6 roles, 4 playbooks, dynamic inventory | `ansible-lint` passes at the **production** profile; all 4 playbooks pass `--syntax-check` |
| 3 CI workflows | authored; they run for the first time on this PR |
| Docs, runbook, CODEOWNERS, superseded headers | complete |

**Requires an operator with credentials** — these are the tasks still `[ ]`:

- **T015** run `terraform apply` in `bootstrap/` and commit the resulting state
- **T020** confirm the plan workflow end-to-end on a real PR
- **T026, T028–T030** generate/review config, run the imports, reach zero-diff, prove `prevent_destroy`
- **T034, T038–T041** adopt secrets/registry/KMS and Cloud Run; remove the shape flags from `cloudbuild.yaml`
- **T047, T052–T053** adopt the edge and monitoring; force an alert to confirm it still fires
- **T064–T065** double-run idempotency against a live node; verify hand-made drift is corrected
- **T070–T073** verify the apply, its divergence failure, and the no-drift-on-deploy property
- **T077–T078** verify drift is reported, and that a clean estate reports clean
- **T079–T080** reduce `startup.sh` to a bootstrap and prove node reconstruction
- **T090–T094** the SC-009/SC-008/SC-003 verifications and the full quickstart run

**Two things are deliberately incomplete rather than guessed:**

1. `prober-cidrs.json` ships **empty**, not filled with invented addresses. A plan-time precondition
   fails loudly until an operator runs `node scripts/infra/generate-prober-cidrs.js`.
2. `imports.tf` blocks are **commented out**. Uncommenting them starts mutating real state, which is
   an operator decision taken one surface at a time — not something a PR should do on merge.

**T079 (`startup.sh` reduction) is intentionally not done in this change.** It changes how a node
boots, and it cannot be validated without recreating one. Doing it blind would mean the first proof
it works is a production node failing to come back. It is the first task of the next change, once
Ansible has been proven against a live node (T064).

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 from spec.md
- **⛔ GATE**: a task that must pass before the next surface begins — these are not advisory

## Path Conventions

Repository root is `/home/user/prediction-dao-research`. Infrastructure lands in `infra/terraform/`
and `infra/ansible/`, alongside the imperative scripts it supersedes (`infra/vm/`,
`infra/cloudflare/`, `ops/monitoring/`). The one Node file lives under the existing `scripts/` tree.

## ⚠️ Read before starting

Three facts make this feature different from ordinary implementation work, and each has already
produced a near-miss in the research:

1. **The GCP project is shared.** `chippr-bots-site-wp` hosts a public WordPress VM plus
   `clearpath-*`, `fukuii-*`, `kings-edge-*`. A single `google_project_iam_binding` — one word away
   from the safe `google_project_iam_member` — strips its role from every other principal in the
   project, and the plan diff looks small and ordinary.
2. **Some resources are unrecoverable.** KMS key versions, secret payloads, and the static IPs pinned
   in Cloudflare DNS. Adoption is by `import`, never recreate.
3. **A zero-diff plan is the definition of done for a surface.** If a plan is not clean, the
   *configuration* is wrong. Never apply to force live infrastructure to match a generated body.

---

## Phase 1: Setup

**Purpose**: Scaffolding and toolchain. No cloud resources touched.

- [X] T001 Create the `infra/terraform/` tree (`bootstrap/`, `modules/`, `environments/prod/`, `environments/staging/`) with `.gitignore` entries for `.terraform/`, `*.tfplan`, and `crash.log` — but **not** `.terraform.lock.hcl` (it must be committed, guardrail G-13) and **not** `bootstrap/terraform.tfstate` (committed on purpose, contracts/state-backend.md)
- [X] T002 [P] Create the `infra/ansible/` tree (`inventory/`, `group_vars/`, `playbooks/`, `roles/`) with `ansible.cfg` and a pinned `requirements.yml` (`google.cloud`, `community.docker`)
- [X] T003 [P] Write `docs/developer-guide/infrastructure-as-code.md` skeleton: tool versions (Terraform `~> 1.15`, ansible-core `~> 2.18`), install instructions, and the three warnings above
- [X] T004 [P] Add `infra/terraform/versions.tf` conventions doc in `infra/terraform/README.md`: `required_version = "~> 1.15.0"`, providers `hashicorp/google ~> 7.44`, `hashicorp/google-beta ~> 7.44`, `cloudflare/cloudflare ~> 5.23` (research.md R1, R6)
- [X] T005 Add `check:iac` and `test:iac-guardrails` scripts to root `package.json`, and add `infra/**` path filters that CI will key on

---

## Phase 2: Foundational (Plan Phase A) — BLOCKING

**Purpose**: The trust root, the guardrail gate, and the plan workflow. Nothing may be adopted, and
no apply may be automated, until this phase is complete.

**⚠️ CRITICAL**: No user story work begins until T020 passes.

### Guardrail gate (test-first)

- [X] T006 [P] Create failing fixtures under `scripts/infra/__fixtures__/` — one per guardrail rule G-01…G-15 in `contracts/guardrails.md`, each a minimal `.tf` file exhibiting exactly one violation, plus `passing/` with a compliant configuration
- [X] T007 Implement `scripts/infra/check-iac-guardrails.js` enforcing G-01…G-15 — HCL is scanned textually with block-aware parsing (no Terraform binary required, so the gate runs on any machine); each violation reports file, line, rule ID, and the one-line rationale from `contracts/guardrails.md`
- [X] T008 Write `scripts/infra/check-iac-guardrails.test.js` asserting every fixture in T006 is rejected for its own rule and the passing fixture is accepted — **a gate that passes everything is worse than no gate, because it gets cited as evidence**
- [X] T009 ⛔ GATE Run `npm run test:iac-guardrails` — all fixtures behave as specified (quickstart scenario 1)

### Trust root

- [X] T010 Write `infra/terraform/bootstrap/main.tf`: the state bucket `fairwins-tfstate-chippr-bots-site-wp` (versioning on, uniform bucket-level access, public access prevention enforced, 30 noncurrent versions, `prevent_destroy`) per `contracts/state-backend.md`
- [X] T011 Add the Workload Identity Federation pool and GitHub OIDC provider to `infra/terraform/bootstrap/main.tf`, with attribute conditions: plan identity restricted to `repository == chippr-robotics/prediction-dao-research`, apply identity additionally restricted to `ref == refs/heads/main` (contracts/ci-identity.md)
- [X] T012 Add `google_service_account.tf_plan` (viewer + state-bucket `objectUser`) to `infra/terraform/bootstrap/main.tf`
- [X] T013 Add `google_service_account.tf_apply` to `infra/terraform/bootstrap/main.tf` with **exactly** the role list in `contracts/ci-identity.md` — including the custom `fairwins.tfServiceAccountManager` role (no `serviceAccounts.delete`, no `serviceAccountKeys.create`) and per-secret rather than project-scoped `secretmanager.admin`
- [X] T014 Verify no forbidden role appears on either identity: no `owner`, `editor`, `resourcemanager.projectIamAdmin`, `cloudkms.admin`, `iam.serviceAccountKeyAdmin`, or project-scoped `secretmanager.admin`
- [ ] T015 Run `terraform apply` in `infra/terraform/bootstrap/` and **commit `bootstrap/terraform.tfstate`** — local state by design, never migrated into the bucket it creates; it holds no secrets and is the audit record of how the trust root was established
- [X] T016 [P] Write `infra/terraform/environments/prod/backend.tf` and `.../staging/backend.tf` with the GCS backend and per-environment prefixes (`prod`, `staging`)

### Plan workflow

- [X] T017 Write `.github/workflows/infra-plan.yml`: triggers on PRs touching `infra/**`; runs `terraform fmt -check -recursive`, `terraform validate`, `tflint`, `npm run check:iac`; authenticates as `fairwins-tf-plan@` via WIF (no stored key)
- [X] T018 Add plan generation to `infra-plan.yml`: `terraform plan -out=tfplan` per environment; upload `tfplan` plus the infra-tree digest (`git rev-parse HEAD:infra/terraform`) and the state serial as a **short-retention, non-public** artifact — plan files embed prior state values (research.md R7)
- [X] T019 Add the redacted PR summary step to `infra-plan.yml`: generated from `terraform show -json` with sensitive values dropped; raw plan files are never posted as comments (guardrail G-15)
- [ ] T020 ⛔ GATE Open a scratch PR touching `infra/terraform/**`; confirm every gate runs, fails loudly on a deliberate violation, and posts a redacted summary. **No adoption work proceeds until this passes.**

**Checkpoint**: Trust root established, gate proven, plan visible in review. Adoption may begin.

---

## Phase 3: User Story 1 — Adopt the live estate without disturbing it (P1) 🎯 MVP

**Goal**: The repository describes reality exactly. A plan against unchanged production reports zero
changes, and nothing was created, replaced, or destroyed to achieve that.

**Independent Test**: `terraform plan` on `environments/prod` reports `No changes.` (quickstart
scenario 2), and `terraform plan -destroy` errors on every protected resource (scenario 3).

**Ordering within this story is gated**: network+nodes → secrets/KMS/registry → Cloud Run → edge →
monitoring. Each sub-surface reaches zero-diff before the next begins. The edge is deliberately last
because `cloudflare_ruleset` is authoritative for its phase.

### Sub-surface B: network and nodes

- [X] T021 [P] [US1] Write `infra/terraform/modules/network/` (`main.tf`, `variables.tf`, `outputs.tf`, `README.md`) per `contracts/module-interfaces.md` — VPC, subnet, static IPs (`prevent_destroy`), and the four firewall rules; Cloudflare and prober ranges are **inputs**, never fetched inside the module (G-08, G-09)
- [X] T022 [P] [US1] Write `infra/terraform/modules/edge-node/` — instance, optional service account, and resource-scoped IAM. Every IAM resource is `*_iam_member`; secret access and Artifact Registry reads are resource-scoped, never project-wide
- [X] T023 [US1] Add `data "cloudflare_ip_ranges"` to `environments/prod/main.tf` so edge ranges refresh on every plan rather than being a pinned stale copy (FR-040, research.md R7)
- [X] T024 [US1] Write `scripts/infra/generate-prober-cidrs.js` producing a dated `infra/terraform/environments/prod/prober-cidrs.json` from `gcloud monitoring uptime list-ips` — no Terraform data source exists for this, so staleness must be made loud instead
- [X] T025 [US1] Wire the network and two `edge-node` instances into `environments/prod/main.tf`, passing `create_service_account = true` for the bundler and `false` for the gateway (it reuses `fairwins-relay-engine@`, which holds **zero** project-level roles — a property to preserve)
- [ ] T026 [US1] Generate configuration bodies with `terraform plan -generate-config-out=`, then **hand-review and reshape** into the modules — generated output includes server-populated defaults and computed fields and must never be committed raw (research.md R2)
- [X] T027 [US1] Write `environments/prod/imports.tf` with `import` blocks for every network and node resource in data-model.md, using the real IDs recorded there; blocks are **retained after adoption** as the audit record and as the state-loss recovery path
- [ ] T028 [US1] Run `terraform plan` and confirm every resource shows `will be imported` and **none** shows `must be replaced` (quickstart scenario 3)
- [ ] T029 [US1] Apply the import, then ⛔ GATE re-plan until it reports `No changes.` — every diff is fixed in the repository, never by applying to the cloud
- [ ] T030 [US1] ⛔ GATE Run `terraform plan -destroy` and confirm it **errors** naming the static IPs; an error is the pass condition (FR-006)

### Sub-surface D1: secrets, KMS, Artifact Registry

- [X] T031 [P] [US1] Declare `google_secret_manager_secret` containers and `*_iam_member` access bindings for every secret in data-model.md's Secret Reference table, with `prevent_destroy`. **No `google_secret_manager_secret_version` resources** (G-04) — destroying a container destroys every version
- [X] T032 [P] [US1] Declare the KMS key ring and crypto keys with `prevent_destroy`, and their IAM bindings. Key **versions** are never managed — a destroyed version cannot be restored from state
- [X] T033 [P] [US1] Declare `google_artifact_registry_repository.cloud_run_source_deploy` with `prevent_destroy`, plus the two repository-scoped reader bindings
- [ ] T034 [US1] Add import blocks for T031–T033 and ⛔ GATE reach zero-diff
- [X] T035 [US1] Record the version pins (`relay-webhook-secret:2`, `relay-engine-api-key:2`) as asserted variables, not defaults — both secrets have an enabled v1 *and* v2 today, so treating unpinned `latest` as equivalent is benign now and silently wrong after the next rotation

### Sub-surface D2: Cloud Run shape

- [X] T036 [P] [US1] Write `infra/terraform/modules/cloud-run-service/` carrying the full G-07 `ignore_changes` set (`template[0].containers[0].image`, `template[0].revision`, `client`, `client_version`) — the pipeline owns the artifact
- [X] T037 [US1] Declare the prod SPA service (`prediction-dao-research`) and both staging services in their respective environment roots, using the `:latest` tag the pipeline already publishes for the required-but-ignored `image` input
- [ ] T038 [US1] Declare per-tenant Cloud Run services with `for_each` over the tenant manifests (spec 072) — the `for_each` usage is why modules may not contain `provider` blocks (G-09)
- [ ] T039 [US1] Add import blocks and ⛔ GATE reach zero-diff for all Cloud Run services
- [ ] T040 [US1] Remove the shape-setting flags from `cloudbuild.yaml`'s `gcloud run deploy` step — `--allow-unauthenticated` and any scaling/CPU/memory/ingress/secret flags — **in the same change** that adopts the service, so the service neither loses public access before nor fights Terraform after (contracts/ownership-boundary.md)
- [ ] T041 [US1] Verify the alto bundler Cloud Run service is **neither imported nor declared**, and confirm guardrail G-11 rejects re-declaring it. Its absence from `cloudbuild.yaml` is load-bearing: re-arming it puts two executors on one EOA, with colliding nonces, stuck bundles, both instances reporting healthy, and no in-band detection
- [X] T042 [P] [US1] Mark `services/alto-bundler/deploy/service.yaml` non-authoritative with a header comment pointing at the Terraform declaration and at T041's reasoning

### Sub-surface E: edge (adopted last, on purpose)

- [X] T043 [P] [US1] Write `infra/terraform/modules/cloudflare-zone/` — `cloudflare_dns_record` (v5 name; v4's `cloudflare_record` no longer exists) plus two `cloudflare_ruleset`s. The README states at the top that both rulesets are **authoritative for their phase**
- [X] T044 [US1] Declare DNS records wired from the `network` module's `static_ips` output, so a changed origin IP cannot desync from DNS
- [X] T045 [US1] Declare the WAF geo ruleset (`http_request_firewall_custom`, HTTP 451) from `infra/cloudflare/waf-geo.md`, preserving the deny set exactly — this is a live legal control, not a config value
- [X] T046 [US1] Declare the origin-lock transform ruleset (`http_request_late_transform`) injecting `X-Origin-Auth`, with the value read via a `google_secret_manager_secret_version` **data source** marked `sensitive` — the one accepted state exception (plan.md Complexity Tracking); the module takes it as an input and never reads Secret Manager itself
- [ ] T047 [US1] Add import blocks and ⛔ GATE reach zero-diff for the edge surface
- [X] T048 [P] [US1] Add a `CODEOWNERS` entry for `infra/terraform/modules/cloudflare-zone/` and the edge declarations, so a compliance-affecting diff cannot ride along unnoticed inside an unrelated change (FR-039)

### Sub-surface F: monitoring

- [X] T049 [P] [US1] Write `infra/terraform/modules/monitoring/` — notification channels, uptime checks, alert policies, log metrics — taking `uptime_targets` as **IPs** with a `validate_ssl` flag, not hostnames
- [X] T050 [US1] Port all seven alert policies and the `fairwins_probe_failures` log metric from `ops/monitoring/apply.sh`, preserving thresholds **and their reasoning comments verbatim**
- [X] T051 [US1] Port the uptime checks, carrying the reasoning for each: checks target origin IPs because the Cloudflare geo gate answers 451 to US-sourced traffic and Google's probers are largely US-based; SSL validation is off because the origin serves a deliberately-untrusted Cloudflare Origin CA certificate; the bundler matcher checks `0x5FF137D4` from `eth_supportedEntryPoints` rather than a 200 (the origin-lock nginx's `/healthz` is a static `return 200` that never touches alto — the check that stayed green through the 2026-07-12 outage); the gateway matcher checks `"rpc":"up"` and must **not** match `"status":"ok"` (returned unconditionally even when every chain is down)
- [ ] T052 [US1] Add import blocks and ⛔ GATE reach zero-diff for monitoring
- [ ] T053 [US1] Force one alert condition and confirm it still fires to the notification channel — a port that silently broke alerting would look identical to a successful one

**Checkpoint**: US1 delivered. `terraform plan` is clean across both environments; the estate is
described by the repository; protected resources refuse destruction.

---

## Phase 4: User Story 3 — Node configuration is declarative and re-runnable (P2)

**Goal**: Converge a node to its declared configuration on demand, without recreating it. A second
run changes nothing.

**Independent Test**: quickstart scenario 5 — run the playbook twice; second run reports
`changed=0`; both services stay healthy throughout.

- [X] T054 [US3] Write `infra/ansible/inventory/gcp.yml` using the `google.cloud.gcp_compute` plugin keyed on the existing `app=fairwins` / `role=` labels, with `ansible_ssh_common_args` proxying through `gcloud compute start-iap-tunnel`. **SSH is open to `35.235.240.0/20` only** — a playbook written for direct SSH cannot reach these hosts, and the fix is never to widen the firewall
- [X] T055 [P] [US3] Write `roles/common/` — base packages, Ops Agent, sysctl. Use `state: present` with explicit versions, never `state: latest` (which reports changed whenever upstream publishes and can upgrade Docker under a running bundler)
- [X] T056 [P] [US3] Write `roles/hardening/` — SSH policy, kernel parameters, file permissions; invocable separately via `playbooks/harden.yml` so OS patching is a deliberate act
- [X] T057 [P] [US3] Write `roles/docker/` installing docker-ce at a pinned version with the official repository and keyring
- [X] T058 [P] [US3] Write `roles/nginx/` templating `fairwins-gateway.conf` and `fairwins-bundler.conf` from the existing `infra/vm/nginx/` files, parameterised by role
- [X] T059 [US3] Write `roles/fairwins_secrets/` that **places, owns and invokes** `infra/vm/common/fetch-secrets.sh` rather than reimplementing it — the script already enforces per-container scoping (the internet-facing container must never receive the engine's KMS-signing credential), byte-exact payloads (escaping a PEM newline breaks KMS signing silently, at first use), refusal to run under `set -x`, and REQUIRED-vs-OPTIONAL handling. Every task touching secrets sets `no_log: true`
- [X] T060 [US3] Write `roles/fairwins_stack/` managing compose files, systemd units and timers, with handlers that restart `fairwins-stack@<role>` **as a whole unit** — containers share one network namespace, so recreating the owner invalidates the joiners (FR-023)
- [X] T061 [P] [US3] Write `group_vars/all.yml`, `bundler.yml`, `gateway.yml` carrying the per-role secret sets and the asserted version pins from T035
- [X] T062 [US3] Write `site.yml` and `playbooks/{bundler,gateway}.yml`
- [X] T063 [US3] Add `ansible-lint` and the double-run idempotency assertion to `.github/workflows/infra-plan.yml`, asserting the second run reports zero changed tasks
- [ ] T064 [US3] ⛔ GATE Run the playbook twice against the live gateway; confirm `changed=0` on the second run, no restarts, and both health endpoints answering throughout (quickstart scenario 5)
- [ ] T065 [US3] Verify hand-made drift is corrected: change an nginx directive by hand, re-run, confirm it is restored and reported (FR-021)

**Checkpoint**: US3 delivered. Node interiors are declarative and convergent.

---

## Phase 5: User Story 2 — Change one service, and only that service changes (P2)

**Goal**: A single-service change reaches production through one reviewed, recorded, automatically
applied change with a visible blast radius.

**Independent Test**: quickstart scenarios 4, 8 and 10.

**Depends on**: Phase 3 (a surface must be at zero-diff before it applies unattended — spec
Dependencies).

- [X] T066 [US2] Write `.github/workflows/infra-apply.yml`: triggers on merge to `main` touching `infra/terraform/**`; authenticates as `fairwins-tf-apply@` via WIF
- [X] T067 [US2] Implement the plan-continuity check in `infra-apply.yml`: recompute the merged tree's `infra/terraform` digest and compare against the approved PR's digest **and** state serial; apply the saved `tfplan` verbatim only on a match, otherwise **fail and report the divergence** — never compute-and-apply a fresh plan (FR-034)
- [X] T068 [US2] Add a `concurrency` group (queue, do not cancel) to the apply job so two closely-merged infra PRs become a clean "re-plan required" rather than a partial change
- [X] T069 [US2] Confirm no retry on the apply step and that a failure is loud (FR-035); add the partial-apply recovery procedure to the operations runbook
- [ ] T070 [US2] ⛔ GATE Verify SC-012: merge an infra change and confirm the log shows the saved plan being consumed, not recomputed (quickstart scenario 10 steps 1–2)
- [ ] T071 [US2] ⛔ GATE Verify FR-034 fires: force a divergence and confirm the apply **fails** on the digest/serial mismatch — the failure is the pass condition (quickstart scenario 10 step 3)
- [ ] T072 [US2] ⛔ GATE Verify SC-014: merge a frontend change, let Cloud Build deploy a new image, and confirm the next drift run is clean — this is what proves the ownership split works (quickstart scenario 8)
- [ ] T073 [US2] Verify SC-004: change one staging attribute and confirm the plan names exactly one resource and touches no prod state (quickstart scenario 4)

**Checkpoint**: US2 delivered. Changes flow from review to production with a bounded blast radius.

---

## Phase 6: User Story 4 — Drift is detected, not discovered (P3)

**Goal**: Divergence between the repository and the running estate is reported on a schedule.

**Independent Test**: quickstart scenario 7 — inject drift, confirm the scheduled run names the
resource and the attribute.

- [X] T074 [US4] Write `.github/workflows/infra-drift.yml`: scheduled `terraform plan -detailed-exitcode` per environment under `fairwins-tf-apply@` (it needs the data-source read), reporting drift without correcting it
- [X] T075 [US4] Add the prober-list staleness check to the drift job: re-run `scripts/infra/generate-prober-cidrs.js` and fail if the committed copy differs — the mechanism that makes a stale list loud instead of silently wrong (FR-040)
- [X] T076 [US4] Add redaction to the drift report so no sensitive value appears in the diff (FR-037)
- [ ] T077 [US4] ⛔ GATE Verify SC-007: inject a label change out of band, confirm the run reports it by resource and attribute, does not auto-correct, and leaks no secrets (quickstart scenario 7)
- [ ] T078 [US4] ⛔ GATE Verify FR-038: with no drift present, confirm the run reports clean across several consecutive executions — recurring false drift is what teaches people to ignore real drift

**Checkpoint**: US4 delivered. "No undocumented drift" is checkable rather than aspirational.

---

## Phase 7: User Story 5 — Reconstruct the environment from the repository (P3)

**Goal**: A lost node returns from repository contents alone, with no step outside the repository.

**Independent Test**: quickstart scenario 6, against a scratch or staging node only.

**Depends on**: Phase 4 (the playbook must exist before `startup.sh` can delegate to it).

- [ ] T079 [US5] Reduce `infra/vm/startup.sh` to a bootstrap that reads `fairwins-role` from metadata, installs python3/git/ansible-core, refreshes the repository, and runs `ansible-playbook` against `localhost` — so cold boot and on-demand convergence share **one** description of node configuration (contracts/ownership-boundary.md)
- [ ] T080 [US5] ⛔ GATE Delete and recreate a scratch node; confirm it reaches a healthy serving state with **no manual step**. Any step performed by hand is a defect in this feature, not expected practice (quickstart scenario 6)
- [X] T081 [US5] Write `docs/runbooks/infrastructure-operations.md`: bootstrap order, per-surface reconstruction, `force-unlock` policy (never automated; confirm no apply is in flight first), partial-apply recovery, state restore from a prior object version, and Cloudflare token rotation
- [X] T082 [US5] Document the state-loss recovery path — re-running the retained `import` blocks — in `docs/runbooks/infrastructure-operations.md`, which is why the blocks stay in the repository after adoption
- [X] T083 [US5] Document every one-time manual step that genuinely cannot be automated, each with its justification (FR-041). Bootstrap and the Cloudflare token are expected to be the only two

**Checkpoint**: US5 delivered. The environment is reconstructable without tribal knowledge.

---

## Phase 8: Polish & Cross-Cutting

- [X] T084 [P] Complete `docs/developer-guide/infrastructure-as-code.md`: the ownership table, how to add a resource, how to adopt a new surface, how to read a plan, and the shared-project hazards
- [X] T085 [P] Write `infra/terraform/modules/README.md` with the extraction path to `chippr-tf-modules` — `git mv`, tag, switch `source` to a `?ref=` pin, then **confirm a zero-diff plan**; a non-zero diff means the module was not portable and the move is reverted (FR-024a)
- [X] T086 [P] Re-scope `infra/cloudflare/*.md` from source-of-truth to operational procedure, pointing at the Terraform declarations so no resource has two competing sources of truth (FR-042)
- [X] T087 [P] Add a superseded header to `ops/monitoring/apply.sh` and `infra/vm/provision.sh` naming the Terraform that replaced them, and state that they are retained for reference and bootstrap only
- [X] T088 [P] Add `docs/developer-guide/infrastructure-as-code.md` and the operations runbook to `mkdocs.yml`
- [X] T089 [P] Update root `CLAUDE.md` with a concise IaC guardrails section: additive IAM only, no secret versions in state, protected resources, the Cloud Run ownership split, and the bundler-must-stay-decommissioned rule
- [ ] T090 Verify SC-009 end to end (quickstart scenario 9): impersonate `fairwins-tf-apply@` and confirm `PERMISSION_DENIED` on all four attempts — destroy a KMS key version, delete a secret container, modify another workload's service, set a project IAM policy. **Any success is a release blocker**
- [ ] T091 Verify SC-008 (quickstart scenario 11): guardrail passes, the secret grep is empty, and plan summaries render `(sensitive value)`
- [ ] T092 Verify SC-003: reconcile the live estate against data-model.md's inventory; every resource is either managed or on the documented exclusion list (research.md R15)
- [ ] T093 Run the full quickstart suite (scenarios 1–11) and record the results in the PR body
- [ ] T094 Close issue #1177 with a summary mapping the two acceptance scenarios — one command updates all services; a single-service change updates only that service — to the delivered phases

---

## Dependencies

```
Phase 1 (Setup)
   └─▶ Phase 2 (Foundational, plan phase A)  ⛔ T020 blocks everything
          ├─▶ Phase 3 (US1 adoption)  ── gated internally: B → D1 → D2 → E → F
          │      ├─▶ Phase 5 (US2 change flow)      needs zero-diff surfaces
          │      └─▶ Phase 6 (US4 drift)            needs zero-diff surfaces
          └─▶ Phase 4 (US3 Ansible)
                 └─▶ Phase 7 (US5 reconstruction)   needs the playbook
                        └─▶ Phase 8 (Polish)
```

**Story independence**: US3 (Ansible) depends on Phase 2 only, not on US1 — the playbook converges
VMs that already exist regardless of whether Terraform has adopted them, so Phases 3 and 4 can run
in parallel. US2 and US4 both require US1's zero-diff state: applying or drift-checking an
unverified surface is the one combination the design forbids. US5 requires US3.

**Within US1, the sub-surface order is a gate, not a preference.** The edge is last because
`cloudflare_ruleset` is authoritative for its phase — an out-of-band WAF rule added during an
incident is deleted on the next apply — so it is adopted only once the change flow and drift
detection are trustworthy.

## Parallel Opportunities

- **Phase 1**: T002, T003, T004 together
- **Phase 2**: T006 while T010–T013 are written (different trees)
- **Phase 3**: module authoring T021, T022, T036, T043, T049 in parallel; **imports and zero-diff
  gates are strictly sequential per sub-surface**
- **Phase 4**: roles T055, T056, T057, T058, T061 in parallel; T059 and T060 are sequential (the
  stack depends on secret delivery)
- **Phase 8**: T084–T089 all parallel
- **Across phases**: Phase 3 and Phase 4 may proceed concurrently by different people

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + Phase 3.** That is User Story 1, and it alone delivers the audit value
the issue asks for: a single reviewable manifest of what exists, provably matching reality. Nothing
applies automatically yet, so the risk is bounded to "we wrote some files and imported some state".

**Increment 2 = Phase 4 (US3).** Node interiors become convergent — the surface with the worst
current story, since today the only way to re-apply node configuration is to destroy the node.

**Increment 3 = Phases 5 + 6 (US2, US4).** Automation and drift detection, once there is verified
state worth automating against.

**Increment 4 = Phases 7 + 8 (US5, polish).** Reconstruction proof and documentation.

Each increment is independently valuable and independently revertible. If work stops after any
increment, what shipped is coherent — which matters here because the alternative to finishing is not
"no IaC", it is "half-adopted IaC", the state in which nobody knows which system owns what.
