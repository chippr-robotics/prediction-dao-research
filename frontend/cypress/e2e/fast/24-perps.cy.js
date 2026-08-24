// =============================================================================
// 24-perps.cy.js
// Fast-tier E2E tests for the Perps view inside Trade (spec 082).
//
// Perps is a READ-ONLY market-data surface over three external venues, so every
// flow here is validatable without a chain — admission rule 1 puts all of it in
// the no-chain tier.
//
// WHY THESE NOW RUN. They used to sit behind `CYPRESS_PERPS_GATEWAY`, which
// nothing set: anti-pattern 8, a permanent skip reported as coverage. The
// no-chain dev server (`dev:fast`) now builds with `VITE_RELAYER_URL` pointed at
// a port nothing serves, so `perpsGatewayUrl()` is non-empty — the Perps tab is
// offered — and each test stubs the gateway's answers itself with cy.intercept.
// Nothing listens at that port, which is the point: a test that wants market
// data supplies it, and a test that does not sees the honest unreachable state
// rather than invented numbers.
// =============================================================================

const TEST_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

/**
 * Two live venues and one degraded one.
 *
 * BTC/USD deliberately carries `fundingRate: null` and `openInterestUsd: null`. Those are the
 * cells the estate rule is about: a metric the venue did not report must render as an em dash,
 * because "0" is a number the member can act on and nobody measured it.
 */
const PAIRS_BODY = {
  pairs: [
    {
      id: 'gains:137:BTC/USD',
      venue: 'gains',
      chainId: 137,
      symbol: 'BTC/USD',
      base: 'BTC',
      quote: 'USD',
      price: 63000,
      fundingRate: null,
      fundingIntervalHours: 1,
      openInterestUsd: null,
      maxLeverage: 200,
      volume24hUsd: null,
    },
    {
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
    // GMX answered nothing. Its pairs are absent from `pairs` above — that is the contract:
    // omitted, not zeroed, and named in the banner so the omission is visible.
    gmx: { status: 'degraded', chains: [], stale: false },
    hyperliquid: { status: 'read', chains: [], stale: false },
  },
  asOf: '2026-08-21T12:00:00.000Z',
}

const CONFIG_BODY = {
  attribution: {
    gains: { referrer: '0x2222222222222222222222222222222222222222' },
    gmx: { refCode: 'fairwins' },
    hyperliquid: { builderAddress: null },
  },
  hyperliquidBuilderFee: { bps: 5, capBps: 10, source: 'chain' },
}

/** Answer the gateway's three read endpoints. `pairs` overrides the market body per test. */
function stubGateway({ pairs = PAIRS_BODY } = {}) {
  cy.intercept('GET', '**/v1/perps/pairs*', { statusCode: 200, body: pairs }).as('pairs')
  cy.intercept('GET', '**/v1/perps/config*', { statusCode: 200, body: CONFIG_BODY }).as('config')
  cy.intercept('GET', '**/v1/perps/positions*', {
    statusCode: 200,
    body: { positions: [], sources: {} },
  }).as('positions')
}

function openPerps() {
  cy.mockWeb3Provider({ account: TEST_ACCOUNT, preAuthorized: true })
  cy.visit('/wallet?tab=trade&view=perps')
}

describe('Perps view (Trade section)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  // ---------------------------------------------------------------------------
  // PERPS-01: the gateway is configured but will not answer.
  //
  // This is a real member world (the venue proxy is down) and it is also the
  // no-chain tier's default world. What it must NOT do is render an empty table:
  // "no pairs" and "we could not ask" are the same pixels and opposite claims.
  // ---------------------------------------------------------------------------
  it('[PERPS-01] an unreachable gateway says so, and never renders an empty market', () => {
    cy.intercept('GET', '**/v1/perps/pairs*', { statusCode: 503, body: { error: { code: 'upstream_unavailable' } } }).as('pairs')
    cy.intercept('GET', '**/v1/perps/config*', { statusCode: 503, body: {} })
    openPerps()

    cy.get('.perps-view', { timeout: 30000 }).should('exist')
    cy.get('.perps-unavailable', { timeout: 30000 }).should('be.visible')
    // A retry is offered, because a configured-but-silent gateway is the case that recovers.
    cy.get('.perps-retry').should('exist')
    // The table is ABSENT rather than empty — nothing claims a market was read.
    cy.get('.perps-table').should('not.exist')
  })

  // ---------------------------------------------------------------------------
  // PERPS-02..06: the gateway-backed flow.
  // ---------------------------------------------------------------------------
  describe('with a gateway answering (stubbed)', () => {
    beforeEach(() => {
      stubGateway()
      openPerps()
      cy.wait('@pairs')
      cy.get('.perps-table', { timeout: 30000 }).should('be.visible')
    })

    it('[PERPS-02] renders the merged pairs table with venue badges', () => {
      cy.contains('.perps-pair-symbol', 'BTC/USD').should('be.visible')
      cy.contains('.perps-pair-symbol', 'ETH/USD').should('be.visible')
      cy.contains('.perps-venue-name', 'Gains').should('be.visible')
      // Hyperliquid is a non-EVM venue and still lists beside the EVM ones (FR-012).
      cy.contains('.perps-venue-name', 'HL').should('be.visible')
    })

    it('[PERPS-03] search narrows the list', () => {
      cy.get('.perps-search input').type('eth')
      cy.contains('.perps-pair-symbol', 'ETH/USD').should('be.visible')
      cy.contains('.perps-pair-symbol', 'BTC/USD').should('not.exist')
    })

    it('[PERPS-04] link-outs carry attribution and are marked external', () => {
      cy.contains('.perps-pair-symbol', 'BTC/USD')
        .closest('tr')
        .find('a.perps-trade-link')
        .should('have.attr', 'target', '_blank')
        .and('have.attr', 'rel')
      cy.contains('.perps-pair-symbol', 'BTC/USD')
        .closest('tr')
        .find('a.perps-trade-link')
        .should('have.attr', 'href')
        .and('contain', '0x2222222222222222222222222222222222222222')
    })

    it('[PERPS-05] no fee is claimed for a capability this build does not have, and the risk is stated', () => {
      /*
       * The Hyperliquid builder fee is the ONE platform-priced number on this surface, and the
       * gateway config above advertises it at 5 bps. This build cannot place a Hyperliquid order,
       * so no member pays it — and a footnote saying "FairWins charges 0.05% on Hyperliquid orders
       * placed through FairWins" would describe a service that does not exist. The rate line is
       * therefore conditioned on the CAPABILITY, not on the configured rate: an admin editing the
       * FeeRouter must not be able to publish a claim about how orders are placed.
       *
       * What members read instead is the true economics, stated positively.
       */
      cy.get('.perps-fee-note').should('not.exist')
      cy.get('.perps-benefit-note')
        .should('be.visible')
        .and('contain.text', 'Hyperliquid trades cost you nothing extra')
      // The configured rate is nowhere on the page — not merely un-emphasised.
      cy.get('.perps-view').should('not.contain.text', '0.05%')

      // Leverage risk and the fact that the trade happens off FairWins are disclosed regardless.
      cy.get('.perps-risk-note').should('be.visible').and('contain.text', 'liquidated')
      cy.get('.perps-external-note').should('be.visible').and('contain.text', 'leaving FairWins')
    })

    it('[PERPS-06] a degraded venue is NAMED, its pairs omitted, and a missing metric is an em dash', () => {
      /*
       * THE ASSERTION THIS FILE EXISTS FOR (FR-004, and the estate rule behind it).
       *
       * Three separate claims, and the spec turns on all three:
       *   1. GMX is named. A venue that silently vanishes is indistinguishable from a venue with
       *      no markets, and the member has no way to know their pair list is short.
       *   2. GMX contributes no rows. Not zero-priced rows — no rows.
       *   3. A metric the LIVE venue did not report renders as '—'. This is the one that was
       *      never asserted: a funding rate of "0.0000%" is a fact about the market, and here
       *      nobody measured it.
       */
      cy.get('.perps-degraded-banner').should('be.visible').and('contain.text', 'GMX')

      // The healthy venues are still live, and the banner says so rather than implying an outage.
      cy.get('.perps-degraded-banner').should('contain.text', 'Other venues are live')

      // No GMX row survives the omission.
      cy.get('.perps-table tbody tr').should('have.length', 2)
      cy.get('.perps-table').should('not.contain.text', 'GMX')

      // The unreported metrics: an em dash, and specifically NOT a zero of any shape.
      cy.contains('.perps-pair-symbol', 'BTC/USD')
        .closest('tr')
        .find('td.perps-num')
        .then(($cells) => {
          const text = [...$cells].map((c) => c.textContent.trim())
          // Columns: price, funding/1h, open interest, max leverage.
          expect(text[0], 'price was reported and renders').to.match(/63,?000/)
          expect(text[1], 'an unreported funding rate is an em dash').to.equal('—')
          expect(text[2], 'unreported open interest is an em dash').to.equal('—')
          expect(text[1], 'an unreported rate is never a zero percentage').to.not.match(/0(\.0+)?%/)
          expect(text[2], 'unreported open interest is never $0').to.not.match(/\$\s*0/)
        })

      // The venue that DID report is unaffected — the omission is per-venue, not a global blank.
      cy.contains('.perps-pair-symbol', 'ETH/USD')
        .closest('tr')
        .find('td.perps-num')
        .then(($cells) => {
          const text = [...$cells].map((c) => c.textContent.trim())
          expect(text[1], 'a reported funding rate renders as a rate').to.match(/%/)
          expect(text[2], 'reported open interest renders as money').to.match(/\$/)
        })
    })
  })
})
