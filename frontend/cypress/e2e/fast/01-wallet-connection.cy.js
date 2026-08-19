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
  // PENDING (#1019): asserts `.account-details` is visible, but WalletButton renders it
  // behind `{isOpen && ...}` — the balances only exist once the dropdown is opened.
  // Decide whether the balance belongs on the collapsed button before asserting it.
  it.skip('[WAL-03] Display wallet balances', () => {
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
  // PENDING (#1019): expects the connect button back after disconnect; the mock has no disconnect path yet.
  it.skip('[WAL-04] Disconnect wallet', () => {
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

    // After disconnect the connect button should reappear.
    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 })
      .should('be.visible')
  })

  // ---------------------------------------------------------------------------
  // WAL-05: Auto-reconnect disabled — refresh page, verify must reconnect
  // ---------------------------------------------------------------------------
  // PENDING (#1019): asserts auto-reconnect is off, but the EIP-6963 mock now makes wagmi attempt one.
  it.skip('[WAL-05] Auto-reconnect disabled', () => {
    cy.mockWeb3Provider({ account: TEST_ACCOUNTS[0] })
    cy.visit('/fairwins')
    cy.get('body').should('be.visible')

    // The page should show the connect button on first load (no auto-connect).
    // The mock provider injects window.ethereum but doesn't trigger auto-connect
    // through wagmi, so the connect button should be visible.
    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 })
      .should('be.visible')

    // Connect, then reload and verify we need to reconnect.
    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]').click()
    cy.selectInjectedConnector()
    cy.get('.wallet-account-button, button[aria-label="Wallet Account"]', { timeout: 10000 })
      .should('be.visible')

    // Reload the page (re-inject mock provider).
    cy.mockWeb3Provider({ account: TEST_ACCOUNTS[0] })
    cy.reload()
    cy.get('body', { timeout: 10000 }).should('be.visible')

    // After reload, verify the connect button is shown OR the app requires
    // explicit reconnection. With wagmi + mock, either the connect button is
    // visible or the Welcome View is shown (no wallet connected).
    cy.get('body').then(($body) => {
      const hasConnectBtn = $body.find('.wallet-connect-button, button[aria-label="Connect Wallet"]').length > 0
      const hasWelcomeView = $body.find('.welcome-view, .welcome-hero').length > 0
      expect(hasConnectBtn || hasWelcomeView).to.be.true
    })
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
  // WAL-07: Reject wallet connection — verify error/pending state clears
  // ---------------------------------------------------------------------------
  // PENDING (#1019): reject-connection path needs the mock to reject eth_requestAccounts.
  it.skip('[WAL-07] Reject wallet connection', () => {
    // Inject a provider that rejects the connection request.
    cy.on('window:before:load', (win) => {
      win.ethereum = {
        isMetaMask: true,
        selectedAddress: null,
        networkVersion: '1337',
        chainId: '0x539',
        request: ({ method }) => {
          if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
            return Promise.reject(new Error('User rejected the request'))
          }
          if (method === 'eth_chainId') return Promise.resolve('0x539')
          if (method === 'net_version') return Promise.resolve('1337')
          return Promise.resolve(null)
        },
        enable: () => Promise.reject(new Error('User rejected')),
        on: () => {},
        removeListener: () => {},
        removeAllListeners: () => {},
      }
    })

    cy.visit('/fairwins')
    cy.get('body').should('be.visible')

    // Open connector dropdown.
    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 })
      .should('be.visible')
      .click()

    // Try to connect — it will be rejected.
    cy.selectInjectedConnector()

    // The connect button should remain visible (connection failed).
    // The pending state should eventually clear.
    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 })
      .should('be.visible')
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
   // ASSERTION-DEBT: #1231 — this branch passes without proving the outcome; rewrite tracked there.
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
    // ASSERTION-DEBT: #1231 — this branch passes without proving the outcome; rewrite tracked there.
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
  // PENDING (#1019): account switching needs the mock to emit accountsChanged.
  it.skip('[WAL-11] Switch account mid-session', () => {
    cy.mockWeb3Provider({ account: TEST_ACCOUNTS[0] })
    cy.visit('/fairwins')
    cy.get('body').should('be.visible')

    // Connect with account #0.
    cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 })
      .click()
    cy.selectInjectedConnector()
    cy.get('.wallet-account-button, button[aria-label="Wallet Account"]', { timeout: 10000 })
      .should('be.visible')

    // Switch to account #1 via the custom command.
    cy.switchAccount(1)

    // After reload, verify the page loaded. The address should update
    // (either reflected in the wallet dropdown or on the dashboard subtitle).
    cy.get('body', { timeout: 10000 }).should('be.visible')

    // The app may require re-connection after switchAccount (which reloads).
    // Verify the page is in a valid state — either showing account #1 address
    // or showing the connect button (for re-connection).
    cy.get('body').then(($body) => {
      const accountBtn = $body.find('.wallet-account-button, button[aria-label="Wallet Account"]')
      const connectBtn = $body.find('.wallet-connect-button, button[aria-label="Connect Wallet"]')
      expect(accountBtn.length > 0 || connectBtn.length > 0).to.be.true
    })
  })
})
