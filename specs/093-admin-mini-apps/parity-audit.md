# Spec 093 — functional parity audit (FR-005 / SC-002)

Every view of the monolithic AdminPanel, where it lives now, and how its controls/reads carried
over. "Re-hosted" = the component file is unchanged; only its mount moved. "Extracted" = the
inline JSX moved verbatim into an app component (handlers, gates, scope semantics, and copy
preserved; asserted by the migrated suites listed).

| Legacy tab | New home | Method | Controls/reads preserved | Guarding suite(s) |
|---|---|---|---|---|
| overview | Control Room (`ControlRoom.jsx`) + app dashboards | dissolved | System status → estate pause tile; Your Permissions card → Control Room (verbatim incl. unread-network disclosure); ServiceHealthCard → Infrastructure + Incident emergency; MembershipTreasuryOverview + fee estate tables → Membership & Revenue dashboard; Contract Addresses → Protocol Config dashboard | `adminEstateEntry`, `ControlRoom` |
| emergency | incident-response ▸ emergency | extracted | scoped pause/unpause (`useScopedChain`, call-site chain check, named-chain buttons/confirmations), ServiceHealthCard | `adminIncidentEstate` (source), `adminSidePanel` |
| moderation | incident-response ▸ moderation | extracted | freeze/unfreeze + reason (on-chain event), ENS, legal link, scoped chain | `adminIncidentEstate`, `moderationLinks` |
| deny-list | compliance ▸ deny-list | re-hosted | unchanged (`DenyListAdmin.jsx`) | `adminViewScope` (renders it) |
| miniapp-review | compliance ▸ miniapp-review | re-hosted | unchanged (`MiniAppReviewTab.jsx`), curator-vs-admin disclosure intact | `MiniAppReviewTab` suite |
| tiers | membership-revenue ▸ tiers | extracted | setTier pinned to `membershipChainId()`, no picker, wallet-there warning | `adminViewScope` (source), `adminApps` |
| members | membership-revenue ▸ members | extracted | grant/revoke membership, ENS, reference-chain pin | same |
| treasury | membership-revenue ▸ treasury | extracted | withdrawFees: one named chain, Max only on read balance, per-unit decimals/symbol, scope never follows wallet | `adminFeeEstate` (source assertions re-pointed) |
| fees | membership-revenue ▸ fees | re-hosted | unchanged (`FeesTab.jsx`) | `FeesTab` + axe suites |
| perps-fees | membership-revenue ▸ perps-fees | re-hosted | unchanged (`PerpsFeesPanel.jsx`); `onOpenFees` now navigates to `?view=fees` | `perpsFeesNav` (re-encoded) |
| bridge | liquidity ▸ bridge | re-hosted | unchanged (`BridgeTab.jsx`); `onOpenFees` gated cross-app link | `AdminBridgeTab`, `pauseNeverTraps` |
| supply | liquidity ▸ supply | re-hosted | unchanged (`SupplyTab.jsx`) | `AdminSupplyTab`, `pauseNeverTraps` |
| staking | protocol-config ▸ staking | re-hosted | unchanged (`StakingTab.jsx`) | staking suites |
| protocol-config | protocol-config ▸ protocol-config | re-hosted | unchanged (`ProtocolConfigTab.jsx`) | `adminViewScope` source list |
| oracle-adapters | protocol-config ▸ oracle-adapters | re-hosted | unchanged (`OracleAdaptersTab.jsx`) | `OracleAdaptersTab` suite |
| maintenance | maintenance ▸ maintenance | re-hosted | unchanged (`MaintenanceTab.jsx`); permissionless reachability preserved as its own always-visible app | `adminApps` (permissionless), `adminRoutes` |
| callsigns | identity ▸ callsigns | re-hosted | unchanged (`CallsignRegistryAdmin.jsx`) | `CallsignRegistryAdmin` suite |
| admin-roles | access-control ▸ admin-roles | extracted | all 11 role targets incl. per-router bridge/liquidity roles, `roleHomeContract()` mapping (ROLE_MANAGER reference-chain pinned), scoped chain, ENS, grant/revoke | `adminViewScope` (source), `adminApps` |
| services | infrastructure ▸ services | extracted | ServiceHealthCard + PaymasterOpsCard + runbook-operated controls disclosure | `appDashboards` |

Role-gate regressions: none — the matrix in `contracts/admin-app-config.md` is copied verbatim
from `buildAdminNavGroups` and enforced two ways (`adminApps.test.js` matrix; `ControlRoom.test.jsx`
render-vs-config parity per single flag).

Write-path semantics: `runTx` contract unchanged (`useAdminTx.test.jsx`); `useScopedChain` /
`WriteGate` / `writeGateReason` untouched (existing `adminScopeControls.test.jsx` still green);
membership writes still pinned; incident writes still single-chain with call-site refusal.

Deliberate non-parity (improvements, not losses):
- Views are now URL-addressable (`/admin/<app>?view=<id>`); the monolith had no view addresses.
- Denied accounts no longer trigger the fee-estate sweep (the monolith mounted `useFeeEstate`
  before its access gate; the gate is now also a data gate).
- Each app opens on a dashboard (new FR-006 surface) instead of landing mid-console.
- `NullifierTab.jsx` deleted — it was imported nowhere (dead code, not a reachable view).
