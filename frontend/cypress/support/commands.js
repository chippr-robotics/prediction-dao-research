// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

/**
 * Custom command to inject a mock Web3 provider into the page
 * This simulates a wallet connection without requiring browser extensions
 * IMPORTANT: Call this BEFORE cy.visit() to ensure provider is available when app loads
 */
Cypress.Commands.add('mockWeb3Provider', (options = {}) => {
  const networkId = options.networkId || Cypress.env('NETWORK_ID') || 1337
  const rpcUrl = options.rpcUrl || Cypress.env('RPC_URL') || 'http://localhost:8545'
  const account = options.account || '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' // Hardhat account #0
  
  cy.on('window:before:load', (win) => {
    // Create a mock ethereum provider
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
              resolve('0x56bc75e2d63100000') // 100 ETH in hex
              break
            default:
              // Forward other requests to actual RPC
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
      
      // Legacy methods for compatibility
      enable: () => Promise.resolve([account]),
      send: (method, params) => {
        return win.ethereum.request({ method, params })
      },
      
      // Event emitter simulation
      on: (event, callback) => {
        win.ethereum._callbacks = win.ethereum._callbacks || {}
        win.ethereum._callbacks[event] = callback
      },
      removeListener: (event) => {
        if (win.ethereum._callbacks) {
          delete win.ethereum._callbacks[event]
        }
      }
    }
    
    // Trigger any account change listeners
    if (win.ethereum._callbacks && win.ethereum._callbacks.accountsChanged) {
      win.ethereum._callbacks.accountsChanged([account])
    }
  })
})

/**
 * Custom command to wait for wallet connection
 */
Cypress.Commands.add('waitForWalletConnection', () => {
  cy.get('[data-testid="wallet-address"], .wallet-address, .connected-wallet', { timeout: 10000 })
    .should('be.visible')
})

/**
 * Custom command to connect wallet via UI
 * Note: mockWeb3Provider should be called BEFORE cy.visit() in most cases
 */
Cypress.Commands.add('connectWallet', () => {
  // If provider not already injected, inject it
  cy.window().then((win) => {
    if (!win.ethereum) {
      cy.mockWeb3Provider()
    }
  })
  
  // Then click the connect button with stability checks
  cy.contains('button', /connect wallet/i, { timeout: 10000 })
    .should('be.visible')
    .should('not.be.disabled')
    .click({ force: true })
  
  // Wait for connection to complete
  cy.waitForWalletConnection()
})

/**
 * Custom command to verify network status
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
 * Custom command to select a platform (ClearPath or FairWins)
 */
Cypress.Commands.add('selectPlatform', (platform) => {
  const platformName = platform.toLowerCase()
  
  if (platformName === 'clearpath') {
    cy.contains('button, a', /enter clearpath|clearpath/i, { timeout: 10000 }).click()
  } else if (platformName === 'fairwins') {
    cy.contains('button, a', /enter fairwins|fairwins|explore markets/i, { timeout: 10000 }).click()
  }
  
  // Wait for platform to load
  cy.wait(1000)
})

/**
 * Custom command to navigate and verify URL
 */
Cypress.Commands.add('navigateAndVerify', (path, urlPattern) => {
  cy.visit(path)
  cy.url().should('match', urlPattern || new RegExp(path))
})

/**
 * Custom command for accessibility checks
 */
Cypress.Commands.add('checkA11y', (context = null, options = {}) => {
  const defaultOptions = {
    rules: {
      // Disable color-contrast for now as it can be inconsistent in CI
      'color-contrast': { enabled: false }
    },
    ...options
  }
  
  cy.get('body').should('be.visible')
  // Note: axe-core integration would be added here if we install cypress-axe
  // For now, we'll do basic checks
  
  // Check for basic accessibility attributes (allow failures)
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
