// =============================================================================
// 36-wager-notifications.cy.js
// Full-tier E2E for wager state-change notifications (spec 012).
//
// Issue #1245. `notifications.wager-state-change` was the last no-blocker row
// left absent: being told when a wager you have money in changes state is not a
// nicety, it is how a member learns their stake is live, or that a deadline is
// about to take it away.
//
// This is on-chain because the notification is DERIVED FROM CHAIN STATE. The
// source polls the member's wagers and diffs successive snapshots, so a stubbed
// feed would assert that the stub was rendered — not that a real acceptance
// produced a real notification.
//
// THE SNAPSHOT-DIFF PROPERTY IS THE POINT. The first poll establishes a
// baseline and must announce nothing: a member opening the app for the first
// time has not just had twelve things happen to them. Only a CHANGE between
// polls is news.
// =============================================================================

import { resetChainBetweenTests } from '../../support/e2e'

const TEST_ACCOUNTS = [
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // #0 Creator
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', // #1 Opponent
]

/** The bell opens the feed; MS-03 covers the control itself in the no-chain tier. */
const openFeed = () => {
  cy.get('[aria-label*="Notifications"]', { timeout: 40000 }).should('exist').click()
}

describe('Wager state-change notifications (spec 012)', () => {
  resetChainBetweenTests()

  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  it('[NOT-01] An acceptance the member did not perform becomes a notification — and the first look announces nothing', () => {
    /*
     * The creator posts a wager and looks at their feed. Nothing has happened yet, and the
     * baseline poll must say so rather than manufacturing news out of a wager they just made.
     *
     * Then the opponent accepts, on chain, from another account entirely. The creator's next poll
     * sees a state it has a previous snapshot for, and THAT is the notification: their stake is
     * live and someone else made it so.
     */
    cy.task('chainTx', { action: 'fund', args: { address: TEST_ACCOUNTS[0] } })
    cy.task('chainTx', { action: 'fund', args: { address: TEST_ACCOUNTS[1] } })
    cy.task('chainTx', { action: 'approve', args: { index: 0 } })
    cy.task('chainTx', { action: 'approve', args: { index: 1 } })
    cy.task('chainTx', { action: 'grantMembership', args: { address: TEST_ACCOUNTS[0], tier: 4, durationDays: 365 } })
    cy.task('chainTx', { action: 'grantMembership', args: { address: TEST_ACCOUNTS[1], tier: 4, durationDays: 365 } })

    cy.task('chainTx', {
      action: 'createWager',
      args: { creatorIndex: 0, opponent: TEST_ACCOUNTS[1], description: 'NOT-01: acceptance notice' },
    }).then((created) => {
      expect(created.ok, 'the wager was created').to.equal(true)

      // The creator's FIRST look. A pending wager they made themselves is not news.
      cy.mockWeb3Provider({ account: TEST_ACCOUNTS[0], preAuthorized: true })
      cy.visitWagers()
      cy.connectWallet()
      openFeed()
      cy.get('body').then(($b) => {
        expect(
          /accepted '.*' — it.s live/i.test($b.text()),
          'the baseline poll announces no acceptance, because none has happened',
        ).to.equal(false)
      })

      // Someone else accepts, on chain.
      cy.task('chainTx', { action: 'acceptWager', args: { opponentIndex: 1, wagerId: created.wagerId } }).then((a) => {
        expect(a.ok, 'the opponent accepted').to.equal(true)
      })
      cy.task('chainTx', { action: 'wagerInfo', args: { wagerId: created.wagerId } }).then((i) => {
        expect(i.status, 'the wager really is Active on chain').to.equal(2)
      })

      /*
       * Reload to force a fresh poll against the previous snapshot. The message names the OTHER
       * party, because for the creator this is something that happened TO them — the source
       * writes a different sentence when the reader is the one who accepted.
       */
      cy.reload()
      openFeed()
      cy.contains(/accepted '.*' — it.s live/i, { timeout: 40000 }).should('be.visible')
    })
  })

  it('[NOT-02] A member with no wagers has an empty feed that says so, rather than an empty box', () => {
    /*
     * The honest-empty rule, on the notification surface. A feed that renders nothing is
     * indistinguishable from one that failed to load, and this is a surface members check
     * precisely when they are worried something happened.
     */
    cy.mockWeb3Provider({ account: TEST_ACCOUNTS[1], preAuthorized: true })
    cy.visitWagers()
    cy.connectWallet()
    openFeed()

    cy.get('body', { timeout: 40000 }).should(($b) => {
      const text = $b.text()
      expect(
        /no notifications|nothing to|all caught up|you.re up to date/i.test(text),
        `an empty feed states that it is empty. Rendered: ${text.slice(0, 300)}`,
      ).to.equal(true)
    })
  })
})
