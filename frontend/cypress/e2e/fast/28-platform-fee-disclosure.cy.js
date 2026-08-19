// =============================================================================
// 28-platform-fee-disclosure.cy.js
// Fast-tier E2E tests for platform-fee DISCLOSURE (spec 060) — the sibling of
// cypress/e2e/full/25-platform-fees.cy.js, which settles the money on a chain.
//
// Two member-facing rules live entirely in the rendering layer, so by admission
// rule 1 they belong here and not in the on-chain tier:
//
//   1. A ZERO RATE SHOWS NO FEE LINE — not a line reading "0". The pre-060
//      behaviour has to come back byte-identical, which means more than the
//      absence of some text: the deposit must still approve and call the VAULT,
//      never route through the FeeRouter. That is asserted on the calldata the
//      wallet was handed, because a fee-free deposit that quietly took the
//      wrapper path would look identical on screen.
//
//   2. AN UNREADABLE RATE BLOCKS THE DEPOSIT. A router exists on this network
//      and could not be read: failing to read is never evidence of a lower rate
//      (FR-015/FR-051), so nothing may be signed. The falsifiable half is that
//      NO transaction is offered at all — a test that only checked for the
//      warning text would pass over a UI that showed it and submitted anyway.
//
// NOTHING REAL IS SIGNED and no chain is needed. The read providers (spec 069
// resolves them from NETWORKS[*].rpcUrl) and the wallet rail (cy.mockWeb3Provider
// forwards its unknown methods to `rpcUrl`) are both intercepted, so every value
// under test is one this spec chose — including, deliberately, the ones it makes
// unreadable. Morpho's vault API is stubbed the same way: there is no vault list
// without it, and the list is not what is under test.
//
// The world is POLYGON, because that is where the app's default build puts a
// FeeRouter and an Earn deployment; `cy.mockWeb3Provider` is pinned to 137 so the
// send path never has to negotiate a chain switch.
// =============================================================================

const TEST_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

/* Real addresses, because the app resolves them from its own config and the assertions below are
 * about WHICH contract was called. `feeRouter` is POLYGON_CONTRACTS.feeRouter; the vault is a
 * plausible-looking Morpho vault address that exists only in this spec's stub. */
const FEE_ROUTER_137 = '0xf8161fC26172621E9fbcc6c39500Bb14b0902B35'
const VAULT_137 = '0x781FB7F6d845E3bE129289833b04d43Aa8558c42'
const POLYGON_USDC = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'

/* The wallet rail. cy.mockWeb3Provider answers the account/chain/signing methods itself and
 * forwards everything else here, so intercepting this URL is what makes a send OBSERVABLE and
 * stops it reaching a node that is not running. */
const WALLET_RPC = 'http://localhost:8545'

const USDC_DECIMALS = 6
const WALLET_BALANCE = 500_000_000n // 500 USDC
const DEPOSIT_UNITS = '100'
const DEPOSIT_AMOUNT = 100_000_000n // 100 USDC at 6 decimals

const SENT_TX_HASH = `0x${'ab'.repeat(32)}`
const BLOCK_HASH = `0x${'cd'.repeat(32)}`
const POLYGON_HEAD_BLOCK = 71_000_500

/** Selectors verified with `ethers.id(sig).slice(0, 10)`. */
const SELECTOR = {
  getService: '0xda47d856', // FeeRouter.getService(bytes32)
  balanceOf: '0x70a08231',
  maxDeposit: '0x402d267d',
  allowance: '0xdd62ed3e',
  approve: '0x095ea7b3',
  deposit: '0x6e553f65', // ERC-4626 deposit(uint256,address)
  depositToVaultWithFee: '0xd2108148', // asserted-against, never expected
}

const hex = (n) => `0x${Number(n).toString(16)}`
const word = (n) => `0x${BigInt(n).toString(16).padStart(64, '0')}`

/**
 * The FeeRouter's `Service` struct — `(uint16 capBps, uint16 feeBps, ServiceKind kind)` — ABI
 * encoded. `kind: 1` is Wrapped, i.e. REGISTERED: an unregistered service (kind 0) is a different
 * and much weaker case, because the app is then honestly fee-free for a reason that has nothing
 * to do with the rate being zero.
 */
function encodeService({ capBps, feeBps, kind }) {
  return `0x${[capBps, feeBps, kind].map((v) => BigInt(v).toString(16).padStart(64, '0')).join('')}`
}

/* --------------------------------------------------------------------------------------------- *
 * The stubbed world
 * --------------------------------------------------------------------------------------------- */

/** Every `eth_sendTransaction` the app made in this test, in order. Reset per test. */
let submissions = []

/**
 * `routerAnswer` is the whole experiment. Returning an encoded Service is the readable world;
 * returning `'0x'` makes ethers reject the decode, which is what an unreachable or wrong-ABI
 * router looks like from the app's side — and is exactly the case FR-015 says must block rather
 * than quote zero.
 */
let routerAnswer = encodeService({ capBps: 250, feeBps: 0, kind: 1 })

function ethCallResult({ to, data } = {}) {
  const selector = typeof data === 'string' ? data.slice(0, 10).toLowerCase() : ''
  const target = String(to || '').toLowerCase()
  switch (selector) {
    case SELECTOR.getService:
      return routerAnswer
    case SELECTOR.balanceOf:
      /*
       * WHICH contract was asked decides the answer, and getting that wrong is not cosmetic: the
       * same selector reads the member's USDC balance on the token and their SHARE balance on the
       * vault. A nonzero share balance makes the app read convertToAssets/maxWithdraw as well —
       * which this world does not answer — so the position read rejects and the sheet never
       * leaves "Loading your balances…". Zero shares is also the state under test: a first
       * deposit is where the approval leg exists, and that approval's SPENDER is what says
       * whether the fee path was taken.
       */
      return target === VAULT_137.toLowerCase() ? word(0) : word(WALLET_BALANCE)
    case SELECTOR.maxDeposit:
      return word(2n ** 255n) // no vault-side cap
    case SELECTOR.allowance:
      return word(0) // forces the approval leg — see the note above
    default:
      // Honestly unanswerable. '0x' makes ethers reject the decode, which every caller in this
      // app turns into an explicit unavailable state rather than into a fabricated number.
      return '0x'
  }
}

function rpcResult(url, { method, params } = {}) {
  switch (method) {
    case 'eth_chainId':
      return hex(137)
    case 'net_version':
      return '137'
    case 'eth_blockNumber':
      return hex(POLYGON_HEAD_BLOCK)
    case 'eth_getCode':
      return '0x60806040'
    case 'eth_getLogs':
      return []
    case 'eth_call':
      return ethCallResult(params?.[0])
    case 'eth_getBalance':
      return '0x0'
    case 'eth_estimateGas':
      return '0x5208'
    case 'eth_gasPrice':
    case 'eth_maxPriorityFeePerGas':
      return '0x3b9aca00'
    case 'eth_getTransactionCount':
      return '0x1'
    case 'eth_feeHistory':
      return {
        oldestBlock: hex(POLYGON_HEAD_BLOCK - 1),
        baseFeePerGas: ['0x1', '0x1'],
        gasUsedRatio: [0],
        reward: [['0x1']],
      }
    case 'eth_getBlockByNumber':
    case 'eth_getBlockByHash':
      return {
        number: hex(POLYGON_HEAD_BLOCK),
        hash: BLOCK_HASH,
        parentHash: BLOCK_HASH,
        timestamp: hex(Math.floor(Date.now() / 1000)),
        gasLimit: '0x1c9c380',
        gasUsed: '0x0',
        baseFeePerGas: '0x1',
        miner: '0x0000000000000000000000000000000000000000',
        extraData: '0x',
        transactions: [],
      }
    case 'eth_sendTransaction':
      return SENT_TX_HASH
    case 'eth_getTransactionByHash':
      return {
        hash: SENT_TX_HASH,
        blockHash: BLOCK_HASH,
        blockNumber: hex(POLYGON_HEAD_BLOCK),
        transactionIndex: '0x0',
        from: TEST_ACCOUNT,
        to: VAULT_137,
        value: '0x0',
        gas: '0x5208',
        gasPrice: '0x3b9aca00',
        input: '0x',
        nonce: '0x1',
        type: '0x0',
        chainId: hex(137),
        v: '0x1b',
        r: `0x${'11'.repeat(32)}`,
        s: `0x${'22'.repeat(32)}`,
      }
    case 'eth_getTransactionReceipt':
      return {
        transactionHash: SENT_TX_HASH,
        transactionIndex: '0x0',
        blockHash: BLOCK_HASH,
        blockNumber: hex(POLYGON_HEAD_BLOCK),
        from: TEST_ACCOUNT,
        to: VAULT_137,
        cumulativeGasUsed: '0x5208',
        gasUsed: '0x5208',
        effectiveGasPrice: '0x3b9aca00',
        contractAddress: null,
        logs: [],
        logsBloom: `0x${'00'.repeat(256)}`,
        status: '0x1',
        type: '0x0',
      }
    default:
      return null
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function stubJsonRpc() {
  const handle = (req) => {
    const body = typeof req.body === 'string' ? safeJson(req.body) : req.body
    const answer = (entry) => {
      if (entry?.method === 'eth_sendTransaction') submissions.push(entry?.params?.[0] ?? null)
      return { jsonrpc: '2.0', id: entry?.id ?? 1, result: rpcResult(req.url, entry) }
    }
    req.reply({
      statusCode: 200,
      body: Array.isArray(body) ? body.map(answer) : answer(body),
    })
  }
  // The app's read providers (spec 069 resolves these from NETWORKS[*].rpcUrl). Every earn-enabled
  // network is covered by the one pattern — Earn reads Ethereum's vaults too.
  cy.intercept({ method: 'POST', url: /publicnode\.com/ }, handle).as('readRpc')
  cy.intercept({ method: 'POST', url: `${WALLET_RPC}**` }, handle).as('walletRpc')
}

/** Morpho's vault API, standing in for a curated Polygon vault. */
function stubVaultList() {
  cy.intercept('POST', 'https://api.morpho.org/graphql', (req) => {
    const query = String(req.body?.query || '')
    if (query.includes('EarnPositions')) {
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
                address: VAULT_137,
                symbol: 'steakUSDC',
                name: 'Test USDC Vault',
                listed: true,
                state: {
                  totalAssetsUsd: 1_000_000,
                  apy: 0.06,
                  netApy: 0.055,
                  curators: [{ name: 'FairWins E2E' }],
                  allRewards: [],
                },
                asset: {
                  name: 'USD Coin',
                  address: POLYGON_USDC,
                  decimals: USDC_DECIMALS,
                  symbol: 'USDC',
                },
                chain: { id: 137 },
              },
            ],
          },
        },
      },
    })
  }).as('morpho')
}

/**
 * `cy.visit` needs longer than the stock 60s page-load timeout in the stubbed worlds. Measured on
 * the sibling perps spec and true for the same reason: registering a request HANDLER (the only
 * way to answer a method that arrives inside the POST body) routes every request through the
 * Cypress driver, and `vite dev` serves this app as ~a thousand module requests.
 */
const STUBBED_VISIT_TIMEOUT_MS = 180_000

/** Connect on Polygon and open Earn ▸ Lend against the stubbed world. */
function openLend() {
  stubJsonRpc()
  stubVaultList()
  // `preAuthorized` because the mock announces over EIP-6963: an unauthorised one reports no
  // accounts and the wallet-gated content never renders (documented in 24-perps.cy.js).
  cy.mockWeb3Provider({ account: TEST_ACCOUNT, networkId: 137, preAuthorized: true })
  cy.visit('/wallet?tab=earn&view=lend', { timeout: STUBBED_VISIT_TIMEOUT_MS })
  cy.get('.earn-vault-row', { timeout: 60000 }).should('be.visible')
}

/** Open the deposit sheet for the one stubbed vault, with its balances read. */
function openDepositSheet() {
  cy.get('.earn-vault-row').click()
  // Scoped from here on — the sheet renders over the list, and an unscoped `cy.contains` would
  // match the page behind it (policy anti-pattern 2).
  cy.get('.earn-vault-sheet[role="dialog"]', { timeout: 30000 }).should('be.visible')
  cy.get('.earn-vault-sheet').contains('In your wallet', { timeout: 30000 }).should('be.visible')
}

describe('Platform fee disclosure', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
    submissions = []
    routerAnswer = encodeService({ capBps: 250, feeBps: 0, kind: 1 })
  })

  // ---------------------------------------------------------------------------
  // FEE-04: fees.zero-rate-shows-no-line
  // ---------------------------------------------------------------------------
  it('[FEE-04] a zero rate shows no fee line, and the deposit goes straight to the vault', () => {
    openLend()
    openDepositSheet()

    /*
     * The ABSENCE, stated three ways, because "no fee line" is the requirement and a line reading
     * "0.00%" would satisfy a looser one.
     *
     * Scoped to the FACTS LIST, which is the thing a fee line is a line OF. Scoping to the whole
     * sheet would be wrong in both directions: the header legitimately carries the vault's APY
     * (a percentage that has nothing to do with fees), and the blocked-rate warning in FEE-05
     * legitimately contains the words "platform fee" — so a sheet-wide negative would fail on
     * correct behaviour and could not distinguish the two states this pair of tests exists to
     * tell apart.
     */
    cy.get('.earn-vault-sheet .earn-vault-sheet-facts').within(() => {
      cy.contains(/platform fee/i).should('not.exist')
      cy.contains(/goes into the vault/i).should('not.exist')
      cy.contains('%').should('not.exist')
    })
    // The honest-failure state is absent too: a zero rate is a READ rate, not an unread one.
    cy.get('.earn-vault-sheet').contains(/could not be confirmed/i).should('not.exist')

    // Byte-identical to pre-060 is a claim about the CALLDATA, not about the copy.
    cy.get('#earn-amount').clear().type(DEPOSIT_UNITS)
    cy.get('.earn-vault-sheet .earn-submit').should('not.be.disabled').click()
    cy.get('.earn-vault-sheet', { timeout: 60000 }).contains(/deposit complete/i).should('be.visible')

    cy.then(() => {
      expect(submissions, 'a first deposit is an approval and the deposit itself').to.have.length(2)

      const [approval, deposit] = submissions
      const spender = `0x${approval.data.slice(34, 74)}`
      expect(approval.to.toLowerCase(), 'the approval is on the token').to.equal(POLYGON_USDC.toLowerCase())
      expect(approval.data.slice(0, 10), 'the approval is an ERC-20 approve').to.equal(SELECTOR.approve)
      expect(spender.toLowerCase(),
        'the member approves the VAULT — with no fee there is nothing for the router to do, and ' +
        'approving it anyway would hand a fee contract an allowance the member was never shown',
      ).to.equal(VAULT_137.toLowerCase())
      expect(BigInt(`0x${approval.data.slice(74, 138)}`).toString(),
        'the approval is for the exact deposit, not an unlimited allowance')
        .to.equal(DEPOSIT_AMOUNT.toString())

      expect(deposit.to.toLowerCase(), 'the deposit calls the vault directly')
        .to.equal(VAULT_137.toLowerCase())
      expect(deposit.data.slice(0, 10), 'the deposit is ERC-4626 deposit(uint256,address)')
        .to.equal(SELECTOR.deposit)

      for (const submission of submissions) {
        expect(submission.to.toLowerCase(), 'nothing was routed through the FeeRouter')
          .to.not.equal(FEE_ROUTER_137.toLowerCase())
        expect(submission.data.slice(0, 10), 'the wrapper charge path was never called')
          .to.not.equal(SELECTOR.depositToVaultWithFee)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // FEE-05: the unhappy half of the same rule — an unread rate is not a zero rate
  // ---------------------------------------------------------------------------
  it('[FEE-05] a rate that could not be read blocks the deposit instead of quoting zero', () => {
    routerAnswer = '0x' // the router is configured here and did not answer

    openLend()
    openDepositSheet()

    // Told plainly, and told BEFORE anything is signed.
    cy.get('.earn-vault-sheet [role="alert"]', { timeout: 30000 })
      .should('contain.text', 'could not be confirmed')
    // And never quoted as free: a zero fee line would state a rate this app does not have. Scoped
    // to the facts list because the warning itself names the platform fee — see FEE-04.
    cy.get('.earn-vault-sheet .earn-vault-sheet-facts').within(() => {
      cy.contains(/platform fee/i).should('not.exist')
      cy.contains('%').should('not.exist')
    })

    cy.get('#earn-amount').clear().type(DEPOSIT_UNITS)
    cy.get('.earn-vault-sheet .earn-submit').should('be.disabled')

    // The falsifiable half: nothing was offered to the wallet. Without this the test would pass
    // over a UI that showed the warning and submitted anyway.
    cy.then(() => {
      expect(submissions, 'no transaction was offered while the rate was unknown').to.have.length(0)
    })

    // Withdrawals are deliberately unaffected — the fee applies to deposits only, and blocking an
    // exit on an unread deposit rate would trap money over a disclosure problem.
    cy.get('.earn-vault-sheet').contains(/withdrawals are unaffected/i).should('be.visible')
  })
})
