/**
 * E2E Tests: Cross-Cutting — Expired Membership (Full-tier)
 *
 * Requires a running Hardhat node with deployed contracts (chain 1337).
 * Verifies an expired membership blocks new wager creation and that renewing
 * restores it. checkCanCreate reverts when expiresAt <= block.timestamp, so we
 * grant a 1-day membership and advance time past it. Asserts via on-chain truth
 * (wager count).
 *
 * Checklist: EXP-01..EXP-05
 */

const USER = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65' // #4 — isolated from create-heavy specs
const OPP = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'  // #0

function connectAsUser() {
  cy.mockWeb3Provider({ account: USER })
  cy.visit('/fairwins')
  cy.get('body', { timeout: 10000 }).should('be.visible')
  cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 }).click()
  cy.get('.connector-option:not(.unavailable)', { timeout: 5000 }).first().click()
  cy.get('.wallet-account-button, button[aria-label="Wallet Account"]', { timeout: 10000 }).should('be.visible')
}

describe('Expired Membership', () => {
  before(() => {
    cy.fundAccount(USER)
    cy.task('chainTx', { action: 'approve', args: { index: 4 } })
  })

  it('[EXP-01] an expired membership blocks wager creation (no new wager on chain)', () => {
    cy.grantMembershipFor(USER, { tier: 4, durationDays: 1 })
    cy.advanceTime(2 * 24 * 3600) // lapse the 1-day membership
    connectAsUser()
    cy.lastWagerId().then((before) => {
      cy.attemptCreateWager({ opponent: OPP, stake: 2 })
      cy.wait(4000)
      cy.lastWagerId().then((after) => {
        expect(after, 'no wager while membership is expired').to.equal(before)
      })
    })
  })

  it('[EXP-02] renewing the membership restores wager creation', () => {
    cy.grantMembershipFor(USER, { tier: 4, durationDays: 365 })
    connectAsUser()
    cy.lastWagerId().then((before) => {
      cy.createWagerViaUI({ opponent: OPP, stake: 2 })
      cy.lastWagerId().then((after) => {
        expect(after, 'creation works after renewal').to.equal(before + 1)
      })
    })
  })
})
