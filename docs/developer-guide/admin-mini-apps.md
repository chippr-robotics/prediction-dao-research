# Admin mini-apps (spec 093)

The operations control plane is no longer one monolithic panel. `/admin` is the **Control
Room** — a launcher listing exactly the admin apps the connected account's on-chain roles
unlock — and each group of admin controls is its own **admin mini-app** at `/admin/<appId>`,
lazily loaded, with `?view=<viewId>` addressing the views inside it.

## Host-bundled, deliberately

Admin apps ride the mini-app *presentation* (tiles, per-app routes, per-app gating) but are
first-party code compiled into the host — **not** spec-073 registry packages. The reasons are
structural, not preferences (research R1): the registry has no private/role-gated visibility
anywhere; the `host` object exposes no authority; packages cannot import `frontend/src`, where
every admin lib lives; and publishing would put admin UI bytes on public IPFS behind a curator
review loop. Do not "finish the job" by converting these to packages — by the platform's own
criterion (shared file closure), they are disqualified the same way Wagers is.

## One source of truth: `adminApps.js`

`frontend/src/components/admin/adminApps.js` defines every app, its views, and each view's role
gate (`specs/093-admin-mini-apps/contracts/admin-app-config.md` is the normative contract). The
Control Room tiles, the per-app rails, the route guard, and the least-privilege tests all read
this module. **Never introduce a second app→view→gate mapping** — two matrices is how a nav gate
and a render gate drift apart. The gates are copied verbatim from the retired
`buildAdminNavGroups`; changing one is a role-model change needing its own spec.

Adding a view to an existing app: add the view descriptor (gate included) to `ADMIN_APPS`, render
it in that app's `renderView`, and `adminApps.test.js` will hold you to totality and gating.
Adding a new app: descriptor + screen component under `admin/apps/` + a lazy entry in
`AdminAppRoute.jsx`.

## The shell owns the chrome

`AdminAppShell` renders the header (back link, name, badge), the collapsible view rail, and
resolves `?view=`. It renders a view **only when that view's own gate passes** — the same
predicate the Control Room used to list the app — and redirects unentitled operators to
`/admin`. The entry gate (`useAdminAccess` + `AdminAccessGate`) keeps the monolith's three-way
distinction: granted / "Access Restricted" (a definite no) / "Could Not Verify Access" (no chain
answered — never dressed as a denial). All data hooks mount *behind* the gate: a denied account
fetches nothing.

UI gating is presentation. The contracts' `onlyRole` checks are the security boundary; a
hand-typed URL past the matrix reaches nothing (the shell refuses render) and would be refused
on-chain regardless.

## Dashboards and the chart kit

Every app opens on a `dashboard` view (a reserved id, never a legacy tab). Charts come from
`admin/charts/`: `AdminSparkline`, `AdminBarList`, `AdminStatTile` — hand-rolled SVG/CSS on the
`--brand-primary` / chart tokens, no charting dependency. Their contract is honesty:

- `AdminStatTile` takes a spec-071 three-state `chainReadResult`; "zero because the read failed"
  has no code path. Unreadable renders as a sentence, never a number.
- `AdminBarList` prints every value as text (the bar is emphasis), renders **no** fill for a
  zero, and a `partial` annotation names the chains a distribution is missing.
- `AdminSparkline` renders an explicit empty state below two points — never an invented line —
  and its caption states which clock the x-axis carries (block numbers, usually).

Dashboards feed these from reads that already exist (fee estate, gateway status, catalog,
bounded event scans). No new indexing; a history source being down degrades that chart to its
labelled state while live state keeps rendering.

## Write semantics are unchanged

`useAdminTx` is the monolith's `runTx` verbatim (resolves `true`/`false`, never rejects — bulk
sequences observe the boolean). Scope rules are untouched: `useScopedChain` seeds once and never
follows the wallet; `writeGateReason`'s four sentences stand, including "unreadable stays
permissive" for killswitches; membership writes stay pinned to `membershipChainId()`; incident
controls act on exactly one named chain, refused at the call site as well as the button, and
there is deliberately no control that acts on several chains at once.

## Discovery: the store's "Operator tools" section and Quick Access pins

Admin apps also surface in the Apps store (FR-013/FR-014 follow-up) so operators can find and pin
them — **derived client-side, never from the registry**:

- `components/admin/adminToolCatalog.js` adapts `buildAdminApps(flags)` into store entries and
  owns the favorite-id namespace (`admin-tool:<appId>`, disjoint from registry integer ids; the
  appId is recoverable from the id alone).
- `components/admin/useOperatorFlags.js` reads the role flags tolerantly (no provider / no roles
  ⇒ no section) and deliberately WITHOUT the curator registry read — the store must not add a
  network round-trip for every member. A curator holding nothing else reaches curation via
  `/admin`, which asks the registry properly.
- The section renders only when at least one tool is derived, never under the verified-market
  badge, and independently of registry status (an unreachable registry does not take the
  operator's own tools down).
- Pins ride the existing favorites store (`lib/miniapps/favorites.js`) and the drawer's capped
  pinned strip; admin tiles show their NavIcon glyph (no registry record ⇒ no store artwork) and
  route to `/admin/<appId>`. A pin is a device-scoped shortcut: revoking the role later leaves
  the pin pointing at the access gate's honest refusal, exactly like a typed URL.

## Tests that gate this surface

- `test/admin/adminApps.test.js` — matrix totality + per-flag gating (replaces `adminNav.test.js`).
- `test/admin/ControlRoom.test.jsx` — render-gate ≡ config-gate per single flag (replaces the
  raw-source `adminLeastPrivilege` diff), tile-status honesty.
- `test/admin/adminRoutes.test.jsx` — unknown-id redirect, `?view=` resolution, denied-at-depth.
- `test/admin/adminEstateGuard.test.js` — recursive scan: no admin file resolves a contract from
  the wallet's chain, no cross-chain sums.
- `test/admin/adminCharts.test.jsx`, `appDashboards.test.jsx` — three-state honesty + axe.
- Screenshot record: `specs/093-admin-mini-apps/screenshots/` (actor-critic loop, harness at
  `scripts/ui/capture-admin-apps.mjs`).

See `specs/093-admin-mini-apps/` for the spec, plan, research, and parity audit.
