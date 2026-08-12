// =============================================================================
// 24-perps.cy.js
// Fast-tier E2E tests for the Perps view inside Trade (spec 082).
//
// The CI dev server runs WITHOUT a relay-gateway (`VITE_RELAYER_URL` unset), so
// the contract under test here is honest ABSENCE (FR-013): no Perps tab is
// offered, `?view=perps` deep links fall back to Swap instead of a dead panel,
// and the Trade section renders exactly as it did before spec 082.
//
// The full gateway-backed flow (pairs table, search, degraded venues, fee
// disclosure, attributed link-outs) is covered by the component suite
// (src/test/perps/) and runs here only when the app was BUILT with a gateway:
//   VITE_RELAYER_URL=http://localhost:9797 CYPRESS_PERPS_GATEWAY=1 npm run test:e2e:fast
// (cy.intercept stubs the gateway; no real server is needed at that URL.)
// =============================================================================

const TEST_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const GATEWAY_CONFIGURED = Boolean(Cypress.env('PERPS_GATEWAY'))

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
      fundingRate: 0.0000125,
      fundingIntervalHours: 1,
      openInterestUsd: 8000,
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
    gmx: { status: 'degraded', chains: [], stale: false },
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
  hyperliquidBuilderFee: { bps: 5, capBps: 10, source: 'chain' },
}

describe('Perps view (Trade section)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  // ---------------------------------------------------------------------------
  // PERPS-01: honest absence without a gateway — the CI-default world.
  // ---------------------------------------------------------------------------
  ;(GATEWAY_CONFIGURED ? it.skip : it)('[PERPS-01] no gateway: no Perps tab, deep link falls back to Swap', () => {
    // Pre-authorized: the Trade tab's content only renders for a connected wallet, and this spec
    // is about the tab content, not the connect flow.
    cy.mockWeb3Provider({ account: TEST_ACCOUNT, preAuthorized: true })
    // A saved perps deep link must land somewhere useful, never a dead panel (FR-013).
    cy.visit('/wallet?tab=trade&view=perps')
    cy.get('body', { timeout: 10000 }).should('be.visible')

    // The Trade section renders its pre-082 content (the swap panel)…
    cy.get('.trade-panel', { timeout: 15000 }).should('exist')
    // …and offers no Perps control at all — absence, not a dead button.
    cy.contains('button', /^Perps$/).should('not.exist')
    cy.get('.perps-view').should('not.exist')
  })

  // ---------------------------------------------------------------------------
  // PERPS-02..05: the gateway-backed flow (opt-in — see the file header).
  // ---------------------------------------------------------------------------
  ;(GATEWAY_CONFIGURED ? describe : describe.skip)('with a configured gateway (stubbed)', () => {
    beforeEach(() => {
      cy.intercept('GET', '**/v1/perps/pairs', { statusCode: 200, body: PAIRS_BODY }).as('pairs')
      cy.intercept('GET', '**/v1/perps/config', { statusCode: 200, body: CONFIG_BODY }).as('config')
      cy.intercept('GET', '**/v1/perps/positions*', {
        statusCode: 200,
        body: { positions: [], sources: {} },
      }).as('positions')
      cy.mockWeb3Provider({ account: TEST_ACCOUNT, preAuthorized: true })
      cy.visit('/wallet?tab=trade&view=perps')
      cy.wait('@pairs')
    })

    it('[PERPS-02] renders the merged pairs table with venue badges and insights', () => {
      cy.get('.perps-table').should('be.visible')
      cy.contains('.perps-pair-symbol', 'BTC/USD').should('be.visible')
      cy.contains('.perps-pair-symbol', 'ETH/USD').should('be.visible')
      cy.contains('.perps-venue-name', 'Gains').should('be.visible')
      cy.contains('.perps-venue-name', 'HL').should('be.visible')
      // The degraded venue is named, not silently absent (FR-004).
      cy.get('.perps-degraded-banner').should('contain.text', 'GMX')
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
        .invoke('attr', 'href')
        .should('contain', 'ref=0x2222222222222222222222222222222222222222')
    })

    it('[PERPS-05] the configured builder fee is disclosed before any link-out', () => {
      cy.get('.perps-fee-note').should('contain.text', '0.05%')
      cy.get('.perps-risk-note').should('be.visible')
    })
  })
})
