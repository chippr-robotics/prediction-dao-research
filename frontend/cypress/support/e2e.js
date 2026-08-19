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
})

/*
 * FULL-TIER CHAIN ISOLATION. Before each full/** spec, revert the local chain to the post-seed
 * checkpoint and re-snapshot (see chainCheckpoint in cypress.config.js). Eight full specs move
 * the chain clock forward and chain time cannot move back, so without this the specs that pass
 * are a function of run order, not of the product. Guarded by path: the fast and passkey tiers
 * run with no chain at all, and a task probing :8545 there would fail runs that are correct.
 */
before(() => {
  if (Cypress.spec.relative.includes('e2e/full/')) {
    cy.task('chainCheckpoint').then(({ reverted }) => {
      cy.log(`chain checkpoint (reverted previous state: ${reverted})`)
    })
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
