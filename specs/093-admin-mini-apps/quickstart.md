# Quickstart: validating Admin Mini-Apps (093)

## Prerequisites

- `npm run deps:reinstall` has been run at least once on this checkout (never bare
  `npm install` — see the monorepo-workspace skill).
- A browser wallet (or the dev harness) able to present accounts with different role sets.

## Scoped test runs (local — never run the full unfiltered vitest suite locally)

```bash
# The new single-source config + route/gating suites
npx vitest run frontend/src/test/admin/adminApps.test.js \
               frontend/src/test/admin/ControlRoom.test.jsx \
               frontend/src/test/admin/adminRoutes.test.jsx \
               frontend/src/test/admin/adminCharts.test.jsx

# The migrated invariants
npx vitest run frontend/src/test/admin/

# Brand + boundary gates that must stay green
npx vitest run frontend/src/test/brand/ frontend/src/test/miniapps/packageBoundary.test.js
```

Expected: all pass; the admin suites include the three-way entry gate, least-privilege parity,
view scope, incident single-chain, and estate-guard invariants.

## Manual validation (dev server)

```bash
npm run frontend
```

1. **Granular visibility (US1 / SC-001)** — connect an account holding exactly one role (e.g.
   FEE_ADMIN): `/admin` shows the Membership & Revenue tile (fees + perps-fees views only) plus
   Maintenance, nothing else. Repeat for each flag per the gate matrix in
   [contracts/admin-app-config.md](./contracts/admin-app-config.md).
2. **Denied experiences** — a role-less account at `/admin` and at `/admin/liquidity?view=supply`
   sees "Access Restricted" (or "Could Not Verify Access" + Retry when no chain answered), with
   no admin reads issued (network tab).
3. **Parity (US2 / SC-002)** — with a full-admin account, walk every view listed in the gate
   matrix and exercise one read per view; confirm every control from the legacy panel is present
   in its app (parity checklist in tasks.md).
4. **Dashboards (US3 / SC-003)** — each app opens on its dashboard; charts render real data on a
   populated network, explicit "No recorded activity" on a fresh one, and a labelled
   partial/unreadable state when an RPC is blackholed (devtools request blocking).
5. **Addresses (US4 / SC-004)** — `/admin` lands on the Control Room; `/admin/<appId>` and
   `?view=` deep links land correctly; unknown app id redirects to `/admin`.
6. **Style/a11y** — run the axe suites; visually confirm both themes; verify no hardcoded colors
   (`npx vitest run frontend/src/test/brand/`).

## Screenshot validation

Use the `actor-critic-screens` skill (capture harness) across both themes and viewports for the
Control Room and at least three app dashboards before shipping.

## What "done" looks like

- All spec success criteria (SC-001…SC-006) checked off against the flows above.
- `frontend/src/components/AdminPanel.jsx` no longer renders tabs (Control Room replaced it);
  no orphaned admin components remain (research R8).
- CI: full vitest suite, brand gates, axe, lint green.
