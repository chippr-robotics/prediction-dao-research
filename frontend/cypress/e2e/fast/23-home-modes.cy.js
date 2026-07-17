// =============================================================================
// 23-home-modes.cy.js
// Fast-tier E2E smoke for the three-mode home surface (spec 058 HMM-01..HMM-05):
// land on Pay, switch modes via the switcher, generate a request QR, and
// confirm the wager create view stays reachable. Runs without a Hardhat node —
// the surface itself renders for disconnected users (connect gates the actions).
// =============================================================================

describe('Home modes (spec 058)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  function visitHome() {
    cy.visit('/app')
    cy.get('body', { timeout: 10000 }).should('be.visible')
  }

  // ---------------------------------------------------------------------------
  // HMM-01: Pay is the default landing mode
  // ---------------------------------------------------------------------------
  it('[HMM-01] lands on the Pay mode — amount hero, recipient row, Pay affordance', () => {
    visitHome()
    cy.get('section[aria-label="Pay"]', { timeout: 10000 }).should('be.visible')
    cy.get('section[aria-label="Pay"] .amount-keypad').should('be.visible')
    cy.get('#pay-to').should('exist')
    cy.get('section[aria-label="Request"]').should('not.be.visible')
    cy.get('section[aria-label="Create a challenge"]').should('not.be.visible')
  })

  // ---------------------------------------------------------------------------
  // HMM-02: the switcher moves between all three modes in place
  // ---------------------------------------------------------------------------
  it('[HMM-02] switches Pay → Request → Wager without leaving the page', () => {
    visitHome()
    // Desktop viewport: the segmented switcher.
    cy.get('[role="radio"]').contains('Request').click()
    cy.get('section[aria-label="Request"]').should('be.visible')
    cy.get('[role="radio"]').contains('Wager').click()
    cy.get('section[aria-label="Create a challenge"]').should('be.visible')
    cy.location('pathname').should('eq', '/app')
  })

  // ---------------------------------------------------------------------------
  // HMM-03: the mobile bottom bar drives the same switch
  // ---------------------------------------------------------------------------
  it('[HMM-03] mobile shows the three-glyph bottom bar and it switches modes', () => {
    cy.viewport(390, 844)
    visitHome()
    cy.get('nav[aria-label="Home mode"]', { timeout: 10000 }).should('be.visible')
    cy.get('nav[aria-label="Home mode"] button').should('have.length', 3)
    cy.get('nav[aria-label="Home mode"] button').contains('Wager').click()
    cy.get('section[aria-label="Create a challenge"]').should('be.visible')
    cy.get('nav[aria-label="Home mode"] button').contains('Pay').click()
    cy.get('section[aria-label="Pay"]').should('be.visible')
    // The bar is a home-surface pattern, not app-wide.
    cy.visit('/wagers')
    cy.get('nav[aria-label="Home mode"]').should('not.exist')
  })

  // ---------------------------------------------------------------------------
  // HMM-04: Request mode asks to connect before generating a code
  // ---------------------------------------------------------------------------
  it('[HMM-04] Request mode renders the hero + note and gates generation on connect', () => {
    visitHome()
    cy.get('[role="radio"]').contains('Request').click()
    cy.get('section[aria-label="Request"] .amount-keypad').should('be.visible')
    cy.get('#request-note').should('exist')
    // Disconnected: the primary action is the connect prompt.
    cy.get('section[aria-label="Request"]').contains('button', /Connect wallet/i).should('be.visible')
  })

  // ---------------------------------------------------------------------------
  // HMM-05: wager extras render only in wager mode
  // ---------------------------------------------------------------------------
  it('[HMM-05] Accept-a-challenge / My Wagers appear only in the Wager mode', () => {
    visitHome()
    cy.contains('button', 'Accept a challenge').should('not.exist')
    cy.get('[role="radio"]').contains('Wager').click()
    cy.contains('button', 'Accept a challenge').should('be.visible')
    cy.contains('button', 'My Wagers').should('be.visible')
  })
})
