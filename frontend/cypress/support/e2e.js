// ***********************************************************
// This example support/e2e.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands'
// Spec 094: the shared harness — accessibility scanning and viewport profiles.
import './a11y'
import { activeProfile, VIEWPORTS } from './viewports'

/*
 * VIEWPORT PROFILE, applied globally (spec 094 FR-019). Selected by CYPRESS_VIEWPORT_PROFILE and
 * defaulting to desktop — the 1280×720 every existing spec was written against, so the desktop leg
 * is a no-op change. Applied here rather than per spec because a spec that sets its own viewport
 * inherits desktop forever, and the phone leg then quietly stops growing as specs are added.
 */
before(() => {
  const profile = activeProfile()
  const { width, height } = VIEWPORTS[profile]
  cy.log(`viewport profile: ${profile} (${width}×${height})`)
})

beforeEach(() => {
  const { width, height } = VIEWPORTS[activeProfile()]
  cy.viewport(width, height)

  /*
   * Dismiss the DEV-ONLY development warning banner before every test.
   *
   * It is `position: fixed` at the top of the page and reserves space through a HARDCODED
   * `--dev-banner-height: 45px`. At 390px the text wraps to three lines, the banner becomes far
   * taller than 45px, and it covers the fixed wallet-connect button — which is how the phone leg
   * failed seven wallet-connection tests on its first run, with "not visible ... covered by
   * another element: div.dev-warning-banner".
   *
   * Dismissing rather than working around it: the banner never ships to production (it is a dev
   * build affordance), so a spec that scrolls or waits around it would be paying attention to
   * something no member ever sees. The banner's own wrap/height bug is real and tracked separately
   * — this line stops it from being reported as thirteen unrelated test failures.
   *
   * Set from `window:before:load`, not `cy.window()`. Before the first `cy.visit()` there is no app
   * origin to write to, and most specs call `cy.clearLocalStorage()` in their own `beforeEach`,
   * which runs after this one — either way a value written here would be gone by the time the app
   * boots. The load hook fires on every visit, on the right origin, before app code runs. It is
   * registered here (not at file scope) because Cypress clears listeners between tests, and it is
   * registered BEFORE the visit it needs to affect — the ordering trap that is anti-pattern 4 in
   * the tiering policy.
   */
  cy.on('window:before:load', (win) => {
    win.localStorage.setItem('dev_warning_banner_dismissed', 'true')
  })
})

/*
 * FULL-TIER CHAIN ISOLATION. Before each full/** spec, revert the local chain to the post-seed
 * checkpoint and re-snapshot (see chainCheckpoint in cypress.config.js). Eight full specs move
 * the chain clock forward and chain time cannot move back, so without this the specs that pass
 * are a function of run order, not of the product. Guarded by path: the fast and passkey tiers
 * run with no chain at all, and a task probing :8545 there would fail runs that are correct.
 *
 * And resync the BROWSER clock right after: `__cyTimeOffsetMs` (commands.js) lives at module
 * scope, so it is NOT a per-spec value — it survives for the whole `cypress run` process the
 * same way the chain snapshot id does, but nothing was rewinding it to match. A spec with no
 * cy.advanceTime of its own (10-claim-payouts) run after one that made heavy use of it
 * (07-manual-resolution, which racks up 250+ days across its RES-09/RES-14/etc. jumps) inherited
 * that offset wholesale: the chain reverted to real time here, the browser stayed 250+ days
 * "ahead", and a wager created fresh in this spec read back as already past its own end date —
 * CLM-10 failed exactly this way despite doing nothing wrong itself. `resetChainBetweenTests()`
 * already re-syncs on every test for specs that opt into it; this is the same fix at the spec
 * boundary, unconditionally, so a spec that never calls cy.advanceTime never has to think about
 * a clock some earlier spec left behind.
 */
before(() => {
  if (Cypress.spec.relative.includes('e2e/full/')) {
    cy.task('chainCheckpoint').then(({ reverted }) => {
      cy.log(`chain checkpoint (reverted previous state: ${reverted})`)
    })
    cy.syncBrowserClockToChain()
  }
})

/*
 * PER-TEST chain isolation, opt-in. A spec whose every test advances the clock poisons its own
 * later tests, not just the next spec: the create form computes deadlines from BROWSER time, so
 * once the chain sits days ahead the registry rejects the create with BadDeadlines and the test
 * fails somewhere far from the cause ("Wager Created" never appears). A spec-level checkpoint
 * cannot help — by the second test the damage is already inside the spec.
 *
 * Opt in from inside the describe block. Deliberately NOT global: specs that carry state across
 * tests on purpose (16-privacy creates a private wager in before-all and decrypts it later,
 * 05 accepts in one test an offer another created) would have that state reverted underneath them.
 */
export function resetChainBetweenTests() {
  /*
   * CALL THIS AFTER the spec's own `before` hook, not at the top of the describe. Mocha runs
   * same-level hooks in declaration order, and the rebase has to land AFTER any durable fixture
   * the spec sets up (encryption keys, capacity) — otherwise every per-test revert wipes it.
   */
  before(() => {
    cy.task('chainRebase')
  })
  beforeEach(() => {
    cy.task('chainCheckpoint')
    /*
     * The revert rewinds CHAIN time under a browser that never noticed. Re-point the browser
     * clock at the chain so the app's expiry decisions and the registry's agree.
     */
    cy.syncBrowserClockToChain()
  })
}

// Alternatively you can use CommonJS syntax:
// require('./commands')

// Disable uncaught exception failures for Web3 errors
Cypress.on('uncaught:exception', (err) => {
  // Log errors for debugging
  console.error('Uncaught exception:', err.message)
  
  // Ignore ResizeObserver errors (harmless browser errors)
  if (err.message.includes('ResizeObserver')) {
    return false
  }
  
  // Ignore Web3 provider errors during testing
  if (err.message.includes('MetaMask') || 
      err.message.includes('ethereum') ||
      err.message.includes('provider') ||
      err.message.includes('Web3') ||
      err.message.includes('process is not defined') ||
      err.message.includes('Cannot read properties of undefined')) {
    return false
  }
  // Let other errors fail the test
  return true
})

// Add beforeEach hook to check for console errors (optional)
beforeEach(() => {
  cy.window().then(() => {
    // Optionally stub console.error to catch app errors
    // Commented out by default to avoid false positives
    // cy.stub(win.console, 'error').as('consoleError')
  })
})
