/**
 * E2E Tests: Refund & Timeout Flows (Full-tier)
 *
 * Requires a running Hardhat node with deployed contracts (chain 1337).
 * Verifies that no stake is stranded by inaction:
 *  - an Open wager not accepted by its acceptDeadline can be refunded (creator);
 *  - an Active wager not resolved by its resolveDeadline can be refunded (both).
 * Wagers are set up on-chain (createAndAcceptWager), time is advanced past the
 * deadline, the refund is claimed, and the outcome is asserted via the wager's
 * on-chain status. Also asserts the refund is NOT allowed before the deadline.
 *
 * Status enum: None=0 Open=1 Active=2 Resolved=3 Cancelled=4 Refunded=5
 *
 * Checklist: REF-01..REF-08
 */

describe('Refund & Timeout', () => {
  it('[REF-01] an unaccepted wager refunds the creator only after the accept deadline', () => {
    cy.createAndAcceptWager({ accept: false, acceptIn: 60, resolveIn: 7200 }).then((wagerId) => {
      cy.task('chainTx', { action: 'wagerInfo', args: { wagerId } }).then((i) => {
        expect(i.status, 'wager starts Open').to.equal(1)
      })
      // Refund is NOT allowed before the accept deadline.
      cy.task('chainTx', { action: 'claimRefund', args: { callerIndex: 0, wagerId } }).then((r) => {
        expect(r.ok, 'refund blocked before deadline').to.not.equal(true)
      })
      cy.advanceTime(120) // past acceptDeadline
      cy.task('chainTx', { action: 'claimRefund', args: { callerIndex: 0, wagerId } }).then((r) => {
        expect(r.ok, 'creator refund succeeds after deadline').to.be.true
      })
      cy.task('chainTx', { action: 'wagerInfo', args: { wagerId } }).then((i) => {
        expect(i.status, 'wager is Refunded after accept-timeout').to.equal(5)
      })
    })
  })

  it('[REF-02] an unresolved active wager refunds after the resolve deadline', () => {
    // Active (accepted) wager with a valid window; advance past resolveDeadline.
    cy.createAndAcceptWager({ acceptIn: 60, resolveIn: 7200 }).then((wagerId) => {
      cy.task('chainTx', { action: 'wagerInfo', args: { wagerId } }).then((i) => {
        expect(i.status, 'wager is Active').to.equal(2)
      })
      cy.advanceTime(7300) // past resolveDeadline
      cy.task('chainTx', { action: 'claimRefund', args: { callerIndex: 0, wagerId } }).then((r) => {
        expect(r.ok, 'refund after resolve-timeout succeeds').to.be.true
      })
      cy.task('chainTx', { action: 'wagerInfo', args: { wagerId } }).then((i) => {
        expect(i.status, 'wager is Refunded after resolve-timeout').to.equal(5)
      })
    })
  })
})
