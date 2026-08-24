/**
 * E2E Tests: Earn — lending vaults and delegated staking (specs 050-earn / 065 / 066, Full-tier)
 *
 * Issue #1237. The question these flows answer is "where did the money end up", and the answer
 * is never a toast:
 *
 *   EL-01  earn.deposit-to-vault      shares appear in the member's name, assets leave the wallet
 *   EL-02  earn.withdraw-from-vault   the shares are burned and the assets come back
 *   ES-01  earn.stake-and-delegate    the POL is delegated to the validator, from the member's wallet
 *   ES-02  earn.unstake               the delegation unbonds, waits, and comes back
 *   ES-03  admin.staking-controls     an operator pauses new staking and retires a validator
 *
 * ── WHY THE VAULT SHARE BALANCE AND NOT THE SCREEN ─────────────────────────────────────────
 * ERC-4626 deposit is two movements — assets out of the wallet, shares into it — and a surface
 * can report success having done neither. `MockERC4626Vault.balanceOf(member)` is the fact.
 *
 * ── WHAT IS REAL AND WHAT IS STUBBED ───────────────────────────────────────────────────────
 * There is no Morpho on a local chain, so the vault LIST is stubbed at Morpho's public API, the
 * same treatment `25-platform-fees.cy.js` gives it. Everything that decides money is real: the
 * `MockERC4626Vault` from `deploy:local:earn-vault`, the token, the FeeRouter, the signature and
 * both balances all live on the chain. Positions are read from the chain by the app itself —
 * Morpho only ever supplies USD enrichment, and the stub deliberately returns none, so what the
 * positions list shows is what the vault says.
 *
 * ── THE FEE IS #1233's SUBJECT, NOT THIS SPEC'S ────────────────────────────────────────────
 * `earn.lend` is a spec-060 service and `25-platform-fees.cy.js` already settles disclosure,
 * the `maxFeeBps` ceiling and the treasury leg against it. Duplicating that here would give two
 * places to update when the rate model changes. These flows run at whatever rate the chain
 * holds and assert the DEPOSIT's own two legs; where the rate is non-zero they account for it
 * rather than re-proving it.
 *
 * ── THE STAKING HALF, AND WHY DELEGATION IS THE ONE UNDER TEST ─────────────────────────────
 * Delegated staking is a DIRECT member call to Polygon's ValidatorShare — no FairWins contract
 * is in the path at all — so it is the half where "we never hold your funds" is a claim about
 * the calldata rather than about a router's balance. `contracts/mocks/MockPolygonDelegation.sol`
 * stands in for the StakeManager and one ValidatorShare, and it deliberately routes the token
 * pull THROUGH the StakeManager, because that is the spender the app approves; a mock that
 * pulled directly would pass while the app approved the wrong contract.
 *
 * The StakingRouter (spec 066) governs what is OFFERED, not what is held: its allowlist decides
 * which validators the app will show, and its pause stops new liquid staking. ES-03 drives both
 * from the operator's own console and reads the result back off the chain and off the member's
 * screen — a pause that stopped an EXIT would be the failure worth catching, and the exit here
 * cannot be stopped because it never went through the router in the first place.
 */

const MEMBER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' // #0 — seeded with the payment token

const DECIMALS = 18n // the local payment token is an 18-decimal MockERC20; the vault inherits it
const ONE = 10n ** DECIMALS

const LEND_URL = '/wallet?tab=earn&view=lend'

/** Fixture coordinates, resolved once from the deployment record. */
let fixtures = null

const chain = (action, args = {}) =>
  cy.task('chainTx', { action, args }).then((r) => {
    expect(r.ok, `chainTx ${action}: ${r.error || 'no error message returned'}`).to.equal(true)
    return r
  })

/**
 * Stand in for Morpho's vault API with the LOCAL mock vault. Two queries arrive on this one
 * endpoint and must be told apart by body: the vault list, and the position enrichment. The
 * enrichment is answered with an empty user, which the app treats as "no enrichment" and falls
 * back to on-chain reads — exactly the state this spec judges by.
 */
const stubVaultList = () => {
  cy.intercept('POST', 'https://api.morpho.org/graphql', (req) => {
    if (String(req.body?.query || '').includes('EarnPositions')) {
      req.reply({ statusCode: 200, body: { data: { userByAddress: null } } })
      return
    }
    req.reply({
      statusCode: 200,
      body: {
        data: {
          vaults: {
            items: [
              {
                address: fixtures.vault,
                symbol: 'mVLT',
                name: 'Local Test Vault',
                listed: true,
                state: {
                  totalAssetsUsd: 1000,
                  apy: 0.05,
                  netApy: 0.045,
                  curators: [{ name: 'FairWins E2E' }],
                  allRewards: [],
                },
                asset: {
                  name: 'Mock USDC',
                  address: fixtures.asset,
                  decimals: Number(DECIMALS),
                  symbol: 'USDC',
                },
                chain: { id: Number(Cypress.env('NETWORK_ID')) },
              },
            ],
          },
        },
      },
    })
  }).as('morpho')
}

/** Open Earn ▸ Lend with the vault list stubbed, and wait for the row to exist. */
const openLend = () => {
  cy.mockWeb3Provider({ account: MEMBER, preAuthorized: true, realBalances: true })
  stubVaultList()
  cy.visit(LEND_URL)
  cy.get('.earn-vault-row', { timeout: 30000 }).should('be.visible')
}

/**
 * Open the vault sheet. Scoped from here on: the sheet renders over the list, and an unscoped
 * `cy.contains` would happily match the page behind it.
 */
const openSheet = () => {
  cy.get('.earn-vault-row').first().click()
  cy.get('.earn-vault-sheet[role="dialog"]', { timeout: 20000 }).should('be.visible')
  // The balance reads have to land before any amount can be entered honestly.
  cy.get('.earn-vault-sheet').contains('In your wallet', { timeout: 30000 }).should('be.visible')
}

const position = () => chain('vaultPosition', { address: MEMBER })
const walletBalance = () =>
  chain('tokenBalance', { address: MEMBER }).then(({ balance }) => BigInt(balance))

describe('Earn — lending vaults and delegated staking (specs 050-earn / 065 / 066)', () => {
  before(() => {
    /*
     * Resolve the fixtures ONCE and refuse to continue without them. A missing vault would
     * otherwise degrade into a spec that stubs a list nothing can be deposited into, and every
     * assertion below would fail somewhere far from the cause.
     */
    chain('feeFixtures').then((r) => {
      fixtures = { vault: r.vault, asset: r.asset, feeRouter: r.feeRouter }
    })
  })

  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  it('[EL-01] earn.deposit-to-vault — the shares land in the member\'s name and the assets leave their wallet', () => {
    const DEPOSIT = 100n * ONE

    position().then(({ shares: sharesBefore }) => {
      walletBalance().then((walletBefore) => {
        openLend()
        openSheet()

        cy.get('#earn-amount').type('100')
        cy.get('.earn-vault-sheet .earn-submit').should('not.be.disabled').click()

        // The sheet stays open and reports what happened — it does not close underneath the
        // member (VaultSheet keeps the done state; SupplyView is the surface that closes).
        cy.get('.earn-tx-done', { timeout: 60000 }).should('contain.text', 'Deposit complete')

        // THE ASSERTION. Both legs of the one transaction, from the chain.
        position().then(({ shares, assets }) => {
          expect(BigInt(shares) > BigInt(sharesBefore), 'shares were minted to the member')
            .to.equal(true)
          // A vault at 1:1 with no prior yield: what the shares are worth is what went in, net
          // of whatever platform rate the chain currently holds (#1233 owns that rate; this
          // asserts only that nothing beyond the deposit moved).
          expect(BigInt(assets) <= DEPOSIT, 'the position is worth no more than was deposited')
            .to.equal(true)
          expect(BigInt(assets) > 0n, 'the position is worth something').to.equal(true)
        })
        walletBalance().then((walletAfter) => {
          expect(walletBefore - walletAfter, 'exactly the deposit left the wallet').to.equal(DEPOSIT)
        })
      })
    })
  })

  it('[EL-02] earn.withdraw-from-vault — the shares are burned and the assets come back', () => {
    // Stand on a position rather than assume EL-01 left one: a spec that only works in order is
    // a spec that fails for a reason unrelated to what it tests.
    position().then(({ shares: existing }) => {
      cy.wrap(BigInt(existing) > 0n, 'there is a position to withdraw').should('equal', true)
    })

    walletBalance().then((walletBefore) => {
      openLend()
      openSheet()

      // The exit is a tab, and it is only offered because the member holds something.
      cy.get('.earn-vault-sheet .earn-mode-tab').eq(1).should('not.be.disabled').click()
      cy.get('.earn-vault-sheet').contains('Available to withdraw now', { timeout: 20000 })
        .should('be.visible')
      cy.get('.earn-vault-sheet .earn-amount-input').contains('button', 'Max').click()
      cy.get('#earn-amount').invoke('val').should('not.equal', '')

      cy.get('.earn-vault-sheet .earn-submit').should('not.be.disabled').click()
      cy.get('.earn-tx-done', { timeout: 60000 }).should('contain.text', 'Withdrawal complete')

      position().then(({ shares }) => {
        expect(BigInt(shares), 'the whole position was burned').to.equal(0n)
      })
      walletBalance().then((walletAfter) => {
        expect(walletAfter > walletBefore, 'the assets came back to the wallet').to.equal(true)
      })
    })
  })

  // ── The staking half (specs 065 + 066) ──────────────────────────────────────────────────
  const STAKE_URL = '/wallet?tab=earn&view=stake'
  const ADMIN_STAKING_URL = '/admin/protocol-config?view=staking'
  /** The locally-curated validator's display name (config/networks.js, DEV-only seam). */
  const LOCAL_VALIDATOR = 'E2E Validator'
  const DELEGATION = 250n * ONE

  const staking = (action, args = {}) =>
    cy.task('stakingFixture', { action, args }).then((r) => {
      expect(r.ok, `stakingFixture ${action}: ${r.error || 'no error message returned'}`).to.equal(true)
      return r
    })

  /**
   * Open the local validator's sheet.
   *
   * The row is picked BY NAME, never `.first()`: the Stake area lists every network's options,
   * so on a machine with outbound RPC the real Ethereum validators are in the list too — and
   * the first row is one of those, where the member holds nothing.
   */
  const openValidator = () => {
    cy.mockWeb3Provider({ account: MEMBER, preAuthorized: true, realBalances: true })
    cy.visit(STAKE_URL)
    cy.contains('.earn-vault-row', LOCAL_VALIDATOR, { timeout: 40000 }).click()
    cy.get('.earn-vault-sheet[role="dialog"]', { timeout: 20000 }).should('be.visible')
    cy.get('.earn-vault-sheet').contains('In your wallet', { timeout: 30000 }).should('be.visible')
  }

  it('[ES-01] earn.stake-and-delegate — the POL leaves the member\'s wallet and lands with the validator', () => {
    staking('setPaused', { paused: false })
    staking('setValidator', { listed: true })
    staking('mintPol', { address: MEMBER, amount: (1000n * ONE).toString() })

    staking('delegation', { address: MEMBER }).then(({ staked: before }) => {
      staking('polBalance', { address: MEMBER }).then(({ balance: walletBefore }) => {
        openValidator()

        // Delegated options label the stake tab "Delegate" — the member is choosing a validator,
        // not handing tokens to a protocol.
        cy.get('.earn-vault-sheet .earn-mode-tab').eq(0).should('contain.text', 'Delegate')
        cy.get('#staking-amount').type('250')
        cy.get('.earn-vault-sheet .earn-submit').should('not.be.disabled').click()
        // One done copy covers both staking models — "Delegate" is the control's label, not the
        // outcome's — so this asserts what the sheet actually says.
        cy.get('.earn-tx-done', { timeout: 60000 }).should('contain.text', 'Stake complete')

        // THE ASSERTION, from the validator's own books.
        staking('delegation', { address: MEMBER }).then(({ staked }) => {
          expect(BigInt(staked) - BigInt(before), 'the validator credits the member with the stake')
            .to.equal(DELEGATION)
        })
        staking('polBalance', { address: MEMBER }).then(({ balance }) => {
          expect(BigInt(walletBefore) - BigInt(balance), 'exactly that much left the wallet')
            .to.equal(DELEGATION)
        })
      })
    })
  })

  it('[ES-02] earn.unstake — the delegation unbonds, waits out the delay, and comes back', () => {
    staking('setPaused', { paused: false })
    staking('setValidator', { listed: true })

    staking('delegation', { address: MEMBER }).then((before) => {
      cy.wrap(BigInt(before.staked) > 0n, 'there is a delegation to unstake').should('equal', true)

      openValidator()
      cy.get('.earn-vault-sheet .earn-mode-tab').eq(1).should('not.be.disabled').click()
      cy.get('.earn-vault-sheet .earn-amount-input').contains('button', 'Max').click()
      // The unbonding wait is a GATE, not a footnote: the exit is not instant and the member
      // has to say they know that before the request is signed.
      cy.get('.staking-ack input[type="checkbox"]').should('not.be.checked').check()
      cy.get('.earn-vault-sheet .earn-submit').should('not.be.disabled').click()
      cy.get('.earn-tx-done', { timeout: 60000 }).should('contain.text', 'Unstake requested')

      // Requested, not returned: the stake is gone from the validator and sitting in an unbond
      // that the checkpoint delay has not released yet.
      staking('delegation', { address: MEMBER }).then((mid) => {
        expect(BigInt(mid.staked), 'the stake left the validator').to.equal(0n)
        expect(BigInt(mid.unbondShares), 'and is waiting in an unbond').to.equal(BigInt(before.staked))
        expect(mid.withdrawEpoch + mid.withdrawalDelay > mid.epoch, 'which is not claimable yet')
          .to.equal(true)
      })

      // The chain moves past the delay. Nothing about the member's rights changed — only time.
      staking('advanceEpoch', { by: 2 })

      staking('polBalance', { address: MEMBER }).then(({ balance: walletBefore }) => {
        openValidator()
        // A matured unbond is offered as its own control, separate from the amount form.
        cy.get('.staking-ready-box', { timeout: 30000 }).should('be.visible')
        cy.get('.staking-ready-box').contains('button', 'Withdraw').click()
        cy.get('.earn-tx-done', { timeout: 60000 }).should('contain.text', 'Withdrawal complete')

        staking('polBalance', { address: MEMBER }).then(({ balance }) => {
          expect(BigInt(balance) - BigInt(walletBefore), 'the POL came back to the wallet')
            .to.equal(BigInt(before.staked))
        })
        staking('delegation', { address: MEMBER }).then(({ unbondShares }) => {
          expect(BigInt(unbondShares), 'and the unbond is settled').to.equal(0n)
        })
      })
    })
  })

  it('[ES-03] admin.staking-controls — an operator pauses new staking and retires a validator', () => {
    /*
     * Two different levers with two different roles behind them (StakingRouter): GUARDIAN_ROLE
     * pauses, STAKING_ADMIN_ROLE curates. Both are driven from the operator's own console here,
     * not from a fixture, because what is under test is that the console actually moves the
     * chain — and then that the member's surface tells the truth about what it did.
     */
    staking('setPaused', { paused: false })
    staking('setValidator', { listed: true })

    cy.mockWeb3Provider({ account: MEMBER, preAuthorized: true, realBalances: true })
    cy.visit(ADMIN_STAKING_URL)
    cy.contains('h3', 'Staking Controls', { timeout: 40000 }).should('be.visible')

    // ── The pause. ────────────────────────────────────────────────────────────────────────
    cy.contains('button', 'Pause staking', { timeout: 20000 }).should('not.be.disabled').click()
    cy.contains('button', 'Resume staking', { timeout: 60000 }).should('be.visible')
    staking('routerState').then(({ paused }) => {
      expect(paused, 'the console paused the router on chain').to.equal(true)
    })

    // What a member sees: the option is labelled paused and new staking is refused — and the
    // EXIT is untouched, because it never ran through this router to begin with.
    openValidator()
    cy.get('.earn-vault-sheet .earn-mode-tab').eq(0).click()
    cy.get('.earn-vault-sheet').contains(/New staking is paused/i).should('be.visible')
    cy.get('.earn-vault-sheet .earn-submit').should('be.disabled')
    cy.get('.earn-vault-sheet .asset-sheet-close').click()
    cy.contains('.earn-vault-row', LOCAL_VALIDATOR).find('.staking-badge.paused').should('exist')

    // ── Retiring the route. ───────────────────────────────────────────────────────────────
    cy.visit(ADMIN_STAKING_URL)
    cy.contains('button', 'Resume staking', { timeout: 40000 }).should('not.be.disabled').click()
    cy.contains('button', 'Pause staking', { timeout: 60000 }).should('be.visible')

    staking('routerState').then(({ validatorShare }) => {
      // The table renders a SHORTENED address and carries the full one in `title`, so the row is
      // found by the attribute rather than by a prefix of the text.
      cy.get(`code[title="${validatorShare}"]`, { timeout: 20000 })
        .closest('tr')
        .contains('button', 'Remove')
        .click()
      // Wait for the console to REFLECT the removal before reading the chain. Reading straight
      // after the click races the transaction, and the failure ("still curated") reads exactly
      // like a control that did nothing.
      cy.get(`code[title="${validatorShare}"]`, { timeout: 60000 }).should('not.exist')
      staking('routerState').then(({ paused, validatorListed }) => {
        expect(paused, 'the pause was lifted').to.equal(false)
        expect(validatorListed, 'the validator is no longer curated on chain').to.equal(false)
      })
    })

    // A retired route is not offered. The allowlist is the boundary — a validator the router
    // does not list is one the app must not send a member to.
    cy.mockWeb3Provider({ account: MEMBER, preAuthorized: true, realBalances: true })
    cy.visit(STAKE_URL)
    cy.get('.earn-vault-row', { timeout: 40000 }).should('exist')
    cy.contains('.earn-vault-row', LOCAL_VALIDATOR).should('not.exist')

    // Leave it curated for whatever runs next.
    staking('setValidator', { listed: true })
  })
})
