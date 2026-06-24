# Contract: Indexing + theme-aware frontend (US5/US10/US12/US13 + portal IA)

Covers the off-chain surfaces of the administration portal: subgraph indexing for the
holder cap table and activity history, and the theme-aware React portal that adapts the
imported `TokenMint.dc.html` design onto the app's theme. Maps to FR-027–FR-029,
FR-039, FR-042–FR-044. See research R13, R16.

## Subgraph — holders & activity via data-source templates (R13)

- Add a **data-source template** for an issued token (ABI: the v2 token). Instantiate it
  from the `TokenFactory.TokenCreated` handler (`TokenTemplate.create(token)`), so every
  token the factory deploys is indexed without per-token manifest edits.
- **`Holder`** entity: running balance per `(token, address)` from `Transfer`; derive
  cap-table `%` from indexed supply, `rank` by balance, `firstHeldAt`. (FR-039)
- **`TokenActivity`** entity: from `Transfer` + admin events (mint/burn, Paused/Unpaused,
  freeze, RoleGranted/Revoked) — `type, actor, tx, timestamp, detail`. (FR-042)
- The v2 templates MUST emit the admin events the activity feed needs (e.g. `Frozen`,
  role events from AccessControl, Paused/Unpaused from Pausable).
- **Subgraph-less networks (Mordor/ETC)**: no Graph node → cap table + activity are
  unavailable; the frontend shows a truthful disabled state (and may show the connected
  user's own `balanceOf`). Never fabricate rows (FR-043, SC-012).

## Frontend — theme-aware portal (R16)

- **Styling**: a scoped `frontend/src/components/tokens/tokens.css` maps the design's
  forest-green / IBM Plex language onto the app's existing theme variables
  (`--brand-primary`, `--surface-color`, `--text-primary/secondary/muted`,
  `--border-color`, `--semantic-active/warning/loss`, `--radius-*`, `--shadow-*`,
  `--transition-*`) so it respects **light/dark** mode. IBM Plex is scoped to the token
  module (serif headings, sans body, mono addresses); global typography is unchanged.
- **IA** (inside My Account → **Tokens** tab; no standalone page chrome):
  - **My Tokens**: summary metric strip + filter/search + table (standard, network,
    live supply, status; holders where indexed) → opens detail. (FR-027)
  - **Create**: standard cards + parameters + options (burnable/pausable/capped) +
    deployment-summary rail → real tx. (FR-045)
  - **Explorer**: public token table for the active network. (FR-029)
  - **Detail** sub-tabs, each shown only when valid for the token's standard + the
    caller's authority + network (FR-028, SC-014): Overview, Supply (mint/burn, cap
    progress), Transfer Controls (pause, freeze list), Compliance (allowlist, codes,
    default message — restricted only), Holders (cap table — indexed only), Activity
    (indexed only), Roles & Ownership (role grants, transfer/renounce), Contract
    (metadata, verification links, deployments, copy address/ABI — FR-044).
- **Capability detection**: probe each token's model (v2 `hasRole`/`getRoleMember` vs v1
  `owner()`) + standard + flags to render only supported controls. Real on-chain tx with
  honest pending/confirmed/failed state; no mock data.
- **Reads**: addresses via `sync:frontend-contracts`; holders/activity via subgraph with
  on-chain fallback/disable; live supply/cap/paused/roles via direct contract reads.

## Test contracts (acceptance)

- Matchstick: `TokenCreated` spawns the token data source; `Transfer` builds `Holder`
  balances; admin events build `TokenActivity`.
- Vitest: portal tabs render; detail sub-tabs gate by standard/authority; cap table +
  activity show a truthful disabled state when indexing is absent; theme tokens resolve
  in both light and dark; create flow previews + submits a real tx (mocked) with honest
  state; no fabricated rows anywhere.
