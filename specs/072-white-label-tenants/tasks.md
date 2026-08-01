# Tasks: White-label multi-tenant platform

**Input**: Design documents from `/specs/072-white-label-tenants/`

**Prerequisites**: plan.md, spec.md, research.md (D1–D11), data-model.md

**Organization**: Grouped by user story. Note the deliberate ordering: US3 (default
tenant preserved) is implemented FIRST because the tenant abstraction is only real once
the existing product runs through it unchanged.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [ ] T001 Create `tenants/` root: `tenants/README.md` (authoring guide, lifecycle,
      no-secrets rule) and `tenants/manifest.schema.json` per data-model.md
- [ ] T002 [P] Add npm scripts: `tenants:validate` → `scripts/tenants/validate-tenant-manifest.js`

## Phase 2: Foundational (blocking)

- [ ] T003 Write `scripts/tenants/validate-tenant-manifest.js`: JSON-Schema check +
      cross-manifest domain uniqueness + fee-cap check + theme-token completeness +
      dedicated-mode deployment-record presence (FR-008); non-zero exit on any failure
- [ ] T004 Author `tenants/fairwins/manifest.json` capturing today's identity, brand,
      theme tokens (from `frontend/src/theme.css` `.platform-fairwins` blocks), features,
      chains, `contractSet.mode: "shared"` (the shared estate IS the default set)
- [ ] T005 Implement `frontend/src/config/tenant.js`: build-time resolution of
      `VITE_TENANT_ID` (default `fairwins`), frozen manifest export, accessors
      (`getActiveTenant`, `tenantBrand`, `isFeatureEnabled`, `tenantChainIds`,
      `tenantContractsForChain`, `tenantThemeClass`); unknown id throws at init
- [ ] T006 Vitest: `frontend/src/test/tenantConfig.test.js` — default tenant resolves
      today's exact values; unknown tenant fails loudly; feature gating shape
- [ ] T007 Wire CI: run `tenants:validate` in the existing lint/build workflow (fail
      loudly, no continue-on-error)

**Checkpoint**: manifest + loader exist; nothing user-visible changed yet

## Phase 3: US3 — Default tenant preserved (P1) 🎯 first, on purpose

- [ ] T008 [US3] Vite plugin in `frontend/vite.config.js`: template `frontend/index.html`
      title/meta/theme-color/apple-title/favicon + emit `manifest.webmanifest` from the
      active tenant manifest; default-tenant output must be byte-equivalent to current files
- [ ] T009 [US3] `frontend/src/theme/tenantTheme.js`: inject `.platform-<id>` CSS custom
      properties from manifest for NON-default tenants only (default keeps static
      `theme.css`); keep `frontend/src/utils/validateTheme.js` assertions passing
- [ ] T010 [US3] `frontend/src/contexts/ThemeContext.jsx`: apply
      `platform-<activeTenantId>` (from `tenantThemeClass()`) instead of hardcoded
      `platform-fairwins`; update `frontend/index.html` pre-hydration default via T008
- [ ] T011 [P] [US3] Vitest: default-build equivalence — resolved addresses unchanged per
      network, `platform-fairwins` applied, generated index/manifest values match current
- [ ] T012 [US3] Run full frontend + contract suites in CI unmodified (SC-003 gate)

**Checkpoint**: app is manifest-driven with zero behavior change — MVP of the abstraction

## Phase 4: US1 — Operator launches a branded tenant (P1)

- [ ] T013 [US1] Deploy lib tenant dimension in `scripts/deploy/lib/helpers.js`:
      `TENANT_ID` env → salt prefix in `generateSalt`, `getDeploymentFilename`/
      `saveDeployment`/`loadDeployment` under `deployments/tenants/<id>/`; no tenant ⇒
      byte-identical behavior (D5)
- [ ] T014 [US1] Thread tenant context through `scripts/deploy/deploy.js` +
      supplementary deployers (fee router, pool factory, callsigns, …): treasury/tiers/
      payment token from the tenant manifest when `TENANT_ID` set
- [ ] T015 [US1] `scripts/utils/sync-frontend-contracts.js --tenant <id>`: generate
      `frontend/src/config/tenants/<id>.contracts.js` from the tenant's records
- [ ] T016 [US1] Dedicated-mode resolution in `frontend/src/config/tenant.js` +
      `frontend/src/config/contracts.js`: dedicated tenant resolves ONLY its generated
      set; absence stays absence; shared mode unchanged (D6)
- [ ] T017 [P] [US1] Brand-surface sweep #1 (high leverage): `frontend/src/wagmi.js`
      `resolveAppUrl` + WalletConnect metadata; `frontend/src/components/Footer.jsx`;
      `frontend/src/components/compliance/EntryGate.jsx`;
      `frontend/src/components/ui/ShareModal.jsx` + `AddressQRModal.jsx`;
      `frontend/src/utils/metadataGenerator.js` external URLs → `tenantBrand()`
- [ ] T018 [P] [US1] Brand-surface sweep #2: remaining member-visible strings/assets
      (landing page, legal links via `frontend/src/constants/legalLinks.js`, notification
      copy, report/document footers); add a lint/grep gate for the platform brand string
      in shipped paths (SC-004)
- [ ] T019 [US1] Feature gating: drive `frontend/src/config/appNav.js` visibility +
      route registration from `isFeatureEnabled` so disabled features are absent, not
      broken
- [ ] T020 [US1] Instance pipeline: parameterize root `Dockerfile` build args with
      `VITE_TENANT_ID` + tenant URLs; document (and template) per-tenant
      `cloudbuild.yaml` substitutions; per-tenant CSP hosts through
      `frontend/nginx.conf.template` keeping `frontend/src/test/nginxCsp*.test.js` green
- [ ] T021 [US1] Vitest: second-tenant fixture build resolves only its identity + its
      contract set (Acceptance US1.1–US1.4)

**Checkpoint**: a second tenant can be authored, deployed, built, and served

## Phase 5: US2 — Isolation proven (P1)

- [ ] T022 [US2] Hardhat two-tenant isolation suite
      `test/integration/tenant-isolation.test.js`: deploy two salted estates on one
      network; assert cross-tenant membership unrecognized, cross-tenant admin reverts,
      fee accrual lands only in acting tenant's router/treasury (Acceptance US2.1–US2.3)
- [ ] T023 [P] [US2] Gateway tenant scoping: `TENANT_ID` env in
      `services/relay-gateway` config → allowlist loads
      `deployments/tenants/<id>/…`; unit test: intent for the other tenant's registry is
      refused (US2.5); README/env.example updates
- [ ] T024 [P] [US2] Indexing scope: per-tenant subgraph parameterization docs +
      manifest `settings.subgraph.urls` consumption; shared-tenant path unchanged (US2.4)
- [ ] T025 [US2] Member-storage tenancy (FR-014): tenant id recorded on
      backup/sync objects (`frontend/src/lib/backup/syncedObjects.js` rail); restore into
      a different tenant skips tenant-scoped objects and says so

**Checkpoint**: SC-002 probes all green

## Phase 6: US4 — Tenant admin self-service (P2)

- [ ] T026 [US4] Tenant admin surfaces read authority from the TENANT's contracts
      (existing role model — `FEE_ADMIN_ROLE` on tenant FeeRouter, admin roles on tenant
      manager); fee edits stay cap-bound on-chain (US4.1–US4.2)
- [ ] T027 [P] [US4] Manifest-editable settings flow for tenant admins (brand assets,
      links, toggles the operator exposes) + validation on submit; changes affect only
      their tenant (US4.3)

## Phase 7: US5 — Shared → dedicated graduation (P3)

- [ ] T028 [US5] Graduation procedure: manifest `mode` repoint; new activity on dedicated
      estate; positions opened on the shared estate remain claimable at original
      addresses (test: open wager pre-switch, claim post-switch) (US5.2)
- [ ] T029 [P] [US5] Shared-mode disclosure copy (operator-facing) that asset isolation
      is not in effect (US5.1 / FR-015)

## Phase 8: Polish & cross-cutting

- [ ] T030 [P] `docs/developer-guide/white-label-tenants.md` +
      `docs/runbooks/tenant-operations.md` (lifecycle, suspension never traps value,
      direct-claim path per FR-013)
- [ ] T031 [P] CLAUDE.md guardrail entry for spec 072 (tenant manifest is the single
      source of truth; no hardcoded brand in shipped paths; dedicated never falls back)
- [ ] T032 Unknown-domain behavior at the edge documented in `infra/cloudflare/`
      (unbound domains never reach a tenant instance)

## Dependencies & execution order

- Setup (T001–T002) → Foundational (T003–T007) blocks everything
- US3 (T008–T012) before US1 — the abstraction must first reproduce the product
- US1 on-chain half (T013–T016) blocks US2 (T022) and US5 (T028)
- US2/US4/US5 can proceed in parallel after their blockers; Polish last
