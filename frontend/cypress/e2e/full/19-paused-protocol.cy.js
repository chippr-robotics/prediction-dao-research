/**
 * E2E Tests: Paused Protocol (Full-tier)
 *
 * Requires a running Hardhat node with deployed contracts (chain 1337).
 * Verifies the emergency-brake behavior: a paused protocol blocks NEW wager
 * creation, and creation works again after unpause. Asserts via on-chain truth
 * (wager count) so it is robust to the exact error-toast wording.
 *
 * Checklist: PAU-01..PAU-04
 */

const ADMIN = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' // Hardhat #0 — admin + creator
const OPPONENT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' // #1

function connectAsAdmin() {
  cy.mockWeb3Provider({ account: ADMIN })
  cy.visitWagers()
  cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 }).click()
  cy.selectInjectedConnector()
  cy.get('.wallet-account-button, button[aria-label="Wallet Account"]', { timeout: 10000 }).should('be.visible')
}

// Open the create modal, fill it, and submit — WITHOUT asserting success, so it
// also works when the create tx reverts (paused). Returns after the submit click.
function attemptCreate() {
  cy.openCreateWagerModal('oneVsOne')
  cy.get('#fm-description, [role="dialog"] input[type="text"]').first().clear().type('Pause test wager')
  cy.get('#fm-opponent, [role="dialog"] input[placeholder*="0x"]').first().clear().type(OPPONENT)
  cy.wait(300)
  cy.enterAmountViaKeypad('fm-stake', '2')
  // Encryption is ON by default and is no longer optional — the opt-out checkbox was removed
  // from FriendMarketsModal several sprints ago (grep `checkbox` there returns nothing). The
  // block that used to uncheck it was a no-op guarded by `if (length > 0)`, so it silently did
  // nothing while the spec read as though it controlled encryption. (#1028)
  cy.get('[role="dialog"], .modal').find('button').filter(':contains("Create")').click({ force: true })
}

describe('Paused Protocol', () => {
  before(() => {
    // Ensure the creator can create when unpaused: funded + approved + member.
    cy.fundAccount(ADMIN)
    cy.task('chainTx', { action: 'approve', args: { index: 0 } })
    cy.grantMembershipFor(ADMIN, { tier: 4, durationDays: 365 })
  })

  afterEach(() => {
    cy.restoreGlobalState()
  })

  it('[PAU-01] paused blocks new wager creation (no new wager on chain)', () => {
    cy.setProtocolPaused(true)
    connectAsAdmin()
    cy.lastWagerId().then((before) => {
      attemptCreate()
      cy.wait(4000) // let the reverted tx settle
      cy.lastWagerId().then((after) => {
        expect(after, 'no new wager while paused').to.equal(before)
      })
    })
  })

  it('[PAU-02] creation succeeds again after unpause', () => {
    cy.setProtocolPaused(false)
    connectAsAdmin()
    cy.lastWagerId().then((before) => {
      cy.createWagerViaUI({ opponent: OPPONENT, stake: 2 })
      cy.lastWagerId().then((after) => {
        expect(after, 'a new wager after unpause').to.equal(before + 1)
      })
    })
  })
})
