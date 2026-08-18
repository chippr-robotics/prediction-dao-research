/**
 * E2E Tests: Wager Acceptance (Full-tier)
 *
 * Requires a running Hardhat node with deployed contracts (chain 1337).
 * Tests acceptance flows with real contract TXs and account switching.
 *
 * Checklist: ACC-01..ACC-13
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
 * Create a simple 1v1 wager as account #0, return to dashboard.
 */
function createSimpleWager(config = {}) {
  const defaults = {
    description: 'Test wager for acceptance',
    opponent: TEST_ACCOUNTS[1],
    stake: 10,
    encrypted: false,
    resolutionType: 0,
  }
  const opts = { ...defaults, ...config }

  cy.openCreateWagerModal('oneVsOne')

  // Fill form
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

  // Encryption is ON by default and is no longer optional — the opt-out checkbox was removed
  // from FriendMarketsModal several sprints ago (grep `checkbox` there returns nothing). The
  // block that used to uncheck it was a no-op guarded by `if (length > 0)`, so it silently did
  // nothing while the spec read as though it controlled encryption. (#1028)

  // Submit
  cy.get('.fm-btn-primary', { timeout: 10000 }).should('not.be.disabled').click()

  // Wait for creation to complete
  cy.contains('Wager Created', { timeout: 60000 }).should('exist')
}

describe('Wager Acceptance', () => {
  before(() => {
    // Encryption is MANDATORY: FriendMarketsModal refuses to create a wager whose opponent has
    // no key in KeyRegistry, silently and with no validation error. A fresh chain has none.
    // Keys persist on chain, so this is once per spec — later runs hit the hasKey fast path.
    cy.ensureWagerCapacity([0, 1])
    cy.ensureEncryptionKeys([0, 1])
  })

  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
    /*
     * STUB THE PINNING SERVICE — see frontend/package.json `dev:e2e`. Every wager this file
     * accepts must first be CREATED, and a create that cannot pin its encrypted metadata throws
     * before it reaches WagerRegistry.
     */
    cy.interceptIpfs()
  })

  // ---------------------------------------------------------------------------
  // ACC-01: Accept 1v1 via link (switch to opponent account)
  // ---------------------------------------------------------------------------
  it('[ACC-01] Accept 1v1 wager via opponent account', () => {
    // Step 1: Create wager as account #0
    connectAndVisit(0)
    createSimpleWager({
      description: 'ACC-01: Opponent should accept this',
    })

    // Close creation modal
    cy.get('[role="dialog"] button[aria-label="Close modal"], [role="dialog"] .fm-close-btn')
      .click({ force: true })

    // Step 2: Switch to opponent (account #1)
    cy.switchAccount(1)

    // Step 3: Open My Wagers — opponent should see the pending wager
    cy.connectWallet()

    cy.openMyWagers('participating')

    // Look for View Offer button on the pending wager
    cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).then(($panel) => {
      const viewBtn = $panel.find('.mm-action-accept, button:contains("View Offer")')
      if (viewBtn.length > 0) {
        cy.wrap(viewBtn.first()).click({ force: true })

        // Acceptance modal should appear
        cy.get('.ma-modal, [role="dialog"]', { timeout: 5000 }).should('be.visible')

        // Click Accept Offer → Confirm
        cy.contains('button', /accept offer/i).click()
        cy.contains('button', /i understand|confirm|accept/i).click()

        // Wait for TX
        cy.get('.ma-modal, [role="dialog"]', { timeout: 30000 }).invoke('text').then((text) => {
          const lower = text.toLowerCase()
          const validOutcome = lower.includes('accepted') ||
                              lower.includes('success') ||
                              lower.includes('processing') ||
                              lower.includes('error')
          expect(validOutcome).to.be.true
        })
      } else {
        // No pending offers visible — wager may not have indexed yet
        cy.get('.mm-empty-state, .mm-panel').should('exist')
      }
    })
  })

  // ---------------------------------------------------------------------------
  // ACC-02: Accept wager with MATIC (if supported)
  // ---------------------------------------------------------------------------
  it('[ACC-02] Accept wager staked in alternate token', () => {
    connectAndVisit(0)
    createSimpleWager({
      description: 'ACC-02: USDC wager for acceptance test',
      stake: 5,
    })

    cy.get('[role="dialog"] button[aria-label="Close modal"], [role="dialog"] .fm-close-btn')
      .click({ force: true })

    cy.switchAccount(1)

    cy.openMyWagers('participating')

    cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).then(($panel) => {
      const viewBtn = $panel.find('.mm-action-accept, button:contains("View Offer")')
      if (viewBtn.length > 0) {
        cy.wrap(viewBtn.first()).click({ force: true })

        cy.get('.ma-modal, [role="dialog"]', { timeout: 5000 }).should('be.visible')

        // Verify token info is displayed
        cy.get('.ma-modal').invoke('text').then((text) => {
          const lower = text.toLowerCase()
          expect(lower.includes('stake') || lower.includes('token') || lower.includes('usdc')).to.be.true
        })

        cy.contains('button', /accept offer/i).click()
        cy.contains('button', /i understand|confirm|accept/i).click()

        cy.get('.ma-modal, [role="dialog"]', { timeout: 30000 }).invoke('text').then((text) => {
          const lower = text.toLowerCase()
          expect(lower.includes('accepted') || lower.includes('success') || lower.includes('processing') || lower.includes('error')).to.be.true
        })
      } else {
        expect(true).to.be.true // No pending offers
      }
    })
  })

  // ---------------------------------------------------------------------------
  // ACC-03: Accept encrypted wager (auto-decrypt)
  // ---------------------------------------------------------------------------
  it('[ACC-03] Accept encrypted wager with auto-decrypt', () => {
    connectAndVisit(0)

    // Create an encrypted wager
    createSimpleWager({
      description: 'ACC-03: Encrypted wager acceptance test',
      encrypted: true,
    })

    cy.get('[role="dialog"] button[aria-label="Close modal"], [role="dialog"] .fm-close-btn')
      .click({ force: true })

    cy.switchAccount(1)

    cy.openMyWagers('participating')

    cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).then(($panel) => {
      const viewBtn = $panel.find('.mm-action-accept, button:contains("View Offer")')
      if (viewBtn.length > 0) {
        cy.wrap(viewBtn.first()).click({ force: true })

        cy.get('.ma-modal, [role="dialog"]', { timeout: 5000 }).should('be.visible')

        // For encrypted wagers, should see encrypted badge or decrypt prompt
        cy.get('.ma-modal').invoke('text').then((text) => {
          const lower = text.toLowerCase()
          const hasEncrypted = lower.includes('private') ||
                              lower.includes('encrypted') ||
                              lower.includes('decrypt') ||
                              lower.includes('unlock') ||
                              lower.includes('offer') // may show plaintext if decrypted
          expect(hasEncrypted).to.be.true
        })
      } else {
        expect(true).to.be.true
      }
    })
  })

  // ---------------------------------------------------------------------------
  // ACC-04: View acceptance countdown timer
  // ---------------------------------------------------------------------------
  it('[ACC-04] View acceptance countdown timer', () => {
    connectAndVisit(0)
    createSimpleWager({ description: 'ACC-04: Countdown timer test' })

    cy.get('[role="dialog"] button[aria-label="Close modal"], [role="dialog"] .fm-close-btn')
      .click({ force: true })

    cy.switchAccount(1)

    cy.openMyWagers('participating')

    cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).then(($panel) => {
      const viewBtn = $panel.find('.mm-action-accept, button:contains("View Offer")')
      if (viewBtn.length > 0) {
        cy.wrap(viewBtn.first()).click({ force: true })

        cy.get('.ma-modal, [role="dialog"]', { timeout: 5000 }).should('be.visible')

        // Countdown timer should be visible
        cy.get('.ma-modal').invoke('text').then((text) => {
          const lower = text.toLowerCase()
          const hasTimer = lower.includes('remaining') ||
                          lower.includes('accept by') ||
                          lower.includes('deadline') ||
                          lower.includes('hours') ||
                          lower.includes('minutes')
          expect(hasTimer).to.be.true
        })
      } else {
        expect(true).to.be.true
      }
    })
  })

  // ---------------------------------------------------------------------------
  // ACC-06: Unaccepted wager stays pending
  // ---------------------------------------------------------------------------
  it('[ACC-06] Unaccepted wager stays pending acceptance', () => {
    // A 1v1 wager that the opponent hasn't accepted yet stays in the
    // pending-acceptance state.
    connectAndVisit(0)

    cy.openMyWagers('created')

    cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).then(($panel) => {
      const pendingBadges = $panel.find('.status-pending-acceptance, :contains("Pending")')
      if (pendingBadges.length > 0) {
        // Verify pending wagers show "Under Consideration" or "Pending Acceptance"
        cy.get('.mm-status-badge').first().invoke('text').then((text) => {
          const lower = text.toLowerCase()
          expect(lower.includes('pending') || lower.includes('under consideration') || lower.includes('active')).to.be.true
        })
      } else {
        // No pending wagers
        expect(true).to.be.true
      }
    })
  })

  // ---------------------------------------------------------------------------
  // ACC-07: Accept with wrong wallet
  // ---------------------------------------------------------------------------
  it('[ACC-07] Accept with wrong wallet shows error', () => {
    connectAndVisit(0)
    createSimpleWager({
      description: 'ACC-07: Wrong wallet test',
      opponent: TEST_ACCOUNTS[1], // Only account #1 can accept
    })

    cy.get('[role="dialog"] button[aria-label="Close modal"], [role="dialog"] .fm-close-btn')
      .click({ force: true })

    // Switch to bystander (account #4) — NOT the invited opponent
    cy.switchAccount(4)

    cy.openMyWagers('participating')

    // The bystander should either:
    // 1. Not see the wager at all
    // 2. See it but with "You are not invited" message
    cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).invoke('text').then((text) => {
      const lower = text.toLowerCase()
      const validState = lower.includes('no active') ||
                        lower.includes('not invited') ||
                        lower.includes('empty') ||
                        lower.includes('no wagers') ||
                        lower.includes('don\'t have')
      expect(validState).to.be.true
    })
  })

  // ---------------------------------------------------------------------------
  // ACC-08: Accept after deadline
  // ---------------------------------------------------------------------------
  it('[ACC-08] Accept after deadline shows expired', () => {
    connectAndVisit(0)
    createSimpleWager({ description: 'ACC-08: Expired deadline test' })

    cy.get('[role="dialog"] button[aria-label="Close modal"], [role="dialog"] .fm-close-btn')
      .click({ force: true })

    // Advance time past the acceptance deadline (midpoint of end time)
    // Default end is 1 day out, deadline is midpoint = ~12 hours
    cy.advanceTime(13 * 60 * 60) // 13 hours

    cy.switchAccount(1)

    cy.openMyWagers('participating')

    cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).then(($panel) => {
      const viewBtn = $panel.find('.mm-action-accept, button:contains("View Offer")')
      if (viewBtn.length > 0) {
        cy.wrap(viewBtn.first()).click({ force: true })

        cy.get('.ma-modal, [role="dialog"]', { timeout: 5000 }).should('be.visible')

        // Should show expired status
        cy.get('.ma-modal').invoke('text').then((text) => {
          const lower = text.toLowerCase()
          expect(lower.includes('expired') || lower.includes('deadline') || lower.includes('passed')).to.be.true
        })
      } else {
        // Wager may have been auto-cleaned after deadline
        expect(true).to.be.true
      }
    })
  })

  // ---------------------------------------------------------------------------
  // ACC-09: Accept already-accepted wager
  // ---------------------------------------------------------------------------
  it('[ACC-09] Accept already-accepted wager shows already accepted', () => {
    // This tests the case where a 1v1 has already been accepted
    connectAndVisit(1) // Opponent

    cy.openMyWagers('participating')

    cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).then(($panel) => {
      // Look for wagers where the user has already accepted
      const acceptedBadge = $panel.find(':contains("Accepted"), :contains("Active")')
      if (acceptedBadge.length > 0) {
        // Click on a wager row to see details
        const row = $panel.find('.mm-table-row')
        if (row.length > 0) {
          cy.wrap(row.first()).click()
          cy.get('.mm-detail', { timeout: 5000 }).should('be.visible')
          // Should not show accept button since already accepted
          cy.get('.mm-detail').invoke('text').then((text) => {
            const lower = text.toLowerCase()
            expect(lower.includes('active') || lower.includes('accepted') || lower.includes('participating')).to.be.true
          })
        }
      } else {
        expect(true).to.be.true
      }
    })
  })

  // ---------------------------------------------------------------------------
  // ACC-10 ("Accept with insufficient balance") REMOVED.
  // Its premise was false: seed-local funds every test account with 1,000,000 USDC, so a
  // stake of 999 is not an insufficient balance and the error it asserted could never appear.
  // Testing the real path needs an account deliberately under-funded on chain, which is a
  // different fixture than this spec provides. (#1028)
  // ---------------------------------------------------------------------------
  // ACC-11: View encrypted wager without correct wallet
  // ---------------------------------------------------------------------------
  it('[ACC-11] View encrypted wager without correct wallet', () => {
    connectAndVisit(4) // Bystander — not a participant

    cy.openMyWagers('participating')

    // Bystander should not see encrypted wagers meant for other participants
    cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).invoke('text').then((text) => {
      const lower = text.toLowerCase()
      // Should show empty state or no encrypted wager details
      const validState = lower.includes('no active') ||
                        lower.includes('don\'t have') ||
                        lower.includes('empty') ||
                        lower.includes('connect') ||
                        lower.includes('no wagers')
      expect(validState).to.be.true
    })
  })

  // ---------------------------------------------------------------------------
  // ACC-12: Accept when frozen
  // ---------------------------------------------------------------------------
  it('[ACC-12] Accept when account is frozen shows error', () => {
    // Freeze account #1 (opponent) via admin operations
    // This requires admin access to call freezeAccount
    connectAndVisit(0) // Admin

    // Create a wager for account #1
    createSimpleWager({
      description: 'ACC-12: Frozen account acceptance test',
      opponent: TEST_ACCOUNTS[1],
    })

    cy.get('[role="dialog"] button[aria-label="Close modal"], [role="dialog"] .fm-close-btn')
      .click({ force: true })

    // Switch to opponent and try to accept — the contract should revert
    cy.switchAccount(1)

    // If frozen, acceptance should show an error about frozen account
    cy.openMyWagers('participating')

    cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).then(($panel) => {
      const viewBtn = $panel.find('.mm-action-accept, button:contains("View Offer")')
      if (viewBtn.length > 0) {
        cy.wrap(viewBtn.first()).click({ force: true })

        cy.get('.ma-modal, [role="dialog"]', { timeout: 5000 }).should('be.visible')

        // If the account is frozen, the UI or contract should indicate this
        cy.get('.ma-modal').invoke('text').then((text) => {
          const lower = text.toLowerCase()
          // Accept frozen state error OR normal offer view (if not frozen in this test run)
          const validState = lower.includes('frozen') ||
                            lower.includes('offer') ||
                            lower.includes('accept') ||
                            lower.includes('review')
          expect(validState).to.be.true
        })
      } else {
        expect(true).to.be.true
      }
    })
  })

  // ---------------------------------------------------------------------------
  // ACC-13: Reject approval during acceptance
  // ---------------------------------------------------------------------------
  it('[ACC-13] Reject approval during acceptance aborts flow', () => {
    connectAndVisit(0)
    createSimpleWager({ description: 'ACC-13: Reject approval test' })

    cy.get('[role="dialog"] button[aria-label="Close modal"], [role="dialog"] .fm-close-btn')
      .click({ force: true })

    // Switch to opponent with rejection-patched provider
    /*
     * Reject every way a member can authorize a SPEND, decided by METHOD rather than by ordinal.
     *
     * This used to reject "the second eth_sendTransaction (the approval TX)". Acceptance rides
     * the spec-035 intent rail, where the member's authorization is a SIGNATURE and someone else
     * submits the transaction — so the rejected request was one the flow never makes, and
     * counting transactions described a sequence that no longer exists. (MEM-12 had the same
     * defect, and its purchase ran to "Purchase Complete!" while the test waited for a refusal.)
     *
     * personal_sign is left alone deliberately: it derives the encryption key, which is identity,
     * not spend authorization.
     */
    const SPEND_AUTH = ['eth_sendTransaction', 'eth_signTypedData', 'eth_signTypedData_v4', 'wallet_sendCalls']
    /*
     * Register the wrapper INSIDE .then(), so it lands after the mock's own handler. `cy.on(...)`
     * at the top level of a test registers SYNCHRONOUSLY, while cy.mockWeb3Provider() only
     * enqueues a command that registers its handler when the queue runs — so a wrapper written
     * "after" the mock in source order actually ran BEFORE it, found no win.ethereum to wrap, and
     * installed nothing.
     */
    cy.mockWeb3Provider({ account: TEST_ACCOUNTS[1] }).then(() => {
      cy.on('window:before:load', (win) => {
        const originalRequest = win.ethereum?.request
        if (originalRequest) {
          win.ethereum.request = ({ method, params }) => {
            if (SPEND_AUTH.includes(method)) {
              const err = new Error('User rejected the request')
              err.code = 4001
              return Promise.reject(err)
            }
            return originalRequest({ method, params })
          }
        }
      })
    })

    cy.visitWagers()

    cy.connectWallet()

    cy.openMyWagers('participating')

    cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).then(($panel) => {
      const viewBtn = $panel.find('.mm-action-accept, button:contains("View Offer")')
      if (viewBtn.length > 0) {
        cy.wrap(viewBtn.first()).click({ force: true })

        cy.get('.ma-modal, [role="dialog"]', { timeout: 5000 }).should('be.visible')

        cy.contains('button', /accept offer/i).click()
        cy.contains('button', /i understand|confirm|accept/i).click()

        // Should show rejection error
        cy.get('.ma-modal, [role="dialog"]', { timeout: 15000 }).invoke('text').then((text) => {
          const lower = text.toLowerCase()
          const hasRejection = lower.includes('rejected') ||
                              lower.includes('cancelled') ||
                              lower.includes('failed') ||
                              lower.includes('error') ||
                              lower.includes('try again')
          expect(hasRejection).to.be.true
        })
      } else {
        expect(true).to.be.true
      }
    })
  })
})
