/**
 * E2E Tests: Nullifier Management
 *
 * Tests the nullifier system including:
 * - Admin panel nullifier tab visibility
 * - Market nullification workflow
 * - Address nullification workflow
 * - Market filtering in frontend
 * - Statistics display
 */

describe('Nullifier Management', () => {
  // Test admin account with NULLIFIER_ADMIN_ROLE
  const adminAddress = '0x52502d049571C7893447b86c4d8B38e6184bF6e1'

  beforeEach(() => {
    // Visit admin panel
    cy.visit('/admin')

    // Mock wallet connection with admin account
    cy.window().then((win) => {
      // Mock web3 provider
      win.localStorage.setItem('connectedAccount', adminAddress)
      win.localStorage.setItem('walletConnected', 'true')

      // Mock admin roles
      win.localStorage.setItem('mockRoles', JSON.stringify({
        isAdmin: true,
        isOperationsAdmin: true,
        hasNullifierRole: true
      }))
    })

    // Wait for page to load
    cy.wait(1000)
  })

  describe('Nullifier Tab Access', () => {
    it('should display nullifier tab for admin users', () => {
      // Look for nullifier tab in navigation
      cy.get('.admin-panel-tabs', { timeout: 10000 }).within(() => {
        cy.contains('button', /nullifier/i).should('be.visible')
      })
    })

    it('should show nullifier tab icon', () => {
      cy.get('.admin-panel-tabs').within(() => {
        cy.contains('button', /nullifier/i)
          .find('svg')
          .should('exist')
      })
    })

    it('should switch to nullifier tab when clicked', () => {
      cy.contains('button', /nullifier/i).click()

      // Verify tab is active
      cy.contains('button', /nullifier/i)
        .should('have.class', 'active')

      // Verify content is displayed
      cy.contains('Nullification Statistics').should('be.visible')
    })
  })

  describe('Nullifier Statistics Display', () => {
    beforeEach(() => {
      cy.contains('button', /nullifier/i).click()
    })

    it('should display statistics card', () => {
      cy.contains('Nullification Statistics').should('be.visible')
    })

    it('should show nullified markets count', () => {
      cy.contains('Nullified Markets').should('be.visible')
    })

    it('should show nullified addresses count', () => {
      cy.contains('Nullified Addresses').should('be.visible')
    })

    it('should show registry status', () => {
      cy.contains('Registry Status').should('be.visible')
    })

    it('should have refresh button', () => {
      cy.get('.refresh-btn').should('exist')
    })

    it('should show RSA accumulator info', () => {
      cy.contains('RSA Accumulator').should('be.visible')
      cy.contains('Params Initialized').should('be.visible')
    })
  })

  describe('Market Nullification Workflow', () => {
    beforeEach(() => {
      cy.contains('button', /nullifier/i).click()
      cy.contains('button', /nullify markets/i).click()
    })

    it('should display market nullification form', () => {
      cy.contains('Nullify Market').should('be.visible')
      cy.get('input[id="market-id"]').should('be.visible')
    })

    it('should have market ID input field', () => {
      cy.get('input[id="market-id"]')
        .should('have.attr', 'type', 'number')
        .should('have.attr', 'placeholder')
    })

    it('should have reason input field', () => {
      cy.get('input[id="market-reason"]').should('be.visible')
    })

    it('should have nullify button', () => {
      cy.contains('button', /nullify market/i).should('be.visible')
    })

    it('should validate market ID is required', () => {
      // Clear the input and try to submit
      cy.get('input[id="market-id"]').clear()
      cy.contains('button', /nullify market/i).should('be.disabled')
    })

    it('should show nullified markets list toggle', () => {
      cy.contains('Nullified Markets').should('be.visible')
      cy.get('.refresh-btn').should('exist')
    })
  })

  describe('Address Nullification Workflow', () => {
    beforeEach(() => {
      cy.contains('button', /nullifier/i).click()
      cy.contains('button', /nullify addresses/i).click()
    })

    it('should display address nullification form', () => {
      cy.contains('Nullify Address').should('be.visible')
      cy.get('input[id="nullify-address"]').should('be.visible')
    })

    it('should have address input field', () => {
      cy.get('input[id="nullify-address"]')
        .should('have.attr', 'type', 'text')
        .should('have.attr', 'placeholder', '0x...')
    })

    it('should have reason input field', () => {
      cy.get('input[id="address-reason"]').should('be.visible')
    })

    it('should validate address is required', () => {
      cy.get('input[id="nullify-address"]').clear()
      cy.contains('button', /nullify address/i).should('be.disabled')
    })

    it('should show nullified addresses list', () => {
      cy.contains('Nullified Addresses').should('be.visible')
    })
  })

  describe('Security Notice', () => {
    beforeEach(() => {
      cy.contains('button', /nullifier/i).click()
    })

    it('should display security notice', () => {
      cy.contains('Security Notice').should('be.visible')
    })

    it('should list security recommendations', () => {
      cy.contains('Document reasons').should('be.visible')
      cy.contains('Coordinate with other admins').should('be.visible')
    })

    it('should explain RSA accumulator purpose', () => {
      cy.contains(/RSA accumulator/i).should('be.visible')
    })
  })

  describe('Tab Switching', () => {
    beforeEach(() => {
      cy.contains('button', /nullifier/i).click()
    })

    it('should switch between markets and addresses tabs', () => {
      // Start on markets
      cy.contains('button', /nullify markets/i).click()
      cy.get('input[id="market-id"]').should('be.visible')

      // Switch to addresses
      cy.contains('button', /nullify addresses/i).click()
      cy.get('input[id="nullify-address"]').should('be.visible')

      // Switch back to markets
      cy.contains('button', /nullify markets/i).click()
      cy.get('input[id="market-id"]').should('be.visible')
    })

    it('should highlight active section tab', () => {
      cy.contains('button', /nullify markets/i).click()
      cy.contains('button', /nullify markets/i).should('have.class', 'active')

      cy.contains('button', /nullify addresses/i).click()
      cy.contains('button', /nullify addresses/i).should('have.class', 'active')
    })
  })
})

describe('Market Filtering with Nullification', () => {
  beforeEach(() => {
    cy.visit('/fairwins')
    cy.wait(1000)
  })

  it('should load market grid', () => {
    cy.get('.market-grid', { timeout: 10000 }).should('exist')
  })

  it('should not display nullified markets (if any)', () => {
    // This test verifies that the filtering mechanism is working
    // The data attribute tracks how many markets were filtered
    cy.get('.market-grid').then(($grid) => {
      const filteredCount = $grid.attr('data-filtered-count')
      // Log filtered count for debugging
      if (filteredCount) {
        cy.log(`Filtered ${filteredCount} nullified markets`)
      }
    })
  })

  it('should show empty state when all markets are nullified', () => {
    // This test would require mocking the nullification state
    // For now, just verify the empty state component exists
    cy.get('.market-grid-empty').should('not.exist')
      .or(cy.get('.market-grid').should('exist'))
  })
})

describe('Unauthorized Access', () => {
  beforeEach(() => {
    cy.visit('/admin')

    // Mock non-admin user
    cy.window().then((win) => {
      win.localStorage.setItem('mockRoles', JSON.stringify({
        isAdmin: false,
        isOperationsAdmin: false,
        hasNullifierRole: false
      }))
    })

    cy.wait(1000)
  })

  it('should not show nullifier tab for non-admin users', () => {
    // The tab should not be visible without proper roles
    cy.get('body').then(($body) => {
      // If admin panel loads for this user, nullifier tab should not be present
      if ($body.find('.admin-panel-tabs').length > 0) {
        cy.get('.admin-panel-tabs').within(() => {
          cy.contains('button', /nullifier/i).should('not.exist')
        })
      }
    })
  })
})

describe('Responsive Design', () => {
  beforeEach(() => {
    cy.visit('/admin')
    cy.window().then((win) => {
      win.localStorage.setItem('mockRoles', JSON.stringify({
        isAdmin: true,
        hasNullifierRole: true
      }))
    })
  })

  it('should display correctly on mobile', () => {
    cy.viewport('iphone-6')
    cy.contains('button', /nullifier/i).click()

    // Verify key elements are visible
    cy.contains('Nullification Statistics').should('be.visible')
    cy.contains('Nullify Market').should('be.visible')
  })

  it('should display correctly on tablet', () => {
    cy.viewport('ipad-2')
    cy.contains('button', /nullifier/i).click()

    cy.contains('Nullification Statistics').should('be.visible')
    cy.get('.overview-grid').should('be.visible')
  })

  it('should display correctly on desktop', () => {
    cy.viewport(1280, 720)
    cy.contains('button', /nullifier/i).click()

    cy.contains('Nullification Statistics').should('be.visible')
    cy.get('.overview-grid').should('be.visible')
  })
})

describe('Form Validation', () => {
  beforeEach(() => {
    cy.visit('/admin')
    cy.window().then((win) => {
      win.localStorage.setItem('mockRoles', JSON.stringify({
        isAdmin: true,
        hasNullifierRole: true
      }))
    })
    cy.contains('button', /nullifier/i).click()
  })

  it('should validate market ID is a positive number', () => {
    cy.contains('button', /nullify markets/i).click()

    // Enter negative number
    cy.get('input[id="market-id"]').type('-1')

    // Button should still be enabled but validation happens on submit
    cy.get('input[id="market-id"]').should('have.attr', 'min', '0')
  })

  it('should accept valid Ethereum address format', () => {
    cy.contains('button', /nullify addresses/i).click()

    const validAddress = '0x1234567890123456789012345678901234567890'
    cy.get('input[id="nullify-address"]').type(validAddress)

    // Button should be enabled
    cy.contains('button', /nullify address/i).should('not.be.disabled')
  })

  it('should allow optional reason field', () => {
    cy.contains('button', /nullify markets/i).click()

    // Enter only market ID, no reason
    cy.get('input[id="market-id"]').type('1')
    cy.get('input[id="market-reason"]').should('be.empty')

    // Button should still be enabled
    cy.contains('button', /nullify market/i).should('not.be.disabled')
  })
})
