/**
 * E2E Tests: Cross-Cutting — Frozen Accounts (Full-tier)
 *
 * Requires a running Hardhat node with deployed contracts (chain 1337).
 * Verifies a frozen account is blocked from creating a wager and is fully
 * restored on unfreeze. Asserts via on-chain truth (wager count) so it is
 * robust to the exact error-toast wording.
 *
 * Checklist: FRZ-01..FRZ-10
 */

const USER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' // #1 — the account we freeze
const OPP = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'  // #0 — opponent

function connectAsUser() {
  cy.mockWeb3Provider({ account: USER })
  cy.visit('/fairwins')
  cy.get('body', { timeout: 10000 }).should('be.visible')
  cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 }).click()
  cy.get('.connector-option:not(.unavailable)', { timeout: 5000 }).first().click()
  cy.get('.wallet-account-button, button[aria-label="Wallet Account"]', { timeout: 10000 }).should('be.visible')
}

describe('Frozen Accounts', () => {
  before(() => {
    // #1 funded + approved + member, so creation works whenever it is NOT frozen.
    cy.fundAccount(USER)
    cy.task('chainTx', { action: 'approve', args: { index: 1 } })
    cy.grantMembershipFor(USER, { tier: 4, durationDays: 365 })
  })

  afterEach(() => {
    cy.restoreGlobalState() // unfreezes any account a test froze
  })

  it('[FRZ-01] a frozen account cannot create a wager (no new wager on chain)', () => {
    cy.setAccountFrozen(USER, true)
    connectAsUser()
    cy.lastWagerId().then((before) => {
      cy.attemptCreateWager({ opponent: OPP, stake: 2 })
      cy.wait(4000) // let the reverted tx settle
      cy.lastWagerId().then((after) => {
        expect(after, 'frozen account created no wager').to.equal(before)
      })
    })
  })

  it('[FRZ-02] unfreezing restores wager creation', () => {
    cy.setAccountFrozen(USER, false)
    connectAsUser()
    cy.lastWagerId().then((before) => {
      cy.createWagerViaUI({ opponent: OPP, stake: 2 })
      cy.lastWagerId().then((after) => {
        expect(after, 'creation works after unfreeze').to.equal(before + 1)
      })
    })
  })
})
