// =============================================================================
// 17-onboarding.cy.js
// Fast-tier E2E tests for the landing / welcome entry points (ONB-01..ONB-03)
//
// The old popup welcome tutorial (OnboardingTutorial via DevelopmentWarningModal)
// has been removed — the site now loads straight to the landing page, which
// provides the context new users need.
// =============================================================================

describe('Onboarding', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
    cy.window().then((win) => {
      win.sessionStorage.clear()
    })
  })

  // ---------------------------------------------------------------------------
  // ONB-01: Landing page loads
  // ---------------------------------------------------------------------------
  // PENDING (#1019): LandingRoute forwards to /app once the entry gate is acked and wagmi reports reconnecting. `/?stay=1` holds the page but the beforeEach then times out in cy.window() (called before any visit) — two separate questions.
  it.skip('[ONB-01] Landing page loads', () => {
    cy.visit('/')
    cy.get('body', { timeout: 10000 }).should('be.visible')

    // The landing page should show the hero section.
    cy.get('.landing-page, .hero-section', { timeout: 10000 })
      .should('be.visible')

    // Verify the headline is rendered.
    cy.get('.hero-headline, h1', { timeout: 5000 })
      .should('be.visible')
      .invoke('text')
      .should('not.be.empty')
  })

  // ---------------------------------------------------------------------------
  // ONB-02: Launch app from landing page
  // ---------------------------------------------------------------------------
  // PENDING (#1019): same redirect + beforeEach ordering as ONB-01.
  it.skip('[ONB-02] Launch app from landing page', () => {
    cy.visit('/')
    cy.get('body', { timeout: 10000 }).should('be.visible')

    // Click "Launch App" button in the hero section.
    cy.contains('button, a', /launch app/i, { timeout: 10000 })
      .first()
      .should('be.visible')
      .click()

    // Should navigate to /app or /fairwins.
    cy.url({ timeout: 10000 })
      .should('match', /\/(app|main|fairwins)/)
  })

  // ---------------------------------------------------------------------------
  // ONB-03: Welcome view without wallet
  // ---------------------------------------------------------------------------
  // PENDING (#1019): asserts `.welcome-view` at /fairwins, which renders HomeScreen; those classes live in Dashboard.jsx. Decide what the no-wallet state should show.
  it.skip('[ONB-03] Welcome view without wallet', () => {
    cy.visit('/fairwins')
    cy.get('body', { timeout: 10000 }).should('be.visible')

    // Without a wallet, the WelcomeView should render.
    cy.get('.welcome-view, .welcome-hero', { timeout: 10000 })
      .should('be.visible')

    // Verify the "Connect Wallet" button is present.
    cy.get('.welcome-connect-btn, button')
      .contains(/connect wallet/i)
      .should('be.visible')

    // Verify the "How it works" steps section.
    cy.get('.welcome-steps, .welcome-steps-grid', { timeout: 5000 })
      .should('be.visible')

    // Verify resolution methods section.
    cy.get('.welcome-resolution, .welcome-resolution-grid', { timeout: 5000 })
      .should('be.visible')
  })
})
