# White-Label Tenants

Spec 072 turns the single-brand product into a platform of **tenant instances**: each
tenant (customer) runs its own branded instance with its own configuration and — for
tenants that need asset isolation — its own contract deployments. The FairWins product
is the **default tenant** (`tenants/fairwins/manifest.json`) and behaves exactly as
before.

Full design: `specs/072-white-label-tenants/` (spec, plan, research D1–D11, data-model,
quickstart, tasks).

## The tenant manifest is the single source of truth

`tenants/<tenant-id>/manifest.json` describes one tenant: identity (name, domains, brand
assets, theme tokens), settings (features, chains, membership tier pricing, fee bps),
and contract set (`shared` | `dedicated`). Rules:

- **Never hardcode a tenant identity value the manifest defines.** Member-visible
  names, logos, URLs, PWA metadata, share text, and support/legal links resolve through
  `frontend/src/config/tenant.js`.
- **No secrets.** Manifests are public config, baked into client bundles.
- `npm run tenants:validate` enforces structure, cross-manifest domain uniqueness, fee
  caps, cohort separation, and dedicated-mode record presence. CI gates on it
  (`tenant-manifests` job in `.github/workflows/test.yml`).

## Frontend

- **Selection is build-time**: `VITE_TENANT_ID` picks the manifest (default
  `fairwins`). One origin = one tenant; there is no runtime tenant switching, so a
  built instance physically contains only its own tenant's identity. An unknown id
  throws at module init — absence never falls back to another tenant.
- `frontend/src/config/tenant.js` exposes `getActiveTenant()`, `tenantBrand()`,
  `tenantLinks()`, `isFeatureEnabled(id)`, `tenantChainIds(cohort)`,
  `tenantThemeClass()`, `tenantContractMode()`.
- **Theming rides the existing `platform-*` seam**: the default tenant's tokens stay
  static in `frontend/src/theme.css`; non-default tenants get an equivalent
  `.platform-<id>` rule set generated from their manifest and injected by
  `frontend/src/theme/tenantTheme.js`. `ThemeContext` applies
  `platform-<activeTenantId>` and persists `themePlatform` for the pre-hydration
  script.
- Feature gating: a feature absent from `settings.features` must be absent from
  nav/routes — never present-but-broken.

## Contract isolation (dedicated tenants)

- Isolation for value-bearing state is **on-chain, by separate proxy instances** of the
  audited implementations — never by a frontend/gateway filter alone. v1 ships zero
  Solidity changes.
- Deploys reuse the deterministic CREATE2 flow: setting `TENANT_ID=<id>` on the
  existing deploy scripts prefixes salts (`tenant:<id>:…`) and writes records to
  `deployments/tenants/<id>/<network>-chain<chainId>-v2.json` (same schema as the
  shared records). `TENANT_ID` unset — or `fairwins` — is the shared estate,
  byte-identical to before.
- **A tenant id is immutable once deployed** (salts derive from it).
- A dedicated tenant resolves ONLY its own contract set; a contract absent from the
  set on a chain reads as not-deployed for that tenant there. No silent fallback to
  the shared estate, ever.
- Per-tenant gateway: run a relay-gateway instance against the tenant's deployment
  records — its startup allowlist (spec 036 FR-025) then *is* the tenant scoping.

## Lifecycle

`draft → live ⇄ suspended → retired`, changed by PR (git history is the audit trail).
Suspension never traps value: contracts don't know about suspension; members keep the
documented direct-claim path. Shared-mode ("branding-only") tenants have cosmetic
isolation only — this must be disclosed to the tenant, and graduation to dedicated
contracts preserves claimability of positions opened on the shared estate.
