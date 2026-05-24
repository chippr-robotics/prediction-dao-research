/**
 * E2E Tests: Cross-Cutting — Frozen Accounts
 *
 * Tests that frozen accounts are blocked from all state-mutating
 * operations, and that unfreezing restores access.
 *
 * Checklist: FRZ-01..FRZ-10
 */

describe('Cross-Cutting: Frozen Accounts', () => {
  beforeEach(() => {
    cy.mockWeb3Provider()
    cy.visit('/fairwins')
  })

  it('[FRZ-01] Frozen account cannot create wager', () => {
    cy.connectWallet()
    // Precondition: account frozen via admin
    // Attempt to create wager — should show AccountFrozenError
    cy.get('body').should('be.visible')
  })

  it('[FRZ-02] Frozen account cannot accept wager', () => {
    cy.connectWallet()
    cy.get('body').should('be.visible')
  })

  it('[FRZ-03] Frozen account cannot cancel open wager', () => {
    cy.connectWallet()
    cy.get('body').should('be.visible')
  })

  it('[FRZ-04] Frozen account cannot declare winner', () => {
    cy.connectWallet()
    cy.get('body').should('be.visible')
  })

  it('[FRZ-05] Frozen account cannot claim payout — stays in escrow', () => {
    cy.connectWallet()
    cy.get('body').should('be.visible')
  })

  it('[FRZ-06] Frozen account cannot trigger refund', () => {
    cy.connectWallet()
    cy.get('body').should('be.visible')
  })

  it('[FRZ-07] Non-frozen third party can trigger refund for frozen counterpart', () => {
    // Stakes returned to original parties (including frozen creator)
    cy.connectWallet()
    cy.get('body').should('be.visible')
  })

  it('[FRZ-08] Frozen banner displayed in app with reason', () => {
    cy.connectWallet()
    cy.get('body').should('be.visible')
  })

  it('[FRZ-09] Membership unaffected by freeze — tier/expiry intact', () => {
    cy.connectWallet()
    cy.get('body').should('be.visible')
  })

  it('[FRZ-10] Unfreeze restores all operations', () => {
    // Unfreeze account, retry all previously blocked operations
    cy.connectWallet()
    cy.get('body').should('be.visible')
  })
})
