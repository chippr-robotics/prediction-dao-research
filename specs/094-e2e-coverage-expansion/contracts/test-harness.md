# Contract: Shared Test Harness

What the harness offers a test author, and what each piece guarantees. Implementation lives in
`frontend/cypress/support/`.

## `cy.a11yScan(options?)` — `support/a11y.js`

Runs the installed `axe-core` against the currently presented surface.

```js
cy.a11yScan()                                   // whole document
cy.a11yScan({ context: '.modal-root' })          // an open modal, NOT the page behind it
cy.a11yScan({ disableRules: [{ rule: 'color-contrast', issue: '#1019' }] })
```

| Guarantee | Why |
|---|---|
| Fails on `serious` and `critical` impact; logs `moderate` and `minor`. | Where WCAG 2.1 AA maps in axe's taxonomy, and where the signal stays usable. |
| The failure names rule id, impact, and failing selectors. | A violation nobody can locate does not get fixed. |
| `context` scopes the scan. | The app portals its modals; a document scan attributes the page's violations to the modal under test — the same defect as an unscoped `cy.contains`. |
| Every `disableRules` entry requires an `issue`. | Suppressions stay countable. The gate enforces it; the harness rejects an entry without one. |
| `axe-core` is injected by the runner, never imported by `frontend/src`. | It must never reach a production bundle. Gated by `harnessBoundary.test.js`. |
| A scan that could not run (axe failed to inject) fails. | An accessibility check that silently did nothing is a green gate over an absent test. |

Replaces the previous `cy.checkA11y`, which is deleted. That command guarded both its loops with
`if ($els.length > 0)` — it passed when there was nothing to check.

## Viewport profiles — `support/viewports.js`

```js
export const VIEWPORTS = {
  phone:   { width: 390, height: 844 },   // iPhone 12/13/14 logical viewport
  desktop: { width: 1280, height: 720 },  // today's configured default
}
```

| Guarantee | Why |
|---|---|
| The profile is selected by `CYPRESS_VIEWPORT_PROFILE` and applied in a global `beforeEach`. | A new spec is covered at both widths the day it lands, with no author action. |
| Default is `desktop`. | Every existing spec was written against 1280×720; the desktop leg is a no-op change, so a diff there is a real regression. |
| Only the no-chain tier runs both legs. | Responsive behaviour needs no chain; doubling a 30-minute chain tier to check reachability is what admission rule 1 forbids. |
| `cy.assertReachable(selector)` asserts the control is inside the layout viewport and not clipped by an ancestor, before it is operated. | `should('be.visible')` passes for an element scrolled outside a clipping container. Present is not reachable. |
| The active profile is logged at the top of every run. | A failure screenshot at an unknown width cannot be read. |

## Lighthouse

| File | Role |
|---|---|
| `frontend/lighthouse-routes.json` | The one route list. Both configs read it, so the profiles cannot drift apart. |
| `frontend/lighthouserc.desktop.json` | Desktop preset. |
| `frontend/lighthouserc.mobile.json` | Mobile preset (emulated device + throttling). |
| `scripts/e2e/check-lighthouse-coverage.js` | Fails when any route × profile produced no report. |

Budgets are baselined from current measurements and asserted at `warn`. The **unmeasured** case
fails: `lhci` asserts only over URLs it actually collected, so a route that failed to load
contributes nothing and leaves the job green — which is the shape of every gate this repo has had to
repair.

## Precondition helpers (existing — build on, do not re-invent)

| Helper | Guarantee |
|---|---|
| `chainCheckpoint` / `resetChainBetweenTests()` | Per-spec and per-test chain isolation. Call after the spec's own `before` so durable fixtures survive. |
| `chainRebase` | Moves the restore point forward without reverting. |
| `syncBrowserClockToChain()` | The app decides expiry in browser time, the contracts in chain time. |
| `chainTx` | Decodes custom errors — a reverting precondition says why. |
| `waitForWagerActive` / `waitForWagerResolved` | Judge by chain state, not by dialog wording. |
