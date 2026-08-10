# Implementation Plan: White-label multi-tenant platform

**Branch**: `claude/white-label-multi-tenant-m9uhsg` (feature id `072-white-label-tenants`) | **Date**: 2026-07-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/072-white-label-tenants/spec.md`

## Summary

Turn the single-brand FairWins product into a platform of tenant instances. A repo-tracked,
schema-validated **tenant manifest** becomes the single source of truth for a tenant's
identity, settings, and contract set. Tenant selection is build-time (`VITE_TENANT_ID`,
one origin = one tenant); branding flows through the existing `platform-*` CSS seam plus a
new `frontend/src/config/tenant.js` module; **dedicated tenants get isolated on-chain
estates** produced by the existing deterministic CREATE2 deployer with tenant-scoped salts,
recorded under `deployments/tenants/<id>/` in the existing schema. Zero Solidity changes in
v1 — isolation comes from separate proxy instances of the audited implementations. The
existing product becomes the default tenant with byte-identical behavior. Full decision log
in [research.md](./research.md).

## Technical Context

**Language/Version**: JavaScript (Node 22) for frontend + scripts; Solidity via Hardhat
(no contract changes in v1)

**Primary Dependencies**: React + Vite + Vitest (frontend); Hardhat + Safe Singleton
Factory CREATE2 flow (`scripts/deploy/`); nginx + Docker + Cloud Run (serving);
relay-gateway (Node, env-configured)

**Storage**: Tenant manifests as repo JSON (`tenants/<id>/manifest.json`); per-tenant
deployment records (`deployments/tenants/<id>/<network>-chain<id>-v2.json`); no new
databases or services

**Testing**: Vitest (tenant loader, theming, resolution, CSP twins); Hardhat
(two-tenant isolation suite); Node script tests for manifest validation

**Target Platform**: Static SPA per tenant instance (Docker/nginx/Cloud Run), EVM chains
already supported

**Project Type**: Web app (frontend + contracts + services + scripts)

**Performance Goals**: No regression to build size/startup for the default tenant;
manifest resolution is build-time (zero runtime cost)

**Constraints**: Default-tenant build must be behaviorally identical (SC-003); dedicated
tenants must never resolve shared-estate addresses (FR-003/D6); no runtime tenant
switching (FR-007); no secrets in manifests

**Scale/Scope**: Tens of tenants; each tenant = 1 manifest + 0..N per-network deployment
records + 1 built instance

## Constitution Check

*GATE: assessed against `.specify/memory/constitution.md` v1.0.0.*

- **I. Security-first contracts** — PASS. v1 ships **no Solidity changes**; dedicated
  tenants are additional proxy instances of already-reviewed implementations deployed by
  the existing deterministic scripts. Tenant-salted CREATE2 does not alter bytecode.
  Access-control reasoning (per-tenant admin keys, on-chain fee caps) is documented in
  research D8; the two-tenant isolation suite (D9) exercises the highest-risk surface
  (cross-tenant authority/funds) explicitly.
- **II. Test-first / coverage** — PASS. New behavior lands with Vitest suites (tenant
  loader/validation/theming/resolution) and a Hardhat two-tenant isolation suite; existing
  suites must pass unmodified (SC-003 is itself a test gate).
- **III. Honest state** — PASS by design. Absence stays absence for tenant contract sets
  (no silent fallback, D6); suspension never traps value (FR-013); testnet/mainnet cohort
  rules apply per tenant unchanged. No mocks in shipped paths.
- **IV. Fail loudly in CI** — PASS. Manifest validation is a build/CI gate that fails on
  invalid manifests (FR-008); no `continue-on-error` introduced.
- **V. Accessible, consistent frontend** — PASS. Theming stays on the validated token
  contract (`validateTheme.js`); contract addresses keep flowing from generated sync
  artifacts — the tenant dimension extends the sync path rather than hand-copying.
- **Additional constraints** — PASS. No new core technology; deployments stay
  deterministic and recorded; manifests contain no secrets; archived code untouched.

No violations → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/072-white-label-tenants/
├── spec.md
├── plan.md              # This file
├── research.md          # Decisions D1–D11
├── data-model.md        # Manifest schema + entities
├── quickstart.md        # How to author/launch a tenant
└── tasks.md             # /speckit-tasks output
```

### Source Code (repository root)

```text
tenants/
├── README.md                          # Authoring guide + lifecycle
├── manifest.schema.json               # JSON Schema for manifests
└── fairwins/
    └── manifest.json                  # Default tenant (reproduces today)

frontend/src/config/
├── tenant.js                          # Active-tenant module (loader + accessors)
└── tenants/                           # Generated per-tenant contract sets (dedicated mode)
frontend/src/contexts/ThemeContext.jsx # platform-<tenantId> application
frontend/src/theme/tenantTheme.js      # Token injection for non-default tenants
frontend/index.html                    # Values templated from manifest via Vite plugin
frontend/vite.config.js                # tenant html/manifest plugin, VITE_TENANT_ID

scripts/
├── tenants/validate-tenant-manifest.js  # Schema + cross-field validation (CI gate)
├── deploy/lib/helpers.js                # tenant-aware salt + deployment file paths
└── utils/sync-frontend-contracts.js     # --tenant <id> generation path

deployments/
└── tenants/<tenant-id>/<network>-chain<id>-v2.json   # Dedicated estates

services/relay-gateway/                 # TENANT_ID + tenant record path (per-tenant process)

test/integration/tenant-isolation.test.js  # Two-tenant on-chain isolation suite

docs/developer-guide/white-label-tenants.md
docs/runbooks/tenant-operations.md
```

**Structure Decision**: Web-app layout already in place; the feature adds the `tenants/`
root (manifests), a tenant dimension inside existing directories (`deployments/tenants/`,
`frontend/src/config/tenants/`), and per-feature docs. No new top-level services.

## Delivery phases

1. **Foundation (US3 first, deliberately)** — introduce `tenants/fairwins/manifest.json`
   capturing today's identity/config, the schema + validator, and
   `frontend/src/config/tenant.js`; wire ThemeContext + index.html/PWA templating through
   it. Gate: default build behaviorally identical; suites pass unmodified.
2. **Dedicated estates (US1/US2 on-chain half)** — tenant dimension in deploy lib
   (salts + record paths), sync `--tenant`, two-tenant isolation suite on Hardhat.
3. **Instance serving (US1 off-chain half)** — tenant build args through
   Dockerfile/cloudbuild parameterization; per-tenant CSP entries via the nginx template;
   gateway `TENANT_ID` scoping docs + config.
4. **Brand-string migration (US1 completion, SC-004)** — sweep member-visible surfaces
   onto `tenant.js` accessors, highest-leverage first (titles/PWA, WalletConnect metadata,
   share/QR frames, footer, entry gate, legal links).
5. **Tenant admin + lifecycle (US4, FR-012)** — operator runbook + validation-backed
   lifecycle states; tenant-admin surfaces read authority from the tenant's own contracts
   (existing role model).
6. **Shared→dedicated graduation (US5, FR-015)** — manifest `mode` switch flow +
   disclosure copy + claims-preserving repoint procedure (runbook + tests).

## Complexity Tracking

*No constitution violations to justify.*
