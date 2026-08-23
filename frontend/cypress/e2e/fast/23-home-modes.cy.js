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
  /*
   * Un-skipped (#1019). The recorded reason — "mode switcher click hits a covered element" — no
   * longer reproduces: run as written at desktop width, HMM-02/04/05 all pass. The overlay they
   * were written against is gone (the `visit` override now closes the auto-opened connect dialog).
   * What was left was the two things below, and both were found by running at BOTH viewport
   * profiles rather than at one.
   *
   * PIN THE WIDTH. The segmented switcher is the LARGE-viewport control; at phone width the mode
   * control is the three-glyph bottom bar, which HMM-03 covers and which pins 390x844 for exactly
   * this reason. The no-chain tier runs every spec at both profiles, so a test about a
   * width-specific control has to say which width it means, or it fails at the other one for
   * something that is not a defect.
   *
   * SCOPE THE SELECTOR. A bare `[role="radio"]` is not the switcher — the page carries other
   * PillSelects, and at phone width the unscoped query resolved to one of them and hunted for
   * "Request" inside it. That is a latent mis-target at any width, so it is scoped rather than
   * merely made to work here.
   */
  it('[HMM-02] switches Pay → Request → Wager without leaving the page', () => {
    cy.viewport(1280, 720)
    visitHome()
    // The segmented switcher — large viewports only (HMM-03 covers the phone bottom bar).
    cy.get('.home-mode-switcher [role="radio"]').contains('Request').click()
    cy.get('section[aria-label="Request"]').should('be.visible')
    cy.get('.home-mode-switcher [role="radio"]').contains('Wager').click()
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
    // The bar is a home-surface pattern, not app-wide. `/wagers` is now a redirect into the
    // Transfer section (spec 073), so this also pins that the legacy link still resolves.
    cy.visit('/wagers')
    cy.location('search').should('include', 'tab=paytransfer')
    cy.location('search').should('include', 'view=wagers')
    cy.get('nav[aria-label="Home mode"]').should('not.exist')
  })

  // ---------------------------------------------------------------------------
  // HMM-04: Request mode asks to connect before generating a code
  // ---------------------------------------------------------------------------
  // Desktop-width switcher, scoped selector — see HMM-02.
  it('[HMM-04] Request mode renders the hero + note and gates generation on connect', () => {
    cy.viewport(1280, 720)
    visitHome()
    cy.get('.home-mode-switcher [role="radio"]').contains('Request').click()
    cy.get('section[aria-label="Request"] .amount-keypad').should('be.visible')
    cy.get('#request-note').should('exist')
    // Disconnected: the primary action is the connect prompt.
    cy.get('section[aria-label="Request"]').contains('button', /Connect wallet/i).should('be.visible')
  })

  // ---------------------------------------------------------------------------
  // HMM-05: wager extras render only in wager mode
  // ---------------------------------------------------------------------------
  // Desktop-width switcher, scoped selector — see HMM-02.
  it('[HMM-05] Accept-a-challenge / My Wagers appear only in the Wager mode', () => {
    cy.viewport(1280, 720)
    visitHome()
    cy.contains('button', 'Accept a challenge').should('not.exist')
    cy.get('.home-mode-switcher [role="radio"]').contains('Wager').click()
    cy.contains('button', 'Accept a challenge').should('be.visible')
    cy.contains('button', 'My Wagers').should('be.visible')
  })
})
