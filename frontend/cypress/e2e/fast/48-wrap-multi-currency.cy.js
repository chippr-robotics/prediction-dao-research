// =============================================================================
// 48-wrap-multi-currency.cy.js
// Fast-tier E2E for spec 108 — the Wrap view's multi-currency picker
// (`trade.wrap-multi-currency-picker` in the coverage matrix).
//
// NO CHAIN, deliberately: what this file proves is the PICKER's honesty and the
// stated-before-signing facts — which coins are offered, that an unreadable
// balance is unknown rather than zero, that changing the coin clears the amount,
// and that a cross-chain selection DISCLOSES the coming wallet switch and refuses
// honestly (naming both chains, sending nothing) when the wallet declines. The
// wrap TRANSACTION on another chain — real value against the chain's own wrapper
// — is the on-chain tier's row (`trade.wrap-cross-chain-submit`), per the e2e
// policy's money-path rule.
//
// The build's cohort here is the TESTNET one, so the offered coins are exactly
// the cohort chains with a configured wrapper: Hardhat 1337 (the connected
// chain), Mordor 63, Amoy 80002. Sepolia is in the cohort and has NO wrapper —
// its absence from the list is itself an assertion (no guessed addresses).
//
// RPC stubbing: each candidate chain's balance read goes to that chain's own
// build-default endpoint. These testnet rails are SINGLE (the drpc failovers of
// issue #1463 are mainnet-only), so one intercept per host is the whole story —
// but the Mordor/Amoy hosts are matched by pattern all the same, so a second
// rung appearing later fails loudly here rather than leaking a live read.
// =============================================================================

const TEST_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const WRAP_URL = '/wallet?tab=trade&view=wrap'

const ONE_ETHER = '0x0de0b6b3a7640000' // 1e18

/**
 * Stub one chain's JSON-RPC endpoint. `fail: true` refuses every method — the
 * single rail dies whole, which is what "this chain could not be read" means.
 */
function stubChainRpc(urlPattern, { chainIdHex, fail = false, balance = ONE_ETHER, alias }) {
  cy.intercept({ method: 'POST', url: urlPattern }, (req) => {
    const one = (payload) => {
      const { method, id } = payload
      if (fail) {
        return { jsonrpc: '2.0', id, error: { code: -32000, message: 'chain unreachable' } }
      }
      let result
      switch (method) {
        case 'eth_chainId': result = chainIdHex; break
        case 'net_version': result = String(parseInt(chainIdHex, 16)); break
        case 'eth_blockNumber': result = '0x100000'; break
        case 'eth_getBalance': result = balance; break
        case 'eth_gasPrice': result = '0x3b9aca00'; break
        case 'eth_call': result = '0x'; break
        default: result = '0x'
      }
      return { jsonrpc: '2.0', id, result }
    }
    req.reply({
      statusCode: 200,
      body: Array.isArray(req.body) ? req.body.map(one) : one(req.body || {}),
    })
  }).as(alias)
}

function stubAllChains({ amoyFails = false } = {}) {
  stubChainRpc(/rpc\.mordor\.etccooperative\.org/, { chainIdHex: '0x3f', alias: 'mordorRpc' })
  stubChainRpc(/rpc-amoy\.polygon\.technology/, {
    chainIdHex: '0x13882',
    fail: amoyFails,
    alias: 'amoyRpc',
  })
  stubChainRpc(/localhost:8545|127\.0\.0\.1:8545/, { chainIdHex: '0x539', alias: 'localRpc' })
}

function openPicker() {
  cy.get('[data-testid="wrap-coin-field"]', { timeout: 15000 })
    .find('button[aria-haspopup="listbox"]')
    .click()
}

describe('Wrap — multi-currency picker (spec 108)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
    cy.mockWeb3Provider({ account: TEST_ACCOUNT, preAuthorized: true })
  })

  it('[WMC-01] offers every wrappable cohort coin with its network — and nothing it cannot resolve', () => {
    stubAllChains()
    cy.visit(WRAP_URL)
    openPicker()
    cy.get('[role="listbox"]').within(() => {
      cy.contains('[role="option"]', 'Hardhat').should('exist')
      cy.contains('[role="option"]', 'Mordor').should('exist')
      cy.contains('[role="option"]', 'Amoy').should('exist')
      // Sepolia is IN the cohort and has no configured wrapper: absent, never a
      // disabled row wearing a guessed address.
      cy.contains('[role="option"]', 'Sepolia').should('not.exist')
    })
  })

  it('[WMC-02] an unreadable chain shows an unknown balance — never a zero — and stays selectable with the switch disclosed', () => {
    stubAllChains({ amoyFails: true })
    cy.visit(WRAP_URL)
    cy.wait('@amoyRpc')
    openPicker()
    cy.contains('[role="option"]', 'Amoy')
      .should('not.contain.text', 'Balance: 0')
      .click()
    // The selection is honest about the failed read, and about the switch to come.
    cy.contains('could not be read just now').should('be.visible')
    cy.contains('unknown, not zero').should('be.visible')
    cy.get('#pt-wrap-amount').type('0.5')
    cy.contains('your wallet will be asked to switch').should('be.visible')
    cy.contains('button', /^Wrap .* on Polygon Amoy$/).should('be.enabled')
  })

  it('[WMC-03] changing the coin clears the amount — a MAX quoted on one chain never rides to another', () => {
    stubAllChains()
    cy.visit(WRAP_URL)
    cy.get('#pt-wrap-amount', { timeout: 15000 }).type('2.5')
    openPicker()
    cy.contains('[role="option"]', 'Mordor').click()
    cy.get('#pt-wrap-amount').should('have.value', '')
  })

  it('[WMC-04] a refused wallet switch names BOTH chains and sends nothing', () => {
    stubAllChains()
    // The mock wallet declines wallet_switchEthereumChain — the member pressing
    // Cancel, or a wallet with no such chain.
    cy.mockWeb3Provider({ account: TEST_ACCOUNT, preAuthorized: true, rejectChainSwitch: true })
    cy.visit(WRAP_URL)
    openPicker()
    cy.contains('[role="option"]', 'Mordor').click()
    cy.get('#pt-wrap-amount').type('0.25')
    cy.contains('button', /^Wrap ETC on Ethereum Classic Mordor$/).click()
    cy.get('[role="alert"]', { timeout: 15000 })
      .should('contain.text', 'Ethereum Classic Mordor')
      .and('contain.text', 'Hardhat')
      .and('contain.text', 'nothing was sent')
    // No success notice, no receipt — the refusal is the whole outcome.
    cy.contains('Done —').should('not.exist')
  })
})
