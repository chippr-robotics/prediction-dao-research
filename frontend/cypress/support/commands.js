// ***********************************************
// FairWins E2E Test Custom Commands
//
// Provides wallet mocking, navigation, form helpers,
// and Hardhat node interaction for E2E testing.
// ***********************************************

const TEST_ACCOUNTS = [
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // #0 Creator / Admin
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', // #1 Opponent
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', // #2 Arbitrator
  '0x90F79bf6EB2c4f870365E785982E1f101E93b906', // #3 Guardian / Moderator
  '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', // #4 Bystander
]

/**
 * Inject a mock Web3 provider into the page.
 * Call BEFORE cy.visit() to ensure provider is available when the app loads.
 */
Cypress.Commands.add('mockWeb3Provider', (options = {}) => {
  const networkId = options.networkId || Cypress.env('NETWORK_ID') || 1337
  const rpcUrl = options.rpcUrl || Cypress.env('RPC_URL') || 'http://localhost:8545'
  const initialAccount = options.account || TEST_ACCOUNTS[0]
  /*
   * A real injected wallet reports NO accounts until the site has been authorised: `eth_accounts`
   * returns [] and only `eth_requestAccounts` (the user pressing Connect) grants access.
   *
   * This mock used to return the account for BOTH, which made it look permanently pre-authorised.
   * That was invisible while the mock itself was undiscoverable — but once it announces over
   * EIP-6963 (issue #1016), wagmi finds it, sees a non-empty eth_accounts, and AUTO-CONNECTS on
   * load. The app then renders the connected header, `.wallet-connect-button` never exists, and
   * specs written to click Connect fail on a UI that skipped straight past them.
   *
   * So the default is now honestly disconnected. Pass `{ preAuthorized: true }` for a spec that
   * wants a restored session.
   */
  let authorized = options.preAuthorized === true

  let activeAccount = initialAccount

  cy.on('window:before:load', (win) => {
    // Suppress the dev banner so its fixed-position overlay doesn't cover
    // interactive elements in tests.
    try {
      win.localStorage.setItem('dev_warning_banner_dismissed', 'true')
    } catch { /* localStorage may be unavailable; ignore */ }

    win.ethereum = {
      isMetaMask: true,
      selectedAddress: activeAccount,
      networkVersion: networkId.toString(),
      chainId: `0x${networkId.toString(16)}`,

      request: ({ method, params }) => {
        return new Promise((resolve, reject) => {
          switch (method) {
            case 'eth_requestAccounts':
              // The user pressing Connect. Grants access for the rest of this page load.
              authorized = true
              resolve([activeAccount])
              break
            case 'eth_accounts':
              // Silent probe on load — empty until authorised, exactly like a real wallet.
              resolve(authorized ? [activeAccount] : [])
              break
            case 'eth_chainId':
              resolve(`0x${networkId.toString(16)}`)
              break
            case 'wallet_switchEthereumChain':
              resolve(null)
              break
            case 'wallet_addEthereumChain':
              resolve(null)
              break
            case 'net_version':
              resolve(networkId.toString())
              break
            case 'eth_getBalance':
              resolve('0x56bc75e2d63100000') // 100 ETH
              break
            case 'personal_sign':
            case 'eth_sign':
              // Deterministic PER-ACCOUNT signature. encryption.js derives keys via
              // keccak256(toUtf8Bytes(signature)) and never verifies the signature,
              // so any account-distinct deterministic value yields per-account keys
              // (a same-for-all value would let a non-participant decrypt). Expand
              // the 40-hex-char account to a 65-byte (130-hex) value.
              resolve('0x' + activeAccount.slice(2).toLowerCase().repeat(4).slice(0, 130))
              break
            default:
              fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: 1,
                  method,
                  params: params || []
                })
              })
              .then(r => r.json())
              .then(data => {
                // Propagate JSON-RPC errors as a real rejection (EIP-1193 shape)
                // so viem/ethers can handle reverts/estimateGas failures instead
                // of receiving `undefined`. This is what makes write txs work:
                // a reverting eth_estimateGas now rejects (ethers retries/falls
                // back) and eth_sendTransaction surfaces real errors.
                if (data && data.error) {
                  const e = new Error(data.error.message || 'RPC error')
                  e.code = data.error.code
                  e.data = data.error.data
                  reject(e)
                } else {
                  resolve(data.result)
                }
              })
              .catch(err => reject(err))
          }
        })
      },

      enable: () => Promise.resolve([activeAccount]),
      send: (method, params) => win.ethereum.request({ method, params }),

      /*
       * Switch the connected account the way a real wallet does — mutate the LIVE provider and
       * emit `accountsChanged`. Used by cy.switchAccount.
       *
       * The old cy.switchAccount called cy.mockWeb3Provider() again and reloaded. That registered a
       * SECOND `window:before:load` handler; both ran on reload, the later one won, and it carried
       * a fresh `authorized = false`. Probed result: the provider reported `eth_accounts: []` while
       * the UI still displayed account 0 — the app showed a stale account while the provider said
       * disconnected, and every post-switch assertion in 05-wager-acceptance was reading the wrong
       * account. Reloading is also not what a switch does: a real member switches in MetaMask and
       * the live page follows.
       */
      __cySetAccount: (next) => {
        activeAccount = next
        win.ethereum.selectedAddress = next
        authorized = true
        const cbs = (win.ethereum._callbacks && win.ethereum._callbacks.accountsChanged) || []
        cbs.forEach((cb) => cb([next]))
      },

      on: (event, callback) => {
        win.ethereum._callbacks = win.ethereum._callbacks || {}
        win.ethereum._callbacks[event] = win.ethereum._callbacks[event] || []
        win.ethereum._callbacks[event].push(callback)
      },
      removeListener: (event, callback) => {
        if (win.ethereum._callbacks && win.ethereum._callbacks[event]) {
          win.ethereum._callbacks[event] = win.ethereum._callbacks[event]
            .filter(cb => cb !== callback)
        }
      },
      removeAllListeners: (event) => {
        if (win.ethereum._callbacks) {
          if (event) delete win.ethereum._callbacks[event]
          else win.ethereum._callbacks = {}
        }
      }
    }

    /*
     * ANNOUNCE THE PROVIDER OVER EIP-6963 (issue #1016).
     *
     * Setting `window.ethereum` alone is no longer enough. This app uses wagmi 3
     * (src/wagmi.js -> injected({ shimDisconnect: true })), which discovers wallets through
     * EIP-6963 announcements via mipd — it never inspects window.ethereum to build the connector
     * list. So the mock was invisible: ConnectModal rendered no available `.connector-option`,
     * every wallet spec failed with "Expected to find element .connector-option:not(.unavailable)",
     * and it had been that way since the wagmi migration — silently, because the E2E gate could
     * not fail (fixed in #1015).
     *
     * The contract is exactly mipd's (node_modules/mipd/dist/esm/utils.js):
     *   · dispatch `eip6963:announceProvider` with a FROZEN { info, provider } detail
     *   · keep answering `eip6963:requestProvider`, because the app requests on mount — which is
     *     after this hook runs, so a single fire-and-forget announcement would be missed
     *
     * Events go through `win`, not Cypress's own window: this is the application's realm.
     */
    const detail = Object.freeze({
      info: Object.freeze({
        // A stable uuid keeps the connector identity stable across re-announcements within a spec.
        uuid: '00000000-0000-4000-8000-0000000f1a17',
        name: 'MetaMask',
        // rdns is what wagmi keys the connector on; io.metamask matches the mock's isMetaMask.
        rdns: 'io.metamask',
        // Inline SVG: EIP-6963 requires a data URI, and a remote icon would be a network
        // dependency in a test.
        icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
      }),
      provider: win.ethereum,
    })

    const announce = () => {
      try {
        win.dispatchEvent(new win.CustomEvent('eip6963:announceProvider', { detail }))
      } catch { /* realm torn down mid-test; nothing to announce to */ }
    }
    win.addEventListener('eip6963:requestProvider', announce)
    announce()
  })
})

/**
 * Switch to a different Hardhat test account by index (0-4).
 * Re-initializes the mock provider and reloads the page.
 */
Cypress.Commands.add('switchAccount', (accountIndex) => {
  const account = TEST_ACCOUNTS[accountIndex]
  if (!account) throw new Error(`Invalid account index: ${accountIndex}`)

  cy.window().then((win) => {
    if (!win.ethereum || typeof win.ethereum.__cySetAccount !== 'function') {
      throw new Error('switchAccount: cy.mockWeb3Provider() must run before the visit')
    }
    win.ethereum.__cySetAccount(account)
  })

  // The app must FOLLOW the switch. Account switching is a core feature, so prove it landed
  // rather than assuming the event was honoured.
  cy.assertActiveAccount(account)
})

/**
 * Assert which account the app currently believes is connected.
 *
 * The address renders only INSIDE the opened account dropdown (WalletButton.jsx puts
 * `.account-address-value` behind `{isOpen && ...}`), so this opens it, checks, and closes it
 * again — leaving the UI as it found it.
 */
Cypress.Commands.add('assertActiveAccount', (address) => {
  const short = `${address.slice(0, 6)}`
  cy.get('.wallet-account-button', { timeout: 10000 }).should('be.visible').click()
  cy.get('.account-address-value', { timeout: 10000 })
    .invoke('text')
    .should((t) => {
      expect(t.toLowerCase(), `connected account should be ${address}`).to.include(short.toLowerCase())
    })
  cy.get('.wallet-account-button').click()
})

/**
 * Wait for wallet connection UI to appear.
 */
Cypress.Commands.add('waitForWalletConnection', () => {
  /*
   * Wait for the CONNECTED INDICATOR, not for the address text.
   *
   * This helper waited on `[data-testid="wallet-address"], .wallet-address, .connected-wallet`.
   * The first of those has never existed in the app (`git log -S` finds no commit that added it),
   * and the address text itself only renders INSIDE the account dropdown — WalletButton.jsx puts
   * `.account-address-value` behind `{isOpen && ...}`. So the helper waited ten seconds for
   * something that appears only after a click it never makes, and every spec that connects a
   * wallet failed on it. That single helper accounted for 28 of the suite's failures.
   *
   * `.wallet-account-button` IS the connected state: WalletButton renders it in place of the
   * connect button as soon as an account is present.
   */
  cy.get('.wallet-account-button, button[aria-label="Wallet Account"]', { timeout: 10000 })
    .should('be.visible')
})

/**
 * Connect wallet via the UI connect button.
 */
Cypress.Commands.add('connectWallet', () => {
  cy.window().then((win) => {
    if (!win.ethereum) {
      cy.mockWeb3Provider()
    }
  })

  cy.contains('button', /connect wallet/i, { timeout: 10000 })
    .should('be.visible')
    .should('not.be.disabled')
    .click({ force: true })

  /*
   * Clicking "Connect Wallet" only OPENS ConnectModal — it does not connect anything.
   * Something has to choose a connector from the dialog, and this helper never did, so
   * `waitForWalletConnection` below sat waiting on a connection nobody had initiated.
   * Every one of the 14 `cy.connectWallet()` call sites failed on it.
   *
   * The specs that connect successfully are precisely the ones that drive the dialog
   * themselves via `cy.selectInjectedConnector()`; this makes the helper do the same.
   */
  cy.selectInjectedConnector()

  cy.waitForWalletConnection()
})

/**
 * Verify the connected network chain ID.
 */
Cypress.Commands.add('verifyNetwork', (expectedChainId = 1337) => {
  cy.window().then((win) => {
    if (win.ethereum) {
      return win.ethereum.request({ method: 'eth_chainId' })
    }
  }).then((chainId) => {
    const numericChainId = parseInt(chainId, 16)
    expect(numericChainId).to.equal(expectedChainId)
  })
})

/*
 * WAGERS_PATH, inlined from src/config/appNav.js:74.
 *
 * Deliberately NOT imported: appNav.js -> config/tenant.js imports the Vite virtual module
 * `virtual:tenant`, and the Cypress preprocessor has no plugin that can resolve it — importing it
 * fails the whole spec bundle. src/test/ guards the real value; this is a copy under test.
 */
const WAGERS_PATH = '/wallet?tab=paytransfer&view=wagers'

/*
 * Resolution-type labels, from FriendMarketsModal.jsx RESOLUTION_TYPE_LABELS. Keyed by the numeric
 * ResolutionType so specs can keep passing the enum value they always passed.
 */
const RESOLUTION_TYPE_LABELS = {
  0: 'Either of Us (equal stakes)',
  1: 'Me (Creator)',
  2: 'Them (Opponent)',
  3: 'A Friend (Arbitrator)',
  4: 'An Oracle (Polymarket)',
}

/**
 * Choose who can resolve the wager.
 *
 * The control is a `PillSelect` — `role="radiogroup"` of `role="radio"` BUTTONS — not a `<select>`,
 * so `.select()` could never drive it. Specs targeted `#fm-resolution-type, .fm-select`; neither
 * string appears in any `.jsx` in the app. Click the pill by its visible label instead.
 *
 * @param {number|string} type ResolutionType enum value, or the label itself
 */
Cypress.Commands.add('selectResolutionType', (type) => {
  const label = RESOLUTION_TYPE_LABELS[type] || type
  cy.contains('[role="radiogroup"] [role="radio"]', label, { timeout: 10000 })
    .click({ force: true })
    .should('have.attr', 'aria-checked', 'true')
})

/**
 * Visit the wager surface.
 *
 * Spec 073 moved wager creation off `/fairwins` (which still exists and renders HomeScreen) to
 * Finance > Transfer > Wagers. Every quick-action card — Friends Decide, Oracle Settles, Make an
 * Offer, My Wagers — is rendered by Dashboard, and Dashboard is mounted ONLY by PayTransferPanel
 * under `?view=wagers`. Specs that kept visiting /fairwins were asking a page that had stopped
 * hosting those controls to produce them.
 */
Cypress.Commands.add('visitWagers', () => {
  cy.visit(WAGERS_PATH)
  cy.get('body', { timeout: 10000 }).should('be.visible')
})

/**
 * Navigate to the FairWins dashboard and verify it loaded.
 */
Cypress.Commands.add('navigateToDashboard', () => {
  cy.visit('/fairwins')
  cy.get('body', { timeout: 10000 }).should('be.visible')
})

/**
 * Navigate to a path and verify the URL matches.
 */
Cypress.Commands.add('navigateAndVerify', (path, urlPattern) => {
  cy.visit(path)
  cy.url().should('match', urlPattern || new RegExp(path))
})

/**
 * Open the wager creation modal for a specific type.
 * Group wagers are no longer supported — the v2 contract is 1v1 only. The
 * 1v1 flow is split into participant-resolved ("Friends Decide") and
 * oracle-resolved ("Oracle Settles") cards.
 * @param {'oneVsOne'|'oracle'|'offer'} type
 */
Cypress.Commands.add('openCreateWagerModal', (type = 'oneVsOne') => {
  const buttonMap = {
    oneVsOne: /friends decide|1v1|create wager/i,
    oracle: /oracle settles/i,
    offer: /make an offer/i,
  }

  const pattern = buttonMap[type] || buttonMap.oneVsOne
  cy.contains('button, [role="button"]', pattern, { timeout: 10000 })
    .should('be.visible')
    .click({ force: true })

  cy.get('[role="dialog"], .modal', { timeout: 5000 }).should('be.visible')
})

/**
 * Fill the wager creation form with the given configuration.
 */
/*
 * Lead with the ids FriendMarketsModal actually renders (#fm-description, #fm-opponent,
 * #fm-stake), the way cy.attemptCreateWager already does.
 *
 * The `[data-testid="wager-*"]` selectors these led with have never existed in the app, and for
 * DESCRIPTION every fallback missed too: the field is an `<input type="text">`, so
 * `textarea[name="description"]` and the bare `textarea` matched nothing and five CRE tests
 * failed on it. Opponent and stake only worked by falling through to their THIRD alternative,
 * which is why the same defect stayed invisible in those two.
 */
Cypress.Commands.add('fillWagerForm', (config = {}) => {
  if (config.opponent) {
    cy.get('#fm-opponent, [role="dialog"] input[placeholder*="0x"]')
      .first()
      .clear()
      .type(config.opponent)
  }

  if (config.description) {
    cy.get('#fm-description, [role="dialog"] input[type="text"]')
      .first()
      .clear()
      .type(config.description)
  }

  /*
   * `!= null` rather than a truthiness check: `stake: 0` is FALSY, so the old guard silently
   * skipped the keypad and left the field on WAGER_DEFAULTS.STAKE_AMOUNT ('10'). CRE-21, the test
   * named "zero stake shows validation error", therefore submitted a stake of ten and had never
   * once entered a zero. The keypad itself handles '0' correctly. (#1019)
   */
  if (config.stake != null) {
    cy.enterAmountViaKeypad('fm-stake', config.stake)
  }
})

/**
 * Enter an amount into an AmountKeypad.
 *
 * The stake field is NOT a text input — `AmountKeypad` renders `role="group"` with one button
 * per digit and no `<input>` anywhere, so `.type()` could never drive it and every selector that
 * assumed one (`#fm-stake`, `input[type="number"]`) matched nothing. The `id` passed to the
 * component is a BASE id: it renders `#<base>-hero` for the display and `#<base>-key-<digit>`,
 * `-key-decimal`, `-key-back` for the pad.
 *
 * @param {string} baseId  the id given to AmountKeypad, e.g. 'fm-stake'
 * @param {string|number} amount  digits and at most one '.'
 */
Cypress.Commands.add('enterAmountViaKeypad', (baseId, amount) => {
  const text = String(amount)
  if (!/^\d*\.?\d*$/.test(text)) {
    throw new Error(`enterAmountViaKeypad: "${text}" is not a plain decimal amount`)
  }

  cy.get(`#${baseId}-hero`, { timeout: 10000 }).should('exist')

  // Clear whatever is there. The pad has no "clear", only backspace, and the display is capped
  // well under 20 digits — pressing back past empty is a no-op, so this is safe to over-press.
  cy.get(`#${baseId}-key-back`).then(($back) => {
    for (let i = 0; i < 20; i += 1) cy.wrap($back).click({ force: true })
  })

  for (const ch of text) {
    const keyId = ch === '.' ? `${baseId}-key-decimal` : `${baseId}-key-${ch}`
    cy.get(`#${keyId}`).click({ force: true })
  }
})

/**
 * Open My Wagers modal and navigate to the specified tab.
 * @param {'participating'|'created'|'history'} tab
 */
Cypress.Commands.add('openMyWagers', (tab = 'participating') => {
  cy.contains('button, [role="button"]', /my wagers/i, { timeout: 10000 })
    .should('be.visible')
    .click({ force: true })

  cy.get('[role="dialog"], .modal', { timeout: 5000 }).should('be.visible')

  if (tab !== 'participating') {
    cy.contains('button, [role="tab"]', new RegExp(tab, 'i'))
      .click({ force: true })
  }
})

/**
 * Wait for the TransactionProgress component to complete.
 */
Cypress.Commands.add('waitForTx', () => {
  cy.get('[data-testid="tx-progress"], .transaction-progress', { timeout: 30000 })
    .should('exist')

  cy.contains(/complete|confirmed|success/i, { timeout: 30000 })
    .should('be.visible')
})

/**
 * Assert a toast notification appeared with the given type and message pattern.
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {string|RegExp} message
 */
Cypress.Commands.add('assertToast', (type, message) => {
  const toastSelector = `[role="alert"], .toast, .notification, [class*="toast"]`

  cy.get(toastSelector, { timeout: 10000 })
    .should('be.visible')
    .and('contain.text', message instanceof RegExp ? undefined : message)

  if (message instanceof RegExp) {
    cy.get(toastSelector).invoke('text').should('match', message)
  }
})

/**
 * Advance Hardhat node time by the specified seconds.
 * Only works when connected to a real Hardhat node.
 */
Cypress.Commands.add('advanceTime', (seconds) => {
  const rpcUrl = Cypress.env('RPC_URL') || 'http://localhost:8545'

  // 1. The CHAIN clock — what the contracts see.
  cy.request({
    method: 'POST',
    url: rpcUrl,
    body: {
      jsonrpc: '2.0',
      id: 1,
      method: 'evm_increaseTime',
      params: [seconds]
    }
  })

  cy.request({
    method: 'POST',
    url: rpcUrl,
    body: {
      jsonrpc: '2.0',
      id: 2,
      method: 'evm_mine',
      params: []
    }
  })

  /*
   * 2. The BROWSER clock — what the UI sees.
   *
   * evm_increaseTime moves the chain only. Every expiry decision in the app is browser-time
   * (`computedStatus` flips to EXPIRED on `Date.now() > acceptDeadline`, and the countdown tiles
   * tick off the same source), so a spec that advanced the chain past a deadline and then asserted
   * the UI said "Expired" was waiting on a clock nothing had moved. That is why the deadline tests
   * could not pass.
   *
   * Shift Date by the same offset inside the app realm. A cumulative offset rather than a frozen
   * clock, so intervals keep firing and the UI re-renders on its own — cy.clock() would stop them.
   */
  cy.window().then((win) => {
    if (!win.__cyTimeShim) {
      const RealDate = win.Date
      const realNow = RealDate.now.bind(RealDate)
      win.__cyTimeOffsetMs = 0

      function ShiftedDate(...args) {
        if (args.length === 0) return new RealDate(realNow() + win.__cyTimeOffsetMs)
        return new RealDate(...args)
      }
      ShiftedDate.prototype = RealDate.prototype
      ShiftedDate.now = () => realNow() + win.__cyTimeOffsetMs
      ShiftedDate.parse = RealDate.parse
      ShiftedDate.UTC = RealDate.UTC
      win.Date = ShiftedDate
      win.__cyTimeShim = true
    }
    win.__cyTimeOffsetMs += seconds * 1000
  })
})

/**
 * Basic accessibility checks: img alt text, button labels.
 */
Cypress.Commands.add('checkA11y', () => {
  cy.get('body').should('be.visible')

  cy.get('img:visible').then(($imgs) => {
    if ($imgs.length > 0) {
      $imgs.each((index, img) => {
        const $img = Cypress.$(img)
        if ($img.is(':visible')) {
          expect($img.attr('alt')).to.exist
        }
      })
    }
  })

  cy.get('button:visible').then(($btns) => {
    if ($btns.length > 0) {
      $btns.each((index, btn) => {
        const $btn = Cypress.$(btn)
        const hasText = $btn.text().trim().length > 0
        const hasAriaLabel = $btn.attr('aria-label')
        const hasAriaLabelledBy = $btn.attr('aria-labelledby')
        expect(hasText || hasAriaLabel || hasAriaLabelledBy).to.be.true
      })
    }
  })
})

// ***********************************************
// Precondition helpers (chain 1337 setup) — see
// specs/001-cypress-e2e-flows/contracts/test-helpers.md.
// These send admin transactions to the local Hardhat node via the `chainTx`
// task (cypress.config.js) to arrange on-chain state the UI can't set, or that
// is faster to set directly. Account #0 holds all admin roles locally.
// ***********************************************

/** Pause / unpause the WagerRegistry (Guardian = #0). Idempotent. */
Cypress.Commands.add('setProtocolPaused', (paused) => {
  return cy.task('chainTx', { action: paused ? 'pause' : 'unpause' }).then((r) => {
    expect(r.ok, 'setProtocolPaused tx ok').to.be.true
    return r
  })
})

/** Freeze / unfreeze an account (Moderator = #0). */
Cypress.Commands.add('setAccountFrozen', (address, frozen) => {
  return cy.task('chainTx', {
    action: frozen ? 'freeze' : 'unfreeze',
    args: { address },
  }).then((r) => {
    expect(r.ok, 'setAccountFrozen tx ok').to.be.true
    return r
  })
})

/** Grant a WAGER_PARTICIPANT membership (ROLE_MANAGER = #0). */
Cypress.Commands.add('grantMembershipFor', (address, { tier = 1, durationDays = 30 } = {}) => {
  return cy.task('chainTx', {
    action: 'grantMembership',
    args: { address, tier, durationDays },
  }).then((r) => {
    expect(r.ok, 'grantMembershipFor tx ok').to.be.true
    return r
  })
})

/** Resolve a MockPolymarketCTF condition. payouts: [1,0]=YES, [0,1]=NO, [1,1]=tie. */
Cypress.Commands.add('resolveMockCondition', (conditionId, payouts) => {
  return cy.task('chainTx', {
    action: 'resolveCondition',
    args: { conditionId, payouts },
  }).then((r) => {
    expect(r.ok, 'resolveMockCondition tx ok').to.be.true
    return r
  })
})

/** Latest wager id (nextWagerId - 1) for status/winner assertions. */
Cypress.Commands.add('lastWagerId', () => {
  return cy.task('lastWagerId')
})

/**
 * Restore global state a spec may have changed so the shared node is clean for
 * later specs. Call in afterEach. Unpauses the protocol and unfreezes the given
 * accounts (defaults to all five test accounts).
 */
Cypress.Commands.add('restoreGlobalState', (accounts = TEST_ACCOUNTS) => {
  cy.task('chainTx', { action: 'unpause' })
  accounts.forEach((address) => cy.task('chainTx', { action: 'unfreeze', args: { address } }))
})

/** Read KeyRegistry: has this account registered an encryption key? */
Cypress.Commands.add('hasRegisteredKey', (address) => {
  return cy.task('chainTx', { action: 'hasKey', args: { address } }).then((r) => r.registered)
})

/**
 * Register the connected account's encryption key via the WalletPage Security tab.
 * Idempotent — if already registered, it just confirms. Polls KeyRegistry until
 * the key is on-chain. The connected account must already be connected (the mock
 * provides per-account signatures so the registered key is account-specific).
 */
Cypress.Commands.add('registerEncryptionKeyViaUI', (address) => {
  cy.visit('/wallet')
  cy.contains('button', /security/i, { timeout: 10000 }).click()
  cy.get('body', { timeout: 10000 }).then(($b) => {
    if (/register encryption key/i.test($b.text())) {
      cy.contains('button', /register encryption key/i).click()
    }
  })
  const poll = (n) => cy.task('chainTx', { action: 'hasKey', args: { address } }).then((r) => {
    if (r.registered) return cy.wrap(true)
    if (n <= 0) throw new Error(`encryption key not registered for ${address}`)
    cy.wait(1000)
    return poll(n - 1)
  })
  return poll(30)
})

/** Mint a large stake-token balance to an account (so create/accept never reverts). */
Cypress.Commands.add('fundAccount', (address) => {
  return cy.task('chainTx', { action: 'fund', args: { address } }).then((r) => {
    expect(r.ok, 'fundAccount tx ok').to.be.true
    return r
  })
})

/** Connect the mocked wallet as `account` and reach the app. */
Cypress.Commands.add('connectAs', (account) => {
  cy.mockWeb3Provider({ account })
  cy.visit('/fairwins')
  cy.get('body', { timeout: 10000 }).should('be.visible')
  cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 }).click()
  /*
   * `.connector-option` survives ONLY in WalletButton.css — the JSX was renamed to
   * `.connect-modal__option` and the stylesheet was never cleaned up, so this selector
   * has matched nothing since the rename. Route through the one helper that knows the
   * real class instead of keeping a second, drifting copy of it.
   */
  cy.selectInjectedConnector()
  cy.get('.wallet-account-button, button[aria-label="Wallet Account"]', { timeout: 10000 }).should('be.visible')
})

/**
 * Open the create modal, fill it, disable privacy, and submit — WITHOUT asserting
 * success. Use for "blocked" cases (paused / frozen / expired membership) where
 * the create should NOT produce a wager; assert lastWagerId is unchanged after.
 */
Cypress.Commands.add('attemptCreateWager', (cfg = {}) => {
  const o = { description: 'E2E automated wager flow', opponent: TEST_ACCOUNTS[1], stake: 2, ...cfg }
  cy.openCreateWagerModal('oneVsOne')
  cy.get('#fm-description, [role="dialog"] input[type="text"]').first().clear().type(o.description)
  cy.get('#fm-opponent, [role="dialog"] input[placeholder*="0x"]').first().clear().type(o.opponent)
  cy.wait(300)
  cy.enterAmountViaKeypad('fm-stake', o.stake)
  cy.get('.fm-encryption-toggle input[type="checkbox"]').then(($e) => {
    if ($e.length && $e.is(':checked')) cy.wrap($e.first()).uncheck({ force: true })
  })
  cy.get('[role="dialog"], .modal').find('button').filter(':contains("Create")').click({ force: true })
})

/** Poll lastWagerId until it reaches `target` (default ~40s). Yields the id. */
Cypress.Commands.add('waitForWagerId', (target, tries = 40) => {
  const check = (remaining) => cy.task('lastWagerId').then((id) => {
    if (id >= target) return cy.wrap(id)
    if (remaining <= 0) throw new Error(`wager ${target} not created (last=${id})`)
    cy.wait(1000)
    return check(remaining - 1)
  })
  return check(tries)
})

/**
 * Create a 1v1 wager through the real UI as the connected account, and confirm
 * it landed on-chain (polls the wager count — robust to success-copy wording).
 * The creator must already be funded + approved + a member (e.g. via the same
 * fund/approve/grant the spec does for createAndAcceptWager). "Private Wager" is
 * turned off so the create flow doesn't block on an IPFS upload (no IPFS in tests).
 */
Cypress.Commands.add('createWagerViaUI', (cfg = {}) => {
  // description must be >= 10 chars (form validation)
  const o = { description: 'E2E automated wager flow', opponent: TEST_ACCOUNTS[1], stake: 2, resolutionType: 0, ...cfg }
  cy.lastWagerId().then((before) => {
    cy.openCreateWagerModal('oneVsOne')
    cy.get('#fm-description, [role="dialog"] input[type="text"]').first().clear().type(o.description)
    cy.get('#fm-opponent, [role="dialog"] input[placeholder*="0x"]').first().clear().type(o.opponent)
    cy.wait(300)
    cy.enterAmountViaKeypad('fm-stake', o.stake)
    if (o.resolutionType !== undefined) {
      cy.get('#fm-resolution-type, [role="dialog"] .fm-select').first().select(String(o.resolutionType))
    }
    // Set a far-future end date (~20 days, within the 21-day max) so acceptDeadline
    // (the midpoint) stays well ahead of the chain clock even after a spec advances
    // time — otherwise the UI computes deadlines from browser time and the create
    // reverts with BadDeadlines once the chain is ahead.
    const end = new Date(Date.now() + 20 * 24 * 3600 * 1000)
    const p2 = (n) => String(n).padStart(2, '0')
    const dtl = `${end.getFullYear()}-${p2(end.getMonth() + 1)}-${p2(end.getDate())}T${p2(end.getHours())}:${p2(end.getMinutes())}`
    cy.get('#fm-end-date').then(($d) => { if ($d.length) cy.wrap($d).clear().type(dtl) })
    cy.get('.fm-encryption-toggle input[type="checkbox"]').then(($e) => {
      if ($e.length && $e.is(':checked')) cy.wrap($e.first()).uncheck({ force: true })
    })
    cy.get('[role="dialog"], .modal').find('button').filter(':contains("Create")').click({ force: true })
    cy.waitForWagerId(before + 1)
  })
})

/**
 * Mock the IPFS (Pinata) boundary: store uploaded JSON in-memory and serve it back
 * on fetch, so the app's real encrypt → store → retrieve → decrypt round-trip runs
 * without a network. Call BEFORE cy.visit. `{ failFetch:true }` makes gateway reads
 * return 500 (to drive the graceful-error path). CIDs are valid CIDv0 strings.
 */
// Module-level IPFS store: persists across tests in a spec so a private wager can
// be created once (uploads stored here) and decrypted in a later test (fetched here).
const __ipfsStore = {}
let __ipfsCounter = 0
Cypress.Commands.add('interceptIpfs', (opts = {}) => {
  const mkCid = () => 'Qm' + String(1000 + __ipfsCounter++).split('').map((c) => 'abcdefghij'[+c]).join('') + 'a'.repeat(40)
  cy.intercept('POST', '**/pinJSONToIPFS', (req) => {
    const cid = mkCid()
    const content = (req.body && req.body.pinataContent) || req.body
    __ipfsStore[cid] = content
    req.reply({ statusCode: 200, body: { IpfsHash: cid, PinSize: 1, Timestamp: '2026-01-01T00:00:00Z' } })
  }).as('ipfsUpload')
  cy.intercept('GET', '**/ipfs/*', (req) => {
    if (opts.failFetch) { req.reply({ statusCode: 500, body: 'mock IPFS unreachable' }); return }
    const cid = req.url.split('/ipfs/')[1].split(/[?#/]/)[0]
    if (__ipfsStore[cid]) req.reply({ statusCode: 200, body: __ipfsStore[cid] })
    else req.reply({ statusCode: 404, body: 'not found' })
  }).as('ipfsFetch')
})

/**
 * Create a 1v1 PRIVATE (encrypted) wager through the UI — leaves the "Private
 * Wager" toggle ON. Requires `interceptIpfs()` active and BOTH parties to have a
 * registered encryption key (creator and `opponent`). Confirms the wager landed
 * and its metadataUri is an `encrypted:ipfs` reference. Yields the wagerId.
 */
Cypress.Commands.add('createPrivateWagerViaUI', (cfg = {}) => {
  const o = { description: 'E2E private encrypted wager', opponent: TEST_ACCOUNTS[1], stake: 2, ...cfg }
  cy.lastWagerId().then((before) => {
    cy.openCreateWagerModal('oneVsOne')
    cy.get('#fm-description, [role="dialog"] input[type="text"]').first().clear().type(o.description)
    cy.get('#fm-opponent, [role="dialog"] input[placeholder*="0x"]').first().clear().type(o.opponent)
    cy.wait(300)
    cy.enterAmountViaKeypad('fm-stake', o.stake)
    const end = new Date(Date.now() + 20 * 24 * 3600 * 1000)
    const p2 = (n) => String(n).padStart(2, '0')
    const dtl = `${end.getFullYear()}-${p2(end.getMonth() + 1)}-${p2(end.getDate())}T${p2(end.getHours())}:${p2(end.getMinutes())}`
    cy.get('#fm-end-date').then(($d) => { if ($d.length) cy.wrap($d).clear().type(dtl) })
    // Leave the encryption toggle ON (do NOT uncheck).
    cy.get('[role="dialog"], .modal').find('button').filter(':contains("Create")').click({ force: true })
    // The encrypted metadata is uploaded to (mocked) IPFS during create.
    cy.wait('@ipfsUpload', { timeout: 30000 }).its('response.statusCode').should('eq', 200)
    cy.waitForWagerId(before + 1).then((id) => {
      cy.task('chainTx', { action: 'wagerInfo', args: { wagerId: id } }).then((i) => {
        expect(i.metadataUri, 'encrypted metadata reference').to.match(/^encrypted:ipfs/)
      })
      return cy.wrap(id)
    })
  })
})

/**
 * Set up a wager directly on-chain (reliable) so specs can assert UI behavior on
 * it. Funds + approves + grants membership for both parties, then createWager and
 * (unless {accept:false}) acceptWager via the chainTx task. Yields the wagerId.
 *
 * cfg: { creatorIndex=0, opponentIndex=1, resolutionType=0, creatorIsYes,
 *        conditionId, acceptIn, resolveIn, stake, accept }
 */
Cypress.Commands.add('createAndAcceptWager', (cfg = {}) => {
  const creatorIndex = cfg.creatorIndex ?? 0
  const opponentIndex = cfg.opponentIndex ?? 1
  const creator = TEST_ACCOUNTS[creatorIndex]
  const opponent = TEST_ACCOUNTS[opponentIndex]
  cy.task('chainTx', { action: 'fund', args: { address: creator } })
  cy.task('chainTx', { action: 'fund', args: { address: opponent } })
  cy.task('chainTx', { action: 'approve', args: { index: creatorIndex } })
  cy.task('chainTx', { action: 'approve', args: { index: opponentIndex } })
  cy.task('chainTx', { action: 'grantMembership', args: { address: creator, tier: 4, durationDays: 365 } })
  cy.task('chainTx', { action: 'grantMembership', args: { address: opponent, tier: 4, durationDays: 365 } })
  return cy.task('chainTx', { action: 'createWager', args: { ...cfg, creatorIndex, opponent } }).then((r) => {
    expect(r.ok, 'createWager ok').to.be.true
    if (cfg.accept === false) return cy.wrap(r.wagerId)
    return cy.task('chainTx', { action: 'acceptWager', args: { opponentIndex, wagerId: r.wagerId } }).then((a) => {
      expect(a.ok, 'acceptWager ok').to.be.true
      return cy.wrap(r.wagerId)
    })
  })
})

/* ------------------------------------------------------------------------- *
 * Entry gate (spec 007 US4) — bypass by default (spec 075)
 * ------------------------------------------------------------------------- *
 *
 * EntryGate is a full-screen compliance overlay that blocks the app until a visitor affirms
 * eligibility. It renders on mount whenever localStorage has no acknowledgement, so it covers the
 * UI in a fresh browser — which is every Cypress run.
 *
 * That is why the E2E suite went red the moment the gate was repaired to be able to fail (spec 075
 * US2): `cy.click()` reported "covered by another element: <div class='entry-gate-overlay'>" on
 * essentially every UI test. Reproduced locally at 11/11 failures in one spec. The tests were not
 * wrong and the app was not broken — nothing had ever told Cypress how to get past the gate,
 * and the muted gate meant nobody saw it.
 *
 * The acknowledgement MUST be seeded before the page loads: EntryGate reads it during the first
 * render, so a post-visit localStorage write is too late. `cy.visit` is overwritten rather than
 * adding a beforeEach to 20+ spec files, so a new spec is covered automatically.
 *
 * A spec that is genuinely TESTING the gate opts out per visit:
 *     cy.visit('/fairwins', { acknowledgeEntryGate: false })
 */
const ENTRY_GATE_ACK_KEY = 'fairwins.entryGate.ack.v1'

/** Shape mirrors utils/entryGateAck.js#writeAck; the app only requires a non-null record. */
const entryGateAckRecord = () => ({
  terms: 'cypress-e2e',
  risk: 'cypress-e2e',
  at: new Date(0).toISOString(),
})

Cypress.Commands.overwrite('visit', (originalFn, url, options = {}) => {
  const { acknowledgeEntryGate = true, autoDismissConnectModal = true, onBeforeLoad, ...rest } = options
  return originalFn(url, {
    ...rest,
    onBeforeLoad(win) {
      if (acknowledgeEntryGate) {
        try {
          win.localStorage.setItem(ENTRY_GATE_ACK_KEY, JSON.stringify(entryGateAckRecord()))
        } catch {
          /* storage disabled in this browser context — the spec will see the gate, which is honest */
        }
      } else {
        try {
          win.localStorage.removeItem(ENTRY_GATE_ACK_KEY)
        } catch { /* nothing to clear */ }
      }
      if (onBeforeLoad) onBeforeLoad(win)
    },
  }).then((win) => {
    /*
     * ...and dismiss the auto-opened connect modal.
     *
     * Acknowledging the gate is exactly what triggers AutoConnectPrompt: for a RETURNING,
     * disconnected visitor the app helpfully opens the connect dialog for them
     * (AutoConnectPrompt.jsx — "if (!isConnectModalOpen) openConnectModal()"). Correct product
     * behaviour, and it replaced the entry gate as the thing covering every button: the failure
     * message just changed from `.entry-gate-overlay` to `.connect-modal__backdrop`.
     *
     * These specs predate both surfaces and drive the connect flow themselves, so the harness
     * closes the auto-opened dialog and leaves the app in the state the tests were written
     * against. A spec that WANTS the prompt opts out with `autoDismissConnectModal: false`.
     *
     * Escape is used rather than clicking the backdrop: the backdrop is the element under test in
     * some specs, and ConnectModal binds Escape to the same `close` handler.
     */
    if (autoDismissConnectModal) {
      /*
       * The prompt opens ASYNCHRONOUSLY — AutoConnectPrompt waits for `connectionStatus` to settle,
       * and WalletContext waits for wallet detection before that. An immediate DOM check races it,
       * and even a short poll can finish BEFORE the dialog appears, which is exactly what happened
       * first time round: Escape fired at nothing and the modal opened a moment later.
       *
       * So: poll generously, dismiss, then confirm — and retry once, because "appeared, dismissed,
       * appeared again" is indistinguishable from "appeared late" without looking twice.
       * Tolerate it never appearing: a spec that is already connected never sees the prompt and
       * must not be delayed or failed by this.
       */
      const waitForBackdrop = (doc, ms) =>
        new Cypress.Promise((resolve) => {
          const deadline = Date.now() + ms
          const poll = () => {
            if (doc.querySelector('[data-testid="connect-modal-backdrop"]')) return resolve(true)
            if (Date.now() > deadline) return resolve(false)
            setTimeout(poll, 100)
          }
          poll()
        })

      cy.document({ log: false }).then((doc) =>
        waitForBackdrop(doc, 12000).then((appeared) => {
          if (!appeared) return undefined
          // Escape rather than clicking the backdrop: the backdrop is the element under test in
          // some specs, and ConnectModal binds Escape on `document` to the same `close` handler
          // (verified: a single Escape takes the backdrop count 1 -> 0).
          cy.get('body', { log: false }).type('{esc}')
          return cy.document({ log: false }).then((d2) =>
            waitForBackdrop(d2, 1500).then((stillThere) => {
              // Best-effort second attempt, then give up: a shared helper must never be the thing
              // that fails a spec. If the dialog will not close, the spec should say so in its own
              // words.
              if (stillThere) cy.get('body', { log: false }).type('{esc}')
            }),
          )
        }),
      )
    }
    return win
  })
})


/**
 * Select the mocked INJECTED wallet in the connect dialog (issue #1016).
 *
 * Specs used to do `.connect-modal__option:not(.unavailable)').first().click()` with a comment
 * saying "the first available injected connector (MetaMask)". That stopped being true: the dialog
 * now lists Passkey first (marked Recommended), then WalletConnect, then the injected wallet. So
 * `.first()` clicked Passkey — which needs a real platform authenticator, silently never connects,
 * and every "after connection..." assertion then failed on a UI that had not connected.
 *
 * Selecting by NAME instead of by position means a future reordering of the dialog cannot quietly
 * change which wallet the suite tests.
 *
 * Note the dialog can legitimately list the injected wallet twice — once from the EIP-6963
 * announcement and once from wagmi's generic injected connector — so this takes the first match
 * rather than asserting there is exactly one.
 */
Cypress.Commands.add('selectInjectedConnector', () => {
  cy.contains('.connect-modal__option:not(.unavailable)', /metamask|browser wallet|injected/i, {
    timeout: 10000,
  })
    .first()
    .click()
})
