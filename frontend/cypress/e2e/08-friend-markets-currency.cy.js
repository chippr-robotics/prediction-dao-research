/**
 * E2E Test: Friend Markets Currency Selection
 *
 * Tests friend markets creation with different currency options:
 * - ETC (native Ethereum Classic)
 * - WETC (Wrapped ETC)
 * - USC (Classic USD Stablecoin - default)
 */

describe('Friend Markets Currency Selection', () => {
  beforeEach(() => {
    // Mock wallet connection before visiting the page
    cy.mockWeb3Provider()
    cy.visit('/fairwins')
    // Wait for page to load
    cy.wait(1000)
  })

  describe('Opening Friend Markets Modal', () => {
    it('should open friend markets modal from sidebar', () => {
      // Look for friend markets button in sidebar or nav
      cy.get('[data-testid="friend-markets-btn"], [class*="friend-market"], button')
        .contains(/friend.*market|p2p|private/i)
        .first()
        .click()

      // Verify modal opens
      cy.get('[role="dialog"]', { timeout: 5000 }).should('be.visible')
      cy.contains('Friend Markets').should('be.visible')
    })
  })

  describe('Currency Selector', () => {
    beforeEach(() => {
      // Open friend markets modal
      cy.get('[data-testid="friend-markets-btn"], [class*="friend-market"], button')
        .contains(/friend.*market|p2p|private/i)
        .first()
        .click()

      // Wait for modal to appear
      cy.get('[role="dialog"]', { timeout: 5000 }).should('be.visible')

      // Select 1v1 market type
      cy.contains('1 vs 1').click()
    })

    it('should display currency selector in create form', () => {
      // Currency selector should be visible
      cy.contains('Payment Currency').should('be.visible')

      // USC should be selected by default
      cy.get('[class*="currency-selector"]').within(() => {
        cy.contains('USC').should('be.visible')
      })
    })

    it('should default to USC (stablecoin)', () => {
      // Check that USC is the default selection
      cy.get('[class*="currency-selector"] button').first().should('contain', 'USC')

      // Stake label should show USC
      cy.contains('Stake (USC)').should('be.visible')
    })

    it('should show currency hint recommending stablecoin', () => {
      // Check for the hint text
      cy.contains(/USC.*stablecoin.*recommended.*price stability/i).should('be.visible')
    })

    it('should allow selecting ETC currency', () => {
      // Click on currency selector
      cy.get('[class*="currency-selector"] button').first().click()

      // Select ETC
      cy.get('[role="listbox"]').within(() => {
        cy.contains('Ethereum Classic').click()
      })

      // Verify ETC is now selected
      cy.get('[class*="currency-selector"] button').first().should('contain', 'ETC')

      // Stake label should update
      cy.contains('Stake (ETC)').should('be.visible')
    })

    it('should allow selecting WETC currency', () => {
      // Click on currency selector
      cy.get('[class*="currency-selector"] button').first().click()

      // Select WETC
      cy.get('[role="listbox"]').within(() => {
        cy.contains('Wrapped ETC').click()
      })

      // Verify WETC is now selected
      cy.get('[class*="currency-selector"] button').first().should('contain', 'WETC')

      // Stake label should update
      cy.contains('Stake (WETC)').should('be.visible')
    })

    it('should show all three currency options in dropdown', () => {
      // Click on currency selector to open dropdown
      cy.get('[class*="currency-selector"] button').first().click()

      // Verify all options are visible
      cy.get('[role="listbox"]').within(() => {
        cy.contains('Classic USD Stablecoin').should('be.visible')
        cy.contains('Ethereum Classic').should('be.visible')
        cy.contains('Wrapped ETC').should('be.visible')
      })
    })

    it('should mark USC as default in dropdown', () => {
      // Click on currency selector
      cy.get('[class*="currency-selector"] button').first().click()

      // Look for default badge on USC option
      cy.get('[role="listbox"]').within(() => {
        cy.contains('Default').should('be.visible')
      })
    })

    it('should close dropdown after selection', () => {
      // Click on currency selector
      cy.get('[class*="currency-selector"] button').first().click()

      // Dropdown should be visible
      cy.get('[role="listbox"]').should('be.visible')

      // Select an option
      cy.get('[role="listbox"]').within(() => {
        cy.contains('Ethereum Classic').click()
      })

      // Dropdown should be closed
      cy.get('[role="listbox"]').should('not.exist')
    })
  })

  describe('Stake Amount Validation', () => {
    beforeEach(() => {
      // Open friend markets modal and select 1v1
      cy.get('[data-testid="friend-markets-btn"], [class*="friend-market"], button')
        .contains(/friend.*market|p2p|private/i)
        .first()
        .click()

      cy.get('[role="dialog"]', { timeout: 5000 }).should('be.visible')
      cy.contains('1 vs 1').click()
    })

    it('should validate minimum stake for USC (1 USC)', () => {
      // Fill in required fields except stake
      cy.get('input[placeholder*="Patriots"]').type('Who will win the game?')
      cy.get('input[placeholder*="0x"]').first().type('0xabcdef1234567890123456789012345678901234')

      // Enter stake below minimum
      cy.get('input[type="number"]').first().clear().type('0.5')

      // Try to submit
      cy.contains('button', /create market/i).click()

      // Should show validation error
      cy.contains(/minimum stake is 1 USC/i).should('be.visible')
    })

    it('should validate minimum stake for ETC (0.1 ETC)', () => {
      // Select ETC currency
      cy.get('[class*="currency-selector"] button').first().click()
      cy.get('[role="listbox"]').within(() => {
        cy.contains('Ethereum Classic').click()
      })

      // Fill in required fields
      cy.get('input[placeholder*="Patriots"]').type('Who will win the game?')
      cy.get('input[placeholder*="0x"]').first().type('0xabcdef1234567890123456789012345678901234')

      // Enter stake below minimum for ETC
      cy.get('input[type="number"]').first().clear().type('0.05')

      // Try to submit
      cy.contains('button', /create market/i).click()

      // Should show validation error
      cy.contains(/minimum stake is 0.1 ETC/i).should('be.visible')
    })

    it('should update placeholder based on currency', () => {
      // Default should show USC placeholder
      cy.get('input[type="number"]').first().should('have.attr', 'placeholder', '10')

      // Switch to ETC
      cy.get('[class*="currency-selector"] button').first().click()
      cy.get('[role="listbox"]').within(() => {
        cy.contains('Ethereum Classic').click()
      })

      // Placeholder should change
      cy.get('input[type="number"]').first().should('have.attr', 'placeholder', '0.5')
    })
  })

  describe('Market Creation with Currency', () => {
    beforeEach(() => {
      // Open friend markets modal and select 1v1
      cy.get('[data-testid="friend-markets-btn"], [class*="friend-market"], button')
        .contains(/friend.*market|p2p|private/i)
        .first()
        .click()

      cy.get('[role="dialog"]', { timeout: 5000 }).should('be.visible')
      cy.contains('1 vs 1').click()
    })

    it('should create market with USC currency', () => {
      // Fill in form
      cy.get('input[placeholder*="Patriots"]').type('Patriots will win the Super Bowl')
      cy.get('input[placeholder*="0x"]').first().type('0xabcdef1234567890123456789012345678901234')
      cy.get('input[type="number"]').first().clear().type('100')

      // Submit form
      cy.contains('button', /create market/i).click()

      // Wait for success state
      cy.contains('Market Created!', { timeout: 10000 }).should('be.visible')

      // Verify currency is shown in success details
      cy.contains('100 USC').should('be.visible')
    })

    it('should create market with ETC currency', () => {
      // Select ETC currency
      cy.get('[class*="currency-selector"] button').first().click()
      cy.get('[role="listbox"]').within(() => {
        cy.contains('Ethereum Classic').click()
      })

      // Fill in form
      cy.get('input[placeholder*="Patriots"]').type('BTC reaches $100k by EOY')
      cy.get('input[placeholder*="0x"]').first().type('0xabcdef1234567890123456789012345678901234')
      cy.get('input[type="number"]').first().clear().type('1')

      // Submit form
      cy.contains('button', /create market/i).click()

      // Wait for success state
      cy.contains('Market Created!', { timeout: 10000 }).should('be.visible')

      // Verify currency is shown in success details
      cy.contains('1 ETC').should('be.visible')
    })
  })

  describe('Active Markets Currency Display', () => {
    it('should display currency for each market in active list', () => {
      // Open friend markets modal
      cy.get('[data-testid="friend-markets-btn"], [class*="friend-market"], button')
        .contains(/friend.*market|p2p|private/i)
        .first()
        .click()

      cy.get('[role="dialog"]', { timeout: 5000 }).should('be.visible')

      // Click on Active tab
      cy.contains('[role="tab"]', /active/i).click()

      // If there are active markets, they should show currency
      cy.get('body').then(($body) => {
        if ($body.find('[role="table"]').length > 0) {
          // Markets exist, check for currency display
          cy.get('[role="table"]').within(() => {
            cy.get('td').should('contain.text', /USC|ETC|WETC/)
          })
        } else {
          // No markets, verify empty state
          cy.contains(/no active markets/i).should('be.visible')
        }
      })
    })
  })

  describe('Market Detail Currency Display', () => {
    it('should display currency in market detail view', () => {
      // Open friend markets modal
      cy.get('[data-testid="friend-markets-btn"], [class*="friend-market"], button')
        .contains(/friend.*market|p2p|private/i)
        .first()
        .click()

      cy.get('[role="dialog"]', { timeout: 5000 }).should('be.visible')

      // Click on Active tab
      cy.contains('[role="tab"]', /active/i).click()

      // If there are markets, click on one to view details
      cy.get('body').then(($body) => {
        if ($body.find('[role="table"] tr').length > 1) {
          // Click on first market row
          cy.get('[role="table"] tbody tr').first().click()

          // Verify currency is displayed in detail view
          cy.contains('Currency').should('be.visible')
          cy.contains(/USC|ETC|WETC/).should('be.visible')
        }
      })
    })
  })

  describe('Currency Reset on Create Another', () => {
    beforeEach(() => {
      // Open friend markets modal and select 1v1
      cy.get('[data-testid="friend-markets-btn"], [class*="friend-market"], button')
        .contains(/friend.*market|p2p|private/i)
        .first()
        .click()

      cy.get('[role="dialog"]', { timeout: 5000 }).should('be.visible')
      cy.contains('1 vs 1').click()
    })

    it('should reset currency to USC when creating another market', () => {
      // Select ETC currency first
      cy.get('[class*="currency-selector"] button').first().click()
      cy.get('[role="listbox"]').within(() => {
        cy.contains('Ethereum Classic').click()
      })

      // Fill in and submit form
      cy.get('input[placeholder*="Patriots"]').type('Test bet')
      cy.get('input[placeholder*="0x"]').first().type('0xabcdef1234567890123456789012345678901234')
      cy.get('input[type="number"]').first().clear().type('1')
      cy.contains('button', /create market/i).click()

      // Wait for success
      cy.contains('Market Created!', { timeout: 10000 }).should('be.visible')

      // Click create another
      cy.contains('button', /create another/i).click()

      // Select 1v1 again
      cy.contains('1 vs 1').click()

      // Currency should be reset to USC (default)
      cy.get('[class*="currency-selector"] button').first().should('contain', 'USC')
    })
  })
})
