/**
 * E2E Test: User Onboarding Flow
 * 
 * Tests the complete user onboarding journey including:
 * - Landing page accessibility
 * - Platform selection
 * - Wallet connection
 * - Network verification
 */

describe('User Onboarding Flow', () => {
  beforeEach(() => {
    // Mock Web3 provider before visiting to ensure wallet detection works
    cy.mockWeb3Provider()
    cy.visit('/')
  })

  it('should load the landing page with all key elements', () => {
    // Verify page loads
    cy.get('body').should('be.visible')
    
    // Check for main heading or platform names
    cy.get('h1, h2, h3').should('exist')
    
    // Check for platform cards or links
    cy.contains(/fairwins|clearpath/i, { timeout: 10000 }).should('be.visible')
    
    // Check for call-to-action buttons
    cy.get('button, a').should('have.length.greaterThan', 0)
  })

  it('should navigate from landing page to platform selector or app', () => {
    // Look for "Get Started", "Browse", or similar CTA
    cy.contains('button, a', /browse|explore|enter|get started/i, { timeout: 10000 })
      .first()
      .should('be.visible')
      .click({ force: true })
    
    // Wait for navigation
    cy.wait(1000)
    
    // Should navigate to either selector, fairwins, or clearpath
    cy.url().should('match', /\/(select|fairwins|clearpath|app|main|$)/)
  })

  it('should display both platform options on selector page', () => {
    // Navigate to platform selector
    cy.visit('/select')
    
    // Verify both platforms are shown
    cy.contains(/clearpath/i, { timeout: 10000 }).should('be.visible')
    cy.contains(/fairwins/i).should('be.visible')
    
    // Check for platform descriptions
    cy.contains(/dao|governance/i).should('be.visible')
    cy.contains(/prediction|market/i).should('be.visible')
  })

  it('should navigate to ClearPath when selected', () => {
    cy.visit('/select')
    cy.selectPlatform('clearpath')
    
    // Verify we're on ClearPath
    cy.url().should('include', '/clearpath')
    cy.contains(/clearpath/i, { timeout: 10000 }).should('be.visible')
  })

  it('should navigate to FairWins when selected', () => {
    cy.visit('/select')
    cy.selectPlatform('fairwins')
    
    // Verify we're on FairWins
    cy.url().should('match', /\/(fairwins|app|main)/)
    cy.contains(/fairwins|market/i, { timeout: 10000 }).should('be.visible')
  })

  it('should show connect wallet button when not connected', () => {
    cy.visit('/clearpath')
    
    // Should see connect button
    cy.contains('button', /connect wallet/i, { timeout: 10000 }).should('be.visible')
    
    // Should not see disconnect button
    cy.contains('button', /disconnect/i).should('not.exist')
  })

  it('should successfully connect wallet and display address', () => {
    cy.visit('/clearpath')
    
    // Connect wallet using custom command
    cy.connectWallet()
    
    // Wait for wallet UI to update
    cy.wait(1000)
    
    // Verify wallet is connected
    cy.get('.wallet-address, [data-testid="wallet-address"]').should('be.visible')
    cy.contains('button', /disconnect/i).should('be.visible')
    
    // Verify address is displayed (shortened format)
    cy.get('.wallet-address, [data-testid="wallet-address"]')
      .invoke('text')
      .should('match', /0x[a-fA-F0-9]{4}\.{3}[a-fA-F0-9]{4}/)
  })

  it('should disconnect wallet when disconnect button is clicked', () => {
    cy.visit('/clearpath')
    cy.connectWallet()
    
    // Click disconnect with stability checks
    cy.contains('button', /disconnect/i)
      .should('be.visible')
      .click({ force: true })
    
    // Wait for disconnect to complete
    cy.wait(1000)
    
    // Verify wallet is disconnected
    cy.contains('button', /connect wallet/i, { timeout: 10000 }).should('be.visible')
    cy.get('.wallet-address, [data-testid="wallet-address"]').should('not.exist')
  })

  it('should verify network connection', () => {
    cy.visit('/clearpath')
    cy.mockWeb3Provider({ networkId: 1337 })
    
    // Verify network
    cy.verifyNetwork(1337)
  })

  it('should handle navigation between platforms', () => {
    // Start on ClearPath
    cy.visit('/clearpath')
    cy.contains(/clearpath/i, { timeout: 10000 }).should('be.visible')
    
    // Navigate back with stability checks
    cy.contains('button', /back/i)
      .should('be.visible')
      .click({ force: true })
    
    // Wait for navigation
    cy.wait(1000)
    
    // Should return to selector or landing
    cy.url().should('match', /\/(select|$)/)
    
    // Navigate to FairWins
    cy.selectPlatform('fairwins')
    cy.contains(/fairwins|market/i, { timeout: 10000 }).should('be.visible')
  })

  it('should maintain wallet connection across platform navigation', () => {
    cy.visit('/clearpath')
    cy.connectWallet()
    
    // Wait for connection to stabilize
    cy.wait(1000)
    
    // Verify connection
    cy.get('.wallet-address, [data-testid="wallet-address"]').should('be.visible')
    
    // Navigate to FairWins
    cy.visit('/fairwins')
    
    // Wait for page to load
    cy.wait(1000)
    
    // Wallet should still be connected
    cy.get('.wallet-address, [data-testid="wallet-address"]', { timeout: 10000 }).should('be.visible')
  })

  it('should pass basic accessibility checks on landing page', () => {
    cy.checkA11y()
  })

  it('should pass basic accessibility checks on platform selector', () => {
    cy.visit('/select')
    cy.checkA11y()
  })

  it('should pass basic accessibility checks on ClearPath', () => {
    cy.visit('/clearpath')
    cy.checkA11y()
  })

  it('should pass basic accessibility checks on FairWins', () => {
    cy.visit('/fairwins')
    cy.checkA11y()
  })
})
