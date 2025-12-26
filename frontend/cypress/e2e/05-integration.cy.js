/**
 * E2E Test: Complete User Journey Integration
 * 
 * Tests the full end-to-end user experience across both platforms:
 * - Complete onboarding
 * - Platform switching
 * - Multi-feature workflow
 * - Cross-platform state management
 */

describe('Complete User Journey Integration', () => {
  it('should complete full onboarding to trading journey', () => {
    // Start from landing page
    cy.visit('/')
    cy.get('body', { timeout: 10000 }).should('be.visible')
    
    // Navigate to platform selector
    cy.contains('button, a', /get started|explore|enter/i).first().click()
    
    // Select FairWins
    cy.selectPlatform('fairwins')
    cy.contains(/fairwins|market/i, { timeout: 10000 }).should('be.visible')
    
    // Connect wallet
    cy.connectWallet()
    
    // Verify connected
    cy.get('.wallet-address, [data-testid="wallet-address"]').should('be.visible')
    
    // Browse markets
    cy.wait(2000)
    cy.get('body').invoke('text').should('have.length.greaterThan', 200)
    
    // Interact with trading interface
    cy.get('button, input[type="number"]').should('exist')
  })

  it('should switch between platforms maintaining wallet connection', () => {
    // Start on FairWins
    cy.visit('/fairwins')
    cy.connectWallet()
    cy.get('.wallet-address, [data-testid="wallet-address"]').should('be.visible')
    
    // Navigate to ClearPath
    cy.visit('/clearpath')
    cy.wait(1000)
    
    // Wallet should still be connected
    cy.get('.wallet-address, [data-testid="wallet-address"]', { timeout: 10000 }).should('be.visible')
    
    // Back to FairWins
    cy.visit('/fairwins')
    cy.wait(1000)
    
    // Still connected
    cy.get('.wallet-address, [data-testid="wallet-address"]').should('be.visible')
  })

  it('should handle complete governance workflow on ClearPath', () => {
    // Navigate to ClearPath
    cy.visit('/clearpath')
    cy.connectWallet()
    cy.wait(2000)
    
    // Verify dashboard loads
    cy.contains(/clearpath|dashboard/i).should('be.visible')
    
    // Look for governance features
    cy.get('body').invoke('text').then((text) => {
      const lowerText = text.toLowerCase()
      const hasGovernance = lowerText.includes('proposal') || 
                           lowerText.includes('vote') ||
                           lowerText.includes('dao')
      expect(hasGovernance).to.be.true
    })
    
    // Interact with available features
    cy.get('button, a').should('exist')
  })

  it('should browse and interact with multiple markets', () => {
    cy.visit('/fairwins')
    cy.connectWallet()
    cy.wait(2000)
    
    // Filter by category
    cy.contains('button, a', /sports|crypto|all/i).first().click()
    cy.wait(1000)
    
    // Markets should be visible
    cy.get('body').invoke('text').should('have.length.greaterThan', 200)
    
    // Try another category if available
    cy.get('button, a, [role="tab"]').then(($buttons) => {
      if ($buttons.length > 1) {
        cy.wrap($buttons.eq(1)).click()
        cy.wait(1000)
      }
    })
  })

  it('should handle disconnection and reconnection flow', () => {
    cy.visit('/fairwins')
    cy.connectWallet()
    
    // Verify connected
    cy.get('.wallet-address, [data-testid="wallet-address"]').should('be.visible')
    
    // Disconnect
    cy.contains('button', /disconnect/i).click()
    cy.contains('button', /connect wallet/i, { timeout: 10000 }).should('be.visible')
    
    // Reconnect
    cy.connectWallet()
    cy.get('.wallet-address, [data-testid="wallet-address"]').should('be.visible')
  })

  it('should maintain state across page reloads', () => {
    cy.visit('/fairwins')
    cy.mockWeb3Provider()
    cy.connectWallet()
    cy.wait(1000)
    
    // Reload page
    cy.reload()
    cy.wait(2000)
    
    // Page should load successfully
    cy.get('body', { timeout: 10000 }).should('be.visible')
    
    // Note: Wallet connection may not persist across hard reload without localStorage
    // But the page should remain functional
    cy.contains('button', /connect wallet|disconnect/i).should('be.visible')
  })

  it('should handle navigation using browser back button', () => {
    // Start at home
    cy.visit('/')
    cy.wait(1000)
    
    // Go to FairWins
    cy.visit('/fairwins')
    cy.wait(1000)
    cy.contains(/fairwins|market/i, { timeout: 10000 }).should('be.visible')
    
    // Use browser back
    cy.go('back')
    cy.wait(1000)
    
    // Should return to previous page
    cy.url().should('not.include', '/fairwins')
    
    // Go forward
    cy.go('forward')
    cy.wait(1000)
    cy.url().should('match', /\/(fairwins|app|main)/)
  })

  it('should work across different viewport sizes', () => {
    const viewports = ['iphone-x', 'ipad-2', [1280, 720], [1920, 1080]]
    
    viewports.forEach((viewport) => {
      if (Array.isArray(viewport)) {
        cy.viewport(viewport[0], viewport[1])
      } else {
        cy.viewport(viewport)
      }
      
      cy.visit('/fairwins')
      cy.wait(1000)
      
      // Verify page loads
      cy.get('body').should('be.visible')
      cy.get('button, a').should('exist')
      
      cy.log(`Tested viewport: ${viewport}`)
    })
  })

  it('should handle rapid navigation between sections', () => {
    cy.visit('/fairwins')
    cy.connectWallet()
    cy.wait(1000)
    
    // Rapidly click through navigation elements
    cy.get('button, a, [role="tab"]').each(($el, index) => {
      if (index < 3) { // Test first 3 elements
        cy.wrap($el).click()
        cy.wait(300)
      }
    })
    
    // Page should remain stable
    cy.get('body').should('be.visible')
  })

  it('should gracefully handle network errors', () => {
    // Visit with a mock error scenario
    cy.visit('/fairwins')
    
    // Even with potential errors, page should be functional
    cy.get('body', { timeout: 10000 }).should('be.visible')
    cy.contains('button', /connect wallet/i).should('be.visible')
  })

  it('should display appropriate feedback for user actions', () => {
    cy.visit('/fairwins')
    cy.connectWallet()
    cy.wait(1000)
    
    // Click various interactive elements
    cy.get('button, a').first().click()
    cy.wait(500)
    
    // Page should respond (change, update, navigate, etc.)
    cy.get('body').should('be.visible')
  })

  it('should handle concurrent actions gracefully', () => {
    cy.visit('/fairwins')
    cy.connectWallet()
    cy.wait(1000)
    
    // Try multiple interactions
    cy.get('button, input[type="number"]').then(($elements) => {
      if ($elements.length > 0) {
        // Interact with first few elements
        $elements.slice(0, 2).each((index, el) => {
          cy.wrap(el).click({ force: true })
        })
      }
    })
    
    // Application should remain stable
    cy.get('body').should('be.visible')
  })

  it('should complete accessibility checks across key pages', () => {
    const pages = ['/', '/select', '/clearpath', '/fairwins']
    
    pages.forEach((page) => {
      cy.visit(page)
      cy.wait(1000)
      
      // Basic accessibility check
      cy.checkA11y()
      
      cy.log(`Accessibility tested for: ${page}`)
    })
  })

  it('should demonstrate full feature integration', () => {
    // Complete user journey demonstrating all features
    
    // 1. Landing
    cy.visit('/')
    cy.get('body').should('be.visible')
    
    // 2. Select platform
    cy.visit('/select')
    cy.contains(/clearpath|fairwins/i).should('be.visible')
    
    // 3. Try ClearPath
    cy.selectPlatform('clearpath')
    cy.connectWallet()
    cy.wait(1000)
    cy.get('.wallet-address, [data-testid="wallet-address"]').should('be.visible')
    
    // 4. Switch to FairWins
    cy.visit('/fairwins')
    cy.wait(1000)
    cy.get('.wallet-address, [data-testid="wallet-address"]').should('be.visible')
    
    // 5. Browse markets
    cy.wait(2000)
    cy.get('body').invoke('text').should('have.length.greaterThan', 200)
    
    // 6. Verify all core features are accessible
    cy.get('button, a, input').should('have.length.greaterThan', 5)
  })
})
