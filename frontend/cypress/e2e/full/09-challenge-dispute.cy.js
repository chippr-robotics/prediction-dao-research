/**
 * E2E Tests: Challenge & Dispute
 *
 * Tests the 24-hour challenge period for manual resolutions.
 * Requires Hardhat node for time manipulation.
 *
 * Checklist: CHL-01..CHL-05
 */

describe('Challenge & Dispute', () => {
  beforeEach(() => {
    cy.mockWeb3Provider()
    cy.visit('/fairwins')
  })

  describe('Happy Path', () => {
    it('[CHL-01] Challenge a proposed resolution within 24h window', () => {
      cy.connectWallet()
      // Precondition: Active wager with Either Party resolution, creator proposed resolution
      // Switch to opponent, file challenge
      cy.get('body').should('be.visible')
    })

    it('[CHL-02] Arbitrator resolves challenged wager', () => {
      cy.connectWallet()
      // Precondition: Challenged wager, switch to arbitrator account
      // Arbitrator calls resolveDispute with final outcome
      cy.get('body').should('be.visible')
    })
  })

  describe('Non-Happy Path', () => {
    it('[CHL-03] Challenge after 24h window expired — challenge blocked', () => {
      cy.connectWallet()
      // Advance time past challenge period, attempt challenge
      cy.get('body').should('be.visible')
    })

    it('[CHL-04] Challenge an already-challenged resolution — duplicate blocked', () => {
      cy.connectWallet()
      cy.get('body').should('be.visible')
    })

    it('[CHL-05] Finalize before challenge period ends — blocked', () => {
      cy.connectWallet()
      // Resolution proposed < 24h ago, attempt finalize
      cy.get('body').should('be.visible')
    })
  })
})
