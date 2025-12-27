describe('Traditional Voting Flow', () => {
  beforeEach(() => {
    // Visit the app and connect wallet
    cy.visit('http://localhost:5173')
    
    // Wait for page to load
    cy.get('body', { timeout: 10000 }).should('be.visible')
  })

  it('should complete a full traditional voting lifecycle', () => {
    // Step 1: Platform selection
    cy.contains('button', /clearpath/i, { timeout: 10000 }).should('be.visible').click()
    
    // Step 2: Connect wallet
    cy.contains('button', /connect wallet/i, { timeout: 10000 })
      .should('be.visible')
      .click()
    
    // Wait for wallet connection (this may require manual interaction or mock)
    cy.wait(2000)
    
    // Step 3: Navigate to governance section
    cy.contains(/governance/i, { timeout: 10000 }).should('be.visible')
    
    // Step 4: Switch to Traditional Voting mode
    cy.contains('button', /traditional/i, { timeout: 10000 })
      .should('be.visible')
      .click()
    
    // Verify we're in traditional voting mode
    cy.contains('Traditional Democracy Voting', { timeout: 5000 }).should('be.visible')
    cy.contains(/token-weighted voting/i).should('be.visible')
    
    // Step 5: Check for voting proposals
    cy.get('.traditional-voting', { timeout: 5000 }).should('be.visible')
    
    // Verify voting info is displayed
    cy.contains(/your voting power/i).should('be.visible')
    cy.contains(/current block/i).should('be.visible')
  })

  it('should display voting proposals with correct information', () => {
    // Navigate to Traditional Voting
    cy.contains('button', /clearpath/i, { timeout: 10000 }).click()
    cy.contains('button', /connect wallet/i, { timeout: 10000 }).click()
    cy.wait(2000)
    
    cy.contains('button', /traditional/i, { timeout: 10000 }).click()
    
    // Check if proposals are displayed
    cy.get('.voting-proposal-card', { timeout: 10000 }).first().within(() => {
      // Verify proposal has essential elements
      cy.get('.proposal-header h3').should('be.visible')
      cy.get('.status-badge').should('be.visible')
      cy.get('.proposal-description').should('be.visible')
      
      // Verify voting stats are shown
      cy.contains(/for:/i).should('be.visible')
      cy.contains(/against:/i).should('be.visible')
      cy.contains(/abstain:/i).should('be.visible')
      cy.contains(/quorum required:/i).should('be.visible')
    })
  })

  it('should allow casting votes on active proposals', () => {
    // Navigate to Traditional Voting
    cy.contains('button', /clearpath/i, { timeout: 10000 }).click()
    cy.contains('button', /connect wallet/i, { timeout: 10000 }).click()
    cy.wait(2000)
    
    cy.contains('button', /traditional/i, { timeout: 10000 }).click()
    
    // Find an active proposal
    cy.get('.voting-proposal-card', { timeout: 10000 })
      .contains('.status-badge', 'Active')
      .parents('.voting-proposal-card')
      .first()
      .within(() => {
        // Verify vote buttons are present
        cy.contains('button', /vote for/i).should('be.visible').and('not.be.disabled')
        cy.contains('button', /vote against/i).should('be.visible').and('not.be.disabled')
        cy.contains('button', /abstain/i).should('be.visible').and('not.be.disabled')
        
        // Click vote For button (will require actual wallet interaction in real scenario)
        cy.contains('button', /vote for/i).click()
      })
    
    // Note: Actual transaction would need wallet confirmation
    // In a real e2e test, you'd need to mock the wallet or use a test wallet
  })

  it('should switch between Futarchy and Traditional modes', () => {
    cy.contains('button', /clearpath/i, { timeout: 10000 }).click()
    cy.contains('button', /connect wallet/i, { timeout: 10000 }).click()
    cy.wait(2000)
    
    // Start with Futarchy mode
    cy.contains('button', /futarchy/i, { timeout: 10000 }).should('have.class', 'active')
    cy.contains(/prediction markets/i).should('be.visible')
    
    // Switch to Traditional
    cy.contains('button', /traditional/i).click()
    cy.contains('button', /traditional/i).should('have.class', 'active')
    cy.contains(/traditional democracy voting/i).should('be.visible')
    cy.contains(/token-weighted voting/i).should('be.visible')
    
    // Switch back to Futarchy
    cy.contains('button', /futarchy/i).click()
    cy.contains('button', /futarchy/i).should('have.class', 'active')
    cy.contains(/prediction markets/i).should('be.visible')
  })

  it('should display voting statistics correctly', () => {
    cy.contains('button', /clearpath/i, { timeout: 10000 }).click()
    cy.contains('button', /connect wallet/i, { timeout: 10000 }).click()
    cy.wait(2000)
    
    cy.contains('button', /traditional/i, { timeout: 10000 }).click()
    
    // Check voting statistics on a proposal
    cy.get('.voting-proposal-card', { timeout: 10000 }).first().within(() => {
      // Verify vote counts are displayed
      cy.get('.stat-row').should('have.length.at.least', 3)
      
      // Verify progress bars exist
      cy.get('.stat-bar.for').should('exist')
      cy.get('.stat-bar.against').should('exist')
      cy.get('.stat-bar.abstain').should('exist')
      
      // Verify percentages are shown
      cy.get('.stat-value').should('have.length.at.least', 3)
    })
  })

  it('should show user vote indicator when voted', () => {
    cy.contains('button', /clearpath/i, { timeout: 10000 }).click()
    cy.contains('button', /connect wallet/i, { timeout: 10000 }).click()
    cy.wait(2000)
    
    cy.contains('button', /traditional/i, { timeout: 10000 }).click()
    
    // Look for proposals where user has already voted
    cy.get('.voting-proposal-card', { timeout: 10000 }).then(($proposals) => {
      const $votedProposal = $proposals.find('.user-vote-indicator')
      
      if ($votedProposal.length > 0) {
        // Verify the vote indicator shows the vote type
        cy.wrap($votedProposal).should('contain.text', 'You voted:')
        cy.wrap($votedProposal).should('match', /(For|Against|Abstain)/)
      }
    })
  })

  it('should display proposal states correctly', () => {
    cy.contains('button', /clearpath/i, { timeout: 10000 }).click()
    cy.contains('button', /connect wallet/i, { timeout: 10000 }).click()
    cy.wait(2000)
    
    cy.contains('button', /traditional/i, { timeout: 10000 }).click()
    
    // Check that status badges are displayed with appropriate colors
    cy.get('.status-badge', { timeout: 10000 }).each(($badge) => {
      const text = $badge.text().toLowerCase()
      
      // Verify badge has appropriate styling class
      if (text.includes('active')) {
        cy.wrap($badge).should('have.class', 'blue')
      } else if (text.includes('succeeded')) {
        cy.wrap($badge).should('have.class', 'green')
      } else if (text.includes('defeated')) {
        cy.wrap($badge).should('have.class', 'red')
      } else if (text.includes('queued')) {
        cy.wrap($badge).should('have.class', 'orange')
      } else if (text.includes('executed') || text.includes('canceled')) {
        cy.wrap($badge).should('have.class', 'gray')
      }
    })
  })

  it('should show blocks remaining for active proposals', () => {
    cy.contains('button', /clearpath/i, { timeout: 10000 }).click()
    cy.contains('button', /connect wallet/i, { timeout: 10000 }).click()
    cy.wait(2000)
    
    cy.contains('button', /traditional/i, { timeout: 10000 }).click()
    
    // Find active proposals and check for blocks remaining
    cy.get('.voting-proposal-card', { timeout: 10000 })
      .contains('.status-badge', 'Active')
      .parents('.voting-proposal-card')
      .first()
      .within(() => {
        cy.contains(/blocks remaining:/i).should('be.visible')
        cy.contains(/blocks remaining:/i)
          .parent()
          .find('.value')
          .invoke('text')
          .then((text) => {
            const blocks = parseInt(text)
            expect(blocks).to.be.a('number')
          })
      })
  })

  it('should display quorum status correctly', () => {
    cy.contains('button', /clearpath/i, { timeout: 10000 }).click()
    cy.contains('button', /connect wallet/i, { timeout: 10000 }).click()
    cy.wait(2000)
    
    cy.contains('button', /traditional/i, { timeout: 10000 }).click()
    
    // Check quorum display
    cy.get('.voting-proposal-card', { timeout: 10000 }).first().within(() => {
      cy.contains(/quorum required:/i)
        .parent()
        .within(() => {
          // Should show either checkmark or "not met"
          cy.get('.value').should('match', /(✓|not met)/)
        })
    })
  })

  it('should handle no proposals state', () => {
    cy.contains('button', /clearpath/i, { timeout: 10000 }).click()
    cy.contains('button', /connect wallet/i, { timeout: 10000 }).click()
    cy.wait(2000)
    
    cy.contains('button', /traditional/i, { timeout: 10000 }).click()
    
    // If there are no proposals, should show empty state
    cy.get('body').then(($body) => {
      if (!$body.find('.voting-proposal-card').length) {
        cy.contains(/no voting proposals yet/i).should('be.visible')
      }
    })
  })

  it('should be responsive on mobile viewport', () => {
    cy.viewport('iphone-x')
    
    cy.contains('button', /clearpath/i, { timeout: 10000 }).click()
    cy.contains('button', /connect wallet/i, { timeout: 10000 }).click()
    cy.wait(2000)
    
    cy.contains('button', /traditional/i, { timeout: 10000 }).click()
    
    // Verify layout adapts to mobile
    cy.get('.traditional-voting', { timeout: 10000 }).should('be.visible')
    cy.get('.voting-header').should('be.visible')
    cy.get('.mode-toggle').should('be.visible')
    
    // Check that proposal cards are still readable
    cy.get('.voting-proposal-card').first().within(() => {
      cy.get('.proposal-header').should('be.visible')
      cy.get('.voting-stats').should('be.visible')
    })
  })
})
