/**
 * E2E Tests: Wager Pools (spec 034, Full-tier)
 *
 * Requires a running Hardhat node with `WagerPoolFactory` deployed (a targeted, append-only deploy
 * on top of the core `deploy:local` record — see scripts/deploy/deploy-wager-pool-factory.js). Pools
 * are address-based (no Semaphore/anonymity): membership, voting, and claims are by public wallet
 * address, and the winner's address IS the claim code.
 *
 * Judged by on-chain state (the `poolInfo`/`poolMemberInfo`/`tokenBalance` chainTx reads), not by
 * modal wording — a pool's UI is exercised for the flow under test; setup for the other flows is
 * bypassed on-chain the same way `createAndAcceptWager` bypasses the 1v1 create wizard elsewhere in
 * this suite.
 *
 * Closes #1232 (sub-issue of #1228). Flows:
 *   POOL-01 pools.create-and-join           — create a pool, two members join with their stake
 *   POOL-02 pools.settle-payout-matrix       — propose → approve to threshold → winner claims
 *   POOL-03 pools.deadline-refund            — a pool that never resolves refunds after the deadline
 *   POOL-04 pools.join-with-authorization    — join gaslessly via a signed EIP-3009 authorization
 *
 * Checklist: POOL-01..POOL-04
 */

import { resetChainBetweenTests } from '../../support/e2e'

const TEST_ACCOUNTS = [
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // #0 Creator / Admin
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', // #1 Member
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', // #2 Member
]

// The local core payment token is an 18-decimal MockERC20 (contracts/mocks). UI-entered buy-ins are
// parsed against the token's live `decimals()`, so this must track that.
const BUY_IN = 10n * 10n ** 18n

function connectAndVisitPool(accountIndex, poolAddress) {
  cy.mockWeb3Provider({ account: TEST_ACCOUNTS[accountIndex] })
  cy.visit(`/pools/${poolAddress}`)
  cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 }).click()
  cy.selectInjectedConnector()
  cy.get('.wallet-account-button, button[aria-label="Wallet Account"]', { timeout: 10000 })
    .should('be.visible')
}

/** Open the Group Pool creation modal from the dashboard — connects account #0 first. */
function connectAndOpenGroupPoolModal() {
  cy.mockWeb3Provider({ account: TEST_ACCOUNTS[0] })
  cy.visitWagers()
  cy.get('.wallet-connect-button, button[aria-label="Connect Wallet"]', { timeout: 10000 }).click()
  cy.selectInjectedConnector()
  cy.get('.wallet-account-button, button[aria-label="Wallet Account"]', { timeout: 10000 })
    .should('be.visible')

  cy.contains('button, [role="button"]', /group pool/i, { timeout: 10000 })
    .should('be.visible')
    .click({ force: true })
  cy.get('[role="dialog"][aria-labelledby="group-pool-title"]', { timeout: 5000 }).should('be.visible')
}

/** Extract the pool address chainTx setup needs from the current /pools/<address> URL. */
function poolAddressFromUrl() {
  return cy.url({ timeout: 15000 })
    .should('match', /\/pools\/0x[0-9a-fA-F]{40}/)
    .then((url) => url.match(/0x[0-9a-fA-F]{40}/)[0])
}

/**
 * Assert a chainTx result succeeded, surfacing the decoded on-chain error (see `describeRevert` in
 * cypress.config.js) instead of a bare "expected false to be true" — a failing precondition should
 * say why.
 */
function expectOk(result, label) {
  expect(result.ok, `${label}: ${result.error || 'no error message returned'}`).to.be.true
  return result
}

describe('Wager Pools', () => {
  // POOL-03 advances the chain clock past a resolve deadline; without per-test isolation that
  // would poison every later test's own deadlines the same way 07-manual-resolution documents.
  resetChainBetweenTests()

  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  // ---------------------------------------------------------------------------
  // POOL-01: pools.create-and-join — create through the UI, two members join with their stake
  // ---------------------------------------------------------------------------
  it('[POOL-01] Create a group pool and have members join with their stake', () => {
    connectAndOpenGroupPoolModal()

    cy.enterAmountViaKeypad('gp-buyin', '10')
    // Maximum members / threshold / deadlines: leave the form's own defaults (10, Majority, 7d/10d).

    cy.get('.fm-btn-primary').should('not.be.disabled').click()
    cy.get('[data-testid="pool-created"]', { timeout: 60000 }).should('exist')

    cy.contains('button', /open my pool/i).click()

    poolAddressFromUrl().then((poolAddress) => {
      // Creator joins their own pool (creating a pool does not auto-join it).
      cy.task('chainTx', { action: 'fund', args: { address: TEST_ACCOUNTS[0] } })
      cy.get('[data-testid="join-pool"]', { timeout: 10000 }).click()
      cy.get('[data-testid="my-nickname"]', { timeout: 30000 }).should('exist')

      // A second member joins the same pool.
      cy.task('chainTx', { action: 'fund', args: { address: TEST_ACCOUNTS[1] } })
      connectAndVisitPool(1, poolAddress)
      cy.get('[data-testid="join-pool"]', { timeout: 10000 }).click()
      cy.get('[data-testid="my-nickname"]', { timeout: 30000 }).should('exist')

      // Judge by chain state, not by the modal.
      cy.task('chainTx', { action: 'poolInfo', args: { pool: poolAddress } }).then((info) => {
        expectOk(info, 'poolInfo')
        expect(info.memberCount, 'two members joined').to.equal(2)
        expect(info.state, 'joining is still open').to.equal(0)
      })
      cy.task('chainTx', { action: 'poolMemberInfo', args: { pool: poolAddress, address: TEST_ACCOUNTS[0] } })
        .its('hasJoined').should('be.true')
      cy.task('chainTx', { action: 'poolMemberInfo', args: { pool: poolAddress, address: TEST_ACCOUNTS[1] } })
        .its('hasJoined').should('be.true')
      cy.task('chainTx', { action: 'tokenBalance', args: { address: poolAddress } }).then((r) => {
        expect(BigInt(r.balance), 'pool escrow holds both stakes').to.equal(BUY_IN * 2n)
      })

      // Unhappy path: a member who already joined cannot join again (WagerPool.AlreadyJoined()).
      // Re-joining would double-count their stake and their vote weight, so this is a core safety
      // property of "join with a stake", not an incidental edge case.
      cy.task('chainTx', { action: 'joinPool', args: { index: 0, pool: poolAddress, buyIn: BUY_IN.toString() } })
        .its('ok').should('not.equal', true)
      cy.task('chainTx', { action: 'poolInfo', args: { pool: poolAddress } })
        .its('memberCount').should('equal', 2) // unchanged by the rejected re-join

      // The UI itself never offers a joined member the join control again.
      cy.get('[data-testid="join-pool"]').should('not.exist')
    })
  })

  // ---------------------------------------------------------------------------
  // POOL-02: pools.settle-payout-matrix — propose, approve to threshold, winner claims
  // ---------------------------------------------------------------------------
  it('[POOL-02] Creator proposes a payout matrix, members approve to threshold, the winner claims', () => {
    // Setup (create + join 3 + close joining) is bypassed on-chain — the flow under test is
    // propose/approve/claim, driven through the UI.
    // maxMembers is deliberately ABOVE the 3 joiners below: WagerPool auto-closes joining once
    // memberCount reaches maxMembers (WagerPool.sol _maybeAutoClose), and joining exactly 3 into a
    // 3-member cap would auto-close the pool before the explicit closeJoiningPool call below runs
    // — which is the flow this test means to exercise — reverting it with WrongState.
    cy.task('chainTx', { action: 'createPool', args: { creatorIndex: 0, buyIn: BUY_IN.toString(), maxMembers: 5, thresholdBips: 5100 } })
      .then((created) => {
        expectOk(created, 'createPool')
        const poolAddress = created.pool

        ;[0, 1, 2].forEach((i) => cy.task('chainTx', { action: 'fund', args: { address: TEST_ACCOUNTS[i] } }))
        ;[0, 1, 2].forEach((i) =>
          cy.task('chainTx', { action: 'joinPool', args: { index: i, pool: poolAddress, buyIn: BUY_IN.toString() } })
            .then((r) => expectOk(r, `joinPool[${i}]`))
        )
        cy.task('chainTx', { action: 'closeJoiningPool', args: { callerIndex: 0, pool: poolAddress } })
          .then((r) => expectOk(r, 'closeJoiningPool'))

        connectAndVisitPool(0, poolAddress)
        cy.get('[data-testid="pool-state"]', { timeout: 10000 }).should('contain.text', 'Closed')
        cy.get('[data-testid="propose-builder"]', { timeout: 10000 }).should('be.visible')

        // Equal split across all three participants (escrow / 3 = buy-in each) — every member ends
        // up a "winner" of their own share, so the row order (by nickname, not address) never
        // matters to this test: whoever claims, the app resolves their own row for them.
        cy.get('[data-testid="propose-builder"] .pool-propose-row input', { timeout: 15000 })
          .should('have.length', 3)
          .each(($input) => {
            cy.wrap($input).clear().type('10')
          })
        cy.get('[data-testid="propose-outcome"]').should('not.be.disabled').click()
        cy.get('[data-testid="approval-progress"]', { timeout: 15000 })
          .should('contain.text', 'Approvals: 0 / 2 needed')

        // Creator approves (majority of 3 = 2 approvals needed).
        cy.get('[data-testid="approve-outcome"]').click()
        cy.get('[data-testid="approval-progress"]', { timeout: 15000 })
          .should('contain.text', 'Approvals: 1 / 2 needed')

        // Unhappy path: the outcome is proposed but not yet approved to threshold — a joined member
        // cannot claim yet (WagerPool._claimBy: `state != Resolved` reverts before the entries are
        // even checked, so any plausible entries array proves the same thing). Claiming early would
        // let a single approval unlock funds nobody actually agreed to.
        cy.task('chainTx', {
          action: 'claimPool',
          args: {
            callerIndex: 1,
            pool: poolAddress,
            index: 1,
            entries: [0, 1, 2].map((i) => ({ winner: TEST_ACCOUNTS[i], amount: BUY_IN.toString() })),
          },
        }).its('ok').should('not.equal', true)
        cy.task('chainTx', { action: 'poolInfo', args: { pool: poolAddress } })
          .its('state').should('equal', 1) // still JoiningClosed, not Resolved

        // Second member approves — crosses the threshold and locks the outcome.
        connectAndVisitPool(1, poolAddress)
        cy.get('[data-testid="approve-outcome"]', { timeout: 10000 }).click()
        cy.get('[data-testid="pool-resolved"]', { timeout: 15000 }).should('exist')

        // The winner (this member, account #1) claims their share. The claim section has no
        // claimedIndex awareness (the button itself never disappears — a real product gap, not
        // this test's concern), so completion is judged by the confirmation notice, then chain state.
        cy.task('chainTx', { action: 'tokenBalance', args: { address: TEST_ACCOUNTS[1] } }).then((before) => {
          cy.get('[data-testid="claim-amount"]').should('contain.text', '10.0')
          cy.get('[data-testid="claim"]').click()
          cy.get('[data-testid="pool-resolution-notice"]', { timeout: 30000 }).should('contain.text', 'Claimed')

          cy.task('chainTx', { action: 'tokenBalance', args: { address: TEST_ACCOUNTS[1] } }).then((after) => {
            expect(BigInt(after.balance) - BigInt(before.balance), 'claimed exactly their share').to.equal(BUY_IN)
          })
        })

        cy.task('chainTx', { action: 'poolInfo', args: { pool: poolAddress } })
          .its('state').should('equal', 2) // Resolved
      })
  })

  // ---------------------------------------------------------------------------
  // POOL-03: pools.deadline-refund — a pool that never resolves refunds after the deadline
  // ---------------------------------------------------------------------------
  it('[POOL-03] A pool that never resolves returns members’ stakes after the deadline', () => {
    // Wide windows deliberately: this is the shard's Nth full-tier spec, and
    // resetChainBetweenTests() reverts to a checkpoint taken real minutes earlier — createPool's
    // deadline math anchors to whichever of chain-time/wall-clock is ahead (see cypress.config.js),
    // but a tight window still leaves less margin for ordinary CI round-trip latency between here
    // and closeJoiningPool below.
    cy.task('chainTx', { action: 'createPool', args: { creatorIndex: 0, buyIn: BUY_IN.toString(), maxMembers: 3, acceptIn: 300, resolveIn: 600 } })
      .then((created) => {
        expectOk(created, 'createPool')
        const poolAddress = created.pool

        ;[0, 1].forEach((i) => cy.task('chainTx', { action: 'fund', args: { address: TEST_ACCOUNTS[i] } }))
        ;[0, 1].forEach((i) =>
          cy.task('chainTx', { action: 'joinPool', args: { index: i, pool: poolAddress, buyIn: BUY_IN.toString() } })
            .then((r) => expectOk(r, `joinPool[${i}]`))
        )
        cy.task('chainTx', { action: 'closeJoiningPool', args: { callerIndex: 0, pool: poolAddress } })
          .then((r) => expectOk(r, 'closeJoiningPool'))

        // Refund is NOT allowed before the resolve deadline.
        cy.task('chainTx', { action: 'refundPool', args: { callerIndex: 0, pool: poolAddress } })
          .its('ok').should('not.equal', true)

        // Advance BEFORE visiting: the app decides refund-eligibility from browser time on page
        // load, and cy.advanceTime() re-applies its Date shim to the next window that loads, so the
        // fresh page already agrees with the chain about the deadline having passed.
        //
        // advanceTime()'s browser offset is cumulative on top of whatever this test's beforeEach
        // last synced it to — and that sync ran at the START of this test, against the chain's
        // *reverted* timestamp (resetChainBetweenTests() reverts to a checkpoint taken real minutes
        // earlier). createPool above force-mines a block and reads its real, current timestamp for
        // the deadline math, so the chain's clock is already back near real time by the time we get
        // here — but the browser shim is still offset from the stale checkpoint. Adding 650s to a
        // stale baseline can land short of a deadline anchored to the real one. Re-sync the browser
        // to the chain's actual (now-advanced) clock instead of trusting the cumulative offset.
        cy.advanceTime(650) // past resolveIn (600s), joining/proposal never happened
        cy.syncBrowserClockToChain()

        connectAndVisitPool(0, poolAddress)
        cy.task('chainTx', { action: 'tokenBalance', args: { address: TEST_ACCOUNTS[0] } }).then((before) => {
          cy.get('[data-testid="refund"]', { timeout: 15000 }).click()
          cy.get('[data-testid="refund"]', { timeout: 30000 }).should('not.exist')

          cy.task('chainTx', { action: 'tokenBalance', args: { address: TEST_ACCOUNTS[0] } }).then((after) => {
            expect(BigInt(after.balance) - BigInt(before.balance), 'stake refunded').to.equal(BUY_IN)
          })
        })

        cy.task('chainTx', { action: 'poolMemberInfo', args: { pool: poolAddress, address: TEST_ACCOUNTS[0] } })
          .its('refunded').should('be.true')
        // The pool itself is never marked "resolved" — it just becomes refund-eligible.
        cy.task('chainTx', { action: 'poolInfo', args: { pool: poolAddress } })
          .its('state').should('equal', 1) // JoiningClosed
      })
  })

  // ---------------------------------------------------------------------------
  // POOL-04: pools.join-with-authorization — join gaslessly via a signed EIP-3009 authorization
  // ---------------------------------------------------------------------------
  it('[POOL-04] Join a pool gaslessly by signing an EIP-3009 authorization', () => {
    const value = (10n * 10n ** 6n).toString() // MockUSDCPermit is 6-decimal

    cy.task('chainTx', { action: 'deployMockUSDCPermit', args: { mintTo: TEST_ACCOUNTS[1], amount: (1000n * 10n ** 6n).toString() } })
      .then((minted) => {
        expectOk(minted, 'deployMockUSDCPermit')
        const token = minted.token

        cy.task('chainTx', { action: 'createPool', args: { creatorIndex: 0, token, buyIn: value, maxMembers: 3 } })
          .then((created) => {
            expectOk(created, 'createPool')
            const poolAddress = created.pool

            // Member #1 SIGNS an authorization — no transaction of their own.
            cy.task('chainTx', {
              action: 'signPoolJoinAuthorization',
              args: { fromIndex: 1, token, pool: poolAddress, value },
            }).then((signed) => {
              expectOk(signed, 'signPoolJoinAuthorization')
              expect(signed.from.toLowerCase(), 'signed by the joining member').to.equal(TEST_ACCOUNTS[1].toLowerCase())

              // A DIFFERENT account (the relayer, #0) submits it on-chain and pays the gas.
              cy.task('chainTx', {
                action: 'submitPoolJoinAuthorization',
                args: { relayerIndex: 0, pool: poolAddress, ...signed },
              }).then((r) => expectOk(r, 'submitPoolJoinAuthorization'))

              cy.task('chainTx', { action: 'poolMemberInfo', args: { pool: poolAddress, address: TEST_ACCOUNTS[1] } })
                .its('hasJoined').should('be.true')
              cy.task('chainTx', { action: 'poolInfo', args: { pool: poolAddress } })
                .its('memberCount').should('equal', 1)
              cy.task('chainTx', { action: 'tokenBalance', args: { token, address: poolAddress } }).then((r) => {
                expect(BigInt(r.balance), 'pool escrow holds the stake').to.equal(BigInt(value))
              })

              // Replaying the same signature must be refused (no double-join, no double-charge).
              cy.task('chainTx', {
                action: 'submitPoolJoinAuthorization',
                args: { relayerIndex: 0, pool: poolAddress, ...signed },
              }).its('ok').should('not.equal', true)
              cy.task('chainTx', { action: 'poolInfo', args: { pool: poolAddress } })
                .its('memberCount').should('equal', 1)

              // The member's own view of the pool honestly reflects the on-chain join.
              connectAndVisitPool(1, poolAddress)
              cy.get('[data-testid="my-nickname"]', { timeout: 15000 }).should('exist')
              cy.get('[data-testid="join-pool"]').should('not.exist')
            })
          })
      })
  })
})
