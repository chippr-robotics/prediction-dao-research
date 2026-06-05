/**
 * E2E Tests: Full Lifecycle Scenarios (Full-tier)
 *
 * Requires a running Hardhat node with deployed contracts (chain 1337).
 * Five connected end-to-end journeys verified through their full state machine
 * (Open → Active → Resolved|Refunded) against the real contracts. State
 * transitions are driven via the chainTx setup task (reliable) and asserted on
 * the wager's on-chain status/winner/paid; the headline happy path also confirms
 * the user-visible outcome in the UI.
 *
 * The obsolete "Challenged Resolution with Arbitrator" journey is intentionally
 * removed — the challenge/dispute/arbitrator-reresolution feature was deleted in
 * #621/#625 (declareWinner is final), the same obsolescence as the removed
 * 09-challenge-dispute spec.
 *
 * Status enum: None=0 Open=1 Active=2 Resolved=3 Cancelled=4 Refunded=5
 * Checklist: E2E-01..E2E-05
 */

const CREATOR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' // #0
const OPPONENT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' // #1

describe('End-to-End Lifecycle Scenarios', () => {
  afterEach(() => {
    cy.restoreGlobalState() // unfreeze anything a journey froze
  })

  it('[E2E-01] Happy path — 1v1 manual resolution: create → accept → resolve → winner claims', () => {
    cy.createAndAcceptWager({ resolutionType: 0 }).then((wagerId) => {
      cy.task('chainTx', { action: 'wagerInfo', args: { wagerId } }).then((i) =>
        expect(i.status, 'Active after accept').to.equal(2))
      cy.task('chainTx', { action: 'declareWinner', args: { callerIndex: 0, wagerId, winner: CREATOR } })
        .then((r) => expect(r.ok, 'declareWinner').to.be.true)
      cy.task('chainTx', { action: 'claimPayout', args: { callerIndex: 0, wagerId } })
        .then((r) => expect(r.ok, 'winner claims payout').to.be.true)
      cy.task('chainTx', { action: 'wagerInfo', args: { wagerId } }).then((i) => {
        expect(i.status, 'Resolved').to.equal(3)
        expect(i.winner.toLowerCase(), 'winner is creator').to.equal(CREATOR.toLowerCase())
        expect(i.paid, 'payout paid').to.be.true
      })
      // User-visible outcome: the creator sees the settled wager in their list.
      cy.mockWeb3Provider({ account: CREATOR })
      cy.visit('/fairwins')
      cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 }).click()
      cy.get('.connector-option:not(.unavailable)', { timeout: 5000 }).first().click()
      cy.get('.wallet-account-button, button[aria-label="Wallet Account"]', { timeout: 10000 }).should('be.visible')
      cy.openMyWagers('created')
      cy.contains(/resolved|you won|settled|complete/i, { timeout: 15000 }).should('exist')
    })
  })

  it('[E2E-02] Happy path — Polymarket auto-resolved wager settles the correct winner', () => {
    cy.task('chainTx', { action: 'prepareCondition', args: { question: 'e2e-poly' } }).then((p) => {
      cy.createAndAcceptWager({ resolutionType: 4, conditionId: p.conditionId, creatorIsYes: true }).then((wagerId) => {
        cy.resolveMockCondition(p.conditionId, [1, 0]) // YES
        cy.task('chainTx', { action: 'autoResolve', args: { wagerId } })
          .then((r) => expect(r.ok, 'auto-resolve').to.be.true)
        cy.task('chainTx', { action: 'wagerInfo', args: { wagerId } }).then((i) => {
          expect(i.status, 'Resolved').to.equal(3)
          expect(i.winner.toLowerCase(), 'YES → creator').to.equal(CREATOR.toLowerCase())
        })
      })
    })
  })

  it('[E2E-03] Unhappy path — acceptance timeout refunds the creator', () => {
    cy.createAndAcceptWager({ accept: false, acceptIn: 60, resolveIn: 7200 }).then((wagerId) => {
      cy.advanceTime(120)
      cy.task('chainTx', { action: 'claimRefund', args: { callerIndex: 0, wagerId } })
        .then((r) => expect(r.ok, 'creator refund').to.be.true)
      cy.task('chainTx', { action: 'wagerInfo', args: { wagerId } }).then((i) =>
        expect(i.status, 'Refunded').to.equal(5))
    })
  })

  it('[E2E-04] Unhappy path — oracle resolve timeout refunds both parties', () => {
    cy.task('chainTx', { action: 'prepareCondition', args: { question: 'e2e-poly-timeout' } }).then((p) => {
      cy.createAndAcceptWager({ resolutionType: 4, conditionId: p.conditionId, creatorIsYes: true, acceptIn: 60, resolveIn: 7200 }).then((wagerId) => {
        cy.advanceTime(7300) // never resolved → past resolveDeadline
        cy.task('chainTx', { action: 'claimRefund', args: { callerIndex: 0, wagerId } })
          .then((r) => expect(r.ok, 'refund after oracle timeout').to.be.true)
        cy.task('chainTx', { action: 'wagerInfo', args: { wagerId } }).then((i) =>
          expect(i.status, 'Refunded').to.equal(5))
      })
    })
  })

  it('[E2E-05] Unhappy path — a frozen winner cannot claim until unfrozen', () => {
    cy.createAndAcceptWager({ resolutionType: 0 }).then((wagerId) => {
      cy.task('chainTx', { action: 'declareWinner', args: { callerIndex: 0, wagerId, winner: CREATOR } })
      cy.setAccountFrozen(CREATOR, true)
      cy.task('chainTx', { action: 'claimPayout', args: { callerIndex: 0, wagerId } })
        .then((r) => expect(r.ok, 'frozen winner blocked from claiming').to.not.equal(true))
      cy.task('chainTx', { action: 'wagerInfo', args: { wagerId } }).then((i) =>
        expect(i.paid, 'not paid while frozen').to.equal(false))
      cy.setAccountFrozen(CREATOR, false)
      cy.task('chainTx', { action: 'claimPayout', args: { callerIndex: 0, wagerId } })
        .then((r) => expect(r.ok, 'claims after unfreeze').to.be.true)
      cy.task('chainTx', { action: 'wagerInfo', args: { wagerId } }).then((i) =>
        expect(i.paid, 'paid after unfreeze').to.be.true)
    })
  })
})
