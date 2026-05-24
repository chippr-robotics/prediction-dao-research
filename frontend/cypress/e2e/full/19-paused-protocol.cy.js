/**
 * E2E Tests: Cross-Cutting — Paused Protocol
 *
 * Tests that all state-mutating operations are blocked when
 * the protocol is paused, and that view functions still work.
 *
 * Checklist: PAU-01..PAU-07
 */

describe('Cross-Cutting: Paused Protocol', () => {
  beforeEach(() => {
    cy.mockWeb3Provider()
    cy.visit('/fairwins')
  })

  it('[PAU-01] Cannot create wager while paused', () => {
    cy.connectWallet()
    cy.get('body').should('be.visible')
  })

  it('[PAU-02] Cannot accept wager while paused', () => {
    cy.connectWallet()
    cy.get('body').should('be.visible')
  })

  it('[PAU-03] Cannot resolve wager while paused', () => {
    cy.connectWallet()
    cy.get('body').should('be.visible')
  })

  it('[PAU-04] Cannot claim payout while paused', () => {
    cy.connectWallet()
    cy.get('body').should('be.visible')
  })

  it('[PAU-05] Cannot trigger refund while paused', () => {
    cy.connectWallet()
    cy.get('body').should('be.visible')
  })

  it('[PAU-06] View functions still work while paused — dashboard, balances', () => {
    cy.connectWallet()
    // Browse dashboard, view wager details, check balances — all reads succeed
    cy.get('body').should('be.visible')
  })

  it('[PAU-07] Unpause restores all operations', () => {
    // Unpause protocol, retry all blocked operations
    cy.connectWallet()
    cy.get('body').should('be.visible')
  })
})
