// =============================================================================
// 36-activity-and-oracle-gating.cy.js
// Fast-tier E2E for the activity ledger across chains, and for what the app
// offers on a network that cannot support it (specs 092 / 051 / 023).
//
// Issue #1245, fourth batch. Both flows are about the same discipline from two
// directions: the app must never present a capability it does not have, and
// must never present an absence as a fact when it simply could not look.
// =============================================================================

const ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const RPC_HOSTS = /publicnode\.com$|rivet\.link$|etcdesktop\.com$|polygon\.technology$/

/** @param {'answer'|'refuse'} mode */
function chainWorld(mode = 'answer') {
  cy.intercept({ method: 'POST', hostname: RPC_HOSTS }, (req) => {
    if (mode === 'refuse') {
      req.reply({ statusCode: 503, body: 'chain unavailable' })
      return
    }
    const one = ({ method, id }) => {
      const reply = (result) => ({ jsonrpc: '2.0', id, result })
      if (method === 'eth_chainId') return reply('0x89')
      if (method === 'eth_blockNumber') return reply('0x4000000')
      if (method === 'eth_getBalance') return reply('0x0')
      if (method === 'eth_getLogs') return reply([])
      return reply('0x')
    }
    const body = req.body
    req.reply({ statusCode: 200, body: Array.isArray(body) ? body.map(one) : one(body || {}) })
  })
}

/** The subgraph is a separate boundary from the RPC, and fails separately (spec 023). */
function subgraphWorld(mode = 'answer') {
  cy.intercept({ method: 'POST', url: /thegraph\.com|subgraph/i }, (req) => {
    if (mode === 'refuse') {
      req.reply({ statusCode: 503, body: 'subgraph unavailable' })
      return
    }
    req.reply({ statusCode: 200, body: { data: {} } })
  })
}

function connect(networkId = 137, rpcUrl = 'https://polygon-bor-rpc.publicnode.com') {
  cy.mockWeb3Provider({ account: ACCOUNT, preAuthorized: true, networkId, rpcUrl })
}

const waitForAccount = () => cy.get('[aria-label="Wallet Account"]', { timeout: 40000 }).should('exist')

describe('Activity across chains, and honest capability gating (specs 092 / 051 / 023)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  it('[MC-01] activity.multi-chain-history — an empty history says it is empty, and says where balances live', () => {
    /*
     * Spec 092/051. A fresh account has no activity, and the panel must say so in words. An empty
     * container is indistinguishable from one that failed to load, and the two mean opposite
     * things to someone looking for a payment they think they made.
     *
     * The filters themselves (by type, by network) render over ENTRIES, so a fresh account
     * correctly has none — asserting them here would be asserting seeded data. That half needs
     * history and belongs to the on-chain tier.
     */
    chainWorld()
    subgraphWorld()
    connect()
    cy.visit('/wallet?tab=account&view=activity')
    waitForAccount()

    cy.get('[role="tabpanel"][aria-label="Activity"]', { timeout: 40000 }).should('exist')
    cy.get('[role="tabpanel"][aria-label="Activity"]').should(($p) => {
      const text = $p.text()
      expect(text, 'an empty ledger states that it is empty').to.match(/No activity/i)
    })
  })

  /*
   * A THIRD TEST BELONGS HERE and is deliberately not written yet.
   *
   * Under a TOTAL RPC refusal this panel renders "No activity yet — your wagers, transfers …
   * will appear here", with the freshness indicator reading "Updated 50s ago". `useAccountStats`
   * has exactly the right branch for this (`allUnreachable` → "None of your networks answered:
   * … Nothing is shown rather than an empty history that isn't true"), so either the ledger does
   * not classify a refused chain as unreachable, or that branch is unreachable in practice.
   *
   * Which of those it is decides whether this is a product bug or a stub that did not model the
   * failure, and that is not established yet — so it is filed (#1280) rather than asserted here.
   * A test written now would either pass for the wrong reason or fail for one.
   */

  it('[OG-01] oracle.graph-unavailable-degrades — an oracle that cannot settle here is LOCKED with its reason, not hidden', () => {
    /*
     * Spec 023's rule, and the reason it is a rule.
     *
     * There are three things the app could do with an oracle whose adapter is not deployed on the
     * member's chain, and only one of them is honest:
     *
     *   - OFFER it. The wager fails at signature, after the member has composed the whole thing.
     *   - HIDE it. The member cannot tell a settlement source that does not exist from one that
     *     exists everywhere except here, so they never learn that switching chains would help.
     *   - LOCK it, and say why. That is what ships.
     *
     * Ethereum carries the spec-067 bridge/liquidity routers and NO oracle adapters, and the
     * Polymarket CTF is Polygon-only — so on chain 1 every oracle settlement source is out of
     * reach while the participant ones are unaffected. That asymmetry is the test: a locked
     * oracle beside enabled human settlement proves the lock is about capability, not about the
     * form being disabled.
     *
     * The OFFER flow is what renders the strip. In the oracle-only flow the build's default
     * exposure (`VITE_ORACLE_MODELS` unset ⇒ Polymarket only) leaves a single settlement type,
     * and a one-option strip is not rendered at all.
     */
    chainWorld()
    subgraphWorld()
    connect(1, 'https://ethereum-rpc.publicnode.com')
    cy.visit('/wallet?tab=paytransfer&view=wagers')
    waitForAccount()

    cy.contains('Make an Offer', { timeout: 40000 }).click()

    /*
     * The strip exists and the oracle option is ON it — present, not hidden. It is labelled
     * "Oracle" rather than "Polymarket": under the build's default exposure Polymarket is the
     * only oracle model offered, so the strip names the CATEGORY and the locked reason names the
     * specific venue that is out of reach.
     */
    cy.get('.pill-select', { timeout: 40000 }).should('exist')
    cy.contains('.pill-select-option', 'Oracle', { timeout: 20000 }).as('oracleOption')

    // LOCKED: disabled, marked as such to assistive tech, and carrying its reason.
    cy.get('@oracleOption')
      .should('have.class', 'locked')
      .and('be.disabled')
      .and('have.attr', 'aria-disabled', 'true')
      .and('have.attr', 'title')
      .and('match', /Polymarket CTF|Switch to Polygon/i)

    /*
     * The reason is available to a screen reader too, not only as a hover title — a member who
     * cannot hover is exactly the member who cannot discover why the option will not take.
     */
    cy.get('@oracleOption')
      .invoke('attr', 'aria-describedby')
      .then((id) => {
        expect(id, 'the locked option points at its reason').to.be.a('string')
        cy.get(`#${id}`).should('contain.text', 'Polygon')
      })

    // Human settlement is untouched: the lock is about this oracle's reach, not about the form.
    cy.get('.pill-select-option:not(.locked)').should('have.length.at.least', 1)
    cy.get('.pill-select-option:not(.locked)').first().should('not.be.disabled')
  })

})
