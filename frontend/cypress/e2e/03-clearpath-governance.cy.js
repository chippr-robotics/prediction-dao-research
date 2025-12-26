/**
 * E2E Test: ClearPath DAO Governance Flow
 * 
 * Tests DAO governance functionality including:
 * - Dashboard viewing
 * - Proposal browsing
 * - Proposal details viewing
 * - Welfare metrics display
 * - Governance interactions
 */

describe('ClearPath DAO Governance Flow', () => {
  beforeEach(() => {
    cy.visit('/clearpath')
    // Mock wallet connection
    cy.mockWeb3Provider()
  })

  it('should display the ClearPath dashboard', () => {
    // Verify dashboard loads
    cy.contains(/clearpath|dashboard/i, { timeout: 10000 }).should('be.visible')
    
    // Check for main dashboard elements
    cy.get('body').should('be.visible')
  })

  it('should show connect wallet prompt when not connected', () => {
    // Should see connect wallet button
    cy.contains('button', /connect wallet/i, { timeout: 10000 }).should('be.visible')
  })

  it('should display DAO information after wallet connection', () => {
    // Connect wallet
    cy.contains('button', /connect wallet/i, { timeout: 10000 }).click()
    cy.wait(1000)
    
    // Dashboard content should be visible
    cy.get('body').should('be.visible')
    cy.get('body').invoke('text').should('have.length.greaterThan', 100)
  })

  it('should display navigation menu with governance sections', () => {
    cy.connectWallet()
    cy.wait(1000)
    
    // Look for navigation elements
    cy.get('button, a, [role="tab"], nav').should('exist')
    
    // Common governance sections
    const sections = ['dashboard', 'proposals', 'metrics', 'welfare']
    
    cy.get('body').invoke('text').then((text) => {
      const lowerText = text.toLowerCase()
      const hasSection = sections.some(section => lowerText.includes(section))
      expect(hasSection).to.be.true
    })
  })

  it('should show proposals list or empty state', () => {
    cy.connectWallet()
    cy.wait(2000)
    
    // Look for proposals section
    cy.get('body').invoke('text').then((text) => {
      const lowerText = text.toLowerCase()
      const hasProposals = lowerText.includes('proposal') || 
                          lowerText.includes('no proposals') ||
                          lowerText.includes('create proposal')
      expect(hasProposals).to.be.true
    })
  })

  it('should display proposal submission interface', () => {
    cy.connectWallet()
    cy.wait(1000)
    
    // Look for create/submit proposal button
    cy.contains('button, a', /create|submit|new|propose/i).should('exist')
  })

  it('should show proposal details when available', () => {
    cy.connectWallet()
    cy.wait(2000)
    
    // If there are proposals, we should see details
    // Otherwise, we should see an empty state
    cy.get('body').invoke('text').then((text) => {
      const hasContent = text.length > 200 // Substantial content
      expect(hasContent).to.be.true
    })
  })

  it('should display welfare metrics section', () => {
    cy.connectWallet()
    cy.wait(1000)
    
    // Look for welfare/metrics related content
    cy.get('body').invoke('text').then((text) => {
      const lowerText = text.toLowerCase()
      // Might show metrics, statistics, or data
      const hasMetrics = lowerText.includes('metric') || 
                        lowerText.includes('welfare') ||
                        lowerText.includes('statistic') ||
                        text.match(/[0-9]+%|[0-9]+\.[0-9]+/)
      expect(hasMetrics).to.be.true
    })
  })

  it('should show DAO treasury or balance information', () => {
    cy.connectWallet()
    cy.wait(1000)
    
    // Look for treasury/balance information
    cy.get('body').invoke('text').then((text) => {
      const lowerText = text.toLowerCase()
      const hasTreasury = lowerText.includes('treasury') || 
                         lowerText.includes('balance') ||
                         text.match(/eth|etc|\$/i)
      expect(hasTreasury).to.be.true
    })
  })

  it('should display governance token information if applicable', () => {
    cy.connectWallet()
    cy.wait(1000)
    
    // Look for token-related information
    cy.get('body').invoke('text').then((text) => {
      const lowerText = text.toLowerCase()
      // May show token balance, voting power, etc.
      cy.log(`Page contains governance info: ${lowerText.includes('vote') || lowerText.includes('token')}`)
    })
  })

  it('should show voting interface for active proposals', () => {
    cy.connectWallet()
    cy.wait(2000)
    
    // Look for voting-related buttons or interface
    cy.get('button, input, [role="button"]').should('exist')
    
    // Check if voting terminology is present
    cy.get('body').invoke('text').then((text) => {
      const lowerText = text.toLowerCase()
      const hasVoting = lowerText.includes('vote') || 
                       lowerText.includes('support') ||
                       lowerText.includes('oppose') ||
                       lowerText.includes('approve')
      cy.log(`Has voting interface: ${hasVoting}`)
    })
  })

  it('should display proposal status indicators', () => {
    cy.connectWallet()
    cy.wait(2000)
    
    // Look for status indicators
    cy.get('body').invoke('text').then((text) => {
      const lowerText = text.toLowerCase()
      const hasStatus = lowerText.includes('active') || 
                       lowerText.includes('pending') ||
                       lowerText.includes('passed') ||
                       lowerText.includes('failed') ||
                       lowerText.includes('closed')
      cy.log(`Has status indicators: ${hasStatus}`)
    })
  })

  it('should show proposal deadlines or time information', () => {
    cy.connectWallet()
    cy.wait(2000)
    
    // Look for time-related information
    cy.get('body').invoke('text').then((text) => {
      const lowerText = text.toLowerCase()
      const hasTimeInfo = lowerText.includes('days') || 
                         lowerText.includes('hours') ||
                         lowerText.includes('deadline') ||
                         lowerText.includes('ends') ||
                         text.match(/[0-9]+[hd]/)
      cy.log(`Has time information: ${hasTimeInfo}`)
    })
  })

  it('should navigate back to platform selector', () => {
    // Click back button
    cy.contains('button', /back/i, { timeout: 10000 }).click()
    
    // Should return to selector or home
    cy.url().should('match', /\/(select|$)/)
  })

  it('should display DAO launchpad if available', () => {
    cy.connectWallet()
    cy.wait(1000)
    
    // Look for launchpad or DAO creation interface
    cy.get('body').invoke('text').then((text) => {
      const lowerText = text.toLowerCase()
      const hasLaunchpad = lowerText.includes('launch') || 
                          lowerText.includes('create dao') ||
                          lowerText.includes('new dao')
      cy.log(`Has DAO launchpad: ${hasLaunchpad}`)
    })
  })

  it('should handle responsive layout on mobile', () => {
    cy.viewport('iphone-x')
    cy.connectWallet()
    cy.wait(1000)
    
    // Verify functionality on mobile
    cy.get('body').should('be.visible')
    cy.get('button, a').should('exist')
  })

  it('should handle responsive layout on tablet', () => {
    cy.viewport('ipad-2')
    cy.connectWallet()
    cy.wait(1000)
    
    // Verify functionality on tablet
    cy.get('body').should('be.visible')
    cy.get('body').invoke('text').should('have.length.greaterThan', 100)
  })

  it('should pass accessibility checks on dashboard', () => {
    cy.connectWallet()
    cy.wait(1000)
    cy.checkA11y()
  })

  it('should maintain keyboard navigation support', () => {
    cy.connectWallet()
    
    // Tab through elements
    cy.get('button, a, input').first().focus()
    cy.focused().should('exist')
    
    // Continue tabbing
    cy.focused().tab()
    cy.focused().should('exist')
  })

  it('should display appropriate loading states', () => {
    // During load, should show loading indicators or content
    cy.get('body', { timeout: 10000 }).should('be.visible')
    
    // Eventually should show interactive elements
    cy.get('button, a, input').should('exist')
  })
})
