/**
 * E2E Tests: Earn — lending vaults and delegated staking (specs 050-earn / 065 / 066, Full-tier)
 *
 * Issue #1237. The question these flows answer is "where did the money end up", and the answer
 * is never a toast:
 *
 *   EL-01  earn.deposit-to-vault      shares appear in the member's name, assets leave the wallet
 *   EL-02  earn.withdraw-from-vault   the shares are burned and the assets come back
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
})
