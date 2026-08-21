// =============================================================================
// spec 041 T044 — returning user signs back in, on any device (US3)
//
// CDP virtual-authenticator flows (Chrome only). The synced-device scenario
// uses a second virtual authenticator carrying the SAME resident credential —
// the WebAuthn-level equivalent of platform credential sync.
// Tier gating mirrors onboarding-journey.cy.js (PASSKEY_ENABLED app build).
// =============================================================================

import {
  addCredential,
  addVirtualAuthenticator as addAuthenticator,
  choosePasskey,
  connectedAddress,
  expectConnected,
  getCredentials,
  isChromium,
  openAccountMenu,
  removeAuthenticator,
  resetAuthenticators,
} from '../../support/webauthn'

;(isChromium ? describe : describe.skip)('Returning passkey user (US3)', () => {
  beforeEach(function () {
    if (!Cypress.env('PASSKEY_ENABLED')) this.skip()
    cy.clearCookies()
    /*
     * RU-01 leaves its authenticator plugged in, and Chrome allows only ONE internal
     * authenticator per environment — so without this, RU-02's own `addAuthenticator` failed
     * with "Chrome only supports one internal authenticator per environment" and the synced-device
     * flow never ran. The collision is invisible from inside either test.
     */
    resetAuthenticators()
  })

  it('[RU-01] same device: reload restores silently; sign-in after sign-out is ONE prompt within budget (SC-005)', () => {
    addAuthenticator()
    cy.visit('/fairwins')
    cy.contains('button', /connect wallet/i).click()
    choosePasskey()
    expectConnected()
    connectedAddress().as('address')

    // Silent reconnect on reload — no ceremony, no connect button.
    cy.reload()
    cy.contains(/connect wallet/i).should('not.exist')
    // Reading the address back also settles the post-reload render, so the sign-out click below
    // is not racing it.
    cy.get('@address').then((address) => connectedAddress().should('equal', address))

    // Explicit sign-out, then a timed one-prompt sign-in (SC-005 ≤10 s). Disconnect lives in the
    // header account menu, so it has to be opened first.
    openAccountMenu()
    // The dropdown re-renders as the balance read settles, so bind to the button only once it is
    // actually interactive — otherwise the click races that update.
    cy.get('[aria-label="Disconnect wallet"]').should('be.visible').click()
    cy.contains('button', /connect wallet/i).should('exist')
    const start = Date.now()
    cy.contains('button', /connect wallet/i).click()
    // Second sign-in in the SAME browser: spec 045's explainer is once-only, so this one goes
    // straight to the ceremony — which is exactly what `choosePasskey` encodes.
    choosePasskey()
    cy.get('@address').then((address) => {
      expectConnected()
      connectedAddress()
        .should('equal', address)
        .then(() => {
          expect(Date.now() - start, 'sign-in wall clock (SC-005)').to.be.lessThan(10000)
        })
    })
  })

  it('[RU-02] synced device: the same credential on a second authenticator reaches the SAME account', () => {
    let credential
    addAuthenticator().then(({ authenticatorId }) => {
      cy.visit('/fairwins')
      cy.contains('button', /connect wallet/i).click()
      choosePasskey()
      expectConnected()
      connectedAddress().as('address')
      // Export the resident credential (the "sync" leg), then remove device A.
      cy.then(() =>
        getCredentials(authenticatorId).then(({ credentials }) => {
          credential = credentials[0]
          return removeAuthenticator(authenticatorId)
        })
      )
    })

    // Device B: fresh authenticator + the synced credential; cleared site data.
    cy.then(() =>
      addAuthenticator().then(({ authenticatorId: deviceB }) =>
        addCredential(deviceB, credential)
      )
    )
    cy.clearLocalStorage()
    cy.visit('/fairwins')
    cy.contains('button', /connect wallet/i).click()
    choosePasskey()
    cy.get('@address').then((address) => {
      // Same on-chain identity: address, funds, roles all follow (FR-009).
      expectConnected()
      connectedAddress().should('equal', address)
    })
  })
})
