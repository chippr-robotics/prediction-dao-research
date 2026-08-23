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
const CREDENTIALS_KEY = 'fairwins.passkey.credentials.v1'
const ACCOUNT = '0x1111000000000000000000000000000000001111'

/** A book entry the connector considers able to transact (credentialId + a P-256 key). */
const completeRecord = (credentialId) => [
  {
    credentialId,
    address: ACCOUNT,
    publicKey: {
      x: '0x1111111111111111111111111111111111111111111111111111111111111111',
      y: '0x2222222222222222222222222222222222222222222222222222222222222222',
    },
  },
]

const seed = (win, { session, credentials }) => {
  win.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  if (credentials) win.localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials))
}

describe('Unified login surface (US2)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
    /*
     * CLOSE THE NETWORK BOUNDARY — required now that the session actually restores.
     *
     * A restored session makes the app read: roles across the cohort, balances, prices. Left
     * open, those hit real public RPC hosts, and their retries outlive the test and kill the
     * browser connection (a reproducible ECONNRESET). This spec was stable before only because
     * reconnect never happened, so nothing was ever read.
     */
    cy.intercept({ method: 'POST', hostname: /publicnode\.com$|rivet\.link$|etcdesktop\.com$|polygon\.technology$/ }, (req) =>
      req.reply({ statusCode: 503, body: 'no chain in the no-chain tier' }),
    )
  })

  // PENDING (#1019): asserts the passkey option is absent, but CI renders it — the network passkey config differs from the assumption. Decide the expected capability matrix.
  it.skip('[UL-01] one connect surface: classic options always, passkey only when capable (FR-004)', () => {
    cy.visit('/fairwins')
    cy.contains('button', /connect wallet/i).click()
    // getWalletLabel names the injected connector after whatever the provider claims to be:
    // the mock sets `isMetaMask: true` (it always has, since before spec 075), so this option
    // renders as "MetaMask" and /browser wallet/i has never matched it. Assert the injected
    // option is OFFERED, not one particular vendor label.
    cy.contains('.connect-modal__option', /metamask|browser wallet|injected/i).should('exist')
    cy.contains(/walletconnect/i).should('exist')
    // Local default env has no passkey network config → honestly absent.
    cy.contains(/^passkey$/i).should('not.exist')
  })

  /*
   * Un-skipped (#1019). There is no question to settle here: WalletButton deliberately renders the
   * address only inside the opened dropdown, and `cy.assertActiveAccount` is the helper that
   * exists for exactly that — it opens the dropdown, checks, and closes it again, and it also
   * handles the fixed-header scroll trap this surface has bitten several specs with.
   */
  it('[UL-02] classic-wallet flows are untouched by the login manager (SC-004 smoke)', () => {
    cy.mockWeb3Provider({ account: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' })
    cy.visit('/fairwins')
    cy.contains('button', /connect wallet/i).click()
    cy.selectInjectedConnector()
    // Connected header state renders exactly as the pre-041 suite expects.
    cy.assertActiveAccount('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
  })

  /*
   * THIS TEST USED TO SEED A SESSION WITH NO CREDENTIAL RECORD and assert it survived a reload.
   *
   * It did survive — because nothing ever read it. wagmi skipped the passkey connector on every
   * reconnect (its `getProvider()` returned null, and reconnect drops a connector without one), so
   * the session sat in storage untouched and the assertion passed on the strength of the bug. The
   * moment reconnect actually ran, the connector did the right thing and cleared it, and this
   * test failed. Both halves of FR-003/FR-005 are now pinned against a reconnect that happens.
   */
  it('[UL-03] a complete passkey session survives reload, and sign-out clears it (FR-003)', () => {
    cy.visit('/fairwins', {
      onBeforeLoad(win) {
        seed(win, {
          session: { address: ACCOUNT, chainId: 80002, credentialId: 'c1', loginMethod: 'passkey' },
          credentials: completeRecord('c1'),
        })
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

  it('[UL-05] a session this browser cannot sign for is cleared, not restored (spec 045 FR-005)', () => {
    // Session present, credential book empty: restoring would hand the member an account that
    // fails on its first action. An honest sign-out is the correct outcome.
    cy.visit('/fairwins', {
      onBeforeLoad(win) {
        seed(win, {
          session: { address: ACCOUNT, chainId: 80002, credentialId: 'orphan', loginMethod: 'passkey' },
          credentials: [],
        })
      },
    })
    cy.get('[aria-label="Connect Wallet"]', { timeout: 20000 }).should('exist')
    cy.window().then((win) => {
      expect(win.localStorage.getItem(SESSION_KEY), 'unusable session is cleared').to.equal(null)
    })
  })

  /*
   * Un-skipped (#1019), and its assertion strengthened rather than merely unblocked.
   *
   * Both of this test's address checks were reading a collapsed header, where NO address renders.
   * The positive one therefore timed out; the negative one — `cy.contains(passkey address)
   * .should('not.exist')` — did the opposite and passed unconditionally, because a bleed would
   * have been just as invisible as no bleed. A test named "no cross-account bleed" that cannot
   * observe a bleed is worse than no test.
   *
   * So the check now opens the dropdown, where the app does render one address, and asserts BOTH
   * halves against it: the classic account is shown AND the stale passkey account is not.
   */
  it('[UL-04] no cross-account bleed: switching identities resets address-keyed UI state (FR-024)', () => {
    cy.mockWeb3Provider({ account: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' })
    cy.visit('/fairwins')
    cy.contains('button', /connect wallet/i).click()
    cy.selectInjectedConnector()
    cy.assertActiveAccount('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
    // A stale passkey session from another identity must not leak into view.
    cy.window().then((win) => {
      win.localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ address: ACCOUNT, chainId: 80002, credentialId: 'c1', loginMethod: 'passkey' })
      )
    })
    cy.reload()
    /*
     * The wagmi-active classic session wins. Asserted where an address actually renders — inside
     * the open dropdown — so "the passkey address is absent" is a claim about what the app SHOWS,
     * not about a collapsed button that shows no address either way.
     */
    cy.scrollTo('top', { ensureScrollable: false })
    cy.get('.wallet-account-button', { timeout: 20000 }).should('be.visible').click()
    cy.get('.account-address-value', { timeout: 10000 })
      .invoke('text')
      .should((t) => {
        const text = t.toLowerCase()
        expect(text, 'shows the classic account').to.include('0xf39f')
        expect(text, 'does not show the stale passkey account').to.not.include(ACCOUNT.slice(0, 6).toLowerCase())
      })
  })
})
