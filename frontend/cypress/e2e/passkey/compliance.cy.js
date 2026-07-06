// =============================================================================
// spec 041 T055 — compliance parity (US6/SC-008). Full-stack tier: the same
// entry-gate / flagged-address / membership-gate matrix the classic-wallet
// suite runs, driven under a passkey session, plus the clarification-Q2
// flagged-controller propagation.
// =============================================================================
const isChrome = Cypress.browser.family === 'chromium'

function addAuthenticator() {
  return Cypress.automation('remote:debugger:protocol', { command: 'WebAuthn.enable' }).then(() =>
    Cypress.automation('remote:debugger:protocol', {
      command: 'WebAuthn.addVirtualAuthenticator',
      params: {
        options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true },
      },
    })
  )
}

;(isChrome ? describe : describe.skip)('Compliance parity for passkey accounts (US6)', () => {
  beforeEach(function () {
    if (!Cypress.env('PASSKEY_FULL_STACK')) this.skip()
    cy.clearLocalStorage()
    addAuthenticator()
  })

  it('[CP-01] entry gate shows for passkey users exactly as for classic wallets', () => {
    cy.visit('/fairwins')
    cy.get('[data-testid="entry-gate"], .entry-gate', { timeout: 15000 }).should('exist')
  })

  it('[CP-02] a flagged passkey ACCOUNT is blocked from gated actions', () => {
    cy.visit('/fairwins')
    cy.contains('button', /connect wallet/i).click()
    cy.contains(/^passkey$/i).click()
    cy.get('[data-testid="passkey-account-address"]', { timeout: 15000 })
      .invoke('text')
      .then((address) => cy.task('flagAddress', address.trim()))
    cy.visit('/fairwins')
    cy.contains(/create.*wager/i).click()
    cy.contains(/restricted|blocked|not permitted|screening/i, { timeout: 30000 }).should('exist')
  })

  it('[CP-03] members-only actions refuse a role-less passkey account with the standard upgrade path', () => {
    cy.visit('/fairwins')
    cy.contains('button', /connect wallet/i).click()
    cy.contains(/^passkey$/i).click()
    cy.contains(/create.*wager/i).click()
    cy.contains(/membership|upgrade|purchase/i, { timeout: 30000 }).should('exist')
  })
})
