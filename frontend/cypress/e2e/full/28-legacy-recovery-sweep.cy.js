// =============================================================================
// 28-legacy-recovery-sweep.cy.js
// Full-tier E2E for the legacy account sweep (spec 062).
//
// Flow covered: recovery.sweep-per-asset-outcomes
//
// NEEDS A CHAIN, and needs one for the right reason: the member signs transfers with a key
// they paste in, value leaves an account, and the invariant under test — a single asset
// failing NEVER aborts the rest — only exists because real transfers can fail one at a time.
// Against a mock every leg succeeds and the test proves nothing.
//
// The import half of the feature (ciphertext at rest, no clear secret anywhere) is chain-free
// and lives in `fast/28-legacy-recovery.cy.js`.
//
// Fixture shape: each test mints a FRESH legacy EOA (cy.task legacyFixture) and funds it with
// native + the chain's wrapped-native ERC-20, which is what the portfolio registry scans on
// 1337. Fresh per test because a fixed key would carry balances between runs and make "what
// moved" depend on how often the suite had run.
// =============================================================================

const OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' // #0 — the signed-in member
const DEST = '0x90F79bf6EB2c4f870365E785982E1f101E93b906'  // #3 — the destination account
const PASSPHRASE = 'correct-horse-battery'

/*
 * The address the APP scans for chain 1337's wrapped-native ERC-20 — `HARDHAT_CONTRACTS.wmatic`
 * in `frontend/src/config/contracts.js`, resolved through `config/wrappedNative.js`. Mirrored
 * here rather than imported because that module reads `import.meta.env`, which does not exist in
 * the Node process running the fixture task.
 *
 * A fresh `deploy:local` does not put the mock here (see the `legacyFixture` comment), so the
 * fixture installs its code at this address. If the constant ever moves, the quote below will not
 * list WETH and the test fails naming exactly that.
 */
const APP_WRAPPED_NATIVE = '0xE80bf16CAF66CAe0Ae5aBC4a5ab4acc27361553F'

const ONE_ETH = (10n ** 18n).toString()
const TOKEN_AMOUNT = (5n * 10n ** 18n).toString()

const fixture = (action, args = {}) =>
  cy.task('legacyFixture', { action, args }).then((r) => {
    // A silent no-op fixture is how a test ends up dying somewhere unrelated: fail here,
    // where the message still says what could not be arranged.
    expect(r.ok, `legacyFixture ${action}: ${r.error || ''}`).to.equal(true)
    return r
  })

const balances = (address) => fixture('balances', { address, token: APP_WRAPPED_NATIVE })

// Chai's ordering assertions are not a contract for BigInt, so compare explicitly and put the
// real values in the message — a failure should say what the balances were, not just "false".
const isGreater = (a, b) => BigInt(a) > BigInt(b)
const isLess = (a, b) => BigInt(a) < BigInt(b)

/** Import the legacy key and land on the transfer step with a destination entered. */
function openTransferFor(privateKey, destination = DEST) {
  cy.importLegacyKey({ secret: privateKey, passphrase: PASSPHRASE })
  cy.get('.action-sheet').within(() => {
    cy.contains('button', 'Move funds').click()
    cy.get('#lkr-destination').clear().type(destination)
  })
}

describe('Legacy account recovery — moving the funds (spec 062)', () => {
  let legacy // { address, privateKey, tokenAddress } for THIS test

  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()

    // Put a working ERC-20 where the app looks for one, in a known unarmed state, BEFORE
    // minting into it.
    fixture('installTokenAt', { token: APP_WRAPPED_NATIVE })

    fixture('newAccount').then((account) => {
      legacy = account
      fixture('fundNative', { address: account.address, amount: ONE_ETH })
      fixture('mintToken', { address: account.address, amount: TOKEN_AMOUNT, token: APP_WRAPPED_NATIVE })
    })

    // `realBalances` matters here: the default mock answers a fixed 100 ETH for EVERY address,
    // so the quote would size its gas reserve against a balance the legacy account does not
    // have and the native leg would revert for reasons that have nothing to do with the app.
    cy.mockWeb3Provider({ account: OWNER, preAuthorized: true, realBalances: true })
    cy.openLegacyRecovery()
  })

  // ---------------------------------------------------------------------------
  // LKR-S1 — the whole portfolio moves: ERC-20s first, native last, reserve left behind
  // ---------------------------------------------------------------------------
  it('[LKR-S1] sweeps every supported asset, ERC-20 first and native last', () => {
    balances(DEST).then((destBefore) => {
      openTransferFor(legacy.privateKey)

      cy.get('.action-sheet').within(() => {
        // Only fungible assets are moved, and the screen says so before anything is signed.
        cy.contains(/collectibles\/NFTs are not/i).should('be.visible')

        cy.contains('button', 'Check balances').click()
        cy.get('.lkr-quote', { timeout: 20000 }).should('be.visible')
        // Both holdings are found, and the fee the legacy key will pay is disclosed as its
        // own line — the member is told what will be left behind, not just what will move.
        // 'WETH' already contains 'ETH', so the native leg is proven by the fee line and by
        // the outcome symbols below (matched exactly), not by a substring of the token's name.
        cy.get('.lkr-quote').should('contain.text', 'WETH')
        cy.get('.lkr-quote__fee').should('contain.text', 'Estimated network fee')

        cy.contains('button', 'Transfer all').click()

        // Every asset reports its own outcome, in the order the sweep must use: the native
        // coin pays for every transfer, so it can only go last.
        cy.get('.lkr-outcome', { timeout: 60000 }).should('have.length', 2)
        cy.get('.lkr-outcome__sym').eq(0).should('have.text', 'WETH')
        cy.get('.lkr-outcome__sym').eq(1).should('have.text', 'ETH')
        cy.get('.lkr-outcome--sent').should('have.length', 2)
        cy.contains(/funds moved/i).should('be.visible')
      })

      // Judged by chain state, not by the dialog's wording.
      balances(DEST).then((destAfter) => {
        expect(BigInt(destAfter.token) - BigInt(destBefore.token), 'token received').to.equal(BigInt(TOKEN_AMOUNT))
        expect(
          isGreater(destAfter.native, destBefore.native),
          `native received (${destBefore.native} -> ${destAfter.native})`,
        ).to.equal(true)
      })
      balances(legacy.address).then((left) => {
        expect(BigInt(left.token), 'token fully swept').to.equal(0n)
        // The gas reserve is deliberately NOT swept — it is what paid for the sweep. What is
        // left is dust, not a balance: a small fraction of the 1 ETH it started with.
        expect(
          isLess(left.native, (BigInt(ONE_ETH) / 100n).toString()),
          `only reserve dust left behind (${left.native} wei)`,
        ).to.equal(true)
      })
    })
  })

  // ---------------------------------------------------------------------------
  // LKR-S2 — the invariant this tier exists for: one asset fails, the rest still move
  // ---------------------------------------------------------------------------
  it('[LKR-S2] reports a per-asset failure and still moves the assets that can move', () => {
    balances(DEST).then((destBefore) => {
      openTransferFor(legacy.privateKey)

      cy.get('.action-sheet').within(() => {
        cy.contains('button', 'Check balances').click()
        cy.get('.lkr-quote', { timeout: 20000 }).should('contain.text', 'WETH')
      })

      /*
       * Force ONE leg to fail, at the moment of transfer.
       *
       * It has to be the TRANSFER that fails, not the balance: `sweepAllAssets` re-reads
       * balances itself, so draining the token would simply drop it from the run and prove
       * nothing. A token that holds the balance and refuses to move it is also the realistic
       * case — a blocklisting stablecoin does exactly this.
       */
      fixture('armTokenToRefuse', { token: APP_WRAPPED_NATIVE })

      cy.get('.action-sheet').within(() => {
        cy.contains('button', 'Transfer all').click()

        cy.get('.lkr-outcome', { timeout: 60000 }).should('have.length', 2)
        // The failure is named, with its reason, against the asset it belongs to…
        cy.get('.lkr-outcome').eq(0).should('have.class', 'lkr-outcome--failed')
        cy.get('.lkr-outcome').eq(0).should('contain.text', 'WETH').and('contain.text', 'failed')
        // …and the asset that could move, did.
        cy.get('.lkr-outcome').eq(1).should('have.class', 'lkr-outcome--sent')
        cy.get('.lkr-outcome').eq(1).should('contain.text', 'ETH')

        // A run with a failure does NOT claim success: the "Funds moved" screen is withheld
        // and the member is left on the transfer step with the outcomes in front of them.
        cy.contains(/funds moved/i).should('not.exist')
      })

      balances(DEST).then((destAfter) => {
        expect(
          isGreater(destAfter.native, destBefore.native),
          `native still moved (${destBefore.native} -> ${destAfter.native})`,
        ).to.equal(true)
        expect(BigInt(destAfter.token) - BigInt(destBefore.token), 'nothing arrived for the failed asset').to.equal(0n)
      })
    })
  })

  // ---------------------------------------------------------------------------
  // LKR-S3 — recovery is complete without a transfer; nothing moves unless asked
  // ---------------------------------------------------------------------------
  it('[LKR-S3] leaves the legacy account untouched when the member stores the key and stops', () => {
    balances(legacy.address).then((before) => {
      cy.importLegacyKey({ secret: legacy.privateKey, passphrase: PASSPHRASE })
      cy.get('.action-sheet').within(() => {
        cy.contains(/recovery is complete/i).should('be.visible')
        cy.contains('button', 'Done').click()
      })
      cy.get('.action-sheet').should('not.exist')
      cy.get('.lkr-stored__item').should('have.length', 1)

      // Storing the key moved nothing. The transfer is genuinely optional, on chain too.
      balances(legacy.address).then((after) => {
        expect(BigInt(after.native), 'native untouched').to.equal(BigInt(before.native))
        expect(BigInt(after.token), 'token untouched').to.equal(BigInt(before.token))
      })
    })
  })
})
