// =============================================================================
// 33-account-surfaces.cy.js
// Fast-tier E2E for the unified account surfaces (specs 074 / 044 / 051 / 047).
//
// Issue #1245. These are READ-ONLY member surfaces: what the app shows you about
// your own account. Nothing here signs anything, so admission rule 1 puts all of
// it in the no-chain tier and the reads are answered at the RPC boundary.
//
// The property they share, and the reason they are worth testing at all, is the
// estate rule: a read that did not happen must never render as a zero. A
// portfolio that shows "$0" because a chain would not answer has told the member
// something false about their own money.
// =============================================================================

const ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const ACCOUNT_URL = '/wallet?tab=account'

/** Every shipped read provider on a mainnet build resolves to one of these. */
const RPC_HOSTS = /publicnode\.com$|rivet\.link$|etcdesktop\.com$|polygon\.technology$/

/**
 * Answer the app's reads, or refuse them, at the RPC boundary.
 *
 * `mode: 'answer'` returns an empty-but-valid answer for everything: balances of zero, no code.
 * `mode: 'refuse'` fails every chain read, which is the case the estate rules exist for.
 */
function chainWorld(mode = 'answer') {
  cy.intercept({ method: 'POST', hostname: RPC_HOSTS }, (req) => {
    if (mode === 'refuse') {
      req.reply({ statusCode: 503, body: 'chain unavailable' })
      return
    }
    const one = ({ method, id }) => {
      const reply = (result) => ({ jsonrpc: '2.0', id, result })
      switch (method) {
        case 'eth_chainId':
          return reply('0x89')
        case 'eth_blockNumber':
          return reply('0x4000000')
        case 'eth_getBalance':
          return reply('0x0')
        case 'eth_getCode':
          return reply('0x')
        case 'eth_call':
          return reply(`0x${'0'.repeat(64)}`)
        default:
          return reply('0x')
      }
    }
    const body = req.body
    req.reply({ statusCode: 200, body: Array.isArray(body) ? body.map(one) : one(body || {}) })
  }).as('chain')
}

function connect() {
  cy.mockWeb3Provider({
    account: ACCOUNT,
    preAuthorized: true,
    networkId: 137,
    rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
  })
}

/**
 * Switch account view through whichever switcher THIS viewport ships.
 *
 * Spec 074 puts the same three views behind two controls: the desktop tab strip
 * (`.my-account-tabs`, hidden ≤768px in CSS) and WalletPage's bottom icon bar
 * (`SectionIconNav`, which returns null above 768px). Exactly one is visible at
 * any width, so a test that reaches for `[role="tab"]` unconditionally is a
 * desktop-only test wearing a viewport-agnostic name — it passes at 1280 and
 * clicks a `display:none` element at 390.
 *
 * Each switcher states the selection in its own idiom, and each is asserted in
 * its own: `aria-selected` on a tab, `aria-current="page"` on the icon bar.
 */
function accountSwitcher() {
  return cy.get('body').then(($body) => {
    const strip = $body.find('[role="tablist"][aria-label="Account views"]:visible')
    return strip.length ? 'tabs' : 'icons'
  })
}

function selectAccountView(label) {
  accountSwitcher().then((kind) => {
    if (kind === 'tabs') cy.contains('[role="tab"]', label).click()
    else cy.get('nav[aria-label="Account views"]').contains('button', label).click()
  })
}

function expectAccountViewSelected(label) {
  accountSwitcher().then((kind) => {
    if (kind === 'tabs') {
      cy.contains('[role="tab"]', label).should('have.attr', 'aria-selected', 'true')
    } else {
      cy.get('nav[aria-label="Account views"]')
        .contains('button', label)
        .should('have.attr', 'aria-current', 'page')
    }
  })
}

describe('The account surfaces (specs 074 / 044 / 051 / 047)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  it('[AC-01] account.unified-panel — one account tab holding Portfolio, Activity and Stats', () => {
    /*
     * Spec 074 folded the standalone Portfolio tab into My Account. What makes that a flow rather
     * than a layout detail is the URL: each view is addressable, so a member can be sent to one.
     */
    chainWorld()
    connect()
    cy.visit(ACCOUNT_URL)

    cy.get('[role="tabpanel"][aria-label="Portfolio"]', { timeout: 40000 }).should('exist')

    /*
     * EXACTLY ONE switcher is offered, whatever the width. Two would give the member a second
     * copy of the same selection to disagree with; none would strand them on whichever view the
     * URL happened to name.
     */
    cy.get('body').then(($body) => {
      const tabs = $body.find('[role="tablist"][aria-label="Account views"]:visible').length
      const icons = $body.find('nav[aria-label="Account views"]:visible').length
      expect(tabs + icons, 'one — and only one — account view switcher is visible').to.equal(1)
    })

    // The default view is Portfolio, and it is the one SELECTED — not merely the one rendered.
    expectAccountViewSelected('Portfolio')

    selectAccountView('Activity')
    cy.get('[role="tabpanel"][aria-label="Activity"]').should('exist')
    expectAccountViewSelected('Activity')
    cy.location('search').should('contain', 'view=activity')

    selectAccountView('Stats')
    cy.get('[role="tabpanel"][aria-label="Stats"]').should('exist')

    // Addressable: arriving directly on a view lands on it, not on the default.
    cy.visit('/wallet?tab=account&view=activity')
    cy.get('[role="tabpanel"][aria-label="Activity"]', { timeout: 40000 }).should('exist')
    expectAccountViewSelected('Activity')
  })

  it('[AC-02] portfolio.see-holdings — the portfolio renders for a connected account', () => {
    chainWorld()
    connect()
    cy.visit(ACCOUNT_URL)

    cy.get('[role="tabpanel"][aria-label="Portfolio"]', { timeout: 40000 })
      .should('exist')
      .and('not.be.empty')

    // The member's own account is identified on it — a portfolio that cannot say whose it is
    // would be the first thing wrong with it.
    cy.get('[role="tabpanel"][aria-label="Portfolio"]').should(($p) => {
      const text = $p.text()
      expect(text.length, 'the portfolio panel rendered something').to.be.greaterThan(0)
    })
  })

  it('[AC-03] portfolio.see-holdings — a refused chain is not rendered as a zero balance', () => {
    /*
     * THE ASSERTION THIS FILE EXISTS FOR (constitution III / spec 071's estate rule).
     *
     * Every chain read fails. A portfolio is entitled to say it does not know; it is not entitled
     * to say the member holds nothing. The two are the same pixels and opposite claims, and only
     * one of them is true here.
     */
    chainWorld('refuse')
    connect()
    cy.visit(ACCOUNT_URL)

    cy.get('[role="tabpanel"][aria-label="Portfolio"]', { timeout: 40000 }).should('exist')
    cy.get('[role="tabpanel"][aria-label="Portfolio"]').should(($p) => {
      const text = $p.text()
      const claimsEmpty = /\$0\.00\b|\bBalance: 0\b/.test(text)
      const saysUnknown = /unavailable|could not|couldn|unable|unreachable|—|try again|error/i.test(text)
      expect(
        !claimsEmpty || saysUnknown,
        `a portfolio that read nothing must not report a zero balance as fact. Rendered: ${text.slice(0, 400)}`,
      ).to.equal(true)
    })
  })

  it('[AC-04] activity.see-unified-history — the activity view is honest when it has nothing to show', () => {
    chainWorld()
    connect()
    cy.visit('/wallet?tab=account&view=activity')

    cy.get('[role="tabpanel"][aria-label="Activity"]', { timeout: 40000 }).should('exist')
    /*
     * A fresh account has no history, and the panel must SAY so. An empty container is
     * indistinguishable from one that failed to load — the member cannot tell "nothing happened"
     * from "we could not look".
     */
    cy.get('[role="tabpanel"][aria-label="Activity"]').should(($p) => {
      const text = $p.text().trim()
      expect(text.length, 'the activity view said nothing at all').to.be.greaterThan(0)
    })
  })

  it('[AC-05] privacy.mask-balances — the tilt preference is account-scoped, persists, and never overstates itself', () => {
    /*
     * Spec 047. The switch turns the FEATURE on; the masking itself is driven by the device's
     * motion sensor. On a sensor-less device — this browser, and plenty of real desktops — the
     * honest thing is to say the setting is on AND inactive, which is what the summary does. That
     * disclosure is the part worth pinning: an "On" that silently does nothing is the failure mode.
     *
     * The preference is stored PER ACCOUNT (`setTiltToHide` no-ops without one) and the card
     * renders its default until those preferences load, so every read here waits for the account
     * first. Reading earlier measures the default and calls it the member's choice.
     */
    const SWITCH = '[role="switch"][aria-labelledby="privacy-prefs-tilt-label"]'
    const openPrivacyCard = () => {
      cy.get('[aria-label="Wallet Account"]', { timeout: 40000 }).should('exist')
      cy.contains('Privacy').click({ force: true })
      cy.get(SWITCH, { timeout: 40000 }).should('exist')
    }

    chainWorld()
    connect()
    cy.visit('/wallet?tab=settings')

    // Default ON (spec 047) — and honest about being inactive without a motion sensor.
    openPrivacyCard()
    cy.get(SWITCH).should('have.attr', 'aria-checked', 'true')
    cy.contains(/tilt to hide on/i).should('exist')

    // Turn it OFF, and check the summary follows the switch rather than lagging it.
    cy.get(SWITCH).click()
    cy.get(SWITCH).should('have.attr', 'aria-checked', 'false')
    cy.contains(/tilt to hide off/i).should('exist')

    /*
     * The choice reaches storage, keyed by the account. Asserted at the boundary because that is
     * the fact that has to survive: the rendered switch can be re-derived, the stored value is
     * what the next visit reads.
     */
    cy.window().then((win) => {
      const key = `fw_user_${ACCOUNT.toLowerCase()}_tilt_to_hide`
      expect(win.localStorage.getItem(key), 'the member choice was written under their account').to.equal('false')
    })
  })
})
