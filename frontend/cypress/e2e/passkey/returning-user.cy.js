// =============================================================================
// spec 041 T044 — returning user signs back in, on any device (US3)
//
// CDP virtual-authenticator flows (Chrome only). The synced-device scenario
// uses a second virtual authenticator carrying the SAME resident credential —
// the WebAuthn-level equivalent of platform credential sync.
// Tier gating mirrors onboarding-journey.cy.js (PASSKEY_ENABLED app build).
// =============================================================================

function cdp(command, params) {
  return Cypress.automation('remote:debugger:protocol', { command, params })
}

function addAuthenticator() {
  return cdp('WebAuthn.enable').then(() =>
    cdp('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
      },
    })
  )
}

const isChrome = Cypress.browser.family === 'chromium'

;(isChrome ? describe : describe.skip)('Returning passkey user (US3)', () => {
  beforeEach(function () {
    if (!Cypress.env('PASSKEY_ENABLED')) this.skip()
    cy.clearCookies()
  })

  it('[RU-01] same device: reload restores silently; sign-in after sign-out is ONE prompt within budget (SC-005)', () => {
    addAuthenticator()
    cy.visit('/fairwins')
    cy.contains('button', /connect wallet/i).click()
    cy.contains(/^passkey$/i).click()
    cy.get('[data-testid="passkey-account-address"]', { timeout: 15000 })
      .invoke('text')
      .as('address')

    // Silent reconnect on reload — no ceremony, no connect button.
    cy.reload()
    cy.contains(/connect wallet/i).should('not.exist')

    // Explicit sign-out, then a timed one-prompt sign-in (SC-005 ≤10 s).
    cy.contains(/sign out|disconnect/i).click({ force: true })
    cy.contains('button', /connect wallet/i).should('exist')
    const start = Date.now()
    cy.contains('button', /connect wallet/i).click()
    cy.contains(/^passkey$/i).click()
    cy.get('@address').then((address) => {
      cy.contains(new RegExp(String(address).slice(0, 8), 'i'), { timeout: 10000 })
        .should('exist')
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
      cy.contains(/^passkey$/i).click()
      cy.get('[data-testid="passkey-account-address"]', { timeout: 15000 })
        .invoke('text')
        .as('address')
      // Export the resident credential (the "sync" leg), then remove device A.
      cy.then(() =>
        cdp('WebAuthn.getCredentials', { authenticatorId }).then(({ credentials }) => {
          credential = credentials[0]
          return cdp('WebAuthn.removeVirtualAuthenticator', { authenticatorId })
        })
      )
    })

    // Device B: fresh authenticator + the synced credential; cleared site data.
    cy.then(() =>
      addAuthenticator().then(({ authenticatorId: deviceB }) =>
        cdp('WebAuthn.addCredential', { authenticatorId: deviceB, credential })
      )
    )
    cy.clearLocalStorage()
    cy.visit('/fairwins')
    cy.contains('button', /connect wallet/i).click()
    cy.contains(/^passkey$/i).click()
    cy.get('@address').then((address) => {
      // Same on-chain identity: address, funds, roles all follow (FR-009).
      cy.contains(new RegExp(String(address).slice(0, 8), 'i'), { timeout: 15000 }).should('exist')
    })
  })
})
