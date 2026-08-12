// =============================================================================
// 25-perps-management.cy.js
// Fast-tier E2E tests for perps POSITION MANAGEMENT (spec 083) — the sibling of
// 24-perps.cy.js, which covers the read-only view spec 082 shipped.
//
// THREE WORLDS, and the opt-in gates exist because two of them cannot be
// produced by the CI dev server. Both `VITE_RELAYER_URL` (does a gateway exist?)
// and `VITE_PERPS_MANAGE_ENABLED` (spec 083's kill switch, DEFAULT OFF) are read
// through `import.meta.env`, i.e. they are BUILD properties — a single dev server
// resolves exactly one of these worlds, so they can never all run in one pass.
//
//   1. DEFAULT — no gateway, flag off. Runs in CI, and is the state most people
//      see. The contract is honest ABSENCE: no management control exists, no
//      sheet can be opened, and a saved deep link lands on Swap rather than on a
//      dead control.
//        npm run test:e2e:fast
//
//   2. GATEWAY STUBBED, FLAG OFF — the regression that would otherwise go
//      unnoticed: with the kill switch off the Perps view must render exactly as
//      spec 082 shipped it. The stuck-order recovery control is the ONE thing
//      that still appears, because it is deliberately not behind the flag
//      (PerpsView composition note 2 / FR-005).
//        VITE_RELAYER_URL=http://localhost:9797 \
//        CYPRESS_PERPS_GATEWAY=1 npm run test:e2e:fast
//
//   3. GATEWAY STUBBED, FLAG ON — the management flows themselves.
//        VITE_RELAYER_URL=http://localhost:9797 VITE_PERPS_MANAGE_ENABLED=true \
//        CYPRESS_PERPS_GATEWAY=1 CYPRESS_PERPS_MANAGE=1 npm run test:e2e:fast
//
// NOTHING REAL IS SIGNED. The wallet rail is the existing `cy.mockWeb3Provider`,
// whose unknown JSON-RPC methods are forwarded to its `rpcUrl` — so pointing that
// at an intercepted URL stubs the send path end to end. The flow reaches "sent to
// the venue" and stops there, which is the whole point: a receipt is not an
// execution, and no assertion below lets one become one.
//
// THE STUBS MATCH THE PRODUCER. `services/relay-gateway/src/perps/normalize.js`
// is the shape of record here — `venueRef` (with `tradeIndex` /
// `pendingOrderIndex` never a bare `index`), `pendingOrders`, `pairIndex`,
// `collaterals`, and `sources.gains.pendingOrderChains`. A stub that drifts from
// the producer is how the phase-4 markPrice defect hid for a whole phase.
// =============================================================================

const TEST_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const GATEWAY_CONFIGURED = Boolean(Cypress.env('PERPS_GATEWAY'))
const MANAGE_ENABLED = Boolean(Cypress.env('PERPS_MANAGE'))

/* Real addresses, because the calldata builders check them: `gainsDiamondFor(137)` is the call
 * target for every Gains action, and the collateral address is what a balance read is aimed at. */
const GAINS_DIAMOND_137 = '0x209A9A01980377916851af2cA075C2b170452018'
const POLYGON_USDC = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'

/* The wallet rail. `cy.mockWeb3Provider` answers the account/chain/signing methods itself and
 * forwards everything else here, so intercepting this URL is what makes a send observable and
 * stops it reaching a node that is not running. */
const WALLET_RPC = 'http://localhost:8545'

/* Block heights. The pending order below is stuck: `createdBlock + timeoutBlocks` is behind the
 * head, which is the ONLY thing that moves the order state machine to `timed_out` and therefore
 * the only thing that makes a recovery control appear (`usePerpsOrders#toGainsOrder`). */
const POLYGON_HEAD_BLOCK = 71_000_500
const PENDING_CREATED_BLOCK = 71_000_000
const PENDING_TIMEOUT_BLOCKS = 30

const SENT_TX_HASH = `0x${'ab'.repeat(32)}`
const BLOCK_HASH = `0x${'cd'.repeat(32)}`

/* --------------------------------------------------------------------------------------------- *
 * Gateway fixtures — the CURRENT payload shape (services/relay-gateway/src/perps/normalize.js)
 * --------------------------------------------------------------------------------------------- */

/** The collateral set Gains publishes on the pair feed — what the OPEN path needs (spec 083 US3). */
const GAINS_COLLATERALS = [
  { symbol: 'USDC', address: POLYGON_USDC, decimals: 6, collateralIndex: 3, usdPrice: 1 },
]

const PAIRS_BODY = {
  pairs: [
    {
      id: 'gains:137:BTC/USD',
      venue: 'gains',
      chainId: 137,
      symbol: 'BTC/USD',
      base: 'BTC',
      quote: 'USD',
      group: 'crypto',
      price: 63000,
      fundingRate: 0.0000125,
      fundingIntervalHours: 1,
      openInterestUsd: 8000,
      maxLeverage: 150,
      volume24hUsd: null,
      // Spec 083 US3 additions. `pairIndex` is the venue's own handle for the market — the sheet
      // cannot build an order without it, and it is not derivable from the symbol.
      pairIndex: 3,
      minLeverage: 2,
      collaterals: GAINS_COLLATERALS,
    },
    {
      // Hyperliquid stays read-only this release (FR-021) — it is here precisely so the "no dead
      // in-app control" rule has a row to be true of.
      id: 'hyperliquid:ETH',
      venue: 'hyperliquid',
      chainId: null,
      symbol: 'ETH/USD',
      base: 'ETH',
      quote: 'USD',
      price: 3000,
      fundingRate: -0.00002,
      fundingIntervalHours: 1,
      openInterestUsd: 90000000,
      maxLeverage: 25,
      volume24hUsd: 4000000,
    },
  ],
  sources: {
    gains: { status: 'read', chains: [137], stale: false },
    gmx: { status: 'read', chains: [42161], stale: false },
    hyperliquid: { status: 'read', chains: [], stale: false },
  },
  asOf: new Date().toISOString(),
}

const CONFIG_BODY = {
  attribution: {
    gains: { referrer: '0x2222222222222222222222222222222222222222' },
    gmx: { refCode: 'fairwins' },
    hyperliquid: { builderAddress: null },
  },
  // Zero, deliberately: the FairWins fee line must not render at a zero rate (FR-012), and this is
  // the venue whose rate the gateway publishes. Gains' own rate is structurally 0 in the client
  // (`defaultReadFeeBps` returns `{ bps: 0 }` for anything that is not GMX).
  hyperliquidBuilderFee: { bps: 0, capBps: 10, source: 'chain' },
}

/**
 * One open Gains position and one STUCK Gains order, exactly as the gateway's
 * `/v1/perps/positions` route serves them.
 *
 * Note the index discipline the producer enforces: the position carries `venueRef.tradeIndex` and
 * the order carries `venueRef.pendingOrderIndex`, and neither carries a bare `index`. The two are
 * disjoint uint32 spaces on this venue and mixing them acts on a DIFFERENT OBJECT rather than
 * reverting, which is why the field names — not a positional convention — are the defence.
 */
const POSITIONS_BODY = {
  positions: [
    {
      id: 'gains:137:7',
      venue: 'gains',
      chainId: 137,
      symbol: 'BTC/USD',
      direction: 'long',
      sizeUsd: 3150,
      collateralUsd: 300,
      entryPrice: 60000,
      leverage: 10.5,
      unrealizedPnlUsd: null, // gains' backend does not report PnL on this read
      venueRef: {
        venue: 'gains',
        chainId: 137,
        tradeIndex: 7,
        pairIndex: 3,
        collateralIndex: 3,
        collateralToken: POLYGON_USDC,
        collateralDecimals: 6,
        collateralPrecision: '1000000',
      },
    },
  ],
  pendingOrders: [
    {
      id: 'gains:137:pending:12',
      venue: 'gains',
      chainId: 137,
      symbol: 'ETH/USD',
      direction: 'long',
      orderType: 0,
      orderTypeName: 'MARKET_OPEN',
      createdBlock: PENDING_CREATED_BLOCK,
      timeoutBlocks: PENDING_TIMEOUT_BLOCKS,
      requestedCollateralUsd: 250,
      requestedLeverage: 5,
      requestedSizeUsd: 1250,
      requestedPrice: 3000,
      venueRef: {
        venue: 'gains',
        chainId: 137,
        pendingOrderIndex: 12,
        // null for MARKET_OPEN: the venue overwrites `Trade.index` to 0 on the way in, and
        // publishing that 0 would hand out a handle to the member's trade #0.
        tradeIndex: null,
        pairIndex: 1,
        collateralIndex: 3,
        collateralToken: POLYGON_USDC,
        collateralDecimals: 6,
        collateralPrecision: '1000000',
      },
    },
  ],
  sources: {
    // `chains` is the POSITION facet; `pendingOrderChains` is the ORDER facet. An absent
    // `pendingOrderChains` reads as "we never asked", which the client renders as unreadable.
    gains: { status: 'read', chains: [137], pendingOrderChains: [137] },
  },
  asOf: new Date().toISOString(),
}

/* --------------------------------------------------------------------------------------------- *
 * A JSON-RPC responder, so no test here depends on a public node being reachable
 *
 * It serves two intercepts: the app's READ providers (publicnode.com, from `NETWORKS[*].rpcUrl`)
 * and the WALLET rail (`cy.mockWeb3Provider`'s forward target). Only the handful of calls this
 * feature actually makes are answered; everything else returns an empty result, which the perps
 * modules are all documented to treat as "could not be read" rather than as a value.
 * --------------------------------------------------------------------------------------------- */

const CHAIN_BY_RPC = [
  ['polygon-bor-rpc', 137],
  ['arbitrum-one-rpc', 42161],
  ['base-rpc', 8453],
  ['optimism-rpc', 10],
  ['ethereum-rpc', 1],
]

/** Selectors verified with `ethers.id(sig).slice(0, 10)`. */
const SELECTOR = {
  getTradingActivated: '0x4115c122', // → uint8; 0 = ACTIVATED, which maps to VENUE_STATUS.OPEN
  getMarketOrdersTimeoutBlocks: '0xa4bdee80', // → uint16
  balanceOf: '0x70a08231', // ERC-20, for the collateral the open sheet offers
}

const hex = (n) => `0x${Number(n).toString(16)}`
const word = (n) => `0x${BigInt(n).toString(16).padStart(64, '0')}`

function chainIdForRpcUrl(url) {
  for (const [fragment, chainId] of CHAIN_BY_RPC) if (url.includes(fragment)) return chainId
  return 137 // the wallet rail — cy.mockWeb3Provider is pinned to Polygon in these worlds
}

function ethCallResult(data) {
  const selector = typeof data === 'string' ? data.slice(0, 10).toLowerCase() : ''
  if (selector === SELECTOR.getTradingActivated) return word(0)
  if (selector === SELECTOR.getMarketOrdersTimeoutBlocks) return word(PENDING_TIMEOUT_BLOCKS)
  if (selector === SELECTOR.balanceOf) return word(500_000_000) // 500 USDC at 6 decimals
  // Anything else is honestly unanswerable here. '0x' makes ethers reject the decode, which every
  // caller in this feature turns into an `unreadable` venue rather than into a fabricated number.
  return '0x'
}

function rpcResult(url, { method, params } = {}) {
  const chainId = chainIdForRpcUrl(url)
  switch (method) {
    case 'eth_chainId':
      return hex(chainId)
    case 'net_version':
      return String(chainId)
    case 'eth_blockNumber':
      return hex(POLYGON_HEAD_BLOCK)
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
    case 'eth_getCode':
      return '0x60806040'
    case 'eth_getLogs':
      return []
    case 'eth_call':
      return ethCallResult(params?.[0]?.data)
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
    case 'eth_sendTransaction':
      return SENT_TX_HASH
    case 'eth_getTransactionByHash':
      return {
        hash: SENT_TX_HASH,
        blockHash: BLOCK_HASH,
        blockNumber: hex(POLYGON_HEAD_BLOCK),
        transactionIndex: '0x0',
        from: TEST_ACCOUNT,
        to: GAINS_DIAMOND_137,
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
      /* A RECEIPT, AND NOTHING MORE. `logs: []` is the honest stub: the venue's own
       * acknowledgement/execution event is what would move the order past "sent", and this
       * transaction carries none. Adding a fabricated venue log here would manufacture exactly the
       * premature success claim these tests exist to forbid. */
      return {
        transactionHash: SENT_TX_HASH,
        transactionIndex: '0x0',
        blockHash: BLOCK_HASH,
        blockNumber: hex(POLYGON_HEAD_BLOCK),
        from: TEST_ACCOUNT,
        to: GAINS_DIAMOND_137,
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

/** Every `eth_sendTransaction` the app made in this test, in order. Reset per test. */
let submissions = []

/**
 * How long the gateway-stubbed worlds allow their one `cy.visit` to settle, overriding Cypress's
 * 60s `pageLoadTimeout` for that command alone.
 *
 * This is a HARNESS cost, not anything the app does, and it was MEASURED on this spec: with the
 * JSON-RPC routes stubbed by a static body the first visit settles in ~30s; with the request-
 * HANDLER form below — the only way to answer a method that arrives inside the POST body — the
 * same visit exceeds 60s. Cypress routes requests through the driver once a handler is registered,
 * and `vite dev` serves this app as ~a thousand separate module requests.
 *
 * It is passed to `cy.visit` rather than set as a suite-level config override, because a suite
 * override made Cypress restart the spec and run the whole suite twice.
 *
 * The CI-default world registers no handler and takes the stock timeout, so nothing here relaxes
 * what CI actually enforces.
 */
const GATEWAY_VISIT_TIMEOUT_MS = 180_000

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
  // The app's read providers (spec 069 resolves these from NETWORKS[*].rpcUrl).
  cy.intercept({ method: 'POST', url: /publicnode\.com/ }, handle).as('readRpc')
  // The wallet rail: cy.mockWeb3Provider forwards every method it does not answer itself here.
  cy.intercept({ method: 'POST', url: `${WALLET_RPC}**` }, handle).as('walletRpc')
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function stubGateway() {
  cy.intercept('GET', '**/v1/perps/pairs', { statusCode: 200, body: PAIRS_BODY }).as('pairs')
  cy.intercept('GET', '**/v1/perps/config', { statusCode: 200, body: CONFIG_BODY }).as('config')
  // Positions AND pending orders arrive on this ONE route — the gateway serves both facets from it
  // deliberately, so that a positions outage cannot bury a recovery handle behind an error screen.
  cy.intercept('GET', '**/v1/perps/positions*', { statusCode: 200, body: POSITIONS_BODY }).as('positions')
}

/**
 * Connect the wallet ON POLYGON. The management surface needs a connected wallet — 24-perps.cy.js
 * documents why `preAuthorized` is required (the mock announces over EIP-6963, and an unauthorised
 * one reports no accounts, so the Trade tab's content never renders). Pinning the chain to 137
 * additionally means the send path never has to negotiate a chain switch, which is a different
 * surface than the one under test.
 */
function connectOnPolygon() {
  cy.mockWeb3Provider({ account: TEST_ACCOUNT, preAuthorized: true, networkId: 137, rpcUrl: WALLET_RPC })
}

/** Nothing in this feature may claim an outcome the venue never reported. */
function assertNoExecutionClaim() {
  cy.contains('Position closed').should('not.exist')
  cy.contains('Position opened').should('not.exist')
  cy.contains('Position reduced').should('not.exist')
  cy.contains('Order cancelled').should('not.exist')
  cy.get('.pps-status-done').should('not.exist')
}

describe('Perps position management (spec 083)', () => {
  beforeEach(() => {
    submissions = []
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  // ---------------------------------------------------------------------------
  // WORLD 1 — no gateway, flag off. The CI-default run, and the state most
  // members are in. The contract is honest absence, not a disabled control.
  // ---------------------------------------------------------------------------
  ;(GATEWAY_CONFIGURED ? describe.skip : describe)('no gateway, management off (CI default)', () => {
    beforeEach(() => {
      connectOnPolygon()
    })

    it('[PERPS-M-01] the Trade section offers no management control at all', () => {
      cy.visit('/wallet?tab=trade')
      cy.get('.trade-panel', { timeout: 15000 }).should('exist')

      // Not "disabled" — absent. A control that cannot work is worse than no control.
      cy.contains('button', /^Perps$/).should('not.exist')
      cy.get('.perps-view').should('not.exist')
      cy.get('.perps-position-manage').should('not.exist')
      cy.get('.perps-open-btn').should('not.exist')
      cy.get('.perps-orders-recover').should('not.exist')
      assertNoExecutionClaim()
    })

    it('[PERPS-M-02] a perps deep link lands on Swap and opens no sheet', () => {
      // A saved link from a build that HAD the surface must land somewhere useful (FR-013), and it
      // must not leave a half-built management sheet behind it.
      cy.visit('/wallet?tab=trade&view=perps&venue=gains')
      cy.get('.trade-panel', { timeout: 15000 }).should('exist')

      cy.get('.perps-position-sheet').should('not.exist')
      cy.get('.perps-open-sheet').should('not.exist')
      cy.get('.asset-sheet-backdrop').should('not.exist')
      // Nothing on the page is waiting for a member to press it.
      cy.get('[class*="perps-"]').should('not.exist')
      assertNoExecutionClaim()
    })
  })

  // ---------------------------------------------------------------------------
  // WORLD 2 — gateway stubbed, kill switch OFF. The regression guard: spec 083
  // must be invisible here, EXCEPT for the stuck-order list, which PerpsView
  // mounts outside the flag on purpose (composition note 2 / FR-005).
  // ---------------------------------------------------------------------------
  ;(GATEWAY_CONFIGURED && !MANAGE_ENABLED ? describe : describe.skip)(
    'gateway stubbed, management flag OFF',
    () => {
      beforeEach(() => {
        stubGateway()
        stubJsonRpc()
        connectOnPolygon()
        cy.visit('/wallet?tab=trade&view=perps', { timeout: GATEWAY_VISIT_TIMEOUT_MS })
        cy.wait('@pairs')
      })

      it('[PERPS-M-10] renders the spec-082 view: pairs table, read-only positions, no manage controls', () => {
        cy.get('.perps-table', { timeout: 15000 }).should('be.visible')
        cy.contains('.perps-pair-symbol', 'BTC/USD').should('be.visible')

        // The position is listed, and it is READ-ONLY: link-out only, exactly as phase 0 shipped.
        cy.contains('.perps-position-symbol', 'BTC/USD', { timeout: 15000 }).should('be.visible')
        cy.get('.perps-position-row').find('a.perps-trade-link').should('exist')

        cy.get('.perps-position-manage').should('not.exist')
        cy.get('.perps-open-btn').should('not.exist')
        cy.contains('.perps-positions-note', 'read-only').should('exist')
      })

      it('[PERPS-M-11] no sheet can be opened from a position row', () => {
        cy.contains('.perps-position-symbol', 'BTC/USD', { timeout: 15000 }).should('be.visible')
        cy.get('.perps-position-row').first().click()

        cy.get('.perps-position-sheet').should('not.exist')
        cy.get('.perps-open-sheet').should('not.exist')
        cy.get('[role="dialog"]').should('not.exist')
        assertNoExecutionClaim()
      })

      it('[PERPS-M-12] the stuck-order recovery control is still offered with the flag off', () => {
        // This is the deliberate exception, and it is the one that matters: an order the venue
        // never executed is holding the member's collateral, and no release switch may stand
        // between them and getting it back (FR-005 / SC-004).
        cy.get('.perps-orders', { timeout: 15000 }).should('exist')
        cy.get('.perps-orders-recover')
          .should('be.visible')
          .and('not.be.disabled')
          .and('contain.text', 'Recover your collateral')
      })
    },
  )

  // ---------------------------------------------------------------------------
  // WORLD 3 — gateway stubbed, kill switch ON. The management flows.
  // ---------------------------------------------------------------------------
  ;(GATEWAY_CONFIGURED && MANAGE_ENABLED ? describe : describe.skip)(
    'gateway stubbed, management flag ON',
    () => {
      beforeEach(() => {
        stubGateway()
        stubJsonRpc()
        connectOnPolygon()
        cy.visit('/wallet?tab=trade&view=perps', { timeout: GATEWAY_VISIT_TIMEOUT_MS })
        cy.wait('@pairs')
      })

      /** Open the exit sheet for the one Gains position in the fixture. */
      const openPositionSheet = () => {
        cy.get('.perps-position-manage', { timeout: 15000 }).first().click()
        cy.get('.perps-position-sheet').should('be.visible')
      }

      /* THE EXIT CONTROL, disambiguated by its own words. `.pps-primary` is worn by two buttons —
       * the close and the protect (`pps-primary pps-primary-secondary`) — and a selector that
       * matches both is a selector that could click the wrong one on a leveraged position. */
      const exitControl = () => cy.contains('button.pps-primary', 'Close this position')

      it('[PERPS-M-20] a position row opens the sheet, which shows the position and a Close control', () => {
        cy.contains('.perps-position-manage', 'Close or protect', { timeout: 15000 }).should('be.visible')
        openPositionSheet()

        // The sheet names the exact position it will act on.
        cy.get('.perps-position-sheet h3').should('contain.text', 'BTC/USD').and('contain.text', 'Long')
        cy.get('.perps-position-sheet .pps-venue').should('contain.text', 'Gains')
        // The venue's own figures, as the venue reported them.
        cy.get('.pps-facts').should('contain.text', '$3,150')

        // The exit itself, named for what it does.
        exitControl().should('exist').and('not.be.disabled')
        assertNoExecutionClaim()
      })

      it('[PERPS-M-21] the cost breakdown appears BEFORE any signature, with no fee line at a zero rate', () => {
        openPositionSheet()

        cy.get('.pps-breakdown').should('be.visible')
        cy.get('.pps-breakdown').should('contain.text', 'Estimated proceeds')
        cy.get('.pps-breakdown').should('contain.text', 'own fees')

        // A ZERO RATE SHOWS NO FEE LINE AT ALL (FR-012) — not "$0.00", which reads as a fee that
        // happened to round down.
        cy.get('.pps-breakdown').should('not.contain.text', 'FairWins fee')

        // …and none of this cost a signature: nothing has been sent at the point the member reads it.
        cy.then(() => {
          expect(submissions, 'no transaction was sent to show the cost').to.have.length(0)
        })
      })

      it('[PERPS-M-22] submitting reports "sent to the venue" and never claims the position closed', () => {
        openPositionSheet()
        // The sheet scrolls inside a fixed overlay, so the control is brought into view first —
        // the same thing a member does before pressing it.
        exitControl().scrollIntoView().click()

        // The machine's own line, verbatim. `Sent to Gains.` is inclusion — the venue has the
        // order, and nothing more than that has been established.
        cy.get('.pps-status', { timeout: 20000 }).should('contain.text', 'Sent to Gains.')

        // THE CENTRAL HONESTY RULE, asserted as an absence: a receipt is not an execution. Only the
        // venue's own execution event may ever produce "Position closed." — and the stubbed receipt
        // deliberately carries no venue log, so it must not appear.
        cy.get('.pps-status').should('not.contain.text', 'Position closed')
        assertNoExecutionClaim()

        // The position is still listed, because the venue has not reported otherwise.
        cy.get('.perps-position-row').should('exist')

        // And the transaction really was sent to the venue's own contract — the member is
        // `msg.sender`, and no FairWins contract sits in the path.
        cy.then(() => {
          expect(submissions, 'exactly one transaction was sent').to.have.length(1)
          expect(String(submissions[0]?.to).toLowerCase()).to.equal(GAINS_DIAMOND_137.toLowerCase())
          expect(String(submissions[0]?.from).toLowerCase()).to.equal(TEST_ACCOUNT.toLowerCase())
        })
      })

      it('[PERPS-M-23] a stuck order renders with a NAMED recovery control', () => {
        cy.get('.perps-orders', { timeout: 15000 }).should('exist')
        cy.contains('.perps-orders-title', 'Orders waiting at the venue').should('be.visible')

        // Everything shown about an unexecuted order is labelled REQUESTED — it is what the member
        // asked for, never what the venue produced.
        cy.get('.perps-orders-stats').should('contain.text', 'Requested size')
        cy.get('.perps-orders-flag').should('contain.text', 'Needs your attention')

        // Named for the outcome, not "Cancel" — the member is getting collateral back.
        cy.get('.perps-orders-recover')
          .should('be.visible')
          .and('not.be.disabled')
          .and('contain.text', 'Recover your collateral')
        cy.get('.perps-orders-recover-note').should('exist')
        assertNoExecutionClaim()
      })

      it('[PERPS-M-24] the recovery control is present with NO attestation given — exits are never gated', () => {
        // The safety property that matters most. Prove the premise rather than assuming it: no
        // acknowledgement has been recorded on this device at all.
        cy.window().then((win) => {
          expect(win.localStorage.getItem('fairwins.perps.attestation'), 'no attestation is stored').to
            .be.null
        })

        cy.get('.perps-orders-recover', { timeout: 15000 })
          .should('be.visible')
          .and('not.be.disabled')
          .and('contain.text', 'Recover your collateral')

        // Nothing is asking the member to acknowledge anything in order to reach it.
        cy.get('.perps-orders').find('.perps-attest').should('not.exist')
      })

      it('[PERPS-M-25] opening a position requires the attestation, and the open control refuses without it', () => {
        cy.contains('.perps-pair-symbol', 'BTC/USD', { timeout: 15000 })
          .closest('tr')
          .find('.perps-open-btn')
          .click()
        cy.get('.perps-open-sheet').should('be.visible')

        // The acknowledgement renders immediately above the control it gates. The sheet scrolls
        // inside a fixed overlay, so it is brought into view the way a member scrolls to it.
        cy.get('.perps-attest').should('exist').scrollIntoView().should('be.visible')
        cy.get('.perps-attest-items input[type="checkbox"]').should('have.length.at.least', 4)
        // …nothing arrives pre-ticked…
        cy.get('.perps-attest-items input[type="checkbox"]').each(($box) => {
          cy.wrap($box).should('not.be.checked')
        })
        // …and the open control refuses, in words, until it is given.
        cy.get('.pos-primary').should('be.disabled')
        cy.contains('.pos-note', 'Confirm the statements above to open a position').should('exist')
        cy.contains('.pos-note', 'not needed to close, reduce or recover').should('exist')

        // Giving it clears exactly that gate — and nothing here claims a position was opened.
        cy.get('.perps-attest-items input[type="checkbox"]').each(($box) => {
          cy.wrap($box).check({ force: true })
        })
        cy.get('.perps-attest-confirm').scrollIntoView().should('not.be.disabled').click()
        cy.get('.perps-attest').should('not.exist')
        cy.contains('.pos-note', 'Confirm the statements above to open a position').should('not.exist')
        assertNoExecutionClaim()
        cy.then(() => {
          expect(submissions, 'acknowledging never sends anything').to.have.length(0)
        })
      })

      it('[PERPS-M-26] the sheet is a modal dialog and Escape dismisses it', () => {
        openPositionSheet()

        cy.get('.perps-position-sheet')
          .should('have.attr', 'role', 'dialog')
          .and('have.attr', 'aria-modal', 'true')
        // A dialog with no accessible name is a dialog a screen reader cannot announce.
        cy.get('.perps-position-sheet')
          .invoke('attr', 'aria-labelledby')
          .then((id) => {
            cy.get(`#${id}`).should('exist').and('contain.text', 'BTC/USD')
          })

        cy.get('body').type('{esc}')
        cy.get('.perps-position-sheet').should('not.exist')
        // The list behind it is intact, and nothing was sent by dismissing.
        cy.get('.perps-position-row').should('exist')
        cy.then(() => {
          expect(submissions, 'dismissing never sends anything').to.have.length(0)
        })
      })
    },
  )
})
