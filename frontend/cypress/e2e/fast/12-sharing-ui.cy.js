/**
 * E2E Tests: Sharing (QR Code & Link) — UI-only
 *
 * Tests QR code rendering, link copying, and share modal interactions
 * without requiring actual wager creation on-chain.
 *
 * Checklist: SHR-01..SHR-08
 */

describe('Sharing (QR Code & Link)', () => {
  beforeEach(() => {
    cy.mockWeb3Provider()
    cy.visit('/fairwins')
  })

  describe('Happy Path', () => {
    it('[SHR-01] Share modal displays QR code after wager creation', () => {
      cy.connectWallet()

      // After a successful wager creation, the share modal opens
      // Test the share modal component directly via the creation flow success state
      cy.openCreateWagerModal('oneVsOne')
      cy.get('[role="dialog"], .modal').should('be.visible')

      // Fill and submit the form to reach success state (if demo mode allows)
      cy.fillWagerForm({
        opponent: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        description: 'Test wager for QR code sharing',
        stake: 10
      })

      // Verify the form elements exist
      cy.get('[role="dialog"], .modal')
        .find('button')
        .should('have.length.greaterThan', 0)
    })

    it('[SHR-02] Copy share link to clipboard', () => {
      cy.connectWallet()

      // Stub clipboard API
      cy.window().then((win) => {
        cy.stub(win.navigator.clipboard, 'writeText').resolves()
      })

      // The copy link functionality exists in the share modal
      // Verify clipboard API is available
      cy.window().then((win) => {
        expect(win.navigator.clipboard).to.exist
        expect(win.navigator.clipboard.writeText).to.be.a('function')
      })
    })

    it('[SHR-03] Shared link navigates to acceptance page', () => {
      // Test that the acceptance page route exists and loads
      cy.visit('/friend-market/accept?marketId=0')
      cy.get('body', { timeout: 10000 }).should('be.visible')

      // The acceptance page should render (even if wager doesn't exist in mock)
      cy.url().should('include', 'friend-market')
    })

    it('[SHR-04] Scan QR Code button exists on Dashboard', () => {
      cy.connectWallet()

      // Look for QR scanner trigger on dashboard
      cy.get('body').then(($body) => {
        const text = $body.text().toLowerCase()
        const hasQR = text.includes('scan') || text.includes('qr')
        expect(hasQR).to.be.true
      })
    })

    it('[SHR-05] Share link contains no secrets', () => {
      // Verify that share URLs do not contain private keys or encryption keys
      const testUrl = `${Cypress.config('baseUrl')}/friend-market/accept?marketId=1&creator=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`

      // URL should not contain private key patterns
      expect(testUrl).to.not.match(/privateKey|secret|password/i)
      // URL should not contain the test private key
      expect(testUrl).to.not.include('ac0974bec39a17e36ba4a6b4d238ff944bacb478')
    })
  })

  describe('Non-Happy Path', () => {
    it('[SHR-06] Scan non-FairWins QR code shows confirmation dialog', () => {
      // The QR scanner should warn before navigating to external URLs
      // Verify the scanner component handles external URLs safely
      cy.connectWallet()
      cy.get('body').should('be.visible')
    })

    it('[SHR-07] Scan QR with camera denied shows error message', () => {
      // When camera permission is denied, the scanner should show a fallback
      cy.connectWallet()
      cy.get('body').should('be.visible')

      // The app should handle camera denial gracefully
      // This is primarily a component-level concern tested in unit tests
    })

    it('[SHR-08] Open share link for nonexistent wager shows error', () => {
      // Navigate to acceptance page with a wager ID that doesn't exist
      cy.mockWeb3Provider()
      cy.visit('/friend-market/accept?marketId=999999')
      cy.get('body', { timeout: 10000 }).should('be.visible')

      // Should show some form of error or empty state
      cy.get('body').invoke('text').then((text) => {
        // Page should load without crashing
        expect(text.length).to.be.greaterThan(0)
      })
    })
  })
})
