// =============================================================================
// 17-onboarding.cy.js
// Fast-tier E2E tests for onboarding / tutorial flows (ONB-01..ONB-08)
//
// The OnboardingTutorial component is shown via the DevelopmentWarningModal
// wrapper. It stores dismissal in sessionStorage / localStorage under the key
// 'dev_warning_modal_seen_v2'. The tutorial is a 6-step carousel with
// Next / Back / Skip controls and a "Don't show again" checkbox.
// =============================================================================

const DEV_WARNING_KEY = 'dev_warning_modal_seen_v2'
const TEST_ACCOUNT_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const TEST_ACCOUNT_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

describe('Onboarding', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
    // Also clear sessionStorage so the tutorial shows on every test.
    cy.window().then((win) => {
      win.sessionStorage.clear()
    })
  })

  // ---------------------------------------------------------------------------
  // ONB-01: Landing page loads
  // ---------------------------------------------------------------------------
  it('[ONB-01] Landing page loads', () => {
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
  it('[ONB-02] Launch app from landing page', () => {
    // Dismiss the tutorial first so it doesn't block navigation.
    cy.window().then((win) => {
      win.sessionStorage.setItem(DEV_WARNING_KEY, 'true')
    })

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
  it('[ONB-03] Welcome view without wallet', () => {
    // Dismiss onboarding so we can see the welcome view.
    cy.window().then((win) => {
      win.sessionStorage.setItem(DEV_WARNING_KEY, 'true')
    })

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

  // ---------------------------------------------------------------------------
  // ONB-04: Onboarding tutorial appears on first visit
  // ---------------------------------------------------------------------------
  it('[ONB-04] Onboarding tutorial appears on first visit', () => {
    // Do NOT set the dismissal key — tutorial should appear.
    cy.visit('/fairwins')
    cy.get('body', { timeout: 10000 }).should('be.visible')

    // The onboarding modal should be visible.
    cy.get('.onboarding-backdrop, .onboarding-modal', { timeout: 10000 })
      .should('be.visible')

    // Verify it's a dialog.
    cy.get('[role="dialog"][aria-modal="true"]', { timeout: 5000 })
      .should('be.visible')

    // Verify the first step title is "Welcome to FairWins".
    cy.get('#onboarding-title, .step-title', { timeout: 5000 })
      .should('be.visible')
      .should('contain.text', 'Welcome to FairWins')

    // Verify progress indicator shows "1 of 6".
    cy.get('.progress-text', { timeout: 5000 })
      .should('contain.text', '1 of 6')
  })

  // ---------------------------------------------------------------------------
  // ONB-05: Navigate tutorial steps
  // ---------------------------------------------------------------------------
  it('[ONB-05] Navigate tutorial steps', () => {
    cy.visit('/fairwins')
    cy.get('body', { timeout: 10000 }).should('be.visible')

    // Tutorial should open on step 1.
    cy.get('.onboarding-modal', { timeout: 10000 }).should('be.visible')
    cy.get('.progress-text').should('contain.text', '1 of 6')

    // Click "Next" to go to step 2.
    cy.get('.nav-btn.primary').contains('Next').click()
    cy.get('.progress-text', { timeout: 3000 }).should('contain.text', '2 of 6')

    // Verify step 2 title is "Creating a Wager".
    cy.get('#onboarding-title, .step-title')
      .should('contain.text', 'Creating a Wager')

    // Click "Next" to go to step 3.
    cy.get('.nav-btn.primary').contains('Next').click()
    cy.get('.progress-text', { timeout: 3000 }).should('contain.text', '3 of 6')

    // Click "Back" to go back to step 2.
    cy.get('.nav-btn.secondary').contains('Back').click()
    cy.get('.progress-text', { timeout: 3000 }).should('contain.text', '2 of 6')

    // Navigate to the last step using dots.
    cy.get('.onboarding-dots .dot').last().click()
    cy.get('.progress-text', { timeout: 3000 }).should('contain.text', '6 of 6')

    // On the last step, the primary button should say "Let's Go!".
    cy.get('.nav-btn.primary').should('contain.text', "Let's Go!")
  })

  // ---------------------------------------------------------------------------
  // ONB-06: Dismiss tutorial permanently
  // ---------------------------------------------------------------------------
  it('[ONB-06] Dismiss tutorial permanently', () => {
    cy.visit('/fairwins')
    cy.get('body', { timeout: 10000 }).should('be.visible')

    cy.get('.onboarding-modal', { timeout: 10000 }).should('be.visible')

    // Check the "Don't show this again" checkbox.
    cy.get('.onboarding-checkbox input[type="checkbox"]')
      .should('not.be.checked')
      .check()
    cy.get('.onboarding-checkbox input[type="checkbox"]')
      .should('be.checked')

    // Click "Skip" to dismiss.
    cy.get('.onboarding-skip').click()

    // The modal should close.
    cy.get('.onboarding-modal').should('not.exist')

    // Verify localStorage was set (permanent dismissal).
    cy.window().then((win) => {
      expect(win.localStorage.getItem(DEV_WARNING_KEY)).to.equal('true')
    })
  })

  // ---------------------------------------------------------------------------
  // ONB-07: Tutorial not shown on repeat visits
  // ---------------------------------------------------------------------------
  it('[ONB-07] Tutorial not shown on repeat visits', () => {
    // Pre-set the dismissal key to simulate a returning user.
    cy.window().then((win) => {
      win.localStorage.setItem(DEV_WARNING_KEY, 'true')
      win.sessionStorage.setItem(DEV_WARNING_KEY, 'true')
    })

    cy.visit('/fairwins')
    cy.get('body', { timeout: 10000 }).should('be.visible')

    // The tutorial should NOT appear.
    cy.get('.onboarding-modal').should('not.exist')
    cy.get('.onboarding-backdrop').should('not.exist')
  })

  // ---------------------------------------------------------------------------
  // ONB-08: Tutorial shown for different wallet
  // ---------------------------------------------------------------------------
  it('[ONB-08] Tutorial shown for different wallet', () => {
    // The DevelopmentWarningModal keys on sessionStorage + localStorage, NOT on
    // the wallet address. This means: if sessionStorage is cleared, the tutorial
    // shows again regardless of wallet.

    // First visit as account #0 — dismiss via sessionStorage only.
    cy.visit('/fairwins')
    cy.get('body', { timeout: 10000 }).should('be.visible')
    cy.get('.onboarding-modal', { timeout: 10000 }).should('be.visible')

    // Skip without checking "Don't show again" — only sessionStorage is set.
    cy.get('.onboarding-skip').click()
    cy.get('.onboarding-modal').should('not.exist')

    // Verify sessionStorage was set but NOT localStorage.
    cy.window().then((win) => {
      expect(win.sessionStorage.getItem(DEV_WARNING_KEY)).to.equal('true')
      // localStorage should remain null since we didn't check "Don't show again".
      expect(win.localStorage.getItem(DEV_WARNING_KEY)).to.be.null
    })

    // Simulate a new session (clear sessionStorage) — tutorial should show again.
    cy.window().then((win) => {
      win.sessionStorage.removeItem(DEV_WARNING_KEY)
    })
    cy.reload()
    cy.get('body', { timeout: 10000 }).should('be.visible')

    // Tutorial should appear again for the new session.
    cy.get('.onboarding-modal', { timeout: 10000 }).should('be.visible')
  })
})
