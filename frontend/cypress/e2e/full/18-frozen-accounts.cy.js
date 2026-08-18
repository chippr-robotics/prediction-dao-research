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
  /*
   * visitWagers, not /fairwins: spec 073 moved the quick-action cards to
   * Finance > Transfer > Wagers, and /fairwins (still routed, still rendering HomeScreen)
   * stopped hosting them. Both FRZ tests died in openCreateWagerModal looking for a card
   * the page it was on no longer renders.
   */
  cy.visitWagers()
  cy.connectWallet()
}

describe('Frozen Accounts', () => {
  /*
   * STUB THE PINNING SERVICE — see frontend/package.json `dev:e2e`.
   *
   * Encryption is mandatory on the create path, so useFriendMarketCreation always calls
   * uploadEncryptedEnvelope, and a create that cannot pin its metadata throws BEFORE it reaches
   * WagerRegistry. Registered per-test rather than in `before` because cy.intercept is cleared
   * between tests.
   */
  beforeEach(() => {
    cy.interceptIpfs()
  })
  before(() => {
    // #1 funded + approved + member, so creation works whenever it is NOT frozen.
    cy.fundAccount(USER)
    cy.task('chainTx', { action: 'approve', args: { index: 1 } })
    cy.grantMembershipFor(USER, { tier: 4, durationDays: 365 })
    /*
     * Encryption is MANDATORY: FriendMarketsModal refuses to create a wager whose OPPONENT has
     * no key in KeyRegistry, and says so only in a console error. Without this the create the
     * spec expects to SUCCEED failed for a reason unrelated to what it tests, reported as
     * "wager 1 not created".
     */
    cy.ensureEncryptionKeys([0, 1])
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
