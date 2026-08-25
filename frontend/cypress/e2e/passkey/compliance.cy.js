// =============================================================================
// spec 041 T055 — compliance parity for passkey accounts (US6/SC-008).
//
// The entry gate half lives HERE, in the no-chain tier, because it needs no
// chain: signing in with a passkey is a WebAuthn ceremony plus a local address
// derivation (connectors/passkey.js, useConnectorAvailability.js), and the gate
// is decided entirely in the browser. Admission rule 1 forbids spending
// on-chain-tier wall clock on a flow that can be validated without a chain.
//
// The flagged-address and membership-gate halves DO need a chain and live in
// `full/38-passkey-compliance.cy.js`.
// =============================================================================
import {
  addVirtualAuthenticator as addAuthenticator,
  choosePasskey,
  expectConnected,
  isChromium,
  resetAuthenticators,
} from '../../support/webauthn'

const GATE = '[role="dialog"][aria-labelledby="entry-gate-title"]'

;(isChromium ? describe : describe.skip)('Compliance parity for passkey accounts (US6)', () => {
  beforeEach(function () {
    /*
     * PASSKEY_ENABLED, not PASSKEY_FULL_STACK.
     *
     * This file was gated on the full stack — hardhat plus an alto bundler — and since nothing
     * sets that variable anywhere, all three of its tests were permanently pending while the
     * coverage matrix recorded the flow as covered (#1271). Nothing here needs a bundler: the
     * ceremony and the address derivation are local, and the entry gate is a browser decision.
     * PASSKEY_ENABLED IS set on the desktop fast leg, so this now runs.
     */
    if (!Cypress.env('PASSKEY_ENABLED')) this.skip()
    cy.clearLocalStorage()
    cy.clearCookies()
    // RU-01 leaves its authenticator plugged in and Chrome allows only ONE internal authenticator
    // per environment, so a stale one makes `addAuthenticator` throw from inside a later test.
    resetAuthenticators()
  })

  it('[CP-01] the entry gate is not bypassed by the passkey path, and clears the same way', () => {
    /*
     * Spec 007 makes the gate a LEGAL control, so the thing worth proving is that it binds on
     * every route in, not that it renders. A member arriving by passkey is a different code path
     * into the app than a member arriving by wallet — different connector, different session
     * store, no injected provider — and "the gate is modal" is a claim about the app, not about
     * one connector.
     *
     * `acknowledgeEntryGate: false` opts out of the suite-wide seed: every other spec
     * pre-acknowledges so the gate does not sit over the surface under test, and this one exists
     * to meet a browser that has never entered.
     */
    addAuthenticator()
    cy.visit('/fairwins', { acknowledgeEntryGate: false })

    cy.get(GATE, { timeout: 40000 }).should('be.visible')
    // Modal: a member who has not entered cannot reach the app behind it — including the control
    // that would start a passkey sign-in.
    cy.get(GATE).should('have.attr', 'aria-modal', 'true')

    /*
     * The negative that carries the claim: the connect control is UNREACHABLE while the gate
     * stands. If the passkey route could be started behind the gate, it would be a way around a
     * control the wallet route obeys, and nothing else in the suite would notice — every other
     * spec acknowledges first.
     *
     * Asserted by OCCLUSION, not by absence. The button is still in the DOM behind the overlay
     * (`should('not.exist')` fails, which is how this was found), and Cypress's own visibility
     * rules are about CSS rather than what is on top — so the honest check is what the browser
     * would actually hit at that point.
     */
    cy.contains('button', /connect wallet/i).then(($btn) => {
      const box = $btn[0].getBoundingClientRect()
      cy.document().then((doc) => {
        const onTop = doc.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        const reachable = Boolean(onTop) && (onTop === $btn[0] || $btn[0].contains(onTop))
        expect(reachable, 'the connect control cannot be hit while the gate stands').to.equal(false)
      })
    })

    // Entering clears it for this route exactly as it does for the wallet route (CG-01).
    cy.contains('button', /^Enter$/).click()
    cy.get(GATE).should('not.exist')

    /*
     * And the passkey path is then reachable and completes — parity means the gate DELAYS this
     * member, not that it excludes them.
     *
     * Wait for the settled shape before branching: entering can hand over with the connect modal
     * already open, and an unconditional click on the button behind it fails on its own backdrop.
     * Probing `body` before either shape has rendered is the trap `choosePasskey` documents.
     */
    cy.get('.connect-modal, button[aria-label="Connect Wallet"]', { timeout: 20000 }).should('exist')
    cy.get('body').then(($b) => {
      if ($b.find('.connect-modal').length === 0) cy.contains('button', /connect wallet/i).click()
    })
    choosePasskey()
    expectConnected()
  })
})
