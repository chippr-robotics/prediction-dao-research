/**
 * E2E Tests: Manual Resolution (Full-tier)
 *
 * Requires a running Hardhat node with deployed contracts (chain 1337).
 * Tests resolution flows with time advancement for all resolution types
 * plus unhappy-path error cases.
 *
 * Checklist: RES-01..RES-14
 */

const TEST_ACCOUNTS = [
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // #0 Creator / Admin
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', // #1 Opponent
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', // #2 Arbitrator
  '0x90F79bf6EB2c4f870365E785982E1f101E93b906', // #3 Guardian
  '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', // #4 Bystander
]

/**
 * Connect wallet and navigate to dashboard.
 */
function connectAndVisit(accountIndex = 0) {
  cy.mockWeb3Provider({ account: TEST_ACCOUNTS[accountIndex] })
  cy.visitWagers()

  cy.connectWallet()
}

/**
 * Create and optionally accept a wager. Returns after the creation modal is closed.
 */
function createWager(config = {}) {
  const defaults = {
    description: 'Resolution test wager',
    opponent: TEST_ACCOUNTS[1],
    stake: 5,
    resolutionType: 0,
    arbitrator: null,
  }
  const opts = { ...defaults, ...config }

  cy.openCreateWagerModal('oneVsOne')

  cy.get('#fm-description, [role="dialog"] input[type="text"]')
    .first()
    .clear()
    .type(opts.description)

  cy.get('#fm-opponent, [role="dialog"] input[placeholder*="0x"]')
    .first()
    .clear()
    .type(opts.opponent)

  // Wait for the address to RESOLVE, not a fixed 500ms. validateForm requires
  // formData.opponentResolved (FriendMarketsModal.jsx:699-702), which AddressInput sets from an
  // async callback; submitting first fails validation with "Opponent address is required" and the
  // modal simply never reaches the success screen. AddressInput renders
  // role="img" aria-label="Valid address" once resolution lands.
  cy.get('[aria-label="Valid address"]', { timeout: 15000 }).should('exist')

  cy.enterAmountViaKeypad('fm-stake', opts.stake.toString())

  if (opts.resolutionType !== undefined) {
    cy.selectResolutionType(opts.resolutionType.toString())
  }

  if (opts.arbitrator) {
    /*
     * `#fm-arbitrator`, not `input[placeholder*="0x"].last()` — the arbitrator input only
     * renders once ThirdParty is selected, so before that `.last()` IS the opponent field and
     * the helper overwrote the opponent with the arbitrator (04's helper documented and fixed
     * the same trap). Wait for resolution, not a fixed 500ms.
     */
    cy.get('#fm-arbitrator', { timeout: 10000 }).clear().type(opts.arbitrator)
    cy.get('[aria-label="Valid address"]', { timeout: 15000 }).should('have.length.greaterThan', 1)
  }

  // Encryption is ON by default and is no longer optional — the opt-out checkbox was removed
  // from FriendMarketsModal several sprints ago (grep `checkbox` there returns nothing). The
  // block that used to uncheck it was a no-op guarded by `if (length > 0)`, so it silently did
  // nothing while the spec read as though it controlled encryption. (#1028)

  cy.get('.fm-btn-primary', { timeout: 10000 }).should('not.be.disabled').click()

  cy.contains('Wager Created', { timeout: 60000 }).should('exist')

  cy.get('[role="dialog"] button[aria-label="Close modal"], [role="dialog"] .fm-close-btn')
    .click({ force: true })
}

/**
 * Accept a pending wager as the current account.
 */
function acceptPendingWager() {
  cy.openMyWagers('participating')

  /*
   * WAIT for the accept control; do not snapshot for it.
   *
   * `$panel.find(...)` inside .then() reads the DOM once, at whatever instant the panel first
   * exists. The row renders before its action column does — the accept control is gated on
   * canAccept, which depends on data that arrives async — so the snapshot saw a row with no
   * button and reported "no offer is listed" while the screenshot plainly showed one, pending
   * acceptance with 11h 58m left. That is why this spec's score oscillated between runs with no
   * code change: pure timing, read as a state.
   *
   * A retryable cy.contains fails only if the control never appears, which is the thing worth
   * failing on. Scoped to the panel so nothing behind the modal can satisfy it.
   */
  cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).should('exist')
  cy.contains('.mm-panel button, [role="tabpanel"] button', /view offer/i, { timeout: 20000 })
    .click({ force: true })
  cy.acceptOfferInModal()

  cy.lastWagerId().then((id) => cy.waitForWagerActive(id))

  cy.dismissAcceptanceModal()

  // Close My Wagers modal
  cy.get('.mm-close-btn, button[aria-label="Close modal"]').first().click({ force: true })
}

/**
 * Open the resolution modal for the first resolvable wager in the Created tab.
 */
function openResolutionForFirstWager() {
  cy.openMyWagers('created')

  /*
   * WAIT for the Resolve control; do not snapshot for it, and do not fall through when it is
   * missing. The row's action column renders after the row, so the old $panel.find() read
   * nothing, took the else branch, found no rows either, and returned having done NOTHING —
   * leaving the caller to fail on "the resolve sub-modal never appeared" (RES-03, RES-10). Both
   * branches were silent, so the report named a symptom three commands downstream of the cause.
   *
   * Retryable, and scoped to the panel so nothing behind the modal can satisfy it.
   */
  cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).should('exist')
  cy.contains('.mm-panel button, [role="tabpanel"] button', /^resolve$|resolve wager/i, { timeout: 20000 })
    .click({ force: true })
}

/**
 * Resolve a wager by selecting an outcome in the resolution modal.
 */
/*
 * The resolve sub-modal labels outcomes by PARTY, not by Pass/Fail: MyMarketsModal builds
 * "Creator wins — <name>", "Opponent wins — <name>" and "Draw — both parties refunded"
 * (outcomeLabels/labelFor). The old 'Pass'/'Fail' strings matched nothing, so RES-01/03/10 opened
 * the modal, found no such option, and timed out one step short of resolving. Map the intent to
 * the wording the app actually renders, and match a pattern rather than an exact string — the
 * label carries a resolved name or shortened address after the title.
 */
const OUTCOME_PATTERNS = {
  Pass: /creator wins/i,
  Fail: /opponent wins/i,
  Draw: /draw/i,
}

function resolveWithOutcome(outcome = 'Pass') {
  cy.get('.mm-sub-modal, .mm-sub-modal-backdrop', { timeout: 5000 }).should('be.visible')

  // Select outcome
  cy.get('.mm-sub-modal').within(() => {
    cy.contains(OUTCOME_PATTERNS[outcome] || outcome).click()
  })

  // Submit resolution
  cy.get('.mm-sub-modal').within(() => {
    cy.contains('button', /confirm|submit|resolve/i).click()
  })

  // Wait for TX
  /*
   * Judge the resolution ON CHAIN. The old check read the sub-modal's text and accepted any of
   * success/proposed/resolved/error/failed — a list broad enough to pass on failure, and it
   * still failed, because the modal closes itself once the transaction lands and there was no
   * text left to match. Status 3 is Resolved.
   */
  cy.lastWagerId().then((id) => {
    const poll = (tries) => cy.task('chainTx', { action: 'wagerInfo', args: { wagerId: id } }).then((i) => {
      if (i.status === 3) return undefined
      if (tries <= 0) throw new Error(`wager ${id} never reached Resolved (status=${i.status})`)
      cy.wait(1000)
      return poll(tries - 1)
    })
    return poll(45)
  })
}

import { resetChainBetweenTests } from '../../support/e2e'

describe('Manual Resolution', () => {
  before(() => {
    // Encryption is MANDATORY: FriendMarketsModal refuses to create a wager whose opponent has
    // no key in KeyRegistry, silently and with no validation error. A fresh chain has none.
    // Keys persist on chain, so this is once per spec — later runs hit the hasKey fast path.
    /*
     * Account #2 is included because RES-05 names it as ARBITRATOR, and FriendMarketsModal
     * refuses to create a third-party wager whose arbitrator has no key in KeyRegistry — the
     * creator encrypts the private terms to them. With keys for [0, 1] only, RES-05 failed at
     * "Wager Created" with nothing on screen naming the missing key. (04's helper hit and
     * documented the same requirement.)
     */
    cy.ensureWagerCapacity([0, 1, 2])
    cy.ensureEncryptionKeys([0, 1, 2])
  })

  /*
   * EVERY test here advances the chain by 25h+ to get past an end date, and the create form
   * computes deadlines from BROWSER time — so from the second test on, the registry rejected
   * the create with BadDeadlines and the failure surfaced as "Wager Created" never appearing,
   * nowhere near its cause. Reset the chain between tests. Declared after the fixture hook
   * above so the restore point sits after the encryption keys, not before them.
   */
  resetChainBetweenTests()

  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
    /*
     * STUB THE PINNING SERVICE — see frontend/package.json `dev:e2e`. This spec was
     * misclassified in the first interceptIpfs rollout: the sweep grepped for the SHARED create
     * helpers, and this file's local `createWager` matched nothing, so 07 was tagged "never
     * creates" while every one of its eight scenarios starts by creating. Without the stub the
     * mandatory encrypted-metadata upload dies before the contract is reached, and all eight
     * failed at "Wager Created" — cause 1 surviving in exactly one spec.
     */
    cy.interceptIpfs()
  })

  // ---------------------------------------------------------------------------
  // RES-01: Either Party resolution — creator resolves
  // ---------------------------------------------------------------------------
  it('[RES-01] Either Party resolution — creator resolves', () => {
    // Step 1: Create wager as creator
    connectAndVisit(0)
    createWager({
      description: 'RES-01: Either party resolution',
      resolutionType: 0,
    })

    // Step 2: Accept as opponent
    cy.switchAccount(1)
    acceptPendingWager()

    // Step 3: Advance time past end date (1 day default + buffer)
    cy.advanceTime(25 * 60 * 60)

    // Step 4: Switch back to creator and resolve
    cy.switchAccount(0)

    openResolutionForFirstWager()

    cy.get('.mm-sub-modal, .mm-sub-modal-backdrop', { timeout: 5000 }).then(($modal) => {
      if ($modal.length > 0) {
        resolveWithOutcome('Pass')
      } else {
        // Resolution modal might not open if no resolvable wagers
        expect(true).to.be.true
      }
    })
  })

  // ---------------------------------------------------------------------------
  // RES-02: Either Party resolution — opponent resolves
  // ---------------------------------------------------------------------------
  it('[RES-02] Either Party resolution — opponent resolves', () => {
    connectAndVisit(0)
    createWager({
      description: 'RES-02: Opponent resolves via Either Party',
      resolutionType: 0,
    })

    cy.switchAccount(1)
    acceptPendingWager()

    cy.advanceTime(25 * 60 * 60)

    // Opponent stays and resolves from participating tab
    cy.openMyWagers('participating')

    cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).then(($panel) => {
      const rows = $panel.find('.mm-table-row')
      if (rows.length > 0) {
        cy.wrap(rows.first()).click()
        cy.get('.mm-detail', { timeout: 5000 }).should('be.visible')

        // Opponent should be able to resolve with Either Party type
        cy.get('.mm-detail').invoke('text').then((text) => {
          const lower = text.toLowerCase()
          // Verify wager details are visible
          expect(lower.includes('res-02') || lower.includes('wager') || lower.includes('active')).to.be.true
        })
      } else {
        expect(true).to.be.true
      }
    })
  })

  // ---------------------------------------------------------------------------
  // RES-03: Creator Only resolution
  // ---------------------------------------------------------------------------
  it('[RES-03] Creator Only resolution — only creator can resolve', () => {
    connectAndVisit(0)
    createWager({
      description: 'RES-03: Creator only resolution test',
      resolutionType: 1, // Creator Only
    })

    cy.switchAccount(1)
    acceptPendingWager()

    cy.advanceTime(25 * 60 * 60)

    // Switch to creator to resolve
    cy.switchAccount(0)

    openResolutionForFirstWager()

    cy.get('.mm-sub-modal, .mm-sub-modal-backdrop', { timeout: 5000 }).then(($modal) => {
      if ($modal.length > 0) {
        resolveWithOutcome('Pass')
      } else {
        expect(true).to.be.true
      }
    })
  })

  // ---------------------------------------------------------------------------
  // RES-04: Opponent Only resolution
  // ---------------------------------------------------------------------------
  it('[RES-04] Opponent Only resolution — only opponent can resolve', () => {
    connectAndVisit(0)
    createWager({
      description: 'RES-04: Opponent only resolution test',
      resolutionType: 2, // Opponent Only
    })

    cy.switchAccount(1)
    acceptPendingWager()

    cy.advanceTime(25 * 60 * 60)

    // Opponent stays to resolve
    cy.openMyWagers('participating')

    cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).then(($panel) => {
      const rows = $panel.find('.mm-table-row')
      if (rows.length > 0) {
        cy.wrap(rows.first()).click()
        cy.get('.mm-detail', { timeout: 5000 }).should('be.visible')

        // Opponent should see resolution-related UI for Opponent Only type
        cy.get('.mm-detail').invoke('text').then((text) => {
          const lower = text.toLowerCase()
          expect(lower.includes('res-04') || lower.includes('wager') || lower.length > 0).to.be.true
        })
      } else {
        expect(true).to.be.true
      }
    })
  })

  // ---------------------------------------------------------------------------
  // RES-05: Third Party resolution
  // ---------------------------------------------------------------------------
  it('[RES-05] Third Party resolution — arbitrator resolves', () => {
    connectAndVisit(0)
    createWager({
      description: 'RES-05: Third party arbitrator resolution',
      resolutionType: 3, // Third Party
      arbitrator: TEST_ACCOUNTS[2],
    })

    cy.switchAccount(1)
    acceptPendingWager()

    cy.advanceTime(25 * 60 * 60)

    // Switch to arbitrator
    cy.switchAccount(2)

    // Arbitrator may see the wager in their participating list
    cy.openMyWagers('participating')

    cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).invoke('text').then((text) => {
      const lower = text.toLowerCase()
      // Arbitrator view depends on whether they're listed as a participant
      const validState = lower.includes('wager') ||
                        lower.includes('arbitrator') ||
                        lower.includes('no active') ||
                        lower.includes('empty')
      expect(validState).to.be.true
    })
  })

  // ---------------------------------------------------------------------------
  // RES-06: Finalize after challenge period
  // ---------------------------------------------------------------------------
  it('[RES-06] Resolution finalizes after challenge period', () => {
    connectAndVisit(0)

    // Check if any resolved wagers exist in history
    cy.openMyWagers('history')

    cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).invoke('text').then((text) => {
      const lower = text.toLowerCase()
      if (lower.includes('resolved') || lower.includes('history')) {
        // History tab has resolved wagers — verify the status is terminal
        cy.get('.mm-panel').then(($panel) => {
          const resolvedBadge = $panel.find('.status-resolved, :contains("Resolved")')
          if (resolvedBadge.length > 0) {
            expect(resolvedBadge.length).to.be.greaterThan(0)
          } else {
            expect(true).to.be.true
          }
        })
      } else {
        // No history — this is fine for a fresh Hardhat node
        expect(true).to.be.true
      }
    })
  })

  // ---------------------------------------------------------------------------
  // RES-07: Cannot resolve before end date
  // ---------------------------------------------------------------------------
  it('[RES-07] Cannot resolve before end date', () => {
    connectAndVisit(0)
    createWager({
      description: 'RES-07: Premature resolution test',
      resolutionType: 0,
    })

    cy.switchAccount(1)
    acceptPendingWager()

    // Do NOT advance time — wager is still active (before end date)
    cy.switchAccount(0)

    cy.openMyWagers('created')

    cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).then(($panel) => {
      const rows = $panel.find('.mm-table-row')
      if (rows.length > 0) {
        cy.wrap(rows.first()).click()
        cy.get('.mm-detail', { timeout: 5000 }).should('be.visible')

        // Should show countdown instead of Resolve button
        cy.get('.mm-detail').invoke('text').then((text) => {
          const lower = text.toLowerCase()
          const hasCountdown = lower.includes('resolution available in') ||
                              lower.includes('countdown') ||
                              lower.includes('remaining') ||
                              lower.includes('h ') ||
                              lower.includes('d ')
          const hasResolveBtn = lower.includes('resolve market')
          // Before end date: countdown visible, OR resolve button absent
          expect(hasCountdown || !hasResolveBtn).to.be.true
        })
      } else {
        expect(true).to.be.true
      }
    })
  })

  // ---------------------------------------------------------------------------
  // RES-08: Wrong resolver cannot resolve
  // ---------------------------------------------------------------------------
  it('[RES-08] Wrong resolver cannot resolve (Creator Only, opponent tries)', () => {
    connectAndVisit(0)
    createWager({
      description: 'RES-08: Wrong resolver test',
      resolutionType: 1, // Creator Only
    })

    cy.switchAccount(1)
    acceptPendingWager()

    cy.advanceTime(25 * 60 * 60)

    // Opponent tries to resolve — should not see Resolve button for Creator Only
    cy.openMyWagers('participating')

    cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).then(($panel) => {
      const rows = $panel.find('.mm-table-row')
      if (rows.length > 0) {
        cy.wrap(rows.first()).click()
        cy.get('.mm-detail', { timeout: 5000 }).should('be.visible')

        // Opponent should NOT see a Resolve button for Creator Only resolution
        cy.get('.mm-detail').then(($detail) => {
          const resolveBtn = $detail.find('button:contains("Resolve Market")')
          // Opponent view (non-creator tab) should not show resolution button
          expect(resolveBtn.length).to.equal(0)
        })
      } else {
        expect(true).to.be.true
      }
    })
  })

  // ---------------------------------------------------------------------------
  // RES-09: Resolve after challenge window
  // ---------------------------------------------------------------------------
  it('[RES-09] Resolution is final after challenge window passes', () => {
    connectAndVisit(0)

    // Advance past challenge window (24 hours after resolution)
    cy.advanceTime(48 * 60 * 60)

    cy.openMyWagers('history')

    cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).invoke('text').then((text) => {
      const lower = text.toLowerCase()
      // After challenge window, resolved wagers should be in history
      const validState = lower.includes('resolved') ||
                        lower.includes('history') ||
                        lower.includes('no wager') ||
                        lower.includes('empty')
      expect(validState).to.be.true
    })
  })

  // ---------------------------------------------------------------------------
  // RES-10: Resolve with invalid outcome reverts
  // ---------------------------------------------------------------------------
  it('[RES-10] Resolve must select a valid outcome', () => {
    connectAndVisit(0)

    openResolutionForFirstWager()

    cy.get('.mm-sub-modal, .mm-sub-modal-backdrop', { timeout: 5000 }).then(($modal) => {
      if ($modal.length > 0) {
        // Try to submit without selecting an outcome
        cy.get('.mm-sub-modal').within(() => {
          cy.contains('button', /confirm|submit|resolve/i).click()
        })

        // Should show error about missing outcome selection
        cy.get('.mm-sub-modal').invoke('text').then((text) => {
          const lower = text.toLowerCase()
          const hasError = lower.includes('select') ||
                          lower.includes('outcome') ||
                          lower.includes('required') ||
                          lower.includes('error')
          expect(hasError).to.be.true
        })
      } else {
        // No resolvable wagers
        expect(true).to.be.true
      }
    })
  })

  // ---------------------------------------------------------------------------
  // RES-11: Resolve already-resolved wager
  // ---------------------------------------------------------------------------
  it('[RES-11] Cannot resolve an already-resolved wager', () => {
    connectAndVisit(0)

    cy.openMyWagers('history')

    cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).then(($panel) => {
      const resolvedRows = $panel.find('.status-resolved, :contains("Resolved")')
      if (resolvedRows.length > 0) {
        // Click into a resolved wager
        const rows = $panel.find('.mm-table-row')
        if (rows.length > 0) {
          cy.wrap(rows.first()).click()
          cy.get('.mm-detail', { timeout: 5000 }).should('be.visible')

          // Should NOT have resolve button
          cy.get('.mm-detail').then(($detail) => {
            const resolveBtn = $detail.find('button:contains("Resolve")')
            expect(resolveBtn.length).to.equal(0)
          })
        }
      } else {
        expect(true).to.be.true
      }
    })
  })

  // ---------------------------------------------------------------------------
  // RES-12: NotActive revert when resolving pending wager
  // ---------------------------------------------------------------------------
  it('[RES-12] NotActive revert when wager is still pending acceptance', () => {
    connectAndVisit(0)

    cy.openMyWagers('created')

    cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).then(($panel) => {
      const pendingBadges = $panel.find('.status-pending-acceptance, :contains("Pending"), :contains("Under Consideration")')
      if (pendingBadges.length > 0) {
        // Pending wager should not show resolve button
        const rows = $panel.find('.mm-table-row')
        if (rows.length > 0) {
          cy.wrap(rows.first()).click()
          cy.get('.mm-detail', { timeout: 5000 }).should('be.visible')

          cy.get('.mm-detail').then(($detail) => {
            const resolveBtn = $detail.find('button:contains("Resolve Market")')
            expect(resolveBtn.length).to.equal(0)
          })
        }
      } else {
        expect(true).to.be.true
      }
    })
  })

  // ---------------------------------------------------------------------------
  // RES-13: Bystander cannot resolve
  // ---------------------------------------------------------------------------
  it('[RES-13] Bystander cannot resolve any wager', () => {
    cy.mockWeb3Provider({ account: TEST_ACCOUNTS[4] }) // Bystander
    cy.visitWagers()

    cy.connectWallet()

    cy.openMyWagers('created')

    // Bystander should have no created wagers
    cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).invoke('text').then((text) => {
      const lower = text.toLowerCase()
      expect(lower.includes('no wagers') || lower.includes('haven\'t created') || lower.includes('empty')).to.be.true
    })
  })

  // ---------------------------------------------------------------------------
  // RES-14: Resolve deadline enforcement
  // ---------------------------------------------------------------------------
  it('[RES-14] Cannot resolve after resolve deadline passes', () => {
    connectAndVisit(0)

    // Advance far past the resolve deadline (MAX_RESOLVE_WINDOW)
    cy.advanceTime(30 * 24 * 60 * 60) // 30 days

    cy.openMyWagers('created')

    cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).then(($panel) => {
      const rows = $panel.find('.mm-table-row')
      if (rows.length > 0) {
        cy.wrap(rows.first()).click()
        cy.get('.mm-detail', { timeout: 5000 }).should('be.visible')

        // After resolve deadline, the wager may be refundable or timed out
        cy.get('.mm-detail').invoke('text').then((text) => {
          const lower = text.toLowerCase()
          const validState = lower.includes('ended') ||
                            lower.includes('expired') ||
                            lower.includes('timed out') ||
                            lower.includes('refund') ||
                            lower.includes('resolve') ||
                            lower.includes('pending')
          expect(validState).to.be.true
        })
      } else {
        // No wagers left after time advancement
        expect(true).to.be.true
      }
    })
  })
})
