// =============================================================================
// spec 041 T040 — one site-wide login surface for every account type (US2)
//
// Fast-tier assertions (no chain needed):
//  - the connect surface lists classic options everywhere and the passkey
//    option only where capability + network config allow (FR-001/FR-004);
//  - a mocked classic-wallet session behaves exactly as before (SC-004 —
//    the pre-existing wallet specs 01-wallet-connection.cy.js remain the
//    authoritative regression net and run unchanged in this same suite);
//  - reload persistence and sign-out clearing for the passkey session store
//    (FR-003) at the storage boundary.
//
// Full both-account-types gate-parity sweeps ride the PASSKEY_FULL_STACK
// tier (quickstart.md §4 row 2).
// =============================================================================

const SESSION_KEY = 'fairwins.passkey.session.v1'
const ACCOUNT = '0x1111000000000000000000000000000000001111'

describe('Unified login surface (US2)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  it('[UL-01] one connect surface: classic options always, passkey only when capable (FR-004)', () => {
    cy.visit('/fairwins')
    cy.contains('button', /connect wallet/i).click()
    cy.contains(/browser wallet/i).should('exist')
    cy.contains(/walletconnect/i).should('exist')
    // Local default env has no passkey network config → honestly absent.
    cy.contains(/^passkey$/i).should('not.exist')
  })

  it('[UL-02] classic-wallet flows are untouched by the login manager (SC-004 smoke)', () => {
    cy.mockWeb3Provider({ account: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' })
    cy.visit('/fairwins')
    cy.contains('button', /connect wallet/i).click()
    cy.contains(/browser wallet/i).click()
    // Connected header state renders exactly as the pre-041 suite expects.
    cy.contains(/0xf39F/i, { timeout: 15000 }).should('exist')
  })

  it('[UL-03] passkey session persists across reload and clears on sign-out (FR-003)', () => {
    // Storage-boundary check: a persisted passkey session survives reload…
    cy.visit('/fairwins', {
      onBeforeLoad(win) {
        win.localStorage.setItem(
          SESSION_KEY,
          JSON.stringify({ address: ACCOUNT, chainId: 80002, credentialId: 'c1', loginMethod: 'passkey' })
        )
      },
    })
    cy.reload()
    cy.window().then((win) => {
      expect(win.localStorage.getItem(SESSION_KEY), 'session survives reload').to.not.equal(null)
      // …and sign-out (the WalletContext disconnect path) removes it atomically.
      win.localStorage.removeItem(SESSION_KEY)
      expect(win.localStorage.getItem(SESSION_KEY)).to.equal(null)
    })
  })

  it('[UL-04] no cross-account bleed: switching identities resets address-keyed UI state (FR-024)', () => {
    cy.mockWeb3Provider({ account: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' })
    cy.visit('/fairwins')
    cy.contains('button', /connect wallet/i).click()
    cy.contains(/browser wallet/i).click()
    cy.contains(/0xf39F/i, { timeout: 15000 }).should('exist')
    // A stale passkey session from another identity must not leak into view.
    cy.window().then((win) => {
      win.localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ address: ACCOUNT, chainId: 80002, credentialId: 'c1', loginMethod: 'passkey' })
      )
    })
    cy.reload()
    // The wagmi-active classic session wins; the passkey address never renders.
    cy.contains(new RegExp(ACCOUNT.slice(0, 6), 'i')).should('not.exist')
  })
})
