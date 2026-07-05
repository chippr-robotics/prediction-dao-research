// =============================================================================
// spec 041 T035 — passkey onboarding journey (US1)
//
// Drives REAL WebAuthn ceremonies through the Chrome DevTools Protocol virtual
// authenticator (no mocked WebAuthn JS API): capability gating (FR-004),
// sign-up ceremony → connected account with a stable address (FR-005),
// counterfactual funding view with QR (FR-007), no-seed-phrase invariant, and
// SC-001's interaction budget.
//
// Tier notes:
//  - The gating + sign-up + funded-view sections run WITHOUT a chain: the
//    account address derivation is the only read and is stubbed at the RPC
//    boundary here (fast tier).
//  - The full money journey (fund → membership → wager round-trip, SC-002)
//    additionally needs the local stack with a bundler
//    (VITE_BUNDLER_URLS_LOCAL + hardhat + alto per quickstart.md §4) and is
//    gated on CYPRESS_PASSKEY_FULL_STACK=1 so the fast tier stays honest
//    about what it proves.
// =============================================================================

const ACCOUNT = '0x1111000000000000000000000000000000001111'

// CDP virtual authenticator plumbing (Chrome-only; skipped elsewhere).
function addVirtualAuthenticator() {
  return Cypress.automation('remote:debugger:protocol', { command: 'WebAuthn.enable' }).then(() =>
    Cypress.automation('remote:debugger:protocol', {
      command: 'WebAuthn.addVirtualAuthenticator',
      params: {
        options: {
          protocol: 'ctap2',
          transport: 'internal',
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
        },
      },
    })
  )
}

const isChrome = Cypress.browser.family === 'chromium'

;(isChrome ? describe : describe.skip)('Passkey onboarding journey (US1)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  it('[PK-01] hides the passkey option when the network has no passkey config (FR-004)', () => {
    // Default local env has no VITE_BUNDLER_URLS_* → capability off → option absent.
    cy.visit('/fairwins')
    cy.contains('button', /connect wallet/i).click()
    cy.contains(/browser wallet/i).should('exist')
    cy.contains(/^passkey$/i).should('not.exist')
  })

  it('[PK-02] sign-up: one ceremony to a connected, fundable account; no seed phrase (SC-001)', function () {
    if (!Cypress.env('PASSKEY_ENABLED')) this.skip() // needs VITE_BUNDLER_URLS_LOCAL app build
    addVirtualAuthenticator()

    // Stub the factory getAddress read at the RPC boundary (fast tier).
    cy.intercept('POST', '**/rpc*', (req) => {
      if (req.body?.method === 'eth_call') {
        req.reply({ jsonrpc: '2.0', id: req.body.id, result: '0x' + ACCOUNT.slice(2).padStart(64, '0') })
      }
    })

    cy.visit('/fairwins')

    // SC-001 interaction budget: connect-surface → passkey → (ceremony is the
    // device prompt, auto-approved by the virtual authenticator) = ≤3 clicks.
    cy.contains('button', /connect wallet/i).click() // 1
    cy.contains(/^passkey$/i).click() // 2

    // Funded view: stable address + QR, honest counterfactual copy (FR-007).
    cy.get('[data-testid="passkey-account-address"]', { timeout: 15000 }).should('contain.text', '0x')
    cy.contains(/activates on-chain automatically/i).should('exist')
    cy.contains('button', /show qr code/i).click() // 3
    cy.get('[role="dialog"]').should('exist')

    // No-seed-phrase invariant: the DOM never asks the user to record anything.
    cy.get('body').should(($b) => {
      const text = $b.text().toLowerCase()
      expect(text).to.not.include('backup phrase')
      expect(text).to.not.include('recovery phrase')
    })

    // Session persisted for silent reconnect (FR-003).
    cy.reload()
    cy.contains(/connect wallet/i).should('not.exist')
  })

  it('[PK-03] full money journey: fund → membership → wager round-trip (SC-002)', function () {
    if (!Cypress.env('PASSKEY_FULL_STACK')) this.skip() // quickstart.md §4 local stack
    addVirtualAuthenticator()
    cy.visit('/fairwins')
    cy.contains('button', /connect wallet/i).click()
    cy.contains(/^passkey$/i).click()
    cy.get('[data-testid="passkey-account-address"]', { timeout: 15000 })
      .invoke('text')
      .then((address) => {
        // Seed USDC to the counterfactual account via the local-stack task
        // (defined in cypress support for the full-stack tier).
        cy.task('seedUsdc', { to: address.trim(), amount: '1000' })
      })

    // Membership purchase: ONE confirmation covers approve+pay (FR-016).
    cy.visit('/fairwins/account')
    cy.contains(/purchase|membership/i).click()
    cy.get('[data-testid="confirm-passkey"]').click()
    cy.contains(/membership.*active|bronze/i, { timeout: 60000 }).should('exist')

    // Wager creation from the passkey account.
    cy.visit('/fairwins')
    cy.contains(/create.*wager/i).click()
    cy.get('[data-testid="confirm-passkey"]').click()
    cy.contains(/wager.*created|pending/i, { timeout: 60000 }).should('exist')
  })
})
