// =============================================================================
// bitcoin-receive.cy.js
// Account-native tier — spec 061, Bitcoin receive addresses.
//
// Issue #1243. Bitcoin keys derive CLIENT-SIDE from the spec-041 passkey master
// seed, which is why these are not no-chain tests: there is no Bitcoin wallet
// at all without a PRF-capable passkey, and `useBitcoinWallet` says so in as
// many words rather than pretending. The virtual authenticator is therefore not
// scaffolding around the test — it IS the wallet.
//
// Nothing here touches Bitcoin. Address derivation, the issued-address ledger
// and the rotation cursor are local; the gateway (balances, UTXOs, fees) is
// pointed at a dead port by `dev:fast`, which is the honest degraded world and
// the one these assertions are made in.
// =============================================================================

import {
  addVirtualAuthenticator as addAuthenticator,
  choosePasskey,
  expectConnected,
  isChromium,
  resetAuthenticators,
} from '../../support/webauthn'

/** Sign in with a PRF-capable passkey and open the Bitcoin receive surface. */
function openBitcoinReceive() {
  // PRF is what the Bitcoin seed derives from — an authenticator without it produces the honest
  // "unavailable" state instead, which is a different test.
  addAuthenticator({ prf: true })
  cy.visit('/fairwins')
  cy.contains('button', /connect wallet/i).click()
  choosePasskey()
  expectConnected()

  cy.visit('/wallet?tab=settings')
  cy.get('#wallet-display-header', { timeout: 40000 }).should('exist').click()
  cy.contains('button', /receive bitcoin/i, { timeout: 20000 }).click()
}

/** The address currently shown on the receive surface. */
function shownAddress() {
  return cy.get('.address-qr-address--bitcoin', { timeout: 20000 }).invoke('text').then((t) => t.trim())
}

/**
 * Wait for the surface to show an address other than `prev`, then yield it.
 *
 * `.invoke('text')` reads once and does not retry, so a bare read after a click samples whatever
 * was on screen at that instant — usually the OLD address, because issuing the next one is a
 * state update. Retrying on the assertion is what makes the read wait for the thing it is about.
 */
function addressAfterChange(prev) {
  cy.get('.address-qr-address--bitcoin', { timeout: 20000 }).should(($el) => {
    expect($el.text().trim(), 'the surface issued a different address').to.not.equal(prev)
  })
  return shownAddress()
}

;(isChromium ? describe : describe.skip)('Bitcoin receive (spec 061)', () => {
  beforeEach(function () {
    if (!Cypress.env('PASSKEY_ENABLED')) this.skip()
    cy.clearCookies()
    cy.clearLocalStorage()
    // Chrome allows ONE internal authenticator per environment, and a spec that leaves its device
    // plugged in breaks the next one from the outside. Reset before the first add.
    resetAuthenticators()
  })

  it('[BTC-01] bitcoin.receive-address-rotates — a fresh address is issued, and the old one is never reissued', () => {
    /*
     * FR-004…FR-007, and the reason the cursor is monotonic rather than a pointer into a list.
     *
     * A receive address that comes back around is an address a member may already have handed to
     * somebody, printed on an invoice, or given to an exchange for a withdrawal. Reissuing it
     * merges two payments the member believes are separate, and — worse — links them publicly to
     * each other, which is the one privacy property a fresh address per payment exists to give.
     *
     * So this is not "the button changes the text". It is that every address the surface has ever
     * shown stays spent, for the life of the wallet.
     */
    openBitcoinReceive()

    // Locked first: the wallet exists only once the passkey has derived it, and the surface says
    // so rather than showing a placeholder address.
    cy.contains(/your bitcoin wallet is locked/i, { timeout: 20000 }).should('be.visible')
    cy.contains('button', /unlock with your passkey/i).click()

    shownAddress().as('first')
    cy.get('@first').should((a) => {
      // A real bech32 mainnet address, not a placeholder. `bc1q` is BIP84 (the default type).
      expect(a, 'a derived segwit address is shown').to.match(/^bc1q[0-9a-z]{20,}$/)
    })

    const seen = new Set()
    cy.get('@first').then((a) => seen.add(a))

    /*
     * Rotate several times. Once would prove the button does something; the point is that the
     * sequence never repeats, so it is checked as a set.
     */
    let previous = null
    cy.get('@first').then((a) => { previous = a })
    for (let i = 0; i < 4; i += 1) {
      cy.contains('button', /^New address$/).click()
      cy.then(() => addressAfterChange(previous).then((a) => {
        expect(a, `rotation ${i + 1} produced a bech32 address`).to.match(/^bc1q[0-9a-z]{20,}$/)
        // The set catches the case the change-wait cannot: a repeat of an EARLIER address rather
        // than the immediately previous one, which is what a wrapped cursor would produce.
        expect(seen.has(a), `rotation ${i + 1} reissued an address already shown: ${a}`).to.equal(false)
        seen.add(a)
        previous = a
      }))
    }

    cy.then(() => {
      expect(seen.size, 'five distinct addresses were issued').to.equal(5)
    })

    /*
     * THE CURSOR NEVER DECREASES — across a reload, and across a re-unlock.
     *
     * This is the assertion that separates a rotating counter from a rotating VIEW. Derivation is
     * deterministic from the seed, so a cursor that reset on reload would hand out address 0
     * again on the next visit, and every earlier address with it.
     */
    cy.reload()
    cy.get('#wallet-display-header', { timeout: 40000 }).should('exist').click()
    cy.contains('button', /receive bitcoin/i, { timeout: 20000 }).click()
    cy.contains('button', /unlock with your passkey/i, { timeout: 20000 }).click()

    shownAddress().then((a) => {
      expect(seen.has(a), `after a reload the wallet reissued ${a}`).to.equal(false)
    })
  })

  it('[BTC-02] bitcoin.receive-address-rotates — the address type is the member\'s choice, and each type has its own run', () => {
    /*
     * BIP84 (segwit, `bc1q…`) and BIP86 (taproot, `bc1p…`) are separate derivation paths with
     * separate cursors, because they are separate address families — switching type must not
     * rewind either one. The prefixes are the visible proof the app used the path it said it did.
     */
    openBitcoinReceive()
    cy.contains('button', /unlock with your passkey/i, { timeout: 20000 }).click()

    cy.get('.address-qr-address--bitcoin', { timeout: 20000 }).should(($el) =>
      expect($el.text().trim()).to.match(/^bc1q/),
    )
    shownAddress().then((segwit) => {
      cy.get('input[name="btc-address-type"][value="taproot"]').check({ force: true })
      cy.get('.address-qr-address--bitcoin', { timeout: 20000 }).should(($el) =>
        expect($el.text().trim(), 'taproot derives a BIP86 address').to.match(/^bc1p/),
      )

      // Back to segwit: the member returns to their own run, and never to an address already used.
      cy.get('input[name="btc-address-type"][value="segwit"]').check({ force: true })
      cy.get('.address-qr-address--bitcoin', { timeout: 20000 }).should(($el) =>
        expect($el.text().trim()).to.match(/^bc1q/),
      )
      cy.contains('button', /^New address$/).click()
      addressAfterChange(segwit).then((next) => {
        expect(next, 'switching type and back did not rewind the segwit cursor').to.not.equal(segwit)
      })
    })
  })
})
