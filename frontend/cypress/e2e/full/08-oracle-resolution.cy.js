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
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

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
  it('[ORC-01] YES outcome settles the creator as winner', () => {
    setupOracleWager('orc-yes', /* creatorIsYes */ true).then(({ wagerId, conditionId }) => {
      cy.resolveMockCondition(conditionId, [1, 0]) // pass(YES) wins
      cy.task('chainTx', { action: 'autoResolve', args: { wagerId } }).then((r) => {
        expect(r.ok, `autoResolve settles (${r.error || 'no error reported'})`).to.be.true
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
        expect(r.ok, `autoResolve settles (${r.error || 'no error reported'})`).to.be.true
      })
      cy.task('chainTx', { action: 'wagerInfo', args: { wagerId } }).then((i) => {
        expect(i.status, 'Resolved').to.equal(3)
        expect(i.winner.toLowerCase(), 'opponent wins on NO').to.equal(OPPONENT.toLowerCase())
      })
    })
  })

  /*
   * A 50/50 tie settles a DRAW IMMEDIATELY — it does not wait for the deadline.
   *
   * WagerRegistryIntents disambiguates an unresolved market from a resolved tie: the tie calls
   * `_settleDraw` (both stakes returned, no winner, Status.Draw), while a genuinely unresolved
   * one reverts ConditionNotResolved.
   *
   * This test used to assert that autoResolve does NOT succeed on a tie, and then that the
   * wager stayed Active until a post-deadline refund. That passed for the whole life of this
   * tier for the wrong reason: deploy.js never wired the intents facet, so EVERY autoResolve
   * reverted UnknownFunction and "does not auto-resolve" was trivially true (#1227). Wiring the
   * facet is what exposed it — the assertions described a registry with no auto-resolution at
   * all, not the tie rule.
   */
  it('[ORC-03] a 50/50 tie settles a draw with no winner', () => {
    setupOracleWager('orc-tie', /* creatorIsYes */ true, /* resolveIn */ 7200).then(({ wagerId, conditionId }) => {
      cy.resolveMockCondition(conditionId, [1, 1]) // tie
      cy.task('chainTx', { action: 'autoResolve', args: { wagerId } }).then((r) => {
        expect(r.ok, `tie settles (${r.error || 'no error reported'})`).to.be.true
      })
      cy.task('chainTx', { action: 'wagerInfo', args: { wagerId } }).then((i) => {
        expect(i.status, 'Draw after a tie').to.equal(6)
        expect(i.winner, 'a draw names no winner').to.equal(ZERO_ADDRESS)
      })
    })
  })
})
