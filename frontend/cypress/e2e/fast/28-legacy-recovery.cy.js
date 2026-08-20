// =============================================================================
// 28-legacy-recovery.cy.js
// Fast-tier E2E for legacy account recovery (specs 062 + 063).
//
// Flows covered:
//   recovery.import-legacy-key    — import a private key / word list, stored encrypted
//   recovery.sweep-across-chains  — the other chains a recovered seed controls (063)
//
// NO CHAIN. Import is entirely client-side: classify → encrypt → localStorage, and the
// cross-chain scan talks to Solana's JSON-RPC and the Bitcoin gateway over HTTP, both of
// which are stubbed here. The one flow that genuinely needs a chain — moving the funds —
// lives in `full/28-legacy-recovery-sweep.cy.js`, per the tiering rule that a flow which
// can be validated without a chain must not sit in the full tier.
//
// What these tests are actually for: the secret is the member's account. The invariant
// worth a flow test is not "the wizard advances" but "the raw secret is never persisted in
// the clear, transmitted, or logged" — which no unit test on encryptLegacySecret can prove,
// because it cannot see localStorage, the DOM, or the network.
// =============================================================================

const OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' // Hardhat #0 — the signed-in member
const CHAIN_ID = 1337

// A legacy private key that is NOT one of the harness accounts, so a stray match in storage
// can only have come from this import.
const LEGACY_PK = '0x1010101010101010101010101010101010101010101010101010101010101010'
// BIP-39 test vector (valid checksum). Used for the word-list import and for 063, which needs
// a seed — a raw private key is a single key, not a derivable tree.
const LEGACY_WORDS = 'legal winner thank year wave sausage worth useful legal winner thank yellow'

const PASSPHRASE = 'correct-horse-battery'

// Matched as a RegExp rather than a glob: the endpoint is a bare origin with no path, which
// leaves nothing for a `**` suffix to bind to.
const SOLANA_RPC_MATCH = /api\.mainnet-beta\.solana\.com/

/**
 * Record every request body the page sends, so a test can assert the secret was not among
 * them. Patching `fetch`/`XHR` in the app's own realm catches the app's traffic wholesale —
 * an intercept-based check only sees the routes it was told to watch.
 */
function recordNetwork(win) {
  win.__fwSent = []
  const origFetch = win.fetch
  win.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : input?.url
      win.__fwSent.push(`${url || ''} ${init?.body ?? ''}`)
    } catch { /* recording must never break the app under test */ }
    return origFetch.apply(this, arguments)
  }
  const origSend = win.XMLHttpRequest.prototype.send
  win.XMLHttpRequest.prototype.send = function (body) {
    try { win.__fwSent.push(String(body ?? '')) } catch { /* as above */ }
    return origSend.apply(this, arguments)
  }
}

/** Assert no request body carried the secret. */
const assertSecretNotSent = (secret) =>
  cy.window({ log: false }).then((win) => {
    const sent = (win.__fwSent || []).join('\n').toLowerCase()
    expect(sent, 'clear secret in an outbound request').to.not.include(String(secret).toLowerCase())
  })

describe('Legacy account recovery — import (spec 062)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
    cy.mockWeb3Provider({ account: OWNER, preAuthorized: true })
    cy.openLegacyRecovery({ onBeforeLoad: recordNetwork })
  })

  // ---------------------------------------------------------------------------
  // LKR-01 — the at-rest invariant, asserted against storage rather than the screen
  // ---------------------------------------------------------------------------
  it('[LKR-01] stores a private key as AES-GCM ciphertext and leaks it nowhere observable', () => {
    cy.importLegacyKey({ secret: LEGACY_PK, passphrase: PASSPHRASE })

    // 1. What is on disk is a ciphertext blob: salt + iv + ct + the PBKDF2 work factor,
    //    keyed by the address it controls. The address is deliberately readable (the member
    //    has to recognise the account); nothing else about the secret is.
    cy.legacyVault(OWNER).then((vault) => {
      const entries = Object.values(vault)
      expect(entries, 'one stored entry').to.have.length(1)
      const [entry] = entries
      expect(entry.kind).to.equal('privateKey')
      expect(entry.ct, 'ciphertext').to.be.a('string').and.not.be.empty
      expect(entry.iv, 'AES-GCM iv').to.be.a('string').and.not.be.empty
      expect(entry.salt, 'PBKDF2 salt').to.be.a('string').and.not.be.empty
      expect(entry.iterations, 'PBKDF2 work factor').to.be.at.least(600000)
      // The blob must not contain the secret in any encoding we can spot.
      expect(JSON.stringify(entry).toLowerCase()).to.not.include(LEGACY_PK.toLowerCase())
      expect(JSON.stringify(entry).toLowerCase()).to.not.include(LEGACY_PK.slice(2).toLowerCase())
    })

    // 2. …and it is nowhere else either: not under some other storage key, not in the DOM.
    cy.assertNoClearSecret(LEGACY_PK)
    cy.assertNoClearSecret(LEGACY_PK.slice(2))
    // 3. …and it never left the device.
    assertSecretNotSent(LEGACY_PK)
    assertSecretNotSent(LEGACY_PK.slice(2))
  })

  // ---------------------------------------------------------------------------
  // LKR-02 — the same invariant for a word list, plus the audit record's contents
  // ---------------------------------------------------------------------------
  it('[LKR-02] stores a word list encrypted and audits address + type only', () => {
    cy.importLegacyKey({ secret: LEGACY_WORDS, passphrase: PASSPHRASE })

    cy.legacyVault(OWNER).then((vault) => {
      const [entry] = Object.values(vault)
      expect(entry.kind).to.equal('mnemonic')
      expect(entry.ct).to.be.a('string').and.not.be.empty
    })

    // The recovery is auditable without being incriminating: address + source, no words.
    cy.activityLedger(OWNER, CHAIN_ID).then((records) => {
      const recovered = records.filter((r) => r.kind === 'legacy_account_recovered')
      expect(recovered, 'one audit record').to.have.length(1)
      expect(recovered[0].refs.source).to.equal('mnemonic')
      expect(recovered[0].refs.recoveredAddress).to.match(/^0x[0-9a-f]{40}$/)
      const serialized = JSON.stringify(recovered[0]).toLowerCase()
      // Not just "no full phrase" — no individual word either, which is what an
      // over-helpful "note" field would leak.
      LEGACY_WORDS.split(' ').forEach((word) => {
        expect(serialized, `audit record leaks the word "${word}"`).to.not.include(`"${word}`)
      })
      expect(serialized).to.not.include(LEGACY_WORDS)
    })

    cy.assertNoClearSecret(LEGACY_WORDS)
    assertSecretNotSent(LEGACY_WORDS)
  })

  // ---------------------------------------------------------------------------
  // LKR-03 — storing IS the recovery; moving funds is optional and must stay so
  // ---------------------------------------------------------------------------
  it('[LKR-03] completes recovery without moving any funds', () => {
    cy.importLegacyKey({ secret: LEGACY_PK, passphrase: PASSPHRASE })

    cy.get('.action-sheet').within(() => {
      cy.get('[data-testid="lkr-saved"]').should('contain.text', 'stored encrypted')
      // The screen says so in as many words, and offers a way out that is not a transfer.
      cy.contains(/recovery is complete/i).should('be.visible')
      cy.contains(/these next steps are optional/i).should('be.visible')
      cy.contains('button', 'Done').click()
    })

    // Leaving here leaves a completed recovery behind: the account is listed on the device.
    cy.get('.action-sheet').should('not.exist')
    cy.get('.lkr-stored__item').should('have.length', 1)
    cy.get('.lkr-stored__item').first().should('contain.text', 'Recovered')
    cy.legacyVault(OWNER).then((vault) => expect(Object.keys(vault)).to.have.length(1))
  })

  // ---------------------------------------------------------------------------
  // LKR-04 — a wrong passphrase fails the AES-GCM tag; it never falls through
  // ---------------------------------------------------------------------------
  it('[LKR-04] refuses a wrong passphrase and leaves the stored blob untouched', () => {
    cy.importLegacyKey({ secret: LEGACY_PK, passphrase: PASSPHRASE })
    cy.get('.action-sheet').within(() => cy.contains('button', 'Done').click())

    cy.legacyVault(OWNER).then((before) => {
      cy.get('.lkr-stored__item').first().contains('button', 'Move funds').click()
      cy.get('.action-sheet').within(() => {
        cy.get('input[aria-label="Passphrase"]').type('not-the-passphrase', { log: false })
        cy.contains('button', 'Unlock').click()
        // Failing closed means saying so — not silently continuing with some other secret.
        cy.get('[role="alert"]').should('contain.text', 'did not unlock this key')
        // Still on the unlock step: the destination field belongs to the transfer step and
        // must not exist, or a wrong passphrase would have opened a funds-moving screen.
        cy.get('#lkr-destination').should('not.exist')
      })

      // The blob is unchanged — a failed unlock must not rewrite or clear it.
      cy.legacyVault(OWNER).then((after) => expect(after).to.deep.equal(before))
    })
  })
})

describe('Legacy account recovery — other chains (spec 063)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
    cy.mockWeb3Provider({ account: OWNER, preAuthorized: true })
  })

  // ---------------------------------------------------------------------------
  // LKR-05 — a recovered SEED reaches beyond EVM, and an unconfigured chain says so
  // ---------------------------------------------------------------------------
  it('[LKR-05] finds Solana funds from a recovered word list and discloses the Bitcoin gateway is unavailable', () => {
    // Stub the Solana cluster: the first derived candidate holds 2.5 SOL, the rest are empty.
    // Answering per JSON-RPC method (rather than one blanket body) keeps the stub honest about
    // which call it is serving.
    let funded = null
    cy.intercept({ method: 'POST', url: SOLANA_RPC_MATCH }, (req) => {
      const { method, params, id } = req.body
      if (method === 'getBalance') {
        const address = params[0]
        if (!funded) funded = address
        req.reply({ jsonrpc: '2.0', id, result: { value: address === funded ? 2500000000 : 0 } })
        return
      }
      if (method === 'getSignaturesForAddress') {
        req.reply({ jsonrpc: '2.0', id, result: [] })
        return
      }
      req.reply({ jsonrpc: '2.0', id, result: null })
    }).as('solana')

    cy.openLegacyRecovery({ onBeforeLoad: recordNetwork })
    cy.importLegacyKey({ secret: LEGACY_WORDS, passphrase: PASSPHRASE })
    cy.get('.action-sheet').within(() => cy.contains('button', 'Done').click())

    // "Other chains" is offered for a word list (a seed), which is the only thing that derives
    // a multi-chain tree.
    cy.get('.lkr-stored__item').first().contains('button', 'Other chains').click()
    cy.get('.lkr-crosschain').within(() => {
      cy.get('input[aria-label="Passphrase"]').type(PASSPHRASE, { log: false })
      cy.contains('button', 'Scan for funds').click()

      // Solana: the funded candidate is surfaced with a way to move it.
      cy.contains('.lkr-asset-row', 'Solana').within(() => {
        cy.get('.lkr-asset-list li').should('have.length.at.least', 1)
        cy.contains('2.5 SOL').should('be.visible')
        cy.contains('button', 'Send').should('be.visible')
      })

      // Bitcoin: VITE_RELAYER_URL is unset in this build, so there is no gateway to ask. The
      // row must say that. "No funds found" here would be a fabricated zero — the member would
      // read "your BTC is gone" from a configuration gap.
      cy.contains('.lkr-asset-row', 'Bitcoin').within(() => {
        cy.contains(/gateway unavailable/i).should('be.visible')
        cy.contains(/no funds found/i).should('not.exist')
      })
    })

    // Only PUBLIC addresses crossed the wire — never the seed (FR-021).
    cy.wait('@solana')
    cy.assertNoClearSecret(LEGACY_WORDS)
    assertSecretNotSent(LEGACY_WORDS)
  })
})
