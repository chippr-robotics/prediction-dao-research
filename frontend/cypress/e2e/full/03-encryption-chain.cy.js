/**
 * E2E Tests: Encryption Key Registration (On-Chain) — Full-tier
 *
 * Requires a running Hardhat node with deployed contracts (chain 1337).
 * Verifies a user can register their encryption public key on-chain via the
 * KeyRegistry (WalletPage → Security), and that registration status is reported
 * correctly. Uses fresh Hardhat accounts so before/after is deterministic on a
 * fresh node. The mock provides per-account signatures, so the registered key is
 * account-specific.
 *
 * Checklist: ENC-02, ENC-03
 */

const USER = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'   // #5 — registers a key here
const UNREG = '0x976EA74026E726554dB657fA54763abd0C3a0aa9'  // #6 — stays unregistered

function connectAs(account) {
  cy.mockWeb3Provider({ account })
  cy.visit('/fairwins')
  cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 }).click()
  cy.get('.connector-option:not(.unavailable)', { timeout: 5000 }).first().click()
  cy.get('.wallet-account-button, button[aria-label="Wallet Account"]', { timeout: 10000 }).should('be.visible')
}

describe('Encryption Key Registration (On-Chain)', () => {
  it('[ENC-02] registers an encryption key on-chain via KeyRegistry', () => {
    cy.hasRegisteredKey(USER).should('eq', false) // fresh node: not yet registered
    connectAs(USER)
    cy.registerEncryptionKeyViaUI(USER)
    cy.hasRegisteredKey(USER).should('eq', true) // key is now on-chain
    // The UI reflects the registered status: the "Register" CTA is gone and the
    // Security tab reports "Registered".
    cy.contains('button', /register encryption key/i).should('not.exist')
    cy.contains(/^\s*registered\s*$/i, { timeout: 10000 }).should('exist')
  })

  it('[ENC-03] registration status is reported correctly', () => {
    // A never-registered account reports "Not registered" on the Security tab.
    connectAs(UNREG)
    cy.visit('/wallet')
    cy.contains('button', /security/i, { timeout: 10000 }).click()
    cy.contains(/not registered/i, { timeout: 10000 }).should('be.visible')
    cy.hasRegisteredKey(UNREG).should('eq', false)
  })
})
