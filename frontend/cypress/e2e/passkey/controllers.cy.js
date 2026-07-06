// =============================================================================
// spec 041 T050 — controllers management (US4). Full-stack tier: needs the
// local chain + bundler (quickstart.md §4 row 4); virtual-authenticator
// ceremonies are real. The on-chain enforcement half (removed owner cannot
// sign, last-owner revert) is ALSO pinned chain-side in test/account/ — this
// spec proves the UI drives those paths.
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

;(isChrome ? describe : describe.skip)('Controllers panel (US4)', () => {
  beforeEach(function () {
    if (!Cypress.env('PASSKEY_FULL_STACK')) this.skip()
    cy.clearLocalStorage()
    addAuthenticator()
    cy.visit('/fairwins')
    cy.contains('button', /connect wallet/i).click()
    cy.contains(/^passkey$/i).click()
    cy.get('[data-testid="passkey-account-address"]', { timeout: 15000 }).should('exist')
    // Activate the account (first action) so controller mutations are live.
    cy.task('seedUsdcForActiveSession')
    cy.visit('/fairwins/account')
  })

  it('[CT-01] add a second passkey: both controllers listed; warning clears', () => {
    cy.get('[data-testid="single-controller-warning"]').should('exist')
    cy.contains('button', /add a passkey/i).click()
    cy.contains(/this device/i, { timeout: 60000 }).should('exist')
    cy.get('[data-testid^="controller-"]').should('have.length.at.least', 2)
    cy.get('[data-testid="single-controller-warning"]').should('not.exist')
  })

  it('[CT-02] remove a controller on-chain; the last one is not removable', () => {
    cy.contains('button', /add a passkey/i).click()
    cy.get('[data-testid^="controller-"]', { timeout: 60000 }).should('have.length.at.least', 2)
    cy.get('[aria-label^="Remove"]').last().click()
    cy.get('[data-testid^="controller-"]', { timeout: 60000 }).should('have.length', 1)
    cy.get('[aria-label^="Remove"]').should('be.disabled') // last controller
  })

  it('[CT-03] link-wallet refuses a flagged address before any transaction', () => {
    cy.task('flagAddress', '0xcccccccccccccccccccccccccccccccccccccccc')
    cy.get('input[aria-label="Wallet address to link"]').type('0xcccccccccccccccccccccccccccccccccccccccc')
    cy.contains('button', /link wallet/i).click()
    cy.contains(/flagged/i, { timeout: 30000 }).should('exist')
    cy.get('[data-testid^="controller-"]').should('have.length', 1) // nothing linked
  })
})
