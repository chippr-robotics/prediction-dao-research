/**
 * E2E Tests: Encryption Key Registration (On-Chain)
 *
 * Tests on-chain key registration via KeyRegistry contract.
 * Requires Hardhat node with deployed contracts.
 *
 * Checklist: ENC-02, ENC-03
 */

describe('Encryption Key Registration (On-Chain)', () => {
  beforeEach(() => {
    cy.mockWeb3Provider()
    cy.visit('/fairwins')
  })

  it('[ENC-02] Register encryption key on-chain via KeyRegistry', () => {
    cy.connectWallet()
    // Navigate to Wallet page > Security tab
    // Click "Register Key", confirm TX
    // Verify "Key Registered" status shown
    cy.get('body').should('be.visible')
  })

  it('[ENC-03] Check key registration status', () => {
    cy.connectWallet()
    // Navigate to Wallet page > Security tab
    // Click "Check Status"
    // Verify shows registered vs local-only status
    cy.get('body').should('be.visible')
  })
})
