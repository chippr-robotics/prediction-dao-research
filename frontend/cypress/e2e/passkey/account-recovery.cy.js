// =============================================================================
// spec 104 — a passkey that answers, and an account that cannot be confirmed.
//
// NO CHAIN NEEDED, and that is not a compromise here — it is the condition under test. This tier
// runs with no RPC reachable, which is exactly what produces the `unverified` verdict, so the
// environment generates the state rather than a stub asserting it does.
//
// What must hold:
//
//  - a cross-device sign-in whose account cannot be confirmed NEVER opens a session. Before spec
//    104 it did: the app derived an address on the assumption the key was the account's sole
//    initial owner and, when nothing was deployed there, signed the member into that brand-new
//    empty account with no error. A member reads that as their money being gone.
//  - the refusal keeps the three verdicts apart. An unreachable network must never render as
//    "you have no account" — same principle as spec 071's estate reads and spec 084's third
//    message-signing verdict, applied to identity.
//  - there is a way forward on the screen, not just a sentence: retry, or name the account.
//
// The chain-confirming half of recovery (the member's address IS verified and a session opens)
// needs a real deployed account and lives in the full-stack tier — see the matrix row.
// =============================================================================

import { addVirtualAuthenticator, choosePasskey, isChromium, resetAuthenticators } from '../../support/webauthn'

const SESSION_KEY = 'fairwins.passkey.session.v1'
const CREDENTIALS_KEY = 'fairwins.passkey.credentials.v1'

/** A passkey exists on the device; this BROWSER has never seen it. The cross-device condition. */
function signUpThenForgetThisBrowser() {
  cy.visit('/fairwins')
  cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 20000 }).click()
  choosePasskey({ mode: 'sign-up' })
  // The book now holds the credential. Clearing it is the "new browser, synced passkey" shape:
  // the authenticator still holds the key, the site remembers nothing.
  cy.get('[aria-label="Wallet Account"]', { timeout: 30000 }).should('exist')
  cy.window().then((win) => {
    win.localStorage.removeItem(CREDENTIALS_KEY)
    win.localStorage.removeItem(SESSION_KEY)
  })
}

describe('Passkey account recovery (spec 104)', () => {
  beforeEach(function () {
    if (!isChromium) this.skip() // the virtual authenticator is a CDP feature
    cy.clearLocalStorage()
    cy.clearCookies()
    resetAuthenticators()
    addVirtualAuthenticator()
  })

  it('[REC-01] an unconfirmable account offers recovery instead of opening a session', () => {
    signUpThenForgetThisBrowser()

    cy.reload()
    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 20000 }).click()
    choosePasskey({ mode: 'sign-in' })

    cy.get('[data-testid="recover-account"]', { timeout: 30000 }).should('exist')

    // THE REGRESSION. No session row, and the header still offers connection rather than an
    // account — an empty derived account must not be presented as the member's wallet.
    cy.window().then((win) => {
      expect(win.localStorage.getItem(SESSION_KEY), 'passkey session').to.be.null
    })
    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]').should('exist')
  })

  it('[REC-02] an unreachable network reads as unverified, never as "you have no account"', () => {
    signUpThenForgetThisBrowser()

    cy.reload()
    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 20000 }).click()
    choosePasskey({ mode: 'sign-in' })

    cy.get('[data-testid="recover-reason"]', { timeout: 30000 })
      .invoke('text')
      .should((text) => {
        // The positive assertion: it says the absence of an answer is not the absence of an
        // account. The negative one matters just as much — a member who reads "no account" on a
        // network blip concludes their account is gone.
        expect(text).to.match(/does not mean you have no account|could not reach/i)
      })
    cy.contains('button', /try again/i).should('exist')
  })

  it('[REC-03] the member can name their account, and a malformed address is refused in words', () => {
    signUpThenForgetThisBrowser()

    cy.reload()
    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 20000 }).click()
    choosePasskey({ mode: 'sign-in' })
    cy.get('[data-testid="recover-account"]', { timeout: 30000 }).should('exist')

    cy.get('#recover-account-address').type('0xnope')
    cy.contains('button', /find my account/i).click()

    // Text, not colour alone (constitution V), and no attempt made.
    cy.get('[role="alert"]').should('contain.text', 'should start with 0x')
    cy.window().then((win) => {
      expect(win.localStorage.getItem(SESSION_KEY), 'passkey session').to.be.null
    })

    // A well-formed address is accepted by the form and handed on to be CHECKED — the refusal
    // that follows (this tier has no chain) is the honest one, not a client-side verdict.
    cy.get('#recover-account-address').clear().type(`0x${'b'.repeat(40)}`)
    cy.contains('button', /find my account/i).should('not.be.disabled')
  })
})
