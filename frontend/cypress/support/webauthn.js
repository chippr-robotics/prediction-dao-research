/**
 * The account-native tier's WebAuthn harness — ONE implementation, shared.
 *
 * Every passkey spec drives REAL WebAuthn ceremonies through the Chrome DevTools Protocol virtual
 * authenticator (never a mocked `navigator.credentials`), and five specs had each grown their own
 * copy of the plumbing. They are here now because two of the rules below are cross-test facts that
 * a per-file copy structurally cannot know.
 *
 * ── ONE INTERNAL AUTHENTICATOR PER ENVIRONMENT ──────────────────────────────────────────────────
 * Chrome permits exactly one `transport: 'internal'` virtual authenticator at a time, and the CDP
 * domain SURVIVES between tests in a spec file. So a second test calling `addVirtualAuthenticator`
 * fails with "Chrome only supports one internal authenticator per environment" — not because that
 * test is wrong, but because the previous one left its device plugged in. `resetAuthenticators()`
 * in a `beforeEach` is the fix, and it belongs somewhere shared: no single spec can see the
 * collision it is half of.
 *
 * ── THE FIRST-TIME EXPLAINER IS PART OF THE CEREMONY (spec 045 FR-010) ──────────────────────────
 * `choosePasskey()` clicks the passkey option and then continues through the explainer when it is
 * shown. The conditional is not test-hedging: the explainer is browser-scoped and once-only
 * (`lib/passkey/explainer.js`), so the SAME journey legitimately has it on a fresh browser and not
 * on a returning one — a test that always expected it would be as wrong as one that never did.
 */

/** Raw CDP call. Chromium-family browsers only; `isChromium` guards the describe blocks. */
export function cdp(command, params) {
  return Cypress.automation('remote:debugger:protocol', { command, params })
}

export const isChromium = Cypress.browser.family === 'chromium'

/**
 * Drop every virtual authenticator and start the domain clean.
 *
 * `WebAuthn.disable` tears down the domain's authenticators; re-enabling gives the test an empty
 * environment whatever the previous test left behind. Call it in `beforeEach`, before the first
 * `addVirtualAuthenticator`.
 */
/** Authenticators this file created, so reset can unplug them by id. CDP cannot enumerate them. */
const created = []

export function resetAuthenticators() {
  // Wrapped in `cy.then` so it joins the command queue: a bare promise in a `beforeEach` is not
  // awaited, and the test starts against a half-configured domain ("The Virtual Authenticator
  // Environment has not been enabled for this session").
  //
  // Both legs are needed. `disable` tears the domain down, but it throws when the domain was
  // never enabled (the first test in a file), so it is swallowed — and removing the ids we know
  // about is what actually guarantees the internal slot is free, since CDP offers no way to list
  // the authenticators already attached.
  return cy.then(() => {
    const ids = created.splice(0, created.length)
    return ids
      .reduce(
        (chain, id) => chain.then(() => cdp('WebAuthn.removeVirtualAuthenticator', { authenticatorId: id }).catch(() => undefined)),
        Promise.resolve(),
      )
      .then(() => cdp('WebAuthn.disable').catch(() => undefined))
      .then(() => cdp('WebAuthn.enable'))
  })
}

/**
 * A platform authenticator with a resident key and user verification already satisfied — the
 * WebAuthn shape of a phone or laptop with Face ID / Touch ID.
 *
 * @param {{prf?: boolean}} [opts] request the `prf` extension (spec 061 derives the Bitcoin
 *   wallet from it; the EVM passkey flows do not need it).
 * @returns {Cypress.Chainable<{authenticatorId: string}>}
 */
export function addVirtualAuthenticator({ prf = false } = {}) {
  // QUEUED, like every other helper here. A bare `Cypress.automation` promise runs the moment the
  // test body is evaluated — i.e. BEFORE the queued commands around it — so a spec reading
  // `resetAuthenticators(); addVirtualAuthenticator()` actually ran the add first, against a
  // domain the reset had not enabled yet, and left the previous test's device attached. That is
  // what produced "Chrome only supports one internal authenticator per environment" from a test
  // whose own code was correct.
  return cy.then(() =>
    cdp('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        ...(prf ? { hasPrf: true } : {}),
      },
    }).then((result) => {
      if (result?.authenticatorId) created.push(result.authenticatorId)
      return result
    }),
  )
}

/** Every resident credential on an authenticator — the "synced to another device" source. */
export function getCredentials(authenticatorId) {
  return cy.then(() => cdp('WebAuthn.getCredentials', { authenticatorId }))
}

export function addCredential(authenticatorId, credential) {
  return cy.then(() => cdp('WebAuthn.addCredential', { authenticatorId, credential }))
}

export function removeAuthenticator(authenticatorId) {
  return cy.then(() => {
    const at = created.indexOf(authenticatorId)
    if (at >= 0) created.splice(at, 1)
    return cdp('WebAuthn.removeVirtualAuthenticator', { authenticatorId })
  })
}

/**
 * Choose the passkey method on the connect surface, through the first-time explainer.
 *
 * Counts as ONE member decision for the interaction budgets (SC-001/SC-005): the explainer is a
 * confirmation of the choice just made, not a second choice. Specs asserting a budget should say
 * which they mean.
 */
export function choosePasskey({ mode = 'sign-up' } = {}) {
  cy.contains(/^passkey$/i).click()
  // Spec 045 FR-010: shown once per browser, so a returning browser goes straight to the chooser.
  cy.get('body').then(($body) => {
    if ($body.find('.passkey-explainer').length > 0) {
      cy.contains('button', /continue with passkey/i).click()
    }
  })
  /*
   * The chooser. A browser that already knows this passkey lists it; one that knows nothing
   * offers the two honest options, because the site cannot tell a brand-new member from one whose
   * passkey synced to this device — only the authenticator can.
   */
  cy.get('[data-testid="passkey-picker"]', { timeout: 20000 }).should('exist')
  cy.get('[data-testid="passkey-picker"]').then(($picker) => {
    const rows = $picker.find('.connect-modal__account-row button.connect-modal__option')
    if (mode === 'sign-up') {
      cy.contains('button', /create a new account/i).click()
    } else if (rows.length > 0) {
      cy.wrap(rows.first()).click()
    } else {
      cy.contains('button', /i already have a passkey|use a different passkey/i).click()
    }
  })
}

/**
 * The connected account's address, read from the header account control.
 *
 * The tier's specs used to assert `[data-testid="passkey-account-address"]` on a post-sign-up
 * "counterfactual funding" screen. **Neither exists in the app** — nor does that screen's
 * "activates on-chain automatically" copy, nor its "Show QR code" button. They were asserting
 * against a surface the product had moved on from, and nothing noticed because the whole tier
 * was permanently skipped. This reads the address where a member actually sees it today.
 *
 * @returns {Cypress.Chainable<string>} the shortened form, e.g. `0x1111...1111`
 */
/** Whatever the dropdown renders once it is open. */
const ADDRESS_CONTROL = '[aria-label="Copy account address"], [aria-label="Address copied"]'

/**
 * Open the header account menu, IDEMPOTENTLY.
 *
 * Two things made a plain click unreliable, and both are about state this helper can see and a
 * caller cannot:
 *
 *  - After a reload the header shows the connect surface until the silent reconnect resolves, so
 *    a click aimed at the account button catches it mid-swap ("disappeared from the page").
 *    `expectConnected()` settles that. `force` then skips the actionability wait, which is itself
 *    the window in which the header's balance/roles re-render detaches the button.
 *  - The button TOGGLES. A helper that toggles blind desynchronises the moment anything else
 *    opened or closed the menu, so this opens only when the menu is not already open.
 */
export function openAccountMenu() {
  expectConnected()
  // The toggle publishes its own state, so drive from that rather than from whether some child
  // happens to be in the DOM yet: click only when it says closed, then WAIT for it to say open.
  // That wait is retryable, so a click swallowed by the header's re-render is retried rather
  // than leaving the next command to time out looking for a menu that never opened.
  cy.get('[aria-label="Wallet Account"]').then(($btn) => {
    if ($btn.attr('aria-expanded') !== 'true') cy.wrap($btn).click({ force: true })
  })
  return cy.get('[aria-label="Wallet Account"]').should('have.attr', 'aria-expanded', 'true')
}

/** Close it, idempotently, for the same reason. */
export function closeAccountMenu() {
  cy.get('[aria-label="Wallet Account"]').then(($btn) => {
    if ($btn.attr('aria-expanded') === 'true') cy.wrap($btn).click({ force: true })
  })
  return cy.get('[aria-label="Wallet Account"]').should('have.attr', 'aria-expanded', 'false')
}

export function connectedAddress() {
  openAccountMenu()
  // The copy control carries the FULL address in `title` (its visible text is the shortened
  // form). Reading the attribute makes a cross-device identity comparison exact rather than a
  // prefix match, which is the whole claim RU-02 makes.
  cy.get(ADDRESS_CONTROL)
    // RETRY UNTIL IT IS THERE. The control renders as soon as the session connects, while the
    // address itself resolves a moment later — so a bare `.invoke('attr', …)`, which does not
    // retry, read an empty string whenever the assertion came straight after the ceremony.
    .should(($el) => expect($el.attr('title') || '').to.match(/^0x[0-9a-fA-F]{40}$/))
    .invoke('attr', 'title')
    .as('__connectedAddress')
  closeAccountMenu()
  return cy.get('@__connectedAddress').then((title) => String(title || '').trim())
}

/** Assert a passkey ceremony landed a connected account (the connect surface is gone). */
export function expectConnected() {
  cy.get('[aria-label="Wallet Account"]', { timeout: 20000 }).should('exist')
  cy.get('[aria-label="Connect Wallet"]').should('not.exist')
}

