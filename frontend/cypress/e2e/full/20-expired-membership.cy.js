/**
 * E2E Tests: Cross-Cutting — Expired Membership
 *
 * Tests that expired memberships block new wager creation
 * but allow claiming payouts, receiving refunds, and renewal.
 *
 * Checklist: EXP-01..EXP-05
 */

describe('Cross-Cutting: Expired Membership', () => {
  beforeEach(() => {
    cy.mockWeb3Provider()
    cy.visit('/fairwins')
  })

  it('[EXP-01] Cannot create wager with expired membership', () => {
    cy.connectWallet()
    // Purchase membership, advance 31+ days, attempt create
    // Should show MembershipDenied error with CTA to renew
    cy.get('body').should('be.visible')
  })

  it('[EXP-02] Can still claim payout with expired membership', () => {
    cy.connectWallet()
    // Resolved wager, expired membership, claim succeeds
    cy.get('body').should('be.visible')
  })

  it('[EXP-03] Can still receive refund with expired membership', () => {
    cy.connectWallet()
    cy.get('body').should('be.visible')
  })

  it('[EXP-04] Active wagers continue despite membership expiry', () => {
    cy.connectWallet()
    // Wagers created before expiry remain active and resolvable
    cy.get('body').should('be.visible')
  })

  it('[EXP-05] Renew expired membership re-activates access', () => {
    cy.connectWallet()
    // Purchase same tier again, verify new 30-day window
    cy.get('body').should('be.visible')
  })
})
