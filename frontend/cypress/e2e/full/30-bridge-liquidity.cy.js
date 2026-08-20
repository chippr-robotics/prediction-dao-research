/**
 * E2E Tests: bridge and supplied liquidity (spec 067, Full-tier) — WIP probe.
 */

const MEMBER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' // #0
const USDC = '0xbc4D54AE49ED9C6075770CD6acA930A728dcf526'   // the local payment token
const WMATIC = '0x007e106a5664D48e02f571b58694B74c9D5c22a1' // the local wrapped native

const fixture = (action, args = {}) =>
  cy.task('liquidityFixture', { action, args }).then((r) => {
    expect(r.ok, `liquidityFixture ${action}: ${r.error || 'no error message returned'}`).to.equal(true)
    return r
  })

describe('Bridge and supplied liquidity (spec 067)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  it('[BL-00] lists a curated pool on the Supply surface', () => {
    fixture('listTradingPool', { tokenA: USDC, tokenB: WMATIC }).then(({ poolId }) => {
      cy.log(`listed pool ${poolId}`)
      cy.mockWeb3Provider({ account: MEMBER, preAuthorized: true, realBalances: true })
      cy.visit('/wallet?tab=earn&view=supply')
      cy.get('.supply-row', { timeout: 30000 }).should('have.length.at.least', 1)
    })
  })
})
