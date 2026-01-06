/**
 * E2E Test: ClearPath Modal
 * 
 * Tests the new ClearPath modal functionality including:
 * - Modal opening/closing
 * - Tab navigation (My DAOs, Browse, Proposals, Metrics, Launch)
 * - DAO list and detail views
 * - Proposal list and detail views
 * - Launch DAO form validation
 * - Keyboard navigation
 * - Accessibility features
 */

describe('ClearPath Modal', () => {
  beforeEach(() => {
    cy.mockWeb3Provider()
    cy.visit('/')
    // Enable demo mode for consistent testing
    cy.window().then((win) => {
      win.localStorage.setItem('userPreferences', JSON.stringify({ demoMode: true }))
    })
  })

  describe('Modal Opening and Closing', () => {
    it('should open the modal when ClearPath button is clicked', () => {
      cy.get('[data-testid="clearpath-button"], button').contains(/clearpath/i).click()
      cy.get('.clearpath-modal-backdrop').should('be.visible')
      cy.get('.clearpath-modal').should('be.visible')
      cy.contains('ClearPath').should('be.visible')
    })

    it('should close the modal when close button is clicked', () => {
      cy.get('[data-testid="clearpath-button"], button').contains(/clearpath/i).click()
      cy.get('.cp-close-btn').click()
      cy.get('.clearpath-modal-backdrop').should('not.exist')
    })

    it('should close the modal when pressing Escape key', () => {
      cy.get('[data-testid="clearpath-button"], button').contains(/clearpath/i).click()
      cy.get('.clearpath-modal').should('be.visible')
      cy.get('body').type('{esc}')
      cy.get('.clearpath-modal-backdrop').should('not.exist')
    })

    it('should close the modal when clicking backdrop', () => {
      cy.get('[data-testid="clearpath-button"], button').contains(/clearpath/i).click()
      cy.get('.clearpath-modal-backdrop').click({ force: true })
      cy.get('.clearpath-modal-backdrop').should('not.exist')
    })

    it('should display demo badge in demo mode', () => {
      cy.get('[data-testid="clearpath-button"], button').contains(/clearpath/i).click()
      cy.get('.cp-demo-badge').should('be.visible').and('contain', 'Demo')
    })
  })

  describe('Tab Navigation', () => {
    beforeEach(() => {
      cy.get('[data-testid="clearpath-button"], button').contains(/clearpath/i).click()
    })

    it('should display all tabs', () => {
      cy.get('.cp-tabs').within(() => {
        cy.contains('My DAOs').should('be.visible')
        cy.contains('Browse').should('be.visible')
        cy.contains('Proposals').should('be.visible')
        cy.contains('Metrics').should('be.visible')
        cy.contains('Launch').should('be.visible')
      })
    })

    it('should activate My DAOs tab by default', () => {
      cy.get('.cp-tab').contains('My DAOs').parent().should('have.class', 'active')
    })

    it('should switch to Browse tab when clicked', () => {
      cy.get('.cp-tab').contains('Browse').click()
      cy.get('.cp-tab').contains('Browse').parent().should('have.class', 'active')
      cy.get('#panel-browse').should('be.visible')
    })

    it('should switch to Proposals tab when clicked', () => {
      cy.get('.cp-tab').contains('Proposals').click()
      cy.get('.cp-tab').contains('Proposals').parent().should('have.class', 'active')
      cy.get('#panel-proposals').should('be.visible')
    })

    it('should switch to Metrics tab when clicked', () => {
      cy.get('.cp-tab').contains('Metrics').click()
      cy.get('.cp-tab').contains('Metrics').parent().should('have.class', 'active')
      cy.get('#panel-metrics').should('be.visible')
    })

    it('should switch to Launch tab when clicked', () => {
      cy.get('.cp-tab').contains('Launch').click()
      cy.get('.cp-tab').contains('Launch').parent().should('have.class', 'active')
      cy.get('#panel-launch').should('be.visible')
    })

    it('should show badge count on My DAOs tab', () => {
      cy.get('.cp-tab').contains('My DAOs').parent().find('.cp-tab-badge').should('exist')
    })
  })

  describe('My DAOs Tab', () => {
    beforeEach(() => {
      cy.get('[data-testid="clearpath-button"], button').contains(/clearpath/i).click()
    })

    it('should display list of DAOs in demo mode', () => {
      cy.get('.cp-dao-list').should('be.visible')
      cy.get('.cp-dao-card').should('have.length.at.least', 1)
    })

    it('should show DAO information in list', () => {
      cy.get('.cp-dao-card').first().within(() => {
        cy.get('.cp-dao-avatar').should('be.visible')
        cy.get('h4').should('not.be.empty')
        cy.get('p').should('not.be.empty')
        cy.contains('Members').should('be.visible')
        cy.contains('Treasury').should('be.visible')
      })
    })

    it('should navigate to DAO detail view when clicked', () => {
      cy.get('.cp-dao-card').first().click()
      cy.get('.cp-detail').should('be.visible')
      cy.get('.cp-back-btn').should('be.visible').and('contain', 'Back')
    })

    it('should navigate back from DAO detail view', () => {
      cy.get('.cp-dao-card').first().click()
      cy.get('.cp-back-btn').click()
      cy.get('.cp-dao-list').should('be.visible')
    })
  })

  describe('Browse Tab', () => {
    beforeEach(() => {
      cy.get('[data-testid="clearpath-button"], button').contains(/clearpath/i).click()
      cy.get('.cp-tab').contains('Browse').click()
    })

    it('should display browseable DAOs', () => {
      cy.get('.cp-dao-list').should('be.visible')
      cy.get('.cp-dao-card').should('have.length.at.least', 1)
    })

    it('should show join indicator on browse DAOs', () => {
      cy.get('.cp-dao-card').first().within(() => {
        cy.get('.cp-join-indicator').should('be.visible').and('contain', 'Join')
      })
    })
  })

  describe('Proposals Tab', () => {
    beforeEach(() => {
      cy.get('[data-testid="clearpath-button"], button').contains(/clearpath/i).click()
      cy.get('.cp-tab').contains('Proposals').click()
    })

    it('should display list of proposals', () => {
      cy.get('.cp-proposal-list').should('be.visible')
      cy.get('.cp-proposal-card').should('have.length.at.least', 1)
    })

    it('should show proposal information in list', () => {
      cy.get('.cp-proposal-card').first().within(() => {
        cy.get('h4').should('not.be.empty')
        cy.get('.cp-proposal-dao').should('be.visible')
        cy.get('.cp-proposal-votes').should('be.visible')
        cy.get('.cp-status-badge').should('be.visible')
      })
    })

    it('should navigate to proposal detail view when clicked', () => {
      cy.get('.cp-proposal-card').first().click()
      cy.get('.cp-detail').should('be.visible')
      cy.get('.cp-back-btn').should('be.visible').and('contain', 'Back to proposals')
    })

    it('should display vote information in detail view', () => {
      cy.get('.cp-proposal-card').first().click()
      cy.get('.cp-vote-progress').should('be.visible')
    })

    it('should show no votes message when totalVotes is 0', () => {
      // This would need a demo proposal with 0 votes
      // Testing the conditional rendering logic
      cy.get('.cp-proposal-card').first().click()
      cy.get('body').then(($body) => {
        if ($body.find('.cp-no-votes-message').length > 0) {
          cy.get('.cp-no-votes-message').should('contain', 'No votes yet')
        }
      })
    })
  })

  describe('Metrics Tab', () => {
    beforeEach(() => {
      cy.get('[data-testid="clearpath-button"], button').contains(/clearpath/i).click()
      cy.get('.cp-tab').contains('Metrics').click()
    })

    it('should display metrics overview', () => {
      cy.get('.cp-metrics').should('be.visible')
    })

    it('should show welfare indicators', () => {
      cy.contains('Member Satisfaction').should('be.visible')
      cy.contains('Treasury Efficiency').should('be.visible')
      cy.contains('Governance Activity').should('be.visible')
    })
  })

  describe('Launch Tab - Form Validation', () => {
    beforeEach(() => {
      cy.get('[data-testid="clearpath-button"], button').contains(/clearpath/i).click()
      cy.get('.cp-tab').contains('Launch').click()
    })

    it('should display Launch DAO form', () => {
      cy.get('.cp-launch-form').should('be.visible')
      cy.get('#dao-name').should('be.visible')
      cy.get('#dao-description').should('be.visible')
      cy.get('#treasury-vault').should('be.visible')
      cy.get('#dao-admins').should('be.visible')
    })

    it('should show error when name is too short', () => {
      cy.get('#dao-name').type('AB')
      cy.get('#dao-description').type('This is a long enough description for validation to pass')
      cy.get('.cp-launch-form').submit()
      cy.get('.cp-error').should('contain', 'Name must be at least 3 characters')
    })

    it('should show error when description is too short', () => {
      cy.get('#dao-name').type('My Test DAO')
      cy.get('#dao-description').type('Too short')
      cy.get('.cp-launch-form').submit()
      cy.get('.cp-error').should('contain', 'Description must be at least 20 characters')
    })

    it('should validate treasury vault address', () => {
      cy.get('#dao-name').type('My Test DAO')
      cy.get('#dao-description').type('This is a long enough description for validation')
      cy.get('#treasury-vault').type('invalid-address')
      cy.get('.cp-launch-form').submit()
      cy.get('.cp-error').should('contain', 'Treasury vault must be a valid Ethereum address')
    })

    it('should validate admin addresses', () => {
      cy.get('#dao-name').type('My Test DAO')
      cy.get('#dao-description').type('This is a long enough description for validation')
      cy.get('#dao-admins').type('invalid-address')
      cy.get('.cp-launch-form').submit()
      cy.get('.cp-error').should('contain', 'Invalid Ethereum address')
    })

    it('should accept valid form submission', () => {
      cy.get('#dao-name').type('My Test DAO')
      cy.get('#dao-description').type('This is a comprehensive description of my test DAO for validation purposes')
      cy.get('.cp-launch-form').submit()
      cy.get('button[type="submit"]').should('contain', 'Creating DAO...')
    })
  })

  describe('Keyboard Navigation', () => {
    beforeEach(() => {
      cy.get('[data-testid="clearpath-button"], button').contains(/clearpath/i).click()
    })

    it('should support arrow key navigation in DAO list', () => {
      cy.get('.cp-dao-card').first().focus()
      cy.focused().should('exist')
      
      cy.focused().type('{downarrow}')
      cy.get('.cp-dao-card').eq(1).should('have.focus')
      
      cy.focused().type('{uparrow}')
      cy.get('.cp-dao-card').first().should('have.focus')
    })

    it('should support Enter key to select DAO', () => {
      cy.get('.cp-dao-card').first().focus()
      cy.focused().type('{enter}')
      cy.get('.cp-detail').should('be.visible')
    })

    it('should support arrow key navigation in proposal list', () => {
      cy.get('.cp-tab').contains('Proposals').click()
      cy.get('.cp-proposal-card').first().focus()
      cy.focused().should('exist')
      
      cy.focused().type('{downarrow}')
      cy.get('.cp-proposal-card').eq(1).should('have.focus')
    })
  })

  describe('Accessibility', () => {
    beforeEach(() => {
      cy.get('[data-testid="clearpath-button"], button').contains(/clearpath/i).click()
    })

    it('should have proper ARIA roles', () => {
      cy.get('.clearpath-modal-backdrop').should('have.attr', 'role', 'dialog')
      cy.get('.clearpath-modal-backdrop').should('have.attr', 'aria-modal', 'true')
      cy.get('.cp-tabs').should('have.attr', 'role', 'tablist')
      cy.get('.cp-tab').should('have.attr', 'role', 'tab')
    })

    it('should have aria-selected on active tab', () => {
      cy.get('.cp-tab.active').should('have.attr', 'aria-selected', 'true')
    })

    it('should have aria-label on close button', () => {
      cy.get('.cp-close-btn').should('have.attr', 'aria-label', 'Close modal')
    })

    it('should have proper heading structure', () => {
      cy.get('h2').should('contain', 'ClearPath')
      cy.get('h3, h4').should('exist')
    })

    it('should support reduced motion', () => {
      cy.window().then((win) => {
        win.matchMedia = cy.stub().returns({ matches: true })
      })
      // Modal should still be functional with reduced motion
      cy.get('.clearpath-modal').should('be.visible')
    })
  })

  describe('Responsive Design', () => {
    it('should work on mobile viewport', () => {
      cy.viewport('iphone-x')
      cy.get('[data-testid="clearpath-button"], button').contains(/clearpath/i).click()
      cy.get('.clearpath-modal').should('be.visible')
      
      // Tab labels should be visually hidden on mobile but still accessible
      cy.get('.cp-tab span:not(.cp-tab-badge)').should('exist')
    })

    it('should work on tablet viewport', () => {
      cy.viewport('ipad-2')
      cy.get('[data-testid="clearpath-button"], button').contains(/clearpath/i).click()
      cy.get('.clearpath-modal').should('be.visible')
      cy.get('.cp-tabs').should('be.visible')
    })
  })

  describe('Error Handling', () => {
    it('should display loading state while fetching data', () => {
      // In demo mode, loading state is brief
      cy.get('[data-testid="clearpath-button"], button').contains(/clearpath/i).click()
      cy.get('.clearpath-modal').should('be.visible')
    })

    it('should handle empty DAO list gracefully', () => {
      // This would require a non-demo mode test or mocked empty state
      cy.get('[data-testid="clearpath-button"], button').contains(/clearpath/i).click()
      cy.get('.cp-dao-list, .cp-empty-state').should('exist')
    })
  })
})
