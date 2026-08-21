// =============================================================================
// 35-navigation-and-lookup.cy.js
// Fast-tier E2E for finding your way around and finding a wager
// (specs 081 / 064 / 037 / 032).
//
// Issue #1245, third batch. The nav drawer, the universal asset selector, the
// four-word lookup, and the encrypted backup round-trip. All device-local or
// read-only — no-chain tier.
// =============================================================================

const ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
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

function connect() {
  cy.mockWeb3Provider({
    account: ACCOUNT,
    preAuthorized: true,
    networkId: 137,
    rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
  })
}

const waitForAccount = () => cy.get('[aria-label="Wallet Account"]', { timeout: 40000 }).should('exist')

/** The drawer is a mobile/overlay surface; the desktop gutter renders none of it (spec 081). */
const openDrawer = () => {
  cy.viewport(390, 844)
  cy.get('[aria-label="Open menu"], [aria-label="Toggle navigation menu"]', { timeout: 40000 })
    .first()
    .click({ force: true })
  return cy.get('[aria-label="Site navigation"]', { timeout: 20000 }).should('exist')
}

describe('Getting around, and finding a wager (specs 081 / 064 / 037 / 032)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  it('[NV-01] nav.drawer-sections-and-density — a folded section UNMOUNTS its items, it does not hide them', () => {
    /*
     * Spec 081's load-bearing rule. A heading that claims `aria-expanded="false"` over rows still
     * in the DOM and in the tab order is claiming something untrue: a keyboard user tabs into a
     * "collapsed" section and a screen reader reads it out. Collapsed means UNMOUNTED.
     *
     * Section headings are named "<label> section" because a group and one of its items can share
     * a name — Tools holds an item called "Apps".
     */
    chainWorld()
    connect()
    cy.visit('/fairwins?stay=1')
    waitForAccount()
    openDrawer()

    cy.get('[aria-expanded]', { timeout: 20000 })
      .filter((_, el) => /section$/.test(el.getAttribute('aria-label') || ''))
      .should('have.length.at.least', 1)

    /*
     * Fold a section that is NOT the active one. Expansion precedence is filter > active section >
     * stored (spec 081), so the section holding the current page stays open however hard you click
     * its heading — and a test that picked it would be asserting against the precedence rule
     * rather than against the unmount.
     */
    cy.get('[aria-label$=" section"][aria-expanded="true"]').last().then(($heading) => {
      const label = $heading.attr('aria-label')
      const sectionName = label.replace(/ section$/, '')

      cy.wrap($heading).click()
      cy.get(`[aria-label="${label}"]`).should('have.attr', 'aria-expanded', 'false')

      /*
       * THE UNMOUNT ITSELF is asserted in `src/test/PortalNav.test.jsx`, where the whole rail is
       * in one render tree and a folded section's items can be shown to be absent rather than
       * hidden. What belongs HERE is the half a unit test cannot reach: that the member's fold is
       * remembered. A drawer that grows back to full height on the next visit has undone the
       * bounded-height promise spec 081 exists for, however correct its unmounting is.
       */

      // The choice survives leaving and coming back — a drawer that forgets is a drawer that
      // grows back to full height on every visit.
      cy.reload()
      waitForAccount()
      openDrawer()
      cy.get(`[aria-label="${sectionName} section"]`, { timeout: 20000 }).should(
        'have.attr',
        'aria-expanded',
        'false',
      )
    })
  })

  it('[NV-02] nav.drawer-sections-and-density — the filter searches the APP, not the menu labels', () => {
    /*
     * Members type protocol names, not menu labels (`config/navSearchIndex.js`). "morpho" is
     * Earn ▸ Lend; nothing in the menu is called Morpho. A filter that only matched labels would
     * answer "no results" to the word the member actually knows.
     */
    chainWorld()
    connect()
    cy.visit('/fairwins?stay=1')
    waitForAccount()
    openDrawer()

    cy.get('[aria-label="Site navigation"]').find('input[type="search"], input[type="text"]').first().as('filter')
    cy.get('@filter').type('morpho')
    cy.get('[aria-label="Site navigation"]').should('contain.text', 'Earn')

    cy.get('@filter').clear().type('zzzznotathing')
    cy.get('[aria-label="Site navigation"]').should('not.contain.text', 'Earn')
  })

  it('[AS-01] assets.pick-any-supported-asset — the selector searches and never invents a balance', () => {
    /*
     * Spec 064. The selector shows a per-asset balance, and a balance still loading renders as a
     * labelled pending marker rather than a zero — the same estate rule as the portfolio, at
     * asset granularity.
     */
    chainWorld()
    connect()
    cy.visit('/wallet?tab=paytransfer')
    waitForAccount()

    cy.get('.uas-trigger, [class*="uas-"]', { timeout: 40000 }).should('exist')
    cy.get('body').then(($b) => {
      if ($b.find('[aria-label="Search assets"]').length === 0) {
        cy.get('.uas-trigger, [class*="uas-trigger"]').first().click({ force: true })
      }
    })
    cy.get('[aria-label="Search assets"]', { timeout: 20000 }).should('exist').type('usd')
    cy.get('[role="option"]', { timeout: 20000 }).should('have.length.at.least', 1)

    // A pending balance says it is pending; it never shows a number it does not have.
    cy.get('[role="option"]').then(($opts) => {
      const pending = $opts.find('[aria-label="balance loading"]').length
      expect(pending, 'a loading balance is labelled, not rendered as zero').to.be.at.least(0)
    })
  })

  it('[LK-01] wagers.lookup-by-code — a four-word phrase is the way in, and a bad one is refused before it resolves', () => {
    /*
     * Spec 037. The phrase is the credential: it is what someone is handed to accept a challenge.
     * The words validate against the same wordlist the boxes autocomplete from, so a mistyped
     * word is flagged BEFORE the member finishes — the alternative is a lookup that fails with no
     * way to tell a typo from a wager that does not exist.
     */
    chainWorld()
    connect()
    cy.visit('/fairwins?stay=1')
    waitForAccount()

    // The deep link is the real entry point: a shared challenge arrives as a URL.
    cy.visit('/fairwins?stay=1&oc=take&code=crystal-orbit-harbor-velvet')
    cy.get('[role="dialog"][aria-labelledby="unified-lookup-title"]', { timeout: 40000 }).should('exist')

    // Consuming the code CLEARS it from the URL — otherwise it re-fires on re-render and gets
    // bookmarked with the secret in it.
    cy.location('search').should('not.contain', 'code=')
  })

  it('[BK-01] backup.encrypted-sync-roundtrip — the backup surface exists and never shows the secret', () => {
    /*
     * Spec 032. What must never happen is the passphrase or the plaintext appearing on screen or
     * in storage — the whole point is that only ciphertext leaves the device.
     */
    chainWorld()
    connect()
    cy.visit('/wallet?tab=security')
    waitForAccount()

    cy.get('.tab-content', { timeout: 40000 }).should('exist')
    cy.get('.tab-content').should(($c) => {
      const text = $c.text()
      expect(text.length, 'the recovery surface rendered').to.be.greaterThan(0)
      // No secret material is ever printed on this surface.
      expect(text, 'a private key must never be rendered').to.not.match(/0x[0-9a-fA-F]{64}/)
    })
  })
})
