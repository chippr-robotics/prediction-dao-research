// =============================================================================
// 26-trade-account.cy.js
// Fast-tier E2E for the Trade ticket's ACTING ACCOUNT.
//
// Trade used to carry its own account picker ("Account: Personal wallet · 0x…"),
// a second switcher that could disagree with the app-wide one. It is gone: the
// acting account (personal wallet / multisig vault / recovered legacy account) is
// chosen once, from the wallet menu's acting-account switcher, exactly as every
// other surface does it. Trade only READS that identity.
//
// The contract under test is therefore absence-plus-alternative: no picker on the
// ticket, and the app-wide switcher still reachable from the same screen — plus
// the order-rail disclosure (sponsored / member-paid / multisig proposal) that
// used to sit in the account card and must survive its removal.
// =============================================================================

const TEST_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

describe('Trade — acting account (no ticket-local picker)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
    // The Trade tab's content only renders for a connected wallet, and this spec is
    // about the ticket, not the connect flow.
    cy.mockWeb3Provider({ account: TEST_ACCOUNT, preAuthorized: true })
    cy.visit('/wallet?tab=trade')
    cy.get('.trade-panel', { timeout: 15000 }).should('exist')
  })

  it('[TRADE-ACCT-01] the ticket offers no account selector', () => {
    // Absence, not a disabled or read-only control.
    cy.get('#trade-account-select').should('not.exist')
    cy.get('.trade-account').should('not.exist')
    cy.get('.trade-account-select').should('not.exist')
    cy.get('[aria-label="Trading account"]').should('not.exist')
    cy.contains('.trade-panel label', /^Account$/).should('not.exist')
    // The picker's options are gone with it — nothing on the ticket names an account.
    cy.get('.trade-panel option').each(($opt) => {
      expect($opt.text()).to.not.match(/Personal wallet|Multisig$|Recovered$/)
    })
  })

  it('[TRADE-ACCT-02] account switching lives where it does everywhere else', () => {
    // The wallet menu is the one switcher, and it is on this screen — removing the
    // ticket's picker took nothing away from the member.
    cy.get('.wallet-account-button, button[aria-label="Wallet Account"]', { timeout: 10000 })
      .should('be.visible')
      .click()
    // With only the personal wallet there is nothing to switch between, so the
    // caret is honestly absent — the menu still owns the identity either way.
    cy.get('.wallet-dropdown .account-info', { timeout: 10000 }).should('exist')
  })

  it('[TRADE-ACCT-03] the order rail is still disclosed before any amount', () => {
    // Sponsored / member-paid / multisig-proposal moved to the header with the
    // account card's removal; it must not have been dropped along the way.
    cy.get('.trade-panel .trade-badge')
      .should('exist')
      .invoke('text')
      .should('match', /Gasless · sponsored|Network fee applies|Multisig proposal/)
  })
})
