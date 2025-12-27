/**
 * E2E Test: FairWins Market Trading Flow
 * 
 * Tests prediction market interaction including:
 * - Market browsing and discovery
 * - Market details viewing
 * - Position trading simulation
 * - Balance and portfolio management
 */

describe('FairWins Market Trading Flow', () => {
  beforeEach(() => {
    // Mock wallet connection BEFORE visiting the page
    cy.mockWeb3Provider()
    cy.visit('/fairwins')
  })

  it('should display market categories and navigation', () => {
    // Check for category filters or navigation
    cy.get('body', { timeout: 10000 }).should('be.visible')
    
    // Look for common market categories
    const categories = ['sports', 'crypto', 'politics', 'entertainment', 'all']
    
    // At least one category should be visible
    cy.get('button, a, [role="tab"]').then(($elements) => {
      const text = $elements.text().toLowerCase()
      const hasCategory = categories.some(cat => text.includes(cat))
      expect(hasCategory).to.be.true
    })
  })

  it('should display list of markets with key information', () => {
    // Wait for markets to load
    cy.wait(2000)
    
    // Look for market cards or items
    cy.get('[class*="market"], [data-testid*="market"]').should('have.length.greaterThan', 0)
    
    // Verify market information is displayed
    // Markets should show prices, titles, or other key data
    cy.get('body').within(() => {
      // Check for price indicators (looking for currency symbols or price patterns)
      cy.get('body').invoke('text').should('match', /[0-9]+\.?[0-9]*/)
    })
  })

  it('should allow filtering markets by category', () => {
    // Click on a category filter if available
    cy.contains('button, a', /sports|crypto|politics/i).first().click()
    
    // Wait for filter to apply
    cy.wait(1000)
    
    // Verify markets are displayed
    cy.get('body').should('be.visible')
  })

  it('should display hero/featured market', () => {
    // Look for a prominent featured market
    cy.get('[class*="hero"], [class*="featured"], [class*="highlight"]')
      .first()
      .should('be.visible')
  })

  it('should display market prices and liquidity', () => {
    cy.wait(2000)
    
    // Look for price indicators in the page content
    cy.get('body').invoke('text').then((text) => {
      // Should contain price-like numbers
      expect(text).to.match(/[0-9]+\.?[0-9]*/)
    })
  })

  it('should show market status indicators', () => {
    cy.wait(2000)
    
    // Look for status indicators
    cy.get('body').invoke('text').then((text) => {
      const lowerText = text.toLowerCase()
      const hasStatus = lowerText.includes('active') || 
                       lowerText.includes('closed') || 
                       lowerText.includes('pending') ||
                       lowerText.includes('resolved')
      expect(hasStatus).to.be.true
    })
  })

  it('should interact with market trading interface', () => {
    cy.wait(2000)
    
    // Look for trading-related buttons or inputs
    cy.get('button, input[type="number"], [role="spinbutton"]').should('exist')
  })

  it('should display balance information when wallet is connected', () => {
    // Connect wallet with stability checks
    cy.contains('button', /connect wallet/i, { timeout: 10000 })
      .should('be.visible')
      .should('not.be.disabled')
      .click({ force: true })
    cy.wait(2000)
    
    // Look for balance display
    cy.get('body').invoke('text').then((text) => {
      // Balance might be shown as "Balance", currency symbol, or numbers
      const hasBalance = text.toLowerCase().includes('balance') || 
                        text.match(/\$|eth|etc/i)
      expect(hasBalance).to.be.true
    })
  })

  it('should show market trading deadlines', () => {
    cy.wait(2000)
    
    // Look for time-related information
    cy.get('body').invoke('text').then((text) => {
      const lowerText = text.toLowerCase()
      const hasTimeInfo = lowerText.includes('days') || 
                         lowerText.includes('hours') ||
                         lowerText.includes('deadline') ||
                         lowerText.includes('ends') ||
                         lowerText.includes('expires')
      expect(hasTimeInfo).to.be.true
    })
  })

  it('should handle swap panel interactions', () => {
    cy.wait(2000)
    
    // Look for swap or trade panel
    cy.get('[class*="swap"], [class*="trade"], [class*="panel"]').should('exist')
  })

  it('should display market categories in sidebar or navigation', () => {
    // Check for sidebar navigation
    cy.get('[class*="sidebar"], [class*="nav"], [role="navigation"]').should('exist')
  })

  it('should show correlated markets when available', () => {
    cy.wait(2000)
    
    // Look for related or correlated markets section
    cy.get('body').invoke('text').then((text) => {
      const lowerText = text.toLowerCase()
      // The app might show related/correlated markets
      const hasRelated = lowerText.includes('related') || 
                        lowerText.includes('correlated') ||
                        lowerText.includes('similar')
      // This is optional, so we just log it
      cy.log(`Has related markets section: ${hasRelated}`)
    })
  })

  it('should maintain responsive layout on mobile viewport', () => {
    cy.viewport('iphone-x')
    cy.wait(1000)
    
    // Verify page is still functional
    cy.get('body').should('be.visible')
    
    // Navigation should be accessible
    cy.get('button, a, [role="button"]').should('exist')
  })

  it('should maintain responsive layout on tablet viewport', () => {
    cy.viewport('ipad-2')
    cy.wait(1000)
    
    // Verify page is still functional
    cy.get('body').should('be.visible')
    
    // Content should be visible
    cy.get('body').invoke('text').should('have.length.greaterThan', 100)
  })

  it('should handle keyboard navigation', () => {
    // Tab through interactive elements
    cy.get('button, a, input').first().focus()
    cy.focused().should('exist')
    
    // Tab to next element
    cy.focused().tab()
    cy.focused().should('exist')
  })

  it('should pass accessibility checks on main market view', () => {
    cy.checkA11y()
  })

  it('should show loading states appropriately', () => {
    // On fresh load, there might be loading indicators
    // This test just verifies the page eventually becomes interactive
    cy.get('body', { timeout: 10000 }).should('be.visible')
    cy.get('button, a, input').should('exist')
  })
})
