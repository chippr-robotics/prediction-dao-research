// =============================================================================
// 01-wallet-connection.cy.js
// Fast-tier E2E tests for wallet connection flows (WAL-01..WAL-11)
//
// These tests run WITHOUT a Hardhat node. They use mockWeb3Provider() and the
// app's existing UI to verify wallet connection, disconnection, network
// switching, and error handling.
// =============================================================================

const TEST_ACCOUNTS = [
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
]

describe('Wallet Connection', () => {
  beforeEach(() => {
    // Clear any persisted wallet state so each test starts clean.
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  // ---------------------------------------------------------------------------
  // WAL-01: Connect wallet via MetaMask (mock provider) — verify address shown
  // ---------------------------------------------------------------------------
  it('[WAL-01] Connect wallet via MetaMask', () => {
    cy.mockWeb3Provider({ account: TEST_ACCOUNTS[0] })
    cy.visit('/fairwins')
    cy.get('body').should('be.visible')

    // The WalletButton shows "Connect Wallet" when disconnected.
    // Click the wallet button to open the connector dropdown.
    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 })
      .should('be.visible')
      .click()

    // The dropdown should show connector options. Look for MetaMask / Browser
    // Wallet option (the mock provider sets isMetaMask = true).
    cy.get('.connect-modal__option, [role="menuitem"]', { timeout: 5000 })
      .should('have.length.greaterThan', 0)

    // Click the first available injected connector (MetaMask).
    cy.selectInjectedConnector()

    // After connection, the WalletButton should switch to showing the account.
    // The wallet-account-button (Blockies avatar) replaces the connect button.
    cy.get('.wallet-account-button, button[aria-label="Wallet Account"]', { timeout: 10000 })
      .should('be.visible')

    // Open the account dropdown to verify the address is displayed.
    cy.get('.wallet-account-button, button[aria-label="Wallet Account"]')
      .click()

    // Verify the shortened address appears (first 6 + last 4 chars).
    const expectedShort = `${TEST_ACCOUNTS[0].substring(0, 6)}...${TEST_ACCOUNTS[0].substring(TEST_ACCOUNTS[0].length - 4)}`
    cy.get('.account-address-full, .account-details', { timeout: 5000 })
      .should('contain.text', expectedShort)
  })

  // ---------------------------------------------------------------------------
  // WAL-02: Connect wallet via WalletConnect — verify option exists
  // ---------------------------------------------------------------------------
  it('[WAL-02] Connect wallet via WalletConnect', () => {
    cy.mockWeb3Provider()
    cy.visit('/fairwins')
    cy.get('body').should('be.visible')

    // Open connector dropdown.
    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 })
      .should('be.visible')
      .click()

    // WalletConnect should always be listed (it uses QR / deep links).
    cy.get('.connect-modal__option, [role="menuitem"]', { timeout: 5000 })
      .should('have.length.greaterThan', 0)

    // Verify a WalletConnect option exists — either by text or by the QR badge.
    cy.get('.connect-modal__option, [role="menuitem"]').then(($options) => {
      const hasWalletConnect = $options.toArray().some((el) => {
        const text = el.innerText || ''
        return (
          text.includes('WalletConnect') ||
          text.includes('QR Code')
        )
      })
      expect(hasWalletConnect).to.be.true
    })
  })

  // ---------------------------------------------------------------------------
  // WAL-03: Display wallet balances — verify USDC shown in dropdown
  // ---------------------------------------------------------------------------
  /*
   * Un-skipped (#1019). The recorded reason described the app correctly — WalletButton renders
   * `.account-details` behind `{isOpen && ...}` — but not this test, which has always opened the
   * dropdown before asserting. Whether the balance ALSO belongs on the collapsed button is a
   * design question and stays open; it is not one this test was ever blocked on.
   */
  it('[WAL-03] Display wallet balances', () => {
    cy.mockWeb3Provider({ account: TEST_ACCOUNTS[0] })
    cy.visit('/fairwins')
    cy.get('body').should('be.visible')

    // Connect via UI.
    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 })
      .should('be.visible')
      .click()

    cy.selectInjectedConnector()

    cy.get('.wallet-account-button, button[aria-label="Wallet Account"]', { timeout: 10000 })
      .should('be.visible')
      .click()

    // The dropdown should show the USDC balance line.
    cy.get('.usdc-balance, .account-details', { timeout: 5000 })
      .should('be.visible')
      .invoke('text')
      .should('match', /USDC|Loading/i)
  })

  // ---------------------------------------------------------------------------
  // WAL-04: Disconnect wallet — verify returns to connect view
  // ---------------------------------------------------------------------------
  /*
   * Not pending any more. The reason recorded here — "the mock has no disconnect path" — did not
   * survive measurement: disconnect is an APP action (WalletButton -> disconnectWallet -> wagmi),
   * and a real wallet is not told about it either, so there is nothing for the mock to model.
   * Run as written, the connect button comes back.
   */
  it('[WAL-04] Disconnect wallet', () => {
    cy.mockWeb3Provider({ account: TEST_ACCOUNTS[0] })
    cy.visit('/fairwins')
    cy.get('body').should('be.visible')

    // Connect.
    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 })
      .click()
    cy.selectInjectedConnector()
    cy.get('.wallet-account-button, button[aria-label="Wallet Account"]', { timeout: 10000 })
      .should('be.visible')

    // Open dropdown and disconnect.
    cy.get('.wallet-account-button, button[aria-label="Wallet Account"]').click()

    // The dropdown should have a Disconnect button.
    cy.contains('button', /disconnect/i, { timeout: 5000 })
      .should('be.visible')
      .click()

    /*
     * SCROLL BACK TO THE TOP FIRST. Reaching the Disconnect button scrolled the page — it sits at
     * the bottom of a long dropdown — and the wallet control lives in a position:fixed header, so
     * Cypress reports it "overflowed by other elements" rather than absent. Same trap, and the
     * same remedy, as cy.assertActiveAccount.
     */
    cy.scrollTo('top', { ensureScrollable: false })

    // After disconnect the connect button should reappear, and the connected affordance must be
    // GONE — not merely joined by a connect button somewhere else on the page.
    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 })
      .should('be.visible')
    cy.get('.wallet-account-button').should('not.exist')
  })

  // ---------------------------------------------------------------------------
  // WAL-05: A connected session survives a reload; a DISCONNECTED one must too
  // ---------------------------------------------------------------------------
  /*
   * Rewritten (#1019). The old test asserted "auto-reconnect disabled" and was skipped because
   * "the EIP-6963 mock now makes wagmi attempt one". Measured, the app's intent is the opposite
   * of what the test claimed: wagmi.js configures `injected({ shimDisconnect: true })`, which
   * exists precisely so a stored session DOES restore on reload and an explicit disconnect does
   * NOT. So the contract has two halves, and this asserts both — the second half is the one that
   * was broken (a member who signed out was silently signed back in by the sibling EIP-6963
   * connector, whose own shim flag had never been set).
   */
  it('[WAL-05] A reload restores a session, but never resurrects a disconnected one', () => {
    cy.mockWeb3Provider({ account: TEST_ACCOUNTS[0] })
    cy.visit('/fairwins')
    cy.get('body').should('be.visible')

    // Nothing is connected before the member asks for it: the mock reports an empty
    // eth_accounts until eth_requestAccounts, exactly as an unauthorised wallet does.
    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 })
      .should('be.visible')
      .click()
    cy.selectInjectedConnector()
    cy.get('.wallet-account-button', { timeout: 10000 }).should('be.visible')

    // Half one — the session restores. No second mockWeb3Provider call: the same closure state
    // carries across the load, which is what a wallet that still trusts the site looks like.
    cy.reload()
    cy.get('.wallet-account-button', { timeout: 20000 })
      .should('be.visible')
    cy.get('.wallet-connect-button').should('not.exist')

    // Half two — an explicit disconnect survives a reload.
    cy.get('.wallet-account-button').click()
    cy.contains('button', /disconnect/i, { timeout: 5000 }).should('be.visible').click()
    // Reaching Disconnect scrolled the page away from the fixed header (see WAL-04).
    cy.scrollTo('top', { ensureScrollable: false })
    cy.get('.wallet-connect-button', { timeout: 10000 }).should('be.visible')

    cy.reload()
    /*
     * The app OPENS THE CONNECT DIALOG here, and that is corroboration rather than an obstacle:
     * AutoConnectPrompt only fires for a disconnected visitor, so the prompt appearing already
     * says the reload did not restore the session. It has to be closed before asserting on the
     * header, though — its backdrop covers the fixed control, which is what failed this test on
     * the phone profile while it passed on desktop. `cy.visit` closes it automatically;
     * `cy.reload` is not `cy.visit` and never did.
     */
    cy.dismissAutoConnectPrompt()
    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 20000 })
      .should('be.visible')
    /*
     * The load-bearing assertion. The wallet still answers eth_accounts with the account — a real
     * MetaMask does too, because the member revoked the SITE's session, not the wallet's memory —
     * so nothing here is proven by the provider being quiet. It is proven by the app declining to
     * act on an answer it was told to ignore.
     */
    cy.get('.wallet-account-button').should('not.exist')
  })

  // ---------------------------------------------------------------------------
  // WAL-06: Switch between networks — verify network toggle exists and works
  // ---------------------------------------------------------------------------
  it('[WAL-06] Switch between networks', () => {
    cy.mockWeb3Provider({ account: TEST_ACCOUNTS[0] })
    cy.visit('/fairwins')
    cy.get('body').should('be.visible')

    // Connect the wallet.
    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 })
      .click()
    cy.selectInjectedConnector()
    cy.get('.wallet-account-button, button[aria-label="Wallet Account"]', { timeout: 10000 })
      .should('be.visible')
      .click()

    // Inside the dropdown, network info should be displayed.
    cy.get('.network-info, .dropdown-section', { timeout: 5000 })
      .should('be.visible')

    // Verify the network name or chain ID is shown.
    cy.get('.wallet-dropdown').should('exist')
    cy.get('.network-info').invoke('text').should('not.be.empty')
  })

  // ---------------------------------------------------------------------------
  // WAL-07: The member declines the wallet's connect prompt
  // ---------------------------------------------------------------------------
  /*
   * Rewritten (#1019). The pending reason was right that the mock could not reject, but the old
   * body could not have worked even with one: it built its OWN window.ethereum in a
   * `window:before:load` handler queued after cy.mockWeb3Provider's, so the two raced for the
   * same window — and its provider announced nothing over EIP-6963, which is the only way wagmi
   * discovers a wallet here. The connect modal therefore had no connector to decline with.
   *
   * `rejectConnect` puts the refusal on the wallet this mock already announces, which is where a
   * refusal lives.
   */
  it('[WAL-07] Reject wallet connection', () => {
    cy.mockWeb3Provider({ account: TEST_ACCOUNTS[0], rejectConnect: true })
    cy.visit('/fairwins')
    cy.get('body').should('be.visible')

    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 })
      .should('be.visible')
      .click()
    cy.selectInjectedConnector()

    /*
     * The app must SAY something. WalletContext.connectWallet turns EIP-1193 4001 into
     * "Please approve the connection request" and ConnectModal renders it in
     * `.connect-modal__error[role="alert"]`; asserting the element alone would pass on an empty
     * one, so assert the copy the member actually reads.
     */
    cy.get('.connect-modal__error', { timeout: 10000 })
      .should('be.visible')
      .invoke('text')
      .should('match', /approve the connection request/i)

    // And the pending state must CLEAR — a spinner that never stops is the failure this test is
    // named for. Every connector option is re-enabled once `pendingId` goes back to null.
    cy.get('.connect-modal__option:not(.unavailable)', { timeout: 10000 })
      .first()
      .should('not.be.disabled')

    // Nothing was granted: no account affordance anywhere.
    cy.get('.wallet-account-button').should('not.exist')
  })

  // ---------------------------------------------------------------------------
  // WAL-08: Connect on wrong network — verify network error banner
  // ---------------------------------------------------------------------------
  /*
   * Chain 56 (BNB), not 1. This test used to pass `networkId: 1` calling it "the app expects a
   * Polygon chain" — but Ethereum became a supported chain with spec 067 (NETWORKS has 1, and
   * `isSupportedChainId` is just hasOwnProperty), so chain 1 raises no error at all. The old
   * assertion tolerated that by accepting `hasBanner || hasConnectBtn`, and passed only because
   * the pre-#1019 connector click never actually connected, leaving the Connect button on screen.
   * Once connecting worked, both halves went false and it failed — the test had been reporting on
   * a broken connect, not on network handling. 56 is genuinely absent from NETWORKS.
   */
  /*
   * FIXED (#1030). The banner used to be unreachable: `WalletContext` read the chain from wagmi's
   * `useChainId()`, which reports `config.state.chainId` — and wagmi refuses to write an
   * UNCONFIGURED chain there ("If chain is not configured, then don't switch over to it",
   * createConfig.js). Since every configured chain is also a NETWORKS key, `isSupportedChainId`
   * was unconditionally true, so both the auto-switch and the banner were dead code and the app
   * displayed "Polygon" to a member sitting on BNB. It now reads the CONNECTION's chainId
   * (`useWalletChainId`), which carries the wallet's real chain.
   */
  it('[WAL-08] Connect on wrong network', () => {
    // Chain 56 (BNB) is genuinely absent from NETWORKS. `rejectChainSwitch` models the member
    // declining the app's automatic switch — the only path that reaches the banner.
    cy.mockWeb3Provider({ account: TEST_ACCOUNTS[0], networkId: 56, rejectChainSwitch: true })
    cy.visit('/fairwins')
    cy.get('body').should('be.visible')

    // Count what the app actually ASKS the wallet to do. Without this the test could pass on a
    // banner rendered for some unrelated reason; with it, the auto-switch has to genuinely fire.
    cy.window().then((win) => {
      win.__switchChainRequests = 0
      const request = win.ethereum.request.bind(win.ethereum)
      win.ethereum.request = (args) => {
        if (args?.method === 'wallet_switchEthereumChain') win.__switchChainRequests += 1
        return request(args)
      }
    })

    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 })
      .should('be.visible')
      .click()
    cy.selectInjectedConnector()
    cy.get('.wallet-account-button, button[aria-label="Wallet Account"]', { timeout: 15000 })
      .should('be.visible')

    // The app must try to move the member onto a chain it supports...
    cy.window({ timeout: 10000 }).should((win) => {
      expect(win.__switchChainRequests, 'wallet_switchEthereumChain requests').to.be.greaterThan(0)
    })

    // ...and when the wallet refuses, say so, with a way out.
    cy.get('.network-error-banner', { timeout: 10000 })
      .should('be.visible')
      .and('contain.text', 'Polygon')
    cy.get('.network-error-banner .switch-network-button').should('be.visible')

    // The wallet really is still on BNB, so the banner is reporting the present, not a stale state.
    cy.window().its('ethereum.chainId').should('eq', '0x38')

    // And the app must NOT name a network the member is not on — the actual #1030 defect. Both
    // halves are required: "not Polygon" alone would pass on an empty chip. The banner is fixed to
    // the top of the viewport and covers the header, hence the forced click.
    cy.get('.wallet-account-button, button[aria-label="Wallet Account"]').click({ force: true })
    cy.get('.network-info', { timeout: 10000 })
      .should('not.contain.text', 'Polygon')
      .and('contain.text', '56')
  })

  // ---------------------------------------------------------------------------
  // WAL-09: Switch to correct network from banner — verify banner disappears
  // ---------------------------------------------------------------------------
  /*
   * This test was unfalsifiable: its `else` branch was `expect(true).to.be.true`, so when the
   * banner it exists to exercise was ABSENT — the case that actually needed reporting — it passed
   * and said so. With the mock's chain now mutable it can assert the real journey instead: the
   * member lands on an unsupported chain, is shown the banner, presses the button in it, and the
   * banner clears because the chain genuinely moved.
   */
  it('[WAL-09] Switch to correct network from banner', () => {
    cy.mockWeb3Provider({ account: TEST_ACCOUNTS[0], networkId: 56, rejectChainSwitch: true })
    cy.visit('/fairwins')
    cy.get('body').should('be.visible')

    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 })
      .should('be.visible')
      .click()
    cy.selectInjectedConnector()

    cy.get('.network-error-banner', { timeout: 15000 }).should('be.visible')

    // Instrument AFTER the automatic attempt, so the count below is the button's doing alone.
    cy.window().then((win) => {
      win.__switchChainRequests = 0
      const request = win.ethereum.request.bind(win.ethereum)
      win.ethereum.request = (args) => {
        if (args?.method === 'wallet_switchEthereumChain') win.__switchChainRequests += 1
        return request(args)
      }
    })

    // Pressing the button asks the WALLET. It does not merely hide the banner.
    cy.get('.network-error-banner .switch-network-button').click()
    cy.window({ timeout: 10000 }).should((win) => {
      expect(
        win.__switchChainRequests,
        'wallet_switchEthereumChain requests raised by the banner button',
      ).to.be.greaterThan(0)
    })

    // This wallet keeps refusing, so the banner MUST stay. Clearing it here would be the same lie
    // the old version told with `expect(true).to.be.true`.
    cy.get('.network-error-banner').should('be.visible')

    // The member switches in their wallet instead. The page has to follow.
    cy.window().then((win) => win.ethereum.__cySetChain(137))

    cy.get('.network-error-banner').should('not.exist')
    cy.window().its('ethereum.chainId').should('eq', '0x89')
    cy.get('.wallet-account-button, button[aria-label="Wallet Account"]', { timeout: 10000 })
      .should('be.visible')
      .click()
    cy.get('.network-info', { timeout: 10000 }).should('contain.text', 'Polygon')
  })

  // ---------------------------------------------------------------------------
  // WAL-10: No wallet extension — verify "Not Detected" state
  // ---------------------------------------------------------------------------
  it('[WAL-10] No wallet extension', () => {
    // Do NOT inject a mock provider. Visit the page with no window.ethereum.
    cy.on('window:before:load', (win) => {
      // Explicitly remove any ethereum provider.
      delete win.ethereum
    })
    cy.visit('/fairwins')
    cy.get('body').should('be.visible')

    // Open the connector dropdown.
    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 })
      .should('be.visible')
      .click()

    // Injected wallets should show "Not Detected" when no provider exists.
    cy.get('.connect-modal__option, [role="menuitem"]', { timeout: 5000 }).then(($options) => {
      const texts = $options.toArray().map((el) => el.innerText)
      const anyUnavailable = texts.some(
        (t) => t.includes('Not Detected') || t.includes('not detected')
      )
      const anyInjectedUnavailable = $options.toArray().some(
        (el) => el.classList.contains('unavailable')
      )
      // Either the text says "Not Detected" or the option has the unavailable class.
      expect(anyUnavailable || anyInjectedUnavailable).to.be.true
    })
  })

  // ---------------------------------------------------------------------------
  // WAL-11: Switch account mid-session — verify address updates
  // ---------------------------------------------------------------------------
  /*
   * Rewritten (#1019). The pending reason — "needs the mock to emit accountsChanged" — went stale
   * when `__cySetAccount` was written: it mutates the live provider and fires the event, which is
   * what a member switching accounts in MetaMask does. What was left was a body that could not
   * fail (`accountBtn.length > 0 || connectBtn.length > 0` is true of every rendered page,
   * including one that dropped the connection entirely).
   *
   * cy.switchAccount already asserts the app FOLLOWED the switch, via cy.assertActiveAccount.
   * What is added here is the other half: the previous account is gone, not merely joined.
   */
  it('[WAL-11] Switch account mid-session', () => {
    cy.mockWeb3Provider({ account: TEST_ACCOUNTS[0] })
    cy.visit('/fairwins')
    cy.get('body').should('be.visible')

    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 })
      .click()
    cy.selectInjectedConnector()
    cy.get('.wallet-account-button', { timeout: 10000 }).should('be.visible')

    // Establish the starting point rather than assuming it — otherwise a switch that never
    // happened is indistinguishable from one that did.
    cy.assertActiveAccount(TEST_ACCOUNTS[0])

    // Emits accountsChanged on the live provider; asserts the app followed.
    cy.switchAccount(1)

    // The displayed address is now #1's AND is no longer #0's. Both halves matter: the dropdown
    // renders one address, so an app that ignored the event would still satisfy a bare "contains
    // an address" check.
    cy.get('.wallet-account-button').click()
    cy.get('.account-address-value', { timeout: 10000 })
      .invoke('text')
      .should((t) => {
        const text = t.toLowerCase()
        expect(text, 'shows the switched-to account').to.include(TEST_ACCOUNTS[1].slice(0, 6).toLowerCase())
        expect(text, 'no longer shows the account switched away from').to.not.include(TEST_ACCOUNTS[0].slice(0, 6).toLowerCase())
      })
  })
})
