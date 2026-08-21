// =============================================================================
// bitcoin-send-fee.cy.js
// Account-native tier — spec 061 FR-012, the fee quote a member confirmed.
//
// Issue #1243. A Bitcoin send is NEVER gasless: the member pays the network fee
// out of the amount they are moving, and the figure they agreed to is a hard
// ceiling on what may be signed. A quote is only true for as long as the
// mempool it describes, so it expires — and an expired one must send the member
// back to a fresh figure rather than quietly pricing the transaction at
// whatever the fee market has since become.
//
// The wallet derives from the passkey seed, so this is account-native. The
// gateway is stubbed: nothing here touches Bitcoin.
// =============================================================================

import {
  addVirtualAuthenticator as addAuthenticator,
  choosePasskey,
  expectConnected,
  isChromium,
  resetAuthenticators,
} from '../../support/webauthn'

const RATES = { fast: 20, normal: 10, slow: 5 }
const TIP_HEIGHT = 900_000
/** 0.005 BTC — comfortably above dust and above any fee these rates produce. */
const FUNDED_SATS = 500_000

/**
 * Answer the five /v1/bitcoin/* endpoints.
 *
 * The wallet's addresses derive from the passkey seed and so differ every run — which is why the
 * UTXO is attached to whichever address the app asks about FIRST, rather than to a fixture
 * address the test would have to know in advance.
 */
function stubBitcoinGateway() {
  let funded = null
  cy.intercept('POST', '**/v1/bitcoin/*/addresses', (req) => {
    const addresses = req.body?.addresses ?? []
    if (!funded && addresses.length) funded = addresses[0]
    req.reply({
      statusCode: 200,
      body: {
        tipHeight: TIP_HEIGHT,
        results: addresses.map((address) => ({
          address,
          confirmedSats: address === funded ? FUNDED_SATS : 0,
          pendingSats: 0,
          hasHistory: address === funded,
          utxos:
            address === funded
              ? [{ txid: 'f'.repeat(64), vout: 0, valueSats: FUNDED_SATS, confirmations: 6 }]
              : [],
        })),
      },
    })
  }).as('addresses')

  // Stamps: positively verified as absent. Recognition is FAIL-SAFE, so a degraded or missing
  // answer would PROTECT the UTXO and there would be nothing spendable to quote a fee on.
  cy.intercept('GET', '**/v1/bitcoin/*/stamps*', {
    statusCode: 200,
    body: { degraded: false, stamps: [] },
  }).as('stamps')

  cy.intercept('GET', '**/v1/bitcoin/*/fees', {
    statusCode: 200,
    body: { rates: RATES, tipHeight: TIP_HEIGHT },
  }).as('fees')

  // Nothing in this spec should ever reach a broadcast. Failing loudly beats a silent 404: a
  // broadcast here would mean the expired quote priced a real transaction.
  cy.intercept('POST', '**/v1/bitcoin/*/tx', () => {
    throw new Error('a transaction was broadcast — the expired quote was not refused')
  })
}

/** Sign in, unlock the Bitcoin wallet, and land on Transfer with BTC selectable. */
function signInAndUnlock() {
  addAuthenticator({ prf: true })
  cy.visit('/fairwins')
  cy.contains('button', /connect wallet/i).click()
  choosePasskey()
  expectConnected()

  // Unlocking happens on the receive surface, and the session is shared across the app — so the
  // walk to Transfer is in-app and BTC is selectable when we get there.
  cy.visit('/wallet?tab=settings')
  cy.get('#wallet-display-header', { timeout: 40000 }).should('exist').click()
  cy.contains('button', /receive bitcoin/i, { timeout: 20000 }).click()
  cy.contains('button', /unlock with your passkey/i, { timeout: 20000 }).click()
  cy.get('.address-qr-address--bitcoin', { timeout: 20000 }).should('exist')
  cy.get('.address-qr-close, [aria-label="Close"]').first().click({ force: true })
}

;(isChromium ? describe : describe.skip)('Bitcoin send — the fee the member agreed to (spec 061)', () => {
  beforeEach(function () {
    if (!Cypress.env('PASSKEY_ENABLED')) this.skip()
    cy.clearCookies()
    cy.clearLocalStorage()
    resetAuthenticators()
    stubBitcoinGateway()
  })

  it('[BTC-03] bitcoin.fee-quote-expiry — an expired quote is refused, and the member is sent back to a fresh one', () => {
    /*
     * FR-012. The quote has a 60-second window because that is roughly how long a mempool
     * estimate stays true. What must not happen when it lapses is the send going through at the
     * fee the member last SAW, priced against a market that has moved — nor at whatever the
     * market has become, which they never agreed to. Both are the same failure: signing a number
     * the member did not confirm.
     */
    signInAndUnlock()

    /*
     * IN-APP, never `cy.visit`. The unlocked Bitcoin session is memory-only by design — the seed
     * is derived per session and never persisted — so a page load re-locks the wallet, BTC drops
     * out of the asset list, and the test silently becomes a test of something else.
     */
    cy.get('[aria-label="Open menu"], [aria-label="Toggle navigation menu"]', { timeout: 20000 })
      .first()
      .click({ force: true })
    cy.get('[aria-label="Finance section"]', { timeout: 20000 }).then(($h) => {
      if ($h.attr('aria-expanded') !== 'true') cy.wrap($h).click({ force: true })
    })
    cy.get('[aria-label="Site navigation"]').contains('Transfer').click({ force: true })
    cy.get('[aria-label="Sending account"]', { timeout: 40000 }).should('exist')

    // Choose Bitcoin. It is offered only once the wallet is unlocked — an asset the app cannot
    // actually spend is never listed.
    cy.get('[aria-label="Asset to send"]', { timeout: 20000 }).first().click()
    cy.contains('[role="option"]', /Bitcoin|BTC/).click()

    cy.get('#pt-btc-to', { timeout: 20000 }).type('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', { delay: 0 })
    cy.get('input[type="number"], input[inputmode="decimal"]').first().type('0.001', { delay: 0 })

    // Preview: this is where the fee is quoted and shown.
    cy.contains('button', /preview|review|continue/i).click()
    cy.wait('@fees')
    cy.contains(/fee/i, { timeout: 20000 }).should('exist')

    /*
     * Age the quote past its window.
     *
     * Only `Date` is faked, and only AFTER sign-in: the WebAuthn ceremony and the app's timers
     * keep their real clock, so this moves the one thing under test — how old the quote is — and
     * nothing else. Waiting 61 real seconds would test the same rule and cost a minute a run.
     */
    /*
     * `cy.then` is load-bearing: the test BODY is evaluated before a single command runs, so a
     * bare `cy.clock(Date.now(), …)` pins the clock to test-start — which here was ~60s BEFORE
     * the quote was fetched, making the +61s tick land in the quote's past and the quote look
     * fresh. The send then went through, and the test reported a product bug that was its own.
     * (Anti-pattern 9, in its other costume.)
     */
    cy.then(() => {
      cy.clock(Date.now(), ['Date'])
      cy.tick(61_000)
    })

    cy.contains('button', /^(confirm|send|sign)/i).click()

    // Refused, and told why in terms of the fee rather than a generic failure.
    cy.contains(/fee quote expired/i, { timeout: 20000 }).should('be.visible')
    // …and sent back to compose again, so the next send is priced by a figure they have seen.
    cy.get('#pt-btc-to').should('exist')
  })
})
