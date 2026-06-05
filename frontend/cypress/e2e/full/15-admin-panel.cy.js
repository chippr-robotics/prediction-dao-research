/**
 * E2E Tests: Admin Panel (Full-tier)
 *
 * Requires a running Hardhat node with deployed contracts (chain 1337).
 * Verifies the admin control surface renders for an admin (account #0, which the
 * local deploy seeds with all admin roles) and that a non-admin is denied. These
 * are read-only UI assertions — no state-mutating transactions.
 *
 * Checklist: ADM-01..ADM-17
 */

const ADMIN = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'    // #0 — all admin roles
const NON_ADMIN = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65' // #4 — no roles

function connectThenVisitAdmin(account) {
  cy.mockWeb3Provider({ account })
  cy.visit('/fairwins')
  cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 }).click()
  cy.get('.connector-option:not(.unavailable)', { timeout: 5000 }).first().click()
  cy.get('.wallet-account-button, button[aria-label="Wallet Account"]', { timeout: 10000 }).should('be.visible')
  cy.visit('/admin')
}

describe('Admin Panel', () => {
  it('[ADM-01] an admin sees the control sections and the treasury-default withdrawal recipient', () => {
    connectThenVisitAdmin(ADMIN)

    // Tabs / sections render for an admin.
    cy.contains('button', /tiers/i, { timeout: 15000 }).should('be.visible')
    cy.contains('button', /account moderation/i).should('be.visible')
    cy.contains('button', /admin roles/i).should('be.visible')
    cy.contains('button', /treasury/i).should('be.visible')

    // Tier config controls.
    cy.contains('button', /tiers/i).click()
    cy.contains(/configure tier/i).should('be.visible')

    // Freeze / unfreeze controls.
    cy.contains('button', /account moderation/i).click()
    cy.contains(/freeze\s*\/\s*unfreeze/i).should('be.visible')

    // Treasury withdrawal: recipient pre-filled with the on-chain treasury address.
    cy.contains('button', /treasury/i).click()
    cy.contains(/treasury withdrawal/i).should('be.visible')
    cy.get('input[placeholder*="name.eth"]').invoke('val').should('match', /^0x[0-9a-fA-F]{40}$/)
  })

  it('[ADM-02] a non-admin is denied access to the admin panel', () => {
    connectThenVisitAdmin(NON_ADMIN)
    cy.contains(/access restricted/i, { timeout: 15000 }).should('be.visible')
    cy.contains(/configure tier/i).should('not.exist')
  })
})
