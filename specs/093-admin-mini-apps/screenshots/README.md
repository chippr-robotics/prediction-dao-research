# Spec 093 — admin mini-apps screenshot record (actor-critic loop)

Harness: `scripts/ui/capture-admin-apps.mjs` (real Control Room + real app screens; data hooks
posed via throwaway vite aliases; network aborted so nothing depends on the internet). Matrix:
12 scenarios × {desktop 1280×900, mobile 390×844} × {light, dark} = 48 shots per round.

## Scenarios

| Shot prefix | Poses |
|---|---|
| `control-room-full` | every role incl. curator — full tile grid + headline statuses |
| `control-room-feeadmin` | FEE_ADMIN only — the granular-visibility story (2 tiles) |
| `control-room-denied` | no roles — "Access Restricted" |
| `control-room-unverified` | no chain answered — "Could Not Verify Access" + Retry |
| `membership-revenue-dashboard` | populated stats/sparkline/bars + partial & unreadable estate rows |
| `identity-dashboard` | populated registrations sparkline + lifecycle bars, truncated-window note |
| `compliance-dashboard` | populated review queue + catalog-by-status bars (incl. a zero row) |
| `infrastructure-dashboard` | gateway healthy + one RPC down + runway telemetry |
| `incident-dashboard-unreadable` | **deliberately degraded**: the pause estate sweep runs against an aborted network, photographing the unreadable tiles |
| `incident-emergency-view` | scope card + pause control + unreadable-state disclosure |
| `access-control-view` | role-target scope card + grant/revoke form |
| `membership-tiers-view` | reference-chain pin warning + the tier form |

Not photographed (cannot be posed honestly here): a real wallet-on-chain write flow, and the
re-hosted heavyweight views' interiors (Bridge/Supply/Fees/Staking/Oracle/Deny-list/Mini-app
review/Callsigns) — those views are unchanged by this feature and carry their own suites and,
where they exist, their own screenshot records (e.g. spec 067).

## Rounds

**Round 1 → 3 findings, all fixed:**

1. `lastReadAt.toLocaleTimeString is not a function` — the incident app passed epoch ms where
   `NetworkScopeCard` renders a `Date`. Caught by the harness before any shot; fixed in
   `IncidentResponseApp.jsx` (`setReadAt(new Date())`).
2. **`.admin-form` had no base styles anywhere** — labels, selects and inputs rendered as one
   inline run of text (visible in `membership-tiers-view` and every scope card). Pre-existing
   defect inherited from the monolith, in scope under US3 polish: added scoped
   `.admin-form > label` column layout + input/select/checkbox styles to `AdminPanel.css`
   (direct-child scoped so `.admin-form-row` grids keep their own layout).
3. **Chart honesty/composition nits** — the sparkline's end dot clipped at the frame edge
   (`PAD` 4→6 in `AdminSparkline`), and a zero-value bar rendered a 2px `min-width` sliver that
   read as "a little" (`AdminBarList` now renders no fill for zero).

**Round 2 → no findings.** Both themes, both viewports: tiles/chips legible and opaque, denied
and unverified states render their distinct sentences, dashboards show real posed data with
partial totals named, zero rows honest, forms stacked and readable, mobile stacks without
horizontal scroll, collapsed rail keeps every section reachable.

## Store-surfacing follow-up (Operator tools in the Apps catalog)

Three scenarios added to the matrix: `store-operator-tools` (all roles — 9 tools above the
registry groups), `store-feeadmin-pinned` (2 tools, one pinned, "★ Pinned" chip + pinned star
state), `store-member-control` (no roles — no operator section at all, the unchanged member
store).

**Round 1 → 1 finding, fixed:** the section's explainer was nested inside the group-title `<h4>`,
inheriting its uppercase/accent styling and rendering the whole heading centered with the accent
bar on top. Moved to its own `<p.miniapp-admin-tools-note>`; the heading now matches the registry
group titles exactly. **Round 2 → no findings** (both themes, both viewports; the fixed StoreBar
appearing mid-list in full-height element captures is a screenshot artifact — it is
viewport-fixed in use).
