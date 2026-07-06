// =============================================================================
// spec 041 T053 — losing a device is not losing the money (US5/SC-007).
// Scenario (a) synced credential and (b) second passkey ride the virtual
// authenticator; (c) linked wallet uses the mock provider; (d) asserts the
// warning moments for a single-credential account.
// =============================================================================
const isChrome = Cypress.browser.family === 'chromium'

function cdp(command, params) {
  return Cypress.automation('remote:debugger:protocol', { command, params })
}
function addAuthenticator() {
  return cdp('WebAuthn.enable').then(() =>
    cdp('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true },
    })
  )
}

;(isChrome ? describe : describe.skip)('Device-loss recovery (US5)', () => {
  beforeEach(function () {
    if (!Cypress.env('PASSKEY_FULL_STACK')) this.skip()
    cy.clearLocalStorage()
  })

  it('[RC-01] synced credential on a new device recovers full control unaided', () => {
    let credential, authA
    addAuthenticator().then(({ authenticatorId }) => {
      authA = authenticatorId
      cy.visit('/fairwins')
      cy.contains('button', /connect wallet/i).click()
      cy.contains(/^passkey$/i).click()
      cy.get('[data-testid="passkey-account-address"]', { timeout: 15000 }).invoke('text').as('address')
      cy.then(() =>
        cdp('WebAuthn.getCredentials', { authenticatorId: authA }).then(({ credentials }) => {
          credential = credentials[0]
          return cdp('WebAuthn.removeVirtualAuthenticator', { authenticatorId: authA }) // device lost
        })
      )
    })
    cy.then(() => addAuthenticator().then(({ authenticatorId }) => cdp('WebAuthn.addCredential', { authenticatorId, credential })))
    cy.clearLocalStorage() // brand-new browser too
    cy.visit('/fairwins')
    cy.contains('button', /connect wallet/i).click()
    cy.contains(/^passkey$/i).click()
    cy.get('@address').then((address) => {
      cy.contains(new RegExp(String(address).slice(0, 8), 'i'), { timeout: 15000 }).should('exist')
    })
  })

  it('[RC-04] single-credential accounts see the warning at every mandated moment (FR-021)', () => {
    addAuthenticator()
    cy.visit('/fairwins')
    cy.contains('button', /connect wallet/i).click()
    cy.contains(/^passkey$/i).click()
    // Moment 1: creation
    cy.get('[data-testid="device-loss-warning-creation"]', { timeout: 15000 }).should('exist')
    // Moment 2: first funding view
    cy.task('seedUsdcForActiveSession')
    cy.visit('/fairwins/account')
    cy.get('[data-testid="device-loss-warning-first-funding"]').should('exist')
    // Moment 3: membership purchase entry
    cy.contains(/membership/i).click()
    cy.get('[data-testid="device-loss-warning-membership-purchase"]').should('exist')
  })
})
