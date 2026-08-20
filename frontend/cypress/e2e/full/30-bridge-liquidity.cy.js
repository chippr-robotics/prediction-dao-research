/**
 * E2E Tests: bridge and supplied liquidity (spec 067, Full-tier)
 *
 * Issue #1236. Four flows, and every one of them settles its claim from CHAIN STATE rather
 * than from a success message, because the claims are all about who is holding the money:
 *
 *   BL-01  liquidity.supply-uniswap-position   the position NFT is the MEMBER's, not the router's
 *   BL-02  liquidity.pause-stops-new-only      a pause stops new supplies and traps nothing
 *   BL-03  bridge.deposit-member-is-depositor  Across records the MEMBER as depositor
 *   BL-04  bridge.fee-consent-ceiling          the disclosed bps is a ceiling, and 0 shows no line
 *
 * ── WHY THESE ARE ON-CHAIN AND NOT NO-CHAIN ────────────────────────────────────────────────
 * "The router never takes custody" is not a rendering fact. A component test can assert what
 * the app INTENDS to send; only a chain can answer who ended up owning the position and whose
 * address Across wrote down. Both are one refactor away from being wrong in a way no unit test
 * would notice — `recipient: address(this)` and `depositor: address(this)` are both perfectly
 * ordinary-looking lines.
 *
 * ── WHAT THE CHAIN IS ──────────────────────────────────────────────────────────────────────
 * The full tier's node boots as chainId 80002 (Amoy-shaped) and `VITE_E2E_AMOY_LOCAL=1` makes
 * the DEV-only seams in config/networks.js + config/contracts.js resolve both routers there.
 * Across and Uniswap are the contracts/mocks stand-ins deployed by
 * `scripts/deploy/deploy-bridge-liquidity.js` — MockAcrossSpokePool records `depositor`
 * verbatim, and MockPositionManager mints to `recipient` and models the member-called exit
 * legs, which is exactly what BL-01/BL-02/BL-03 read back.
 */

const MEMBER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' // hardhat #0
const USDC = '0xbc4D54AE49ED9C6075770CD6acA930A728dcf526'   // the local payment token (18 dec here)
const WMATIC = '0x007e106a5664D48e02f571b58694B74c9D5c22a1' // the local wrapped native
const ROUTER = '0x5f3f1dBD7B74C6B46e8c44f98792A1dAf8d69154' // liquidityRouter (nonce-derived)

const SUPPLY_URL = '/wallet?tab=earn&view=supply'

const fixture = (action, args = {}) =>
  cy.task('liquidityFixture', { action, args }).then((r) => {
    expect(r.ok, `liquidityFixture ${action}: ${r.error || 'no error message returned'}`).to.equal(true)
    return r
  })

/**
 * Open the sheet for the pool THIS SPEC listed. The whole row is the control (SupplyView).
 *
 * The row is picked by NETWORK NAME, never `.first()`: the catalog reads every supported
 * network, so on a machine with outbound RPC the list also carries the real Ethereum and
 * Polygon pools — and `.first()` silently opened an Ethereum USDC/USDT sheet where the
 * member holds nothing, which fails as "that is more than your USDC" three steps later.
 */
const LOCAL_NETWORK = 'Polygon Amoy' // what chain 80002 calls itself (config/networks.js)

/*
 * Each flow curates its own pool at its own FEE TIER, and opens the row by that tier. Sharing
 * one pool between flows was worse than it looks: `SupplySheet` matches a position to a pool by
 * `poolId` and takes the FIRST match, so a second position in the same pool is invisible to it —
 * a flow that supplied would find the earlier flow's spent position instead of its own and be
 * told it has nothing to withdraw.
 */
const FEE_TIER = { supply: 3000, pause: 500 }
const feeLabel = (tier) => `${(tier / 10_000).toFixed(2)}% fee`

/*
 * The row for THIS spec's pool. Both filters are required and neither is an assertion after the
 * fact: the catalog reads every supported network, so on a machine with outbound RPC the list
 * also carries the real Ethereum and Polygon pools — and `cy.contains` returns the FIRST match,
 * which was an Ethereum row where the member holds nothing.
 */
const poolRow = (tier) =>
  cy
    .get('.supply-row', { timeout: 60000 })
    .filter(`:contains("${LOCAL_NETWORK}")`)
    .filter(`:contains("${feeLabel(tier)}")`)
    .should('have.length', 1)

const openPool = (tier) => {
  poolRow(tier).click()
  // The sheet is a fixed-position panel with its own scroll container, so Cypress cannot
  // scroll the page to reach a field below the fold — scroll the field itself into view.
  cy.get('#supply-amount-0', { timeout: 20000 }).scrollIntoView().should('be.visible')
}

describe('Bridge and supplied liquidity (spec 067)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
    /*
     * Every test starts from an UNPAUSED router, and this belongs here rather than at the end
     * of the test that pauses. A pause left behind does not fail the next test where it was
     * set — it changes which mode the sheet opens in (`SupplyView` opens a closed pool the
     * member holds on the way OUT), so the next spec fails looking for an amount field that
     * was never going to be there. Cleanup that only runs when a test succeeds is exactly the
     * cleanup that is missing when you need it.
     */
    fixture('setPaused', { paused: false })
  })

  it('[BL-01] liquidity.supply-uniswap-position — the position NFT is minted to the member, never to the router', () => {
    fixture('listTradingPool', { tokenA: USDC, tokenB: WMATIC, feeTier: FEE_TIER.supply })

    // The id the supply below will mint, read BEFORE it happens. Token ids accumulate on a
    // shared node, so this is the only way to name the position this flow created.
    fixture('positionCounters', { owner: MEMBER }).then(({ nextTokenId, balance }) => {
      cy.mockWeb3Provider({ account: MEMBER, preAuthorized: true, realBalances: true })
      cy.visit(SUPPLY_URL)
      openPool(FEE_TIER.supply)

      cy.get('#supply-amount-0').type('5')
      cy.get('#supply-amount-1').type('5')
      cy.contains('button', 'Review and confirm').should('not.be.disabled').click()

      // The disclosure is a GATE, not a tooltip (SupplySheet) — the confirm control is unusable
      // until it is acknowledged, so a test that could skip it would be testing a different app.
      cy.get('.supply-ack input[type="checkbox"]').should('not.be.checked').check()
      cy.contains('button', 'Supply to this pool').should('not.be.disabled').click()

      // SupplyView closes the sheet on completion (`onActionComplete`), so the member's signal
      // is the pool appearing under "Your pools" — not a message inside a panel that is gone.
      cy.get('.supply-ack', { timeout: 60000 }).should('not.exist')
      cy.get('.supply-position-list .supply-position', { timeout: 30000 })
        .should('have.length.at.least', balance + 1)

      // THE ASSERTION. Not the list above it — the owner of the NFT, from the chain.
      fixture('positionOwner', { tokenId: nextTokenId }).then(({ owner, liquidity }) => {
        expect(owner.toLowerCase(), 'the position NFT belongs to the member').to.equal(MEMBER.toLowerCase())
        expect(owner.toLowerCase(), 'the router must never own a member position')
          .to.not.equal(ROUTER.toLowerCase())
        expect(BigInt(liquidity) > 0n, 'the position holds liquidity').to.equal(true)
      })

      // FR-013's sibling on this path: the router is a conduit, so it ends the transaction
      // holding nothing of either asset. A residue here is custody by accident.
      for (const token of [USDC, WMATIC]) {
        fixture('tokenBalanceOf', { token, address: ROUTER }).then(({ balance: residue }) => {
          expect(residue, `router residue in ${token}`).to.equal('0')
        })
      }
    })
  })

  it('[BL-02] liquidity.pause-stops-new-only — a pause closes new supplies and traps nothing', () => {
    /*
     * The claim under test is the one the router's design rests on: `pause()` is a stop on NEW
     * Uniswap supplies, not a killswitch over a member's money. It is testable only because the
     * exit does not run through FairWins at all — `buildExitCalls` talks to Uniswap's position
     * manager directly — so this flow withdraws WHILE THE ROUTER IS PAUSED and takes the tokens
     * back. A refactor that routed the exit through the router would fail here and nowhere else.
     *
     * Note also what this test does NOT say. Across bridge-LP deposits never touch a FairWins
     * contract either (research R3), so this pause cannot reach them — calling it a pause on
     * "pooling" would be asserting something untrue about a path it does not control.
     */
    fixture('listTradingPool', { tokenA: USDC, tokenB: WMATIC, feeTier: FEE_TIER.pause })

    fixture('positionCounters', { owner: MEMBER }).then(({ nextTokenId }) => {
      cy.mockWeb3Provider({ account: MEMBER, preAuthorized: true, realBalances: true })
      cy.visit(SUPPLY_URL)
      openPool(FEE_TIER.pause)

      cy.get('#supply-amount-0').type('4')
      cy.get('#supply-amount-1').type('4')
      cy.contains('button', 'Review and confirm').should('not.be.disabled').click()
      cy.get('.supply-ack input[type="checkbox"]').check()
      cy.contains('button', 'Supply to this pool').click()
      cy.get('.supply-ack', { timeout: 60000 }).should('not.exist')

      fixture('positionOwner', { tokenId: nextTokenId }).then(({ liquidity }) => {
        expect(BigInt(liquidity) > 0n, 'there is a position for the pause to trap').to.equal(true)
      })

      // ── The guardian pauses. ────────────────────────────────────────────────────────
      fixture('setPaused', { paused: true })
      fixture('poolPaused').then(({ paused }) => expect(paused, 'the router is paused').to.equal(true))

      cy.visit(SUPPLY_URL)
      // A pool that has stopped taking deposits is NOT hidden (FR-024) — it stays in the
      // list, labelled, and opens on the way OUT because the member holds a position.
      poolRow(FEE_TIER.pause)
        .should('have.class', 'supply-row-closed')
        // Wait for the POSITION to be attached to the row before opening it. The catalog and
        // the member's positions load separately, and the tab the sheet lands on is decided
        // ONCE, at click time — click in the gap between the two and a pool the member holds
        // opens on Supply, which is the dead end this pause is supposed to route around.
        .find('.supply-row-chip.position')
        .should('exist')
      poolRow(FEE_TIER.pause).click()
      // Tabs are addressed BY POSITION, not by label: the supply tab renames itself to "Add to
      // position" once the member holds one, so a label selector here tests the copy, not the
      // pause. [0] is supply, [1] is withdraw (SupplySheet's `earn-mode-tabs`).
      cy.get('.earn-mode-tabs [role="tab"]', { timeout: 20000 })
        .eq(1)
        .should('have.attr', 'aria-selected', 'true')

      // Half one: new value in is refused, and the controls say so rather than failing later.
      cy.get('.earn-mode-tabs [role="tab"]').eq(0).click()
      cy.get('#supply-amount-0').scrollIntoView().should('be.disabled')
      cy.get('#supply-amount-1').should('be.disabled')
      cy.contains('button', 'Review and confirm').should('be.disabled')

      // Half two: the exit is untouched. The tab is not disabled, the control is not
      // disabled, and — the part that actually matters — the tokens come back.
      cy.get('.earn-mode-tabs [role="tab"]').eq(1).should('not.be.disabled').click()
      // SCOPED. `cy.contains('button', 'All')` matches the "← All earning options" back
      // control first, which is behind the sheet's scrim and cannot be clicked.
      cy.get('.supply-percent-row').contains('button', 'All').click()

      fixture('tokenBalanceOf', { token: USDC, address: MEMBER }).then(({ balance: usdcBefore }) => {
        fixture('tokenBalanceOf', { token: WMATIC, address: MEMBER }).then(({ balance: wmaticBefore }) => {
          cy.contains('button', /^Withdraw /).should('not.be.disabled').click()
          cy.get('.earn-mode-tabs', { timeout: 60000 }).should('not.exist')

          fixture('positionOwner', { tokenId: nextTokenId }).then(({ owner, liquidity }) => {
            expect(BigInt(liquidity), 'the position was emptied while the router was paused').to.equal(0n)
            expect(owner.toLowerCase(), 'and it is still the member who owns it')
              .to.equal(MEMBER.toLowerCase())
          })
          for (const [token, before, label] of [
            [USDC, usdcBefore, 'USDC'],
            [WMATIC, wmaticBefore, 'WMATIC'],
          ]) {
            fixture('tokenBalanceOf', { token, address: MEMBER }).then(({ balance }) => {
              expect(BigInt(balance) > BigInt(before), `${label} came back to the member`).to.equal(true)
            })
          }
        })
      })

    })
  })
})
