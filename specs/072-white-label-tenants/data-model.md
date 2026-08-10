# Data Model: White-label multi-tenant platform

**Feature**: `072-white-label-tenants` | **Date**: 2026-07-31

## Entities

### Tenant Manifest (`tenants/<tenant-id>/manifest.json`)

The single source of truth for one tenant. Repo-tracked, schema-validated
(`tenants/manifest.schema.json`), no secrets ever.

```jsonc
{
  "schemaVersion": 1,
  "id": "fairwins",                     // ^[a-z][a-z0-9-]{1,30}$ — used in salts, paths, CSS class
  "lifecycle": "live",                  // draft | live | suspended | retired

  "identity": {
    "displayName": "FairWins",
    "legalName": "FairWins, Inc.",
    "tagline": "Prediction Markets for Friends",
    "domains": ["fairwins.app"],       // globally unique across manifests (validator-enforced)
    "appUrl": "https://fairwins.app",
    "support": { "email": "Howdy@FairWins.App" },
    "social": { "x": "https://x.com/fairwins_app" },
    "legal": { "termsPath": "/terms", "privacyPath": "/privacy", "riskPath": "/risk" }
  },

  "brand": {
    "logo": "/assets/logo_fairwins.svg",
    "logoMark": "/assets/fairwins_no-text_logo.svg",
    "favicon": "/assets/logo_fairwins.svg",
    "pwa": {
      "name": "FairWins",
      "shortName": "FairWins",
      "themeColor": "#36B37E",
      "backgroundColor": "#0B1221"
    },
    "theme": {                          // CSS custom properties injected under .platform-<id>
      "light": { "--brand-primary": "#36B37E", "--brand-secondary": "…", "…": "…" },
      "dark":  { "--brand-primary": "…", "…": "…" }
    }
  },

  "settings": {
    "features": ["wagers", "pools", "predict", "collect", "earn", "bridge", "protect", "callsigns"],
    "chains": { "mainnet": [137, 1, 10, 8453, 42161, 61], "testnet": [80002, 63] },
    "membership": {                     // seeded tier pricing for the tenant's manager
      "tiers": { "bronze": 2, "silver": 8, "gold": 25, "platinum": 100 }
    },
    "fees": {                           // per-service bps, validated ≤ platform caps
      "polymarket.taker": 50
    },
    "gateway": { "relayerUrl": null, "bundlerUrls": {}, "paymaster": {} },
    "subgraph": { "urls": {} }          // per-chain, dedicated tenants only
  },

  "contractSet": {
    "mode": "shared",                   // "shared" (platform estate) | "dedicated"
    "saltPrefix": null                  // dedicated only; defaults to id — NEVER change after first deploy
  }
}
```

**Validation rules (validator-enforced, FR-008):**

- Required: `schemaVersion`, `id`, `lifecycle`, `identity.displayName`,
  `identity.domains` (≥1, each unique across ALL manifests, none equal to another
  tenant's), `brand.pwa.name`, `brand.theme` (both modes resolving every token
  `validateTheme.js` asserts), `settings.features` (⊆ known feature ids),
  `settings.chains` (⊆ supported chain ids; testnet/mainnet never mixed in one cohort
  list), `contractSet.mode`.
- Every `settings.fees` entry ≤ the platform cap for that service id.
- `mode: "dedicated"` + `lifecycle: "live"` requires, for every enabled chain, either a
  record at `deployments/tenants/<id>/<network>-chain<chainId>-v2.json` or the chain
  listed in `contractSet.pendingChains` (explicit, honest absence).
- `id` immutable once any deployment record exists (salt derivation depends on it).

### Contract Set (dedicated mode)

`deployments/tenants/<tenant-id>/<network>-chain<chainId>-v2.json` — **identical schema**
to the existing per-network records (network, chainId, deployer, treasury, paymentToken,
`contracts: { membershipManager, membershipManagerImpl, wagerRegistry, …, feeRouter }`).
The shared estate's existing `deployments/<network>-chain<id>-v2.json` files are the
default tenant's contract set.

Derivations:

- CREATE2 salt: `generateSalt(`${saltPrefix}:${contractIdentifier}`)` when a tenant is in
  scope; unprefixed (today's salts) for the default tenant → default addresses unchanged.
- Frontend generated set: `frontend/src/config/tenants/<id>.contracts.js`, written by
  `sync-frontend-contracts --tenant <id>`; consumed only when
  `VITE_TENANT_ID === <id>` and mode is dedicated.

### Active Tenant (frontend, build-time)

`frontend/src/config/tenant.js` resolves `VITE_TENANT_ID` (default `"fairwins"`) to a
frozen manifest object at build time. Accessors:

| Accessor | Returns | Notes |
|---|---|---|
| `getActiveTenant()` | full frozen manifest | throws at module init if id unknown (fail loudly) |
| `tenantBrand()` | identity + brand | drives titles, logos, PWA, share frames |
| `isFeatureEnabled(id)` | boolean | absent feature ⇒ nav/routes omit it |
| `tenantChainIds(cohort)` | number[] | intersected with build cohort rules (spec 071) |
| `tenantContractsForChain(chainId)` | address record \| undefined | dedicated: tenant set only; shared: existing shared lookup |
| `tenantThemeClass()` | `platform-<id>` | applied by ThemeContext |

### Instance

Not a stored object — an instance is (built bundle + serving config) for one tenant:
`VITE_TENANT_ID` + tenant URLs as build args, one service, one domain set, optional
tenant-scoped gateway process (`TENANT_ID` env + tenant record path) and subgraph.

### Lifecycle states

`draft → live ⇄ suspended → retired`. Enforced by the validator (e.g. a `draft` tenant
fails the build of a production instance; a `suspended` tenant builds only the
unavailability shell with the documented direct-claim path per FR-013). Transitions are
git commits to the manifest — auditable per SC-005.

## Relationships

```text
Tenant 1—1 Manifest
Tenant 1—0..N per-network Contract Set records (dedicated) — or —> shared estate (shared)
Tenant 1—1..N Domains (globally unique)
Tenant 1—0..1 gateway process, 0..N subgraph deployments
Manifest —build-time—> Active Tenant module —> every branded/config surface
```
