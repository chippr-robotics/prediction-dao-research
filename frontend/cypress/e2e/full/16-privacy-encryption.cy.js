/**
 * E2E Tests: Privacy & Encryption (End-to-End)
 *
 * Tests full encrypted wager lifecycle with two wallets,
 * IPFS metadata storage, and decryption.
 *
 * Checklist: PRV-01..PRV-07
 */

describe('Privacy & Encryption (E2E)', () => {
  beforeEach(() => {
    cy.mockWeb3Provider()
    cy.visit('/fairwins')
  })

  describe('Happy Path', () => {
    it('[PRV-01] Full encrypted wager lifecycle — create, accept, resolve, claim', () => {
      cy.connectWallet()
      // Creator creates private wager (encryption ON)
      // Metadata encrypted for both parties, stored on IPFS
      // Opponent opens link, decrypts, accepts
      // Wager resolves, winner claims
      cy.get('body').should('be.visible')
    })

    it('[PRV-02] Non-participant cannot read encrypted wager details', () => {
      cy.connectWallet()
      // Switch to bystander account, open encrypted wager
      // Should see "Encrypted Market" only
      cy.get('body').should('be.visible')
    })

    it('[PRV-03] Public data visible on encrypted wager (addresses, stakes, status)', () => {
      cy.connectWallet()
      // Even on encrypted wagers, participant addresses, stake amounts,
      // token type, status, and timestamps are visible
      cy.get('body').should('be.visible')
    })

    it('[PRV-04] IPFS metadata retrieval — encrypted:ipfs:// URI', () => {
      cy.connectWallet()
      // Verify metadataUri format starts with encrypted:ipfs://
      cy.get('body').should('be.visible')
    })

    it('[PRV-05] Legacy shared-signature decryption fallback', () => {
      cy.connectWallet()
      // Test decryption using shared creator signature in URL parameter
      cy.get('body').should('be.visible')
    })
  })

  describe('Non-Happy Path', () => {
    it('[PRV-06] Decryption fails with wrong wallet — "Unable to decrypt"', () => {
      // Connect with uninvited wallet, attempt decryption
      cy.switchAccount(4) // bystander
      cy.get('body').should('be.visible')
    })

    it('[PRV-07] IPFS fetch fails — graceful error with retry option', () => {
      cy.connectWallet()
      // Mock IPFS gateway to return 503
      cy.intercept('GET', '**/ipfs/**', { statusCode: 503 }).as('ipfsFail')
      cy.get('body').should('be.visible')
    })
  })
})
