// =============================================================================
// 49-token-news.cy.js
// Fast-tier E2E for token news on the portfolio and trade surfaces (spec 109).
//
// News is a READ-ONLY advisory feed over the relay-gateway's Alphaday proxy, so
// every flow here is validatable without a chain — admission rule 1 puts all of
// it in the no-chain tier. The dev:fast build points VITE_RELAYER_URL at a dead
// port, so each test stubs the gateway's answers itself with cy.intercept; the
// asset→slug mapping (config/newsAssets.js) is real and client-side, which is
// exactly what TN-02 exercises: an unmapped asset never produces a request.
//
// The portfolio card needs a holding row to open the AssetDetailSheet, and the
// fast tier starts no chain — so the portfolio tests stub the read-provider
// JSON-RPC the same way 25-perps-management.cy.js does (publicnode intercepts),
// answering ONLY a Polygon native balance. Every other chain stays honestly
// unreadable, which is per-chain isolation working, not a gap.
// =============================================================================

const TEST_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const PORTFOLIO_URL = '/wallet?tab=account&view=portfolio'

// ---- gateway fixtures (FeedReading shapes per contracts/gateway-news-api.md) ----

const newsItem = (over = {}) => ({
  id: '409910',
  title: 'Network upgrade lands on schedule',
  url: 'https://news.example/upgrade-story',
  source: { name: 'Example Wire', slug: 'example_wire' },
  publishedAt: new Date(Date.now() - 3 * 3600_000).toISOString(), // 3h ago
  sentiment: 0,
  ...over,
})

const readBody = (items) => ({
  state: 'read',
  fetchedAt: new Date().toISOString(),
  stale: false,
  items,
})

// ---- read-provider JSON-RPC stub (the 25-perps-management device) --------------
//
// The app's read providers resolve NETWORKS[*].rpcUrl (spec 069) — publicnode
// hosts on a mainnet-cohort build. Only Polygon answers a balance here; the
// point is one clickable native POL row, nothing more.

const CHAIN_BY_RPC = [
  ['polygon-bor-rpc', 137],
  ['arbitrum-one-rpc', 42161],
  ['base-rpc', 8453],
  ['optimism-rpc', 10],
  ['ethereum-rpc', 1],
]

const hex = (n) => `0x${Number(n).toString(16)}`

function chainIdForRpcUrl(url) {
  for (const [fragment, chainId] of CHAIN_BY_RPC) if (url.includes(fragment)) return chainId
  return 137
}

function rpcResult(url, { method } = {}) {
  const chainId = chainIdForRpcUrl(url)
  switch (method) {
    case 'eth_chainId':
      return hex(chainId)
    case 'net_version':
      return String(chainId)
    case 'eth_blockNumber':
      return hex(75000000)
    case 'eth_getBalance':
      // 2 POL on Polygon; zero elsewhere (those chains' rows simply do not exist).
      return chainId === 137 ? '0x1bc16d674ec80000' : '0x0'
    case 'eth_getLogs':
      return []
    default:
      // Honestly unanswerable: '0x' makes ethers reject the decode, and every consumer
      // treats that as unreadable rather than inventing a number.
      return '0x'
  }
}

function stubJsonRpc() {
  cy.intercept({ method: 'POST', url: /publicnode\.com/ }, (req) => {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const answer = (entry) => ({ jsonrpc: '2.0', id: entry?.id ?? 1, result: rpcResult(req.url, entry) })
    req.reply({ statusCode: 200, body: Array.isArray(body) ? body.map(answer) : answer(body) })
  }).as('readRpc')
}

function openPolAssetSheet() {
  cy.mockWeb3Provider({ account: TEST_ACCOUNT, preAuthorized: true })
  cy.visit(PORTFOLIO_URL)
  // The one holding the RPC stub creates. Generous timeout: the other chains'
  // reads have to time out around it.
  cy.contains('.portfolio-row-button', 'POL', { timeout: 60000 }).click()
  cy.get('.asset-sheet', { timeout: 30000 }).should('be.visible')
}

describe('Token news (spec 109)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  // ---------------------------------------------------------------------------
  // Portfolio card (US1) — the AssetDetailSheet mount.
  // ---------------------------------------------------------------------------
  describe('portfolio token card', () => {
    beforeEach(() => {
      stubJsonRpc()
    })

    it('[TN-01] a covered token renders attributed, dated, text-only items with a link-out', () => {
      const item = newsItem()
      cy.intercept('GET', '**/v1/news/**', { statusCode: 200, body: readBody([item]) }).as('news')
      openPolAssetSheet()

      cy.wait('@news').its('request.url').should('contain', 'slug=matic-network')
      cy.get('.token-news-card', { timeout: 15000 }).should('be.visible')

      // The headline is a link out, marked external, and TEXT — no vendor image ever renders.
      cy.get('.token-news-card a.token-news-link')
        .should('have.attr', 'href', item.url)
        .and('have.attr', 'target', '_blank')
      cy.get('.token-news-card a.token-news-link').invoke('attr', 'rel').should('contain', 'noopener')
      cy.get('.token-news-card').should('contain.text', item.title)
      cy.get('.token-news-card img').should('not.exist')

      // Attribution and age are mandatory on every item (FR-004/FR-005).
      cy.get('.token-news-meta').should('contain.text', 'Example Wire').and('contain.text', '3h ago')

      // The card never gates the sheet: the instance actions are all still offered.
      cy.get('.asset-sheet-actions button').should('have.length.greaterThan', 0)

      cy.get('.asset-sheet').then(($sheet) => {
        cy.a11yScan({ context: $sheet[0], label: 'asset sheet with news card' })
      })
    })

    it('[TN-03] an unreadable feed is a sentence plus retry — and retry recovers', () => {
      let fail = true
      cy.intercept('GET', '**/v1/news/**', (req) => {
        if (fail) req.reply({ statusCode: 500, body: { error: { code: 'upstream_error' } } })
        else req.reply({ statusCode: 200, body: readBody([newsItem()]) })
      }).as('news')
      openPolAssetSheet()

      // The failure state names itself; it must never look like "no news".
      cy.get('.token-news-card', { timeout: 15000 }).should(
        'contain.text',
        'The news feed could not be read right now.',
      )
      cy.get('.token-news-card').should('not.contain.text', 'No recent items')
      cy.get('.token-news-card .token-news-retry')
        .should('be.visible')
        .then(($btn) => {
          fail = false
          cy.wrap($btn).click()
        })
      // Retry re-invokes the seam and the items arrive.
      cy.get('.token-news-card a.token-news-link', { timeout: 15000 }).should('be.visible')
    })

    it('[TN-04] an honest-empty read says sparse coverage, with no retry — distinct from unreadable', () => {
      cy.intercept('GET', '**/v1/news/**', { statusCode: 200, body: readBody([]) }).as('news')
      openPolAssetSheet()

      cy.get('.token-news-card', { timeout: 15000 }).should('contain.text', 'No recent items for POL.')
      // Empty is NOT the failure state: no retry, no could-not-read sentence.
      cy.get('.token-news-card .token-news-retry').should('not.exist')
      cy.get('.token-news-card').should('not.contain.text', 'could not be read')
    })

    it('[TN-04b] the module switched off renders NO card — absence, not an empty affordance', () => {
      cy.intercept('GET', '**/v1/news/**', {
        statusCode: 503,
        body: { error: { code: 'news_unconfigured' } },
      }).as('news')
      openPolAssetSheet()

      cy.wait('@news')
      // The sheet is fine; the news surface simply is not there.
      cy.get('.asset-sheet-actions').should('be.visible')
      cy.get('.token-news-card').should('not.exist')
    })
  })

  // ---------------------------------------------------------------------------
  // Trade-pair feed (US2) — one card per leg, advisory only.
  // ---------------------------------------------------------------------------
  describe('trade-pair feed', () => {
    beforeEach(() => {
      cy.mockWeb3Provider({ account: TEST_ACCOUNT, preAuthorized: true })
    })

    it('[TN-05] partial coverage is labelled per leg, and news never touches the swap form (+ [TN-02] no request for an unmapped asset)', () => {
      const item = newsItem({ title: 'Classic client release cut' })
      const newsCalls = []
      cy.intercept('GET', '**/v1/news/**', (req) => {
        newsCalls.push(req.url)
        req.reply({ statusCode: 200, body: readBody([item]) })
      }).as('news')

      cy.visit('/wallet?tab=trade')
      cy.get('.trade-panel', { timeout: 15000 }).should('exist')

      // Move the pair to WETC/USC on Ethereum Classic: WETC maps to a news slug
      // (baseline ETC → ethereum-classic), USC is deliberately unmapped.
      cy.get('button[aria-label="Token to sell"]').click()
      cy.get('[role="listbox"]', { timeout: 10000 }).should('be.visible')
      cy.get('[role="option"][aria-label="WETC on Ethereum Classic"]').click()

      // One card per leg — a pair with one covered and one uncovered token is
      // labelled partial coverage, never a silently merged feed.
      cy.get('.trade-news .token-news-card', { timeout: 15000 }).should('have.length', 2)
      cy.get('.trade-news').should('contain.text', item.title)
      cy.get('.trade-news').should('contain.text', 'No news source covers USC.')

      // TN-02: the unmapped leg produced ZERO gateway requests — the mapping is
      // client-side and a missing row IS "not covered" (no ticker heuristic).
      cy.get('.trade-news .token-news-card a.token-news-link').should('be.visible')
      cy.then(() => {
        expect(newsCalls.length, 'exactly one news request, for the mapped leg').to.equal(1)
        expect(newsCalls[0]).to.contain('slug=ethereum-classic')
      })

      // FR-006: the ticket is untouched by any news state — the amount entry
      // takes input exactly as if the feed did not exist.
      cy.get('#trade-amount').should('not.be.disabled').type('1').should('have.value', '1')
    })

    it('[TN-05b] an unreadable feed on the trade surface never disables the form', () => {
      cy.intercept('GET', '**/v1/news/**', {
        statusCode: 200,
        body: { state: 'unreadable', reason: 'upstream_unreachable' },
      }).as('news')

      cy.visit('/wallet?tab=trade')
      cy.get('.trade-panel', { timeout: 15000 }).should('exist')
      cy.get('button[aria-label="Token to sell"]').click()
      cy.get('[role="option"][aria-label="WETC on Ethereum Classic"]').click()

      cy.get('.trade-news .token-news-card', { timeout: 15000 })
        .should('contain.text', 'The news feed could not be read right now.')
      cy.get('#trade-amount').should('not.be.disabled').type('2').should('have.value', '2')
    })
  })
})
