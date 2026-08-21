// =============================================================================
// 30-identity-access.cy.js
// Fast-tier E2E tests for identity and access (specs 084 + 069).
//
// Issue #1241. Every flow here is decided on the member's own device: a
// signature checked offline, an endpoint saved to device-scoped preferences, a
// credential redacted before it reaches the DOM. None of it moves value, so
// admission rule 1 puts all of it in the no-chain tier.
//
// ── THE ONE RPC THAT DOES APPEAR, AND WHY IT IS STUBBED ────────────────────
// Verify's ESCALATION is a network read by design — a contract account has no
// public key, so only the account itself can say whether it stands behind the
// bytes. That read is stubbed at the RPC boundary, which is the whole point:
// the flow that matters is the one where the node does NOT answer, and the only
// way to test "an unreachable node is not a forged signature" is to make a node
// unreachable on purpose.
// =============================================================================

import {
  MESSAGE,
  SIGNATURE,
  SIGNER_ADDRESS,
  OTHER_ADDRESS,
} from '../../../src/test/fixtures/signedMessages'

const ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const CUSTODY_URL = '/wallet?tab=custody'
const NETWORK_URL = '/wallet?tab=network'

/** Every shipped read provider this build resolves runs through publicnode. */
const RPC_PATTERN = /publicnode\.com/

/**
 * Answer the escalation's `eth_getCode`, or refuse to.
 *
 * `mode: 'unreachable'` fails the request outright — a node that cannot be asked. `mode: 'no-code'`
 * answers honestly that the address holds no contract, which IS a definite negative and the reason
 * the escalation is worth offering at all.
 */
function stubEscalation(mode) {
  cy.intercept({ method: 'POST', url: RPC_PATTERN }, (req) => {
    if (mode === 'unreachable') {
      req.destroy()
      return
    }
    const body = req.body
    const one = ({ method, id }) => {
      switch (method) {
        case 'eth_chainId':
          return { jsonrpc: '2.0', id, result: '0x1' }
        case 'net_version':
          return { jsonrpc: '2.0', id, result: '1' }
        case 'eth_getCode':
          // No contract at that address on this chain — a plain account.
          return { jsonrpc: '2.0', id, result: '0x' }
        case 'eth_blockNumber':
          return { jsonrpc: '2.0', id, result: '0x1312d00' }
        default:
          return { jsonrpc: '2.0', id, result: '0x' }
      }
    }
    req.reply({ statusCode: 200, body: Array.isArray(body) ? body.map(one) : one(body || {}) })
  }).as('escalationRpc')
}

const openVerify = () => {
  cy.mockWeb3Provider({ account: ACCOUNT, preAuthorized: true })
  cy.visit(CUSTODY_URL)
  /*
   * Protect's sections are an accordion. `AccordionSection` puts the section id on
   * `data-attention` (the drawer-search deep-link target) and derives the trigger's DOM id from
   * it — there is no element with a bare `#custody-verify`, so addressing that finds nothing and
   * the failure says only "not found". The trigger is what a member clicks.
   */
  cy.get('#custody-verify-header', { timeout: 40000 }).should('exist').click()
  cy.get('[data-testid="custody-acc-verify"]').contains('button', /^Check$/, { timeout: 20000 }).click()
  cy.get('#verify-check-message', { timeout: 20000 }).should('be.visible')
}

const fillCheck = ({ message, signature, address }) => {
  cy.get('#verify-check-message').clear().type(message, { parseSpecialCharSequences: false, delay: 0 })
  cy.get('#verify-check-signature').clear().type(signature, { delay: 0 })
  if (address) cy.get('#verify-check-address').clear().type(address, { delay: 0 })
  cy.get('button.verify-primary').should('not.be.disabled').click()
}

describe('Identity and access (specs 084 + 069)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  it('[VF-01] verify.three-verdicts — valid, invalid, and unverifiable are three different answers', () => {
    /*
     * The rule this exists to hold: a mismatching ECDSA recovery is NOT a negative while the
     * on-chain leg could not run, because that is exactly what a legitimate smart-account
     * signature looks like from outside. Two verdicts would make an RPC timeout indistinguishable
     * from a forgery, and a member acting on that would be acting on a fabricated accusation.
     */

    // ── VALID. Offline, no network, nothing to stub. ────────────────────────────────
    openVerify()
    fillCheck({ message: MESSAGE, signature: SIGNATURE, address: SIGNER_ADDRESS })
    cy.get('[data-testid="verify-result"]', { timeout: 20000 })
      .should('have.attr', 'data-status', 'valid')
      .and('contain.text', SIGNER_ADDRESS)

    // ── UNVERIFIABLE. The same bytes, claimed for somebody else. Offline arithmetic alone
    //    cannot settle it: the claimed account might be a contract that stands behind them.
    fillCheck({ message: MESSAGE, signature: SIGNATURE, address: OTHER_ADDRESS })
    cy.get('[data-testid="verify-result"]')
      .should('have.attr', 'data-status', 'unverifiable')
      .and('contain.text', 'not a failed check')

    // The escalation is offered, and ONLY here — this is the one outcome a network can settle.
    cy.get('#verify-check-chain').should('exist')

    // ── STILL UNVERIFIABLE when the node cannot be asked. THE ASSERTION THAT MATTERS. ──
    stubEscalation('unreachable')
    cy.get('#verify-check-chain').select('1')
    cy.contains('button', /Check on-chain/i).click()
    cy.get('[data-testid="verify-result"]', { timeout: 30000 })
      .should('have.attr', 'data-status', 'unverifiable')
    cy.get('[data-testid="verify-result"]').should('not.have.attr', 'data-status', 'invalid')
    // The offline fact survives the failed escalation rather than being replaced by less.
    cy.get('[data-testid="verify-result"]').should('contain.text', SIGNER_ADDRESS)
  })

  it('[VF-02] verify.three-verdicts — a negative is reported only when it is knowable', () => {
    /*
     * The companion to VF-01, and the reason the escalation is worth offering: when the account
     * ANSWERS — here, by holding no code at all — the claim really is settled, and saying so is
     * not an accusation but a fact the member came for.
     */
    openVerify()
    fillCheck({ message: MESSAGE, signature: SIGNATURE, address: OTHER_ADDRESS })
    cy.get('[data-testid="verify-result"]', { timeout: 20000 })
      .should('have.attr', 'data-status', 'unverifiable')

    stubEscalation('no-code')
    cy.get('#verify-check-chain').select('1')
    cy.contains('button', /Check on-chain/i).click()

    cy.get('[data-testid="verify-result"]', { timeout: 30000 })
      .should('have.attr', 'data-status', 'invalid')
      .and('contain.text', 'holds no contract')
  })

  it('[EP-01] endpoints.save-custom-rpc — a member endpoint is saved, disclosed as theirs, and shown redacted', () => {
    const MY_HOST = 'https://my-own-node.example'
    const MY_NODE = `${MY_HOST}/rpc/secret-path`

    cy.mockWeb3Provider({ account: ACCOUNT, preAuthorized: true })
    cy.visit(NETWORK_URL)
    cy.get('.network-endpoint-row', { timeout: 40000 }).should('exist')

    /*
     * The FIRST network card, whichever it is. The visible label is "Edit endpoints" — the
     * network name lives only in the button's accessible name — so a regex expecting the name in
     * the text matches nothing. Which network this is does not matter to the claim: what is under
     * test is that a member endpoint is saved and disclosed as theirs.
     */
    cy.contains('button', /^Edit endpoints$/).first().click()
    cy.get('.network-endpoint-form input[type="url"]').first().as('url')
    cy.get('@url').clear().type(MY_NODE)
    cy.get('.network-endpoint-form').contains('button', /^Save$/).click()

    cy.get('.network-endpoint-saved', { timeout: 20000 }).should('be.visible')

    /*
     * The row now says the route is the member's. "Your endpoint" versus "App default" is the
     * whole disclosure — a member has to be able to see which one is in force.
     *
     * And it shows the endpoint REDACTED to its host: a provider URL routinely carries the key in
     * its path, so the path is replaced with `/…` even for a URL the member typed themselves.
     * Asserting the host is present AND the path absent is what makes this a redaction test rather
     * than a rendering test.
     */
    cy.get('.network-endpoint-form').contains('button', /^Close$/).click()
    cy.contains('.network-endpoint-row', MY_HOST)
      .find('.network-endpoint-source')
      .should('contain.text', 'Your endpoint')
    cy.contains('.network-endpoint-row', MY_HOST)
      .find('.network-endpoint-url')
      .should('contain.text', `${MY_HOST}/…`)
      .and('not.contain.text', 'secret-path')
  })

  it('[EP-02] endpoints.wrong-chain-refused — an endpoint answering with another chain id is refused', () => {
    /*
     * The failure this prevents is silent and total: an endpoint that answers for a different
     * network would serve that network's state into every read for this one, and nothing else in
     * the app would notice. So a TESTED mismatch is a hard stop at save, not a warning.
     */
    const WRONG_CHAIN_NODE = 'https://answers-for-another-chain.example/rpc'

    cy.intercept({ method: 'POST', url: /answers-for-another-chain\.example/ }, (req) => {
      // 0x2a (42) is deliberately a chain NO card in this list is for. An answer of `0x1` would be
      // correct for the Ethereum card the test happens to open first, and the probe would pass —
      // which is the right behaviour and the wrong test.
      const one = ({ id }) => ({ jsonrpc: '2.0', id, result: '0x2a' })
      const body = req.body
      req.reply({ statusCode: 200, body: Array.isArray(body) ? body.map(one) : one(body || {}) })
    }).as('wrongChain')

    cy.mockWeb3Provider({ account: ACCOUNT, preAuthorized: true })
    cy.visit(NETWORK_URL)
    cy.contains('button', /^Edit endpoints$/, { timeout: 40000 }).first().click()

    cy.get('.network-endpoint-form input[type="url"]').first().clear().type(WRONG_CHAIN_NODE)
    cy.get('.network-endpoint-form').contains('button', /^Test$/).click()

    cy.get('.network-endpoint-probe.failed', { timeout: 30000 })
      .should('be.visible')
      // The message names the chain it actually serves — "it did not work" would leave the member
      // guessing at a misconfiguration that is entirely knowable.
      .and('contain.text', 'serves chain 42')

    // And the refusal has teeth: saving after a tested mismatch does not go through.
    cy.get('.network-endpoint-form').contains('button', /^Save$/).click()
    cy.get('.network-endpoint-saved').should('not.exist')
    cy.get('.network-endpoint-form .network-endpoint-error').should('be.visible')
  })

  it('[EP-03] endpoints.credentials-redacted — the key is never rendered back into the page', () => {
    /*
     * The credential rides in a HEADER and is device-scoped, so the only way it can leak to a
     * shoulder, a screenshot or a support ticket is by being rendered. This asserts it appears
     * nowhere in the page's text after saving — including inside the endpoint row, which shows a
     * URL that routinely carries a key in its path and is redacted for exactly that reason.
     */
    const SECRET = 'sk-e2e-do-not-render-me-4f31c0'
    const HOST = 'https://keyed-provider.example'
    const NODE = `${HOST}/rpc`

    cy.mockWeb3Provider({ account: ACCOUNT, preAuthorized: true })
    cy.visit(NETWORK_URL)
    cy.contains('button', /^Edit endpoints$/, { timeout: 40000 }).first().click()

    cy.get('.network-endpoint-form input[type="url"]').first().clear().type(NODE)
    cy.get('.network-endpoint-form select').first().select('header')
    cy.get('.network-endpoint-form input[placeholder="x-api-key"]').clear().type('x-api-key')
    cy.get('.network-endpoint-secret input').clear().type(SECRET)

    // Masked while typing, before anything is saved.
    cy.get('.network-endpoint-secret input').should('have.attr', 'type', 'password')

    cy.get('.network-endpoint-form').contains('button', /^Save$/).click()
    cy.get('.network-endpoint-saved', { timeout: 20000 }).should('be.visible')
    cy.get('.network-endpoint-form').contains('button', /^Close$/).click()

    // The row discloses THAT a key is set — which the member needs — without disclosing it.
    cy.contains('.network-endpoint-row', HOST)
      .find('.network-endpoint-auth-badge')
      .should('contain.text', 'API key')

    cy.get('body').invoke('text').should('not.contain', SECRET)

    // And still not after a reload, when the value is re-read from storage rather than held in a
    // form the member just filled in.
    cy.reload()
    cy.get('.network-endpoint-row', { timeout: 40000 }).should('exist')
    cy.get('body').invoke('text').should('not.contain', SECRET)
  })
})
