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
  const account = options.account || TEST_ACCOUNTS[0]

  cy.on('window:before:load', (win) => {
    // Suppress the dev-warning modal/onboarding tutorial and the dev banner so
    // their fixed-position overlays don't cover interactive elements in tests.
    try {
      win.localStorage.setItem('dev_warning_modal_seen_v2', 'true')
      win.localStorage.setItem('dev_warning_banner_dismissed', 'true')
    } catch { /* localStorage may be unavailable; ignore */ }

    win.ethereum = {
      isMetaMask: true,
      selectedAddress: account,
      networkVersion: networkId.toString(),
      chainId: `0x${networkId.toString(16)}`,

      request: ({ method, params }) => {
        return new Promise((resolve, reject) => {
          switch (method) {
            case 'eth_requestAccounts':
            case 'eth_accounts':
              resolve([account])
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
              // Return a deterministic mock signature for key derivation
              resolve('0x' + 'ab'.repeat(65))
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
              .then(data => resolve(data.result))
              .catch(err => reject(err))
          }
        })
      },

      enable: () => Promise.resolve([account]),
      send: (method, params) => win.ethereum.request({ method, params }),

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
  })
})

/**
 * Switch to a different Hardhat test account by index (0-4).
 * Re-initializes the mock provider and reloads the page.
 */
Cypress.Commands.add('switchAccount', (accountIndex) => {
  const account = TEST_ACCOUNTS[accountIndex]
  if (!account) throw new Error(`Invalid account index: ${accountIndex}`)

  cy.mockWeb3Provider({ account })
  cy.reload()
  cy.get('body', { timeout: 10000 }).should('be.visible')
})

/**
 * Wait for wallet connection UI to appear.
 */
Cypress.Commands.add('waitForWalletConnection', () => {
  cy.get('[data-testid="wallet-address"], .wallet-address, .connected-wallet', { timeout: 10000 })
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
 * Enable demo mode via localStorage and reload.
 */
Cypress.Commands.add('enableDemoMode', () => {
  cy.window().then((win) => {
    win.localStorage.setItem('useMockWagers', 'true')
  })
  cy.reload()
})

/**
 * Disable demo mode (switch to live) via localStorage and reload.
 */
Cypress.Commands.add('disableDemoMode', () => {
  cy.window().then((win) => {
    win.localStorage.setItem('useMockWagers', 'false')
  })
  cy.reload()
})

/**
 * Open the wager creation modal for a specific type.
 * Group wagers are no longer supported — the v2 contract is 1v1 only. The
 * 1v1 flow is split into participant-resolved ("Friends Decide") and
 * oracle-resolved ("Oracle Settles") cards.
 * @param {'oneVsOne'|'oracle'|'bookmaker'} type
 */
Cypress.Commands.add('openCreateWagerModal', (type = 'oneVsOne') => {
  const buttonMap = {
    oneVsOne: /friends decide|1v1|create wager/i,
    oracle: /oracle settles/i,
    bookmaker: /bookmaker/i,
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
Cypress.Commands.add('fillWagerForm', (config = {}) => {
  if (config.opponent) {
    cy.get('[data-testid="wager-opponent"], input[name="opponent"], input[placeholder*="0x"]')
      .first()
      .clear()
      .type(config.opponent)
  }

  if (config.description) {
    cy.get('[data-testid="wager-description"], textarea[name="description"], textarea')
      .first()
      .clear()
      .type(config.description)
  }

  if (config.stake) {
    cy.get('[data-testid="wager-stake"], input[name="stake"], input[type="number"]')
      .first()
      .clear()
      .type(config.stake.toString())
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
  cy.get('.connector-option:not(.unavailable)', { timeout: 5000 }).first().click()
  cy.get('.wallet-account-button, button[aria-label="Wallet Account"]', { timeout: 10000 }).should('be.visible')
})

/**
 * Create a 1v1 wager through the UI as the connected account. Drives the
 * multi-step create wizard (verify role → approve token → create) and waits for
 * completion. The creator must already have a membership + token balance.
 */
Cypress.Commands.add('createWagerViaUI', (cfg = {}) => {
  // description must be >= 10 chars (form validation)
  const o = { description: 'E2E automated wager flow', opponent: TEST_ACCOUNTS[1], stake: 2, resolutionType: 0, ...cfg }
  cy.openCreateWagerModal('oneVsOne')
  cy.get('#fm-description, [role="dialog"] input[type="text"]').first().clear().type(o.description)
  cy.get('#fm-opponent, [role="dialog"] input[placeholder*="0x"]').first().clear().type(o.opponent)
  cy.wait(300)
  cy.get('#fm-stake, [role="dialog"] input[type="number"]').first().clear().type(String(o.stake))
  if (o.resolutionType !== undefined) {
    cy.get('#fm-resolution-type, [role="dialog"] .fm-select').first().select(String(o.resolutionType))
  }
  cy.get('[role="dialog"]').then(($m) => {
    const e = $m.find('input[type="checkbox"]')
    if (e.length && e.is(':checked')) cy.wrap(e.first()).uncheck({ force: true })
  })
  cy.get('[role="dialog"], .modal').find('button').filter(':contains("Create")').click({ force: true })
  // Multi-step wizard completes -> success copy appears.
  cy.get('[role="dialog"], .modal', { timeout: 60000 }).invoke('text').then((t) => {
    expect(t.toLowerCase(), 'create wizard reached success').to.match(/created|success|share|invite/)
  })
  cy.get('[role="dialog"] button[aria-label="Close modal"], [role="dialog"] .fm-close-btn').click({ force: true })
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
