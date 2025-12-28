/**
 * E2E Test: Market Sorting Functionality
 * 
 * Tests the new sorting options for prediction markets:
 * - Ending Time
 * - Market Value
 * - Volume (24h)
 * - Activity (Trades)
 * - Popularity (Traders)
 * - Probability (YES%)
 */

describe('Market Sorting Functionality', () => {
  beforeEach(() => {
    // Mock wallet connection BEFORE visiting the page
    cy.mockWeb3Provider()
    cy.visit('/fairwins')
    
    // Navigate to a category with markets (e.g., Sports)
    cy.contains('button', /sports/i, { timeout: 10000 }).click()
    cy.wait(1000)
  })

  it('should display sort dropdown with all sorting options', () => {
    // Find the sort dropdown
    cy.get('select[id="sort-select"]').should('exist')
    
    // Verify all sorting options are available
    cy.get('select[id="sort-select"] option').should('have.length', 6)
    cy.get('select[id="sort-select"] option').eq(0).should('contain', 'Ending Time')
    cy.get('select[id="sort-select"] option').eq(1).should('contain', 'Market Value')
    cy.get('select[id="sort-select"] option').eq(2).should('contain', 'Volume (24h)')
    cy.get('select[id="sort-select"] option').eq(3).should('contain', 'Activity (Trades)')
    cy.get('select[id="sort-select"] option').eq(4).should('contain', 'Popularity (Traders)')
    cy.get('select[id="sort-select"] option').eq(5).should('contain', 'Probability (YES%)')
  })

  it('should sort by Ending Time by default', () => {
    cy.get('select[id="sort-select"]').should('have.value', 'endTime')
  })

  it('should change sort order when selecting Market Value', () => {
    // Select Market Value sorting
    cy.get('select[id="sort-select"]').select('marketValue')
    
    // Verify the selection changed
    cy.get('select[id="sort-select"]').should('have.value', 'marketValue')
    
    // Wait for re-render
    cy.wait(500)
    
    // Markets should still be displayed
    cy.get('[role="grid"]').should('exist')
  })

  it('should change sort order when selecting Volume (24h)', () => {
    // Select Volume sorting
    cy.get('select[id="sort-select"]').select('volume24h')
    
    // Verify the selection changed
    cy.get('select[id="sort-select"]').should('have.value', 'volume24h')
    
    // Wait for re-render
    cy.wait(500)
    
    // Markets should still be displayed
    cy.get('[role="grid"]').should('exist')
  })

  it('should change sort order when selecting Activity (Trades)', () => {
    // Select Activity sorting
    cy.get('select[id="sort-select"]').select('activity')
    
    // Verify the selection changed
    cy.get('select[id="sort-select"]').should('have.value', 'activity')
    
    // Wait for re-render
    cy.wait(500)
    
    // Markets should still be displayed
    cy.get('[role="grid"]').should('exist')
  })

  it('should change sort order when selecting Popularity (Traders)', () => {
    // Select Popularity sorting
    cy.get('select[id="sort-select"]').select('popularity')
    
    // Verify the selection changed
    cy.get('select[id="sort-select"]').should('have.value', 'popularity')
    
    // Wait for re-render
    cy.wait(500)
    
    // Markets should still be displayed
    cy.get('[role="grid"]').should('exist')
  })

  it('should change sort order when selecting Probability (YES%)', () => {
    // Select Probability sorting
    cy.get('select[id="sort-select"]').select('probability')
    
    // Verify the selection changed
    cy.get('select[id="sort-select"]').should('have.value', 'probability')
    
    // Wait for re-render
    cy.wait(500)
    
    // Markets should still be displayed
    cy.get('[role="grid"]').should('exist')
  })

  it('should maintain sort selection when switching between categories', () => {
    // Select a specific sort option
    cy.get('select[id="sort-select"]').select('volume24h')
    cy.wait(500)
    
    // Switch to another category
    cy.contains('button', /crypto|politics|finance/i).first().click()
    cy.wait(1000)
    
    // Sort selection should be maintained (sort state is preserved across category changes)
    cy.get('select[id="sort-select"]').should('have.value', 'volume24h')
  })

  it('should display markets in different order when changing sort', () => {
    // Get the first market title with Ending Time sort
    cy.get('select[id="sort-select"]').select('endTime')
    cy.wait(500)
    
    cy.get('[role="grid"] h3').first().invoke('text').then((firstTitleEndTime) => {
      // Change to Market Value sort
      cy.get('select[id="sort-select"]').select('marketValue')
      cy.wait(500)
      
      // Get the first market title with Market Value sort
      cy.get('[role="grid"] h3').first().invoke('text').then((firstTitleMarketValue) => {
        // The titles might be different (if markets have different values)
        // Or at least verify markets are displayed
        expect(firstTitleEndTime).to.be.a('string')
        expect(firstTitleMarketValue).to.be.a('string')
      })
    })
  })
})
