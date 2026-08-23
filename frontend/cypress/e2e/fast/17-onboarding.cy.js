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
    /*
     * cy.clearAllSessionStorage(), NOT cy.window().then(win => win.sessionStorage.clear()).
     *
     * This hook runs before any cy.visit, so there is no application window to reach — the
     * cy.window() it used to call timed out every time, taking the whole spec with it. Cypress's
     * own command clears session storage across origins without needing a loaded page.
     */
    cy.clearAllSessionStorage()
  })

  // ---------------------------------------------------------------------------
  // ONB-01: Landing page loads
  // ---------------------------------------------------------------------------
  /*
   * `/?stay=1` is the app's OWN escape hatch (LandingRoute: "Escape hatches, both honoured for the
   * rest of the tab session"), not a test-only trapdoor — which is why this uses it rather than
   * fighting the redirect.
   *
   * The redirect is real and fires even with no wallet: LandingRoute treats a `connecting` /
   * `reconnecting` wagmi status as a returning member, and wagmi's reconnect-on-mount passes
   * through that status on every load. So a visitor who has acknowledged the entry gate is
   * forwarded to the app before the landing page can be asserted on.
   *
   * Not `acknowledgeEntryGate: false`, which would also stop the redirect: it stops it by leaving
   * the entry gate UNACKNOWLEDGED, and the gate's overlay then covers the hero this test is about.
   * One overlay traded for another.
   */
  it('[ONB-01] Landing page loads', () => {
    cy.visit('/?stay=1')
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
  // Same escape hatch as ONB-01, for the same reason.
  it('[ONB-02] Launch app from landing page', () => {
    cy.visit('/?stay=1')
    cy.get('body', { timeout: 10000 }).should('be.visible')

    /*
     * The LANDING PAGE's own hero CTA (`.hero-cta-primary`), not the first "Launch App" in the
     * document. There are three: two in Header.jsx (the desktop nav bar and the mobile menu) and
     * this one. A `.first()` over the whole page picked the header's, which is display:none at
     * phone width — so the test failed on "not visible" at 390px while passing at 1280px, for a
     * reason that had nothing to do with what it is testing.
     *
     * The hero button is the landing page's primary call to action and renders at both widths,
     * which is what makes it the right target for a test about the landing page.
     *
     * Scoped to `#hero` because `.hero-cta-primary` is used twice — once here and once by the
     * closing CTA near the foot of the page (`.hero-cta-primary.cta-large`). Both run the same
     * handler, so either would exercise the flow, but an unscoped selector matches two elements
     * and cy.click() refuses that outright.
     */
    cy.get('#hero .hero-cta-primary', { timeout: 10000 })
      .should('be.visible')
      .and('contain.text', 'Launch App')
      .click()

    /*
     * Launch App lands on whichever surface `landingViewPreference` resolves, and there are
     * exactly two: HOME_ITEM.to ('/app') and PORTFOLIO_PATH ('/wallet?tab=account&view=portfolio'),
     * chosen by device width (mobile -> Home, larger -> Portfolio) unless Preferences overrides it.
     *
     * This spec runs at BOTH viewport profiles, so it has to accept either — but accepting either
     * is not the same as accepting anything. The old expectation, /(app|main|fairwins)/, was stale
     * (the destination moved to the unified account view) and also loose enough that '/main' and
     * '/fairwins' would have satisfied it despite neither being reachable from this button.
     * Matching the two real constants fails if the button goes somewhere else, or nowhere.
     */
    cy.url({ timeout: 10000 })
      .should('match', /(\/app$|\/wallet\?tab=account&view=portfolio$)/)
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
