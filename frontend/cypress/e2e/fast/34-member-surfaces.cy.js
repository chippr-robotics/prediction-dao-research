// =============================================================================
// 34-member-surfaces.cy.js
// Fast-tier E2E for the member's own records and references
// (specs 021 / 016 / 031 / 059 / 010).
//
// Issue #1245, second batch. Address book, statements, the notification feed and
// its profiles, and the versioned legal documents. All read-only or
// device-local, so admission rule 1 puts them in the no-chain tier.
//
// The recurring property: each of these surfaces has an EMPTY state that must be
// distinguishable from a broken one. "You have no contacts" and "we could not
// load your contacts" are different sentences, and only one of them is true at
// any moment.
// =============================================================================

const ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const FRIEND = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const RPC_HOSTS = /publicnode\.com$|rivet\.link$|etcdesktop\.com$|polygon\.technology$/

function chainWorld() {
  cy.intercept({ method: 'POST', hostname: RPC_HOSTS }, (req) => {
    const one = ({ method, id }) => {
      const reply = (result) => ({ jsonrpc: '2.0', id, result })
      switch (method) {
        case 'eth_chainId':
          return reply('0x89')
        case 'eth_blockNumber':
          return reply('0x4000000')
        case 'eth_getBalance':
          return reply('0x0')
        default:
          return reply('0x')
      }
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

/** Every account-scoped surface renders defaults until the account lands. */
const waitForAccount = () => cy.get('[aria-label="Wallet Account"]', { timeout: 40000 }).should('exist')

describe('The member’s records and references (specs 021 / 016 / 031 / 059 / 010)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  it('[MS-01] addressbook.save-and-use-contact — a saved contact persists and is findable by name', () => {
    chainWorld()
    connect()
    cy.visit('/wallet?tab=addressbook')
    waitForAccount()

    // Empty state SAYS it is empty — the distinction this file is about.
    cy.get('.ab-empty', { timeout: 40000 }).should('contain.text', 'No saved contacts yet')

    cy.get('[aria-label="Add contact"]').click()
    cy.get('[role="dialog"][aria-label="Add contact"]').should('exist')
    cy.get('#ab-nickname').type('Alice')
    cy.get('#ab-addr-0').type(FRIEND)
    cy.contains('button', /^Save$/).click()

    // Saved, counted, and findable by the name the member gave it — an address book that cannot
    // be searched by nickname is an address list.
    cy.get('.ab-contact-grid', { timeout: 20000 }).should('contain.text', 'Alice')
    cy.get('.ab-meta-count').should('contain.text', '1 saved address')

    cy.get('input[placeholder="Search by name or address"]').type('Ali')
    cy.get('.ab-contact-grid').should('contain.text', 'Alice')

    // A search that matches nothing says so, rather than rendering an empty grid that reads as
    // "your contacts are gone".
    cy.get('input[placeholder="Search by name or address"]').clear().type('zzzz')
    cy.get('.ab-empty').should('contain.text', 'No contacts match')

    // Survives a reload: the book is the member's, not the page's.
    cy.reload()
    waitForAccount()
    cy.get('.ab-contact-grid', { timeout: 40000 }).should('contain.text', 'Alice')
  })

  it('[MS-02] reports.export-wager-history — statements are offered and their empty state is honest', () => {
    chainWorld()
    connect()
    cy.visit('/wallet?tab=reports')
    waitForAccount()

    cy.get('.reports-section', { timeout: 40000 }).should('exist')
    /*
     * Nothing has been generated yet, and the panel says what that means AND what to do about it —
     * "statements are listed here and can be re-made at any time from the chain" is a promise
     * about where the data comes from, which is the honest thing to tell someone about a tax
     * record.
     */
    cy.get('.statement-saved-empty')
      .should('exist')
      .and('contain.text', 're-made at any time from the chain')
  })

  it('[MS-03] notifications.platform-feed — the feed opens from the bell and declares its unread count', () => {
    chainWorld()
    connect()
    cy.visit('/fairwins?stay=1')
    waitForAccount()

    /*
     * The bell's accessible name CARRIES the count. That is not decoration: a bell that shows a
     * dot but announces nothing tells a screen-reader user there is something without saying
     * what, and the count is the whole signal.
     */
    cy.get('[aria-label*="Notifications"]', { timeout: 40000 })
      .should('have.attr', 'aria-label')
      .and('match', /Notifications, \d+ unread/)

    cy.get('[aria-label*="Notifications"]').click()
    cy.get('[role="dialog"][aria-label="Activity"]').should('exist')
    /*
     * The domain filters render only once there is more than one KIND of activity to filter
     * (`domains.length > 1`), so a fresh account correctly has none — asserting them here would
     * be asserting seeded data, not the feed. What must hold on an empty feed is that it says it
     * is empty rather than rendering a blank panel.
     */
    cy.get('[role="dialog"][aria-label="Activity"]').should(($d) => {
      expect($d.text().trim().length, 'an empty feed still says something').to.be.greaterThan(0)
    })
  })

  it('[MS-04] notifications.choose-profile — profiles are listed with an explicit on/off per profile', () => {
    chainWorld()
    connect()
    cy.visit('/fairwins?stay=1')
    waitForAccount()

    /*
     * Profiles are quick-access INSIDE the activity feed (spec 059 US3), not a settings page —
     * they are meant to be reachable at the moment a notification arrives.
     *
     * A member with no profiles yet gets the route to CREATE one rather than an expander over an
     * empty list. That is the honest empty state, and the deep link it follows is the assertion
     * worth having: an offer that does not land anywhere is worse than no offer.
     */
    cy.get('[aria-label*="Notifications"]', { timeout: 40000 }).click()
    cy.get('[role="dialog"][aria-label="Activity"]').should('exist')
    cy.get('.profile-qa', { timeout: 20000 }).should('exist')
    cy.contains('button', /new notification profile/i).click()

    /*
     * It lands on Settings with the wizard OPEN. The section is addressed by hash
     * (`#notification-profiles-new`) rather than by tab — SETTINGS_HASH_ALIASES maps it to the
     * notifications card — so the wizard being open is the assertion, not the query string.
     */
    cy.location('search', { timeout: 20000 }).should('contain', 'tab=settings')
    // The card is titled "Notifications" and its id is what the hash opens.
    cy.get('[data-attention="notifications"], #notifications-header', { timeout: 20000 }).should('exist')
    cy.get('[class*="profile-wizard"]', { timeout: 20000 }).should('exist')
  })

  it('[MS-05] legal.read-versioned-policies — every policy is reachable and states the version it is', () => {
    /*
     * Spec 007 FR-017. A policy a member agreed to is only meaningful if they can tell WHICH
     * text they agreed to, so each document carries its SHA-256. A page that renders the current
     * terms with no version is not a record of anything.
     */
    chainWorld()
    connect()

    for (const path of ['/terms', '/risk', '/privacy']) {
      cy.visit(path)
      cy.get('.legal-doc-version', { timeout: 40000 })
        .should('exist')
        .and('contain.text', 'Version (SHA-256):')
      cy.get('.legal-doc-version code')
        .invoke('text')
        .should('match', /^[0-9a-f]{16,64}$/i)
      cy.get('h1').should('exist')
    }

    // And they are reachable by following links, not only by typing a URL. The footer carries
    // them on the public pages, which is where someone deciding whether to sign up will look.
    cy.visit('/?stay=1')
    cy.contains('a', 'Privacy Policy', { timeout: 40000 }).should('have.attr', 'href', '/privacy')
    cy.contains('a', 'Terms & Conditions').should('have.attr', 'href', '/terms')
  })
})
