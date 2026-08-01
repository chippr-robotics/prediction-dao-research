# Research: White-label multi-tenant platform

**Feature**: `072-white-label-tenants` | **Date**: 2026-07-31

This document records the architecture survey and the decisions that resolve every
technical unknown in the spec. Each decision states the alternatives considered and why
they were rejected.

## Current-state survey (what exists today)

### Branding

- The brand is hardcoded: "FairWins" appears ~843 times across ~327 frontend files.
  `frontend/index.html` hardcodes title, meta description, `theme-color`,
  `apple-mobile-web-app-title`, favicon and touch icons; `frontend/public/manifest.webmanifest`
  hardcodes PWA name/colors/icons; `frontend/src/wagmi.js#resolveAppUrl` falls back to
  `https://fairwins.app`; `mkdocs.yml`, legal pages, share/QR frames, and the
  `frontend/src/components/fairwins/` module namespace all embed the brand.
- **One real theming seam exists**: the `platform-*` CSS class contract.
  `frontend/src/theme.css` scopes brand tokens (`--brand-primary`, `--brand-secondary`,
  `--brand-accent`, semantic and chart colors, button/accent tokens per light/dark mode) under
  `.platform-fairwins`; `frontend/index.html` has a pre-hydration script applying
  `theme-<mode>` + `platform-<platform>` classes from localStorage (defaulting
  `platform-fairwins`); `frontend/src/contexts/ThemeContext.jsx` currently removes
  `platform-clearpath`/`platform-fairwins` and unconditionally re-adds `platform-fairwins`.
  A dormant `platform-clearpath` and a stray `tokenmint_no-text_logo.svg` asset show the
  seam was intended to scale.

### Configuration and address resolution

- `frontend/src/config/contracts.js` holds per-network address records
  (`POLYGON_CONTRACTS`, `AMOY_CONTRACTS`, …) assembled into `NETWORK_CONTRACTS` keyed by
  chainId. `getContractAddressForChain(name, chainId)` is a pure lookup; absence
  (`undefined`) deliberately means "not deployed on this network".
- `scripts/utils/sync-frontend-contracts.js` rewrites those address blocks in place from
  `deployments/<network>-chain<id>-v2.json`.
- **Everything is keyed by `(network, chainId)` only.** There is no dimension for "which
  instance on this chain" anywhere: deployment records, sync script, frontend resolution,
  or the relay-gateway's startup allowlist (which reads `deployments/*-chain<ID>-v2.json`
  and refuses to encode calls to any other address — spec 036 FR-025).

### Deployment tooling

- `scripts/deploy/deploy.js` is a deterministic full-stack deployer via the Safe Singleton
  Factory (salted CREATE2, `generateSalt(identifier)` in `scripts/deploy/lib/helpers.js`),
  deploying MembershipManager (UUPS proxy + seeded tiers), WagerRegistry (UUPS proxy),
  SanctionsGuard, oracle adapters, KeyRegistry, TokenFactory, then
  `saveDeployment(getDeploymentFilename(network, "v2"), record)`. Supplementary deployers
  (fee router, pool factory, callsign registry, …) append to the same record.
- Because addresses are deterministic **per salt**, a tenant-scoped salt prefix yields a
  distinct, reproducible address set per tenant on the same chain.

### Contract primitives relevant to tenancy

- `MembershipManager` is bytes32-role-keyed by design ("future paid roles without a
  redeploy") — but `treasury`, `paymentToken`, `accruedFees`, and `sanctionsGuard` are
  per-deployment singletons. **Per-tenant economics therefore requires a per-tenant
  MembershipManager deployment**, not a role key inside the shared one.
- `WagerPoolFactory` (spec 034) is the working in-repo reference for "one factory produces
  isolated per-group instances with a stable relayer anchor" — the pattern proof that
  instance isolation via separate contract state works in this codebase.
- `FeeRouter` (spec 060) is per-deployment: its treasury and service table are exactly the
  per-tenant fee surface once deployed per tenant.

### Serving and infra

- One Docker image bakes all `VITE_*` config at build time; `cloudbuild.yaml` hardcodes one
  set of build args (`VITE_APP_URL=https://fairwins.app`, network 137, relayer/bundler
  URLs) and one Cloud Run service. Runtime envsubst covers only Pinata JWT + origin lock.
- CSP lives in `frontend/nginx.conf.template` + `frontend/nginx.conf`, kept identical by
  `frontend/src/test/nginxCsp{ScriptSrc,ConnectSrc}.test.js`.
- `services/relay-gateway` is configured purely by env; per-chain quotas, killswitch,
  paymaster ceilings — all singleton-per-process.

## Decisions

### D1. Tenant manifest: one JSON document per tenant, in-repo, schema-validated

**Decision**: A tenant is described by `tenants/<tenant-id>/manifest.json` at the repo
root, validated by `scripts/tenants/validate-tenant-manifest.js` against a documented
schema. The manifest carries: identity (id, display name, legal name, domains, brand
assets, theme tokens per light/dark mode, support/legal links, social), settings (enabled
features, enabled chain IDs, membership tier pricing, fee service rates), and the contract
set declaration (`mode: "shared" | "dedicated"`).

**Rationale**: The constitution makes deterministic artifacts in-repo the source of truth
(`deployments/`); tenant manifests follow the same rule. A repo-tracked JSON document is
auditable (FR-012/SC-005 via git history), consumable by all four consumers (frontend
build, deploy scripts, gateway config, docs), and needs no new service.

**Alternatives rejected**: An on-chain TenantRegistry contract (adds a value-adjacent
contract surface with zero enforcement value — isolation comes from separate instances,
not from a registry; YAGNI under constitution §Simplicity). A hosted tenant-config service
(new core technology, new availability dependency; contradicts the static per-instance
build model).

### D2. Tenant selection: build-time, one origin = one tenant

**Decision**: `VITE_TENANT_ID` selects the manifest at build time; unset means `fairwins`
(the default tenant). Each tenant instance is its own build + serve (own Docker image
build args, own Cloud Run service or equivalent, own domain). No runtime tenant
switching from client input (spec FR-007).

**Rationale**: Matches the existing static-hosting model and the strong-isolation
requirement: an instance physically contains only its own tenant's identity and contract
set, so a whole class of cross-tenant leaks (wrong-manifest render, host-header spoofing)
is structurally impossible. The Vite pipeline already bakes config this way.

**Alternatives rejected**: Host-header-based runtime multi-tenancy in one served bundle
(one bundle would carry every tenant's manifest and addresses — a data-leak surface and a
CSP nightmare; also contradicts "unknown domain must not render any tenant"). Runtime
manifest fetch (adds an availability dependency and a spoofable input; the edge case
"manifest store unreachable" exists precisely because built-in manifests avoid it).

### D3. Theming: extend the existing `platform-*` seam, tokens from the manifest

**Decision**: Keep the `platform-<id>` class contract. The active tenant's theme tokens
(from the manifest) are materialized as CSS custom properties scoped under
`.platform-<tenant-id>` — injected at app bootstrap for non-default tenants, while the
default tenant continues to use the static `theme.css` rules unchanged.
`ThemeContext.jsx` applies `platform-<activeTenantId>` instead of the hardcoded
`platform-fairwins`. `validateTheme.js` keeps asserting the required tokens resolve.

**Rationale**: The seam already exists and is validated; the token vocabulary
(`--brand-*`, `--semantic-*`, `--primary-button*`, chart series) is already consumed
everywhere. Injecting vars for non-default tenants means zero visual diff for the default
tenant (US3) and no fork of `theme.css` per tenant.

**Alternatives rejected**: Per-tenant compiled CSS files (build complexity, drift risk
against `theme.css` structure). CSS-in-JS re-theming (new core technology, wholesale
refactor).

### D4. Brand surface: a single `tenant.js` config module; strings resolved, not hardcoded

**Decision**: `frontend/src/config/tenant.js` exposes the active tenant
(`getActiveTenant()`, `tenantBrand()`, `tenantLinks()`, `tenantFeatures()`,
`isFeatureEnabled(id)`, `tenantContractsForChain(chainId)`), loaded from the manifest via
`VITE_TENANT_ID`. Member-visible identity strings/assets migrate to it incrementally
(FR-002), starting with the highest-leverage surfaces: `index.html` title/meta/PWA
manifest (templated at build via a small Vite plugin reading the manifest),
`wagmi.js#resolveAppUrl` (WalletConnect metadata), share/QR frames, footer, entry gate.

**Rationale**: One import point makes "no hardcoded tenant identity in shipped paths"
(FR-001) lintable and auditable (SC-004 becomes a grep). The Vite plugin keeps
`index.html`/`manifest.webmanifest` static-file semantics (no runtime templating) while
sourcing values from the manifest.

**Alternatives rejected**: Env vars per brand field (`VITE_APP_NAME`, …) — sprawling,
unvalidated, and already proven insufficient (no such vars exist; the manifest is the
validated unit). Runtime string replacement — violates honest-state simplicity and CSP.

### D5. Contract sets: tenant dimension layered on the existing deployment records

**Decision**: The shared estate keeps its records exactly where they are
(`deployments/<network>-chain<id>-v2.json` — these become the *default tenant's* contract
set). Dedicated tenant sets are recorded as
`deployments/tenants/<tenant-id>/<network>-chain<id>-v2.json` with the **same schema**.
Deploy tooling gains a tenant dimension: `TENANT_ID` env (or `--tenant` flag) causes
(a) `generateSalt` to prefix identifiers with the tenant id — producing deterministic,
distinct, reproducible per-tenant addresses via the existing CREATE2 flow — and
(b) `getDeploymentFilename`/`saveDeployment`/`loadDeployment` to read/write under the
tenant subdirectory. With no tenant set, behavior is byte-identical to today.

**Rationale**: Reuses the deterministic deployer wholesale (spec FR-004); the salt is the
one lever needed for N isolated instances of audited implementations on one chain.
Same-schema records mean `sync-frontend-contracts.js`, the gateway's FR-025 startup
check, and verification tooling extend by path, not by format.

**Alternatives rejected**: A factory contract that clones the whole platform per tenant
(months of new audited contract surface; UUPS proxies per tenant already give isolation
and upgradeability; the WagerPoolFactory pattern fits pools, not a 15-contract estate).
Multi-tenant records inside one JSON file (breaks the sync script's regex model and
the gateway's one-record-per-chain assumption more invasively than a path dimension).

### D6. Frontend address resolution: tenant overlay with honest absence

**Decision**: For a dedicated tenant, the tenant build's address records are generated
from the tenant's own deployment records (sync script `--tenant <id>` writes the tenant's
per-chain map into the tenant manifest's generated companion,
`frontend/src/config/tenants/<id>.contracts.js`), and `getContractAddressForChain`
resolves **only** from the active tenant's set — absence stays absence (spec FR-003); a
dedicated tenant never falls back to the shared estate's addresses. For a shared-mode
tenant, resolution is unchanged (the shared records). The default tenant's generated set
IS the current `contracts.js` data, so default behavior is unchanged.

**Rationale**: Preserves the existing "undefined means not-deployed" contract the whole
app is built on, and makes the isolation property structural: a dedicated build does not
contain another tenant's addresses at all.

**Alternatives rejected**: Runtime overlay merging shared + tenant maps (silent fallback
to another estate is exactly the FR-008/edge-case failure the spec forbids).

### D7. Gateway and indexing: one scoped instance per dedicated tenant

**Decision**: A dedicated tenant that wants gasless rails runs its own relay-gateway
process configured with `TENANT_ID` + the tenant's deployment records; the existing
FR-025 startup allowlist then *is* the tenant scoping (it already refuses any address not
in its records — spec FR-009 falls out for free). Quotas, killswitch, paymaster deposits
are per-process, hence per-tenant. Same for subgraph: dedicated tenants get their own
subgraph deployment parameterized with their addresses (the manifest records the
per-tenant subgraph URL); shared-mode tenants use the shared subgraph. The gateway module
and subgraph remain optional per tenant — every flow keeps its self-submit fallback
(existing never-stranded rule).

**Rationale**: Process-per-tenant reuses every existing safety property (allowlist,
quotas, killswitch) without making any of them multi-tenant-aware — far smaller and safer
than teaching one process to segregate tenants internally.

**Alternatives rejected**: One multi-tenant gateway with per-tenant allowlists/quotas
(large blast radius: one process compromise or quota bug spans tenants; contradicts
"no shared barrier is the only barrier").

### D8. Membership and fees: per-tenant proxies, not role-keying

**Decision**: A dedicated tenant gets its own `MembershipManager` proxy (own treasury,
payment token, tiers, terms hash) and its own `FeeRouter` proxy (own service table,
caps, treasury), deployed by the existing scripts under the tenant salt. Tenant-admin
guardrails (spec FR-011) use the existing on-chain role model on the *tenant's* contracts
(`DEFAULT_ADMIN_ROLE`, `FEE_ADMIN_ROLE`, per-service hard caps already enforced on-chain
by spec 060).

**Rationale**: The survey shows treasury/paymentToken/sanctions are per-deployment
singletons in MembershipManager — per-tenant economics cannot be role-keyed. Fee caps
enforced on-chain (existing `FeeRouter` behavior) satisfy "guardrails enforced on-chain,
not merely hidden in UI" with zero new contract code.

**Alternatives rejected**: Tenant-as-bytes32-role inside shared MembershipManager (shared
treasury and payment token defeats asset isolation; acceptable only for shared-mode
tenants, where it is simply "the shared estate"). New contract code for tenancy (none is
needed — v1 ships zero Solidity changes, keeping the audited surface unchanged).

### D9. Isolation guarantees and their tests

**Decision**: The isolation test suite (SC-002) deploys two tenants' estates on one
Hardhat network via the salted deployer and asserts: cross-tenant membership is
unrecognized; cross-tenant admin calls revert; fee accrual lands only in the acting
tenant's router/treasury; and a gateway configured for tenant A refuses an intent
targeting tenant B's registry (unit-level against the allowlist loader). Frontend Vitest
covers: unknown `VITE_TENANT_ID` fails the build/loader loudly; dedicated resolution
never returns a shared address; default tenant resolves today's exact values.

**Rationale**: Isolation must be proven by construction *and* by test (constitution II);
these are the probes named in US2.

### D10. Per-tenant serving, domains, CSP

**Decision**: Per-tenant instances are produced by parameterizing the existing pipeline:
tenant build args (`VITE_TENANT_ID` + tenant URLs) into the existing Dockerfile, one
service per tenant, tenant domain bound at the edge (existing Cloudflare origin-lock +
geo docs extend per domain). CSP stays per-instance: tenant-specific hosts
(relayer/bundler/subgraph/IPFS) enter `connect-src`/`img-src` via the nginx template for
that instance; the `nginxCsp*` twin tests continue to gate template/config agreement.

**Rationale**: The pipeline is already one-image-one-config; running it N times with N
arg sets is the smallest change that yields true isolation at the serving layer too.

**Alternatives rejected**: Edge-side dynamic branding (rewriting HTML per host at the
CDN) — reintroduces runtime multi-tenancy and its leak surface.

### D11. Member-scoped storage tenancy

**Decision**: Client storage that is member-scoped gains a tenant dimension where it is
tenant-specific (spec FR-014): storage namespaces derive from the active tenant id for
tenant-scoped data (preferences tied to tenant surfaces), while genuinely
account-global data (device RPC endpoints, spec 069) stays global. Backup/sync objects
record the tenant id they were created under; restore into a different tenant surfaces
skipped tenant-scoped objects honestly.

**Rationale**: Since instances are separate origins, browser storage is already
origin-isolated — this decision covers only the sync/backup rail (spec 032) that crosses
devices and could cross tenants via a shared account.

## Resolved unknowns

| Unknown | Resolution |
|---|---|
| Where does a second deployment on the same chain live? | `deployments/tenants/<id>/…` + tenant-prefixed CREATE2 salts (D5) |
| How does a tenant get distinct addresses deterministically? | Existing singleton-factory CREATE2 with tenant-scoped salt (D5) |
| Can membership be tenant-scoped inside one contract? | No — treasury/paymentToken are singletons; per-tenant proxy (D8) |
| How does branding change without forking CSS? | `platform-<id>` class + injected tokens from manifest (D3) |
| How is the gateway tenant-scoped? | One process per tenant; FR-025 allowlist is the scope (D7) |
| What does "unknown domain" serve? | Nothing tenant-flavored — each instance serves only its own tenant; unbound domains never reach a tenant instance (D2/D10) |
| Does v1 need new Solidity? | No — zero contract changes; isolation via separate proxy instances (D8) |
