// =============================================================================
// 37-predict-and-collect.cy.js
// Fast-tier E2E for Predict and Collect (specs 057 / 055 / 056 / 013).
//
// Issue #1239. Both features are a frontend section plus a relay-gateway proxy —
// NO contract changes, no custody, the member's wallet is the only order signer.
// So everything short of the signature is answerable at the gateway boundary and
// belongs in the no-chain tier.
//
// Both gate on the SAME variable, `VITE_RELAYER_URL`: unset, their tabs hide
// entirely and none of this is reachable. The tier's dev server (`dev:fast`)
// points it at a port nothing serves, so a spec that wants these surfaces stubs
// the gateway itself and a spec that does not sees the honest unreachable state.
//
// The divergence worth remembering: Collect's OpenSea referral costs the member
// NOTHING, while Predict's builder fee is ADDITIVE — a real taker cost — and must
// be disclosed as its own line, never hidden and never called free.
// =============================================================================

const ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
/*
 * Matched on the full URL, not `hostname`: Cypress's `hostname` is the host WITHOUT the port, so a
 * pattern like /localhost:8899$/ matches nothing and the intercept silently never fires — the
 * request goes to the dead port and the surface renders its unreachable state instead.
 */
const GATEWAY_URL = /localhost:8899\/v1\/polymarket/
const RPC_HOSTS = /publicnode\.com$|rivet\.link$|etcdesktop\.com$|polygon\.technology$/

function chainWorld() {
  cy.intercept({ method: 'POST', hostname: RPC_HOSTS }, (req) => {
    const one = ({ method, id }) => {
      const reply = (result) => ({ jsonrpc: '2.0', id, result })
      if (method === 'eth_chainId') return reply('0x89')
      if (method === 'eth_blockNumber') return reply('0x4000000')
      if (method === 'eth_getBalance') return reply('0x0')
      return reply('0x')
    }
    const body = req.body
    req.reply({ statusCode: 200, body: Array.isArray(body) ? body.map(one) : one(body || {}) })
  })
}

/*
 * THE GATEWAY'S DTO, which is what the client consumes — not Gamma's wire shape.
 *
 * `services/relay-gateway/src/polymarket/normalize.js` does the Gamma parsing server-side and
 * emits `outcomes: [{ name, tokenId, price }]`. Two fixture mistakes each render as a broken app
 * rather than a wrong stub: calling the field `outcome` instead of `name` leaves the detail sheet
 * with unnamed rows, and a token id that fails `isTokenId` makes the gateway DROP the outcome, so
 * the sheet has no Buy button at all and `tradable` goes false.
 */
const TOKEN_YES = '71321045679252212594626385532706912750332728571942532289631379312455583992563'
const TOKEN_NO = '52114319501245915516055106046884209969926127482827954674443846427813813222426'

const MARKETS = [
  {
    conditionId: '0xaaa1',
    question: 'Will it rain in London tomorrow?',
    category: 'Weather',
    slug: 'rain-london',
    endDate: '2030-01-01T00:00:00Z',
    tradable: true,
    outcomes: [
      { name: 'Yes', tokenId: TOKEN_YES, price: '0.62' },
      { name: 'No', tokenId: TOKEN_NO, price: '0.38' },
    ],
  },
  {
    conditionId: '0xbbb2',
    question: 'Will the harbour freeze this winter?',
    category: 'Weather',
    slug: 'harbour-freeze',
    endDate: '2030-01-01T00:00:00Z',
    tradable: true,
    outcomes: [
      { name: 'Yes', tokenId: TOKEN_YES, price: '0.10' },
      { name: 'No', tokenId: TOKEN_NO, price: '0.90' },
    ],
  },
]

/** Answer the Predict half of the gateway. `query` filters, mirroring the proxy. */
function predictGateway() {
  cy.intercept({ method: 'GET', url: GATEWAY_URL }, (req) => {
    if (!/\/markets(\?|$)/.test(req.url)) return req.continue()
    const q = (new URL(req.url).searchParams.get('q') || '').toLowerCase()
    const markets = q ? MARKETS.filter((m) => m.question.toLowerCase().includes(q)) : MARKETS
    req.reply({ statusCode: 200, body: { markets, next: null, fetchedAt: Date.now(), stale: false } })
  }).as('markets')

  cy.intercept({ method: 'GET', url: /localhost:8899\/v1\/polymarket\/\d+\/fee-rate/ }, {
    statusCode: 200,
    // 50 bps taker / 0 maker — spec 057's documented default, well inside the 100/50 cap.
    body: { builderTakerFeeBps: 50, builderMakerFeeBps: 0, polymarketTakerFeeBps: 0, fetchedAt: Date.now() },
  }).as('feeRate')
}

/**
 * Polymarket's OWN geoblock endpoint, called directly from the browser (not through our gateway).
 *
 * Modelled rather than defeated: the block is Polymarket's policy and FairWins respects it, so the
 * tests drive both sides of it — a restricted member is refused with a link out, an allowed member
 * reaches the fee schedule.
 */
function geoblock(blocked) {
  cy.intercept({ method: 'GET', url: /polymarket\.com\/api\/geoblock/ }, {
    statusCode: 200,
    body: blocked ? { blocked: true, country: 'US', region: 'US' } : { blocked: false },
  }).as('geoblock')
}

function connect(networkId = 137, rpcUrl = 'https://polygon-bor-rpc.publicnode.com') {
  cy.mockWeb3Provider({ account: ACCOUNT, preAuthorized: true, networkId, rpcUrl })
}

const waitForAccount = () => cy.get('[aria-label="Wallet Account"]', { timeout: 40000 }).should('exist')

describe('Predict and Collect (specs 057 / 055 / 056 / 013)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  it('[PR-01] predict.search-markets — markets list, and a search that matches nothing says so', () => {
    chainWorld()
    predictGateway()
    connect()
    cy.visit('/wallet?tab=predict')
    waitForAccount()

    cy.get('[aria-label="Predict"]', { timeout: 40000 }).should('exist')
    cy.get('.predict-grid li', { timeout: 20000 }).should('have.length', MARKETS.length)
    cy.contains('Will it rain in London tomorrow?').should('exist')

    // Searching narrows to the gateway's own answer — the filter is served, not done locally.
    cy.get('[aria-label="Search markets"]').type('harbour')
    cy.get('.predict-grid li', { timeout: 20000 }).should('have.length', 1)
    cy.contains('Will the harbour freeze this winter?').should('exist')

    /*
     * A search matching nothing must SAY so, and offer the way out. An empty grid is
     * indistinguishable from a gateway that failed — and the two call for different actions.
     */
    cy.get('[aria-label="Search markets"]').clear().type('zzzznothing')
    cy.contains('No markets found', { timeout: 20000 }).should('exist')
    cy.contains(/No markets match your search/i).should('exist')
  })

  it('[PR-02] predict.builder-fee-disclosed — the builder fee is its OWN line before any signature', () => {
    /*
     * THE DIVERGENCE FROM COLLECT (spec 057). Collect's OpenSea referral costs the member
     * nothing; this fee is ADDITIVE — a real taker cost — so it must appear as its own labelled
     * line in the confirm UI before the member signs, never folded into a total and never
     * described as free.
     */
    chainWorld()
    predictGateway()
    geoblock(false) // an allowed region, so the fee schedule is actually reached
    connect()
    cy.visit('/wallet?tab=predict')
    waitForAccount()

    cy.get('.predict-grid li', { timeout: 40000 }).first().find('button, [role="button"]').first().click({ force: true })
    cy.get('.market-detail', { timeout: 20000 }).should('exist')
    cy.get('.market-detail').contains('button', /^Buy$/).first().click({ force: true })

    cy.get('[class*="trade-confirm"]', { timeout: 20000 }).should('exist')
    cy.get('[class*="trade-confirm"]', { timeout: 20000 }).should(($c) => {
      const text = $c.text()
      expect(text, 'the builder fee is named, as its own line').to.match(/builder/i)
      // 50 bps rendered as a percentage — "0.50%", trailing zero and all.
      expect(text, 'the rate the member is being charged is shown').to.match(/0\.50\s*%|50\s*bps/i)
      // And it says the fee is INSIDE the number above it, so the total is not read as fee-free.
      expect(text, 'the member is told where the fee sits in the price').to.match(/included above/i)
      // Polymarket's own taker fee is named separately — two charges, two sentences.
      expect(text, "Polymarket's own fee is disclosed as a separate charge").to.match(/Polymarket also charges/i)
      expect(text, 'an additive cost must never be described as free').to.not.match(
        /builder[^.]{0,40}\bfree\b/i,
      )
    })
  })

  it('[PR-04] predict.builder-fee-disclosed — a restricted region is refused before any fee or signature', () => {
    /*
     * The other side of the same gate, and the reason it is worth a test of its own: Polymarket
     * blocks order placement in some regions as a matter of THEIR policy. FairWins respects it and
     * never tries to bypass it — so the member gets an honest notice naming who sets the
     * restriction, and a link OUT to trade under Polymarket's own rules, instead of a dead Buy
     * button or a submit that fails after they have committed to it.
     */
    chainWorld()
    predictGateway()
    geoblock(true)
    connect()
    cy.visit('/wallet?tab=predict')
    waitForAccount()

    cy.get('.predict-grid li', { timeout: 40000 }).first().find('button, [role="button"]').first().click({ force: true })
    cy.get('.market-detail', { timeout: 20000 }).should('exist')
    cy.get('.market-detail').contains('button', /^Buy$/).first().click({ force: true })

    cy.get('[class*="trade-confirm"]', { timeout: 20000 }).should('exist')
    cy.get('[class*="trade-confirm"]').should(($c) => {
      const text = $c.text()
      expect(text, 'the refusal names whose restriction it is').to.match(/Polymarket sets this restriction/i)
      expect(text, 'and offers the way to trade it anyway, on the venue').to.match(/Trade on Polymarket/i)
      expect(text, 'no fee is quoted to someone who cannot trade').to.not.match(/builder/i)
    })
  })

  it('[PR-03] predict.hidden-off-polygon — the tab does not exist on a chain Polymarket does not serve', () => {
    /*
     * FR-018. Polymarket runs on Polygon and nowhere else, so on any other chain the tab HIDES
     * rather than rendering an empty or erroring surface. The gateway is configured here and
     * answering, so the only reason it can be absent is the chain — which is the claim.
     */
    chainWorld()
    predictGateway()
    connect(1, 'https://ethereum-rpc.publicnode.com')
    cy.visit('/fairwins?stay=1')
    waitForAccount()

    cy.visit('/wallet?tab=predict')
    // Asking for it by URL does not conjure it: an unavailable tab redirects rather than renders.
    /*
     * The PANEL is what must be absent. The URL keeps whatever was typed — an unavailable tab
     * resolves to Account internally rather than rewriting the address bar — so asserting on the
     * query string would be asserting a redirect the app does not perform.
     */
    cy.get('[aria-label="Predict"]').should('not.exist')

    // …and on Polygon, with the same gateway, it is there. Same build, same stub: only the chain
    // differs, which is what makes this a test of the chain gate.
    connect(137, 'https://polygon-bor-rpc.publicnode.com')
    cy.visit('/wallet?tab=predict')
    cy.get('[aria-label="Predict"]', { timeout: 40000 }).should('exist')
  })

  it('[CO-01] collect.browse-and-buy — an unreachable OpenSea gateway degrades honestly, never into "you own nothing"', () => {
    /*
     * Specs 055/056 FR-007 soft-fail. The Collect surface is READ-ONLY over OpenSea, and the
     * failure that matters is the same one as the portfolio's: a member whose gateway is down
     * must not be told their collection is empty.
     *
     * The gateway is deliberately NOT stubbed here — `dev:fast` points it at a dead port, which
     * is exactly the unreachable case.
     */
    chainWorld()
    connect()
    cy.visit('/wallet?tab=collectibles')
    waitForAccount()

    cy.get('.tab-content', { timeout: 40000 }).should('exist')
    cy.get('.tab-content').should(($c) => {
      const text = $c.text()
      const claimsEmptyAsFact = /you (do not|don.t) (own|have) any|no collectibles\b/i.test(text)
      const disclosesTheGap = /unavailable|could not|couldn.t|unreachable|try again|temporarily/i.test(text)
      expect(
        disclosesTheGap || !claimsEmptyAsFact,
        `an unreachable gateway must not be rendered as an empty collection. Rendered: ${text.slice(0, 400)}`,
      ).to.equal(true)
    })
  })
})
