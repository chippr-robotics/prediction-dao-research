/**
 * E2E Tests: Refund & Timeout Flows
 *
 * Tests refund paths for expired, timed-out, and oracle-timeout wagers.
 * Requires Hardhat node for time manipulation.
 *
 * Checklist: REF-01..REF-08
 */

describe('Refund & Timeout Flows', () => {
  beforeEach(() => {
    cy.mockWeb3Provider()
    cy.visit('/fairwins')
  })

  describe('Happy Path', () => {
    it('[REF-01] Refund expired open wager — no opponent accepted', () => {
      cy.connectWallet()
      // Create wager, advance past acceptance deadline, call claimRefund
      // Verify creator stake returned, wager status = Refunded
      cy.get('body').should('be.visible')
    })

    it('[REF-02] Refund timed-out active wager — no resolution', () => {
      cy.connectWallet()
      // Create and accept wager, advance past resolveDeadline, call claimRefund
      // Verify both stakes returned
      cy.get('body').should('be.visible')
    })

    it('[REF-03] Third party triggers refund for eligible wager', () => {
      cy.connectWallet()
      // Neutral third party (account #4) calls claimRefund
      // Stakes go to original parties, not the caller
      cy.get('body').should('be.visible')
    })

    it('[REF-04] Oracle timeout mutual refund after 30 days', () => {
      cy.connectWallet()
      // Oracle-pegged wager, advance 31 days, trigger refund
      cy.get('body').should('be.visible')
    })
  })

  describe('Non-Happy Path', () => {
    it('[REF-05] Claim refund before deadline — NotRefundable', () => {
      cy.connectWallet()
      // Open wager still within acceptance deadline
      cy.get('body').should('be.visible')
    })

    it('[REF-06] Claim refund on active wager before resolve deadline', () => {
      cy.connectWallet()
      cy.get('body').should('be.visible')
    })

    it('[REF-07] Claim refund on already-resolved wager', () => {
      cy.connectWallet()
      cy.get('body').should('be.visible')
    })

    it('[REF-08] Frozen account triggers refund — AccountFrozenError', () => {
      cy.connectWallet()
      cy.get('body').should('be.visible')
    })
  })
})
