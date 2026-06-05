/**
 * E2E Tests: Oracle Resolution — Polymarket (Full-tier)
 *
 * Requires a running Hardhat node with deployed contracts (chain 1337).
 * Scoped to the Polymarket path — the only oracle adapter deploy:local wires on
 * chain 1337 (Chainlink/UMA/Functions constants are null/empty for localhost, so
 * those adapters are not deployed). Chainlink/UMA auto-resolution is covered by
 * the hardhat integration tests under test/integration/oracle/ — not this E2E
 * harness; that omission is explicit, not a silent gap.
 *
 * Verifies the recently-fixed tie behavior: a 50/50 Polymarket payout settles NO
 * winner and both stakes are refundable after the resolve deadline. Outcome maps
 * via creatorIsYes: winner = (outcome == creatorIsYes) ? creator : opponent.
 *
 * Status enum: None=0 Open=1 Active=2 Resolved=3 Cancelled=4 Refunded=5
 * Checklist: ORC-01..ORC-12
 */

const CREATOR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' // #0
const OPPONENT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' // #1
const POLYMARKET = 4 // ResolutionType.Polymarket

// Set up an accepted Polymarket wager on a fresh, prepared condition.
function setupOracleWager(question, creatorIsYes, resolveIn = 7200) {
  return cy.task('chainTx', { action: 'prepareCondition', args: { question } }).then((p) => {
    expect(p.ok, 'condition prepared').to.be.true
    return cy.createAndAcceptWager({
      resolutionType: POLYMARKET, conditionId: p.conditionId, creatorIsYes,
      acceptIn: 60, resolveIn,
    }).then((wagerId) => ({ wagerId, conditionId: p.conditionId }))
  })
}

describe('Oracle Resolution (Polymarket)', () => {
  it('[ORC-01] YES outcome settles the creator as winner', () => {
    setupOracleWager('orc-yes', /* creatorIsYes */ true).then(({ wagerId, conditionId }) => {
      cy.resolveMockCondition(conditionId, [1, 0]) // pass(YES) wins
      cy.task('chainTx', { action: 'autoResolve', args: { wagerId } }).then((r) => {
        expect(r.ok, 'autoResolve settles').to.be.true
      })
      cy.task('chainTx', { action: 'wagerInfo', args: { wagerId } }).then((i) => {
        expect(i.status, 'Resolved').to.equal(3)
        expect(i.winner.toLowerCase(), 'creator wins on YES').to.equal(CREATOR.toLowerCase())
      })
    })
  })

  it('[ORC-02] NO outcome settles the opponent as winner', () => {
    setupOracleWager('orc-no', /* creatorIsYes */ true).then(({ wagerId, conditionId }) => {
      cy.resolveMockCondition(conditionId, [0, 1]) // fail(NO) wins
      cy.task('chainTx', { action: 'autoResolve', args: { wagerId } }).then((r) => {
        expect(r.ok, 'autoResolve settles').to.be.true
      })
      cy.task('chainTx', { action: 'wagerInfo', args: { wagerId } }).then((i) => {
        expect(i.status, 'Resolved').to.equal(3)
        expect(i.winner.toLowerCase(), 'opponent wins on NO').to.equal(OPPONENT.toLowerCase())
      })
    })
  })

  it('[ORC-03] a 50/50 tie settles no winner and refunds both after the deadline', () => {
    setupOracleWager('orc-tie', /* creatorIsYes */ true, /* resolveIn */ 7200).then(({ wagerId, conditionId }) => {
      cy.resolveMockCondition(conditionId, [1, 1]) // tie
      // The tie must NOT settle a winner (the fixed behavior).
      cy.task('chainTx', { action: 'autoResolve', args: { wagerId } }).then((r) => {
        expect(r.ok, 'tie does not auto-resolve').to.not.equal(true)
      })
      cy.task('chainTx', { action: 'wagerInfo', args: { wagerId } }).then((i) => {
        expect(i.status, 'still Active after a tie').to.equal(2)
      })
      // After the resolve deadline, both stakes are refundable.
      cy.advanceTime(7300)
      cy.task('chainTx', { action: 'claimRefund', args: { callerIndex: 0, wagerId } }).then((r) => {
        expect(r.ok, 'refund after tie').to.be.true
      })
      cy.task('chainTx', { action: 'wagerInfo', args: { wagerId } }).then((i) => {
        expect(i.status, 'Refunded after tie + deadline').to.equal(5)
      })
    })
  })
})
