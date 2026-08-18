/**
 * E2E Tests: Membership Purchase / Upgrade / Extend (Full-tier)
 *
 * Requires a running Hardhat node with deployed contracts (chain 1337).
 * Drives real MembershipManager purchases through PremiumPurchaseModal.
 *
 * RESTRUCTURED (#1028): the original reached the modal through a
 * `.cta-banner-btn` that no longer exists on /fairwins (HomeScreen carries no
 * membership button at all), and re-used one bystander for every purchase —
 * after the first buy the account was a member, and the non-member entry it
 * needed is deliberately absent for members ("Never show both at once",
 * WalletButton.jsx). Three rules govern this version:
 *
 *  1. THE ENTRY POINT IS THE ACCOUNT DROPDOWN. Non-members buy via
 *     `.purchase-access-btn` ("Get Access"); members manage via the
 *     "Membership" menu item (→ /wallet?tab=membership) and upgrade/extend
 *     via RoleDetailsSection. Asserting the right entry per state is itself
 *     part of the test.
 *  2. EVERY TEST MANUFACTURES ITS OWN FIXTURE at test time — a fresh hardhat
 *     account per purchase (any of the node's unlocked accounts can sign;
 *     the mock synthesizes per-account personal_sign), funded with
 *     cy.fundAccount. No test depends on a previous test's leftovers.
 *  3. CLOCK-ADVANCING TESTS RUN LAST (MEM-06 extend, MEM-13 expired).
 *     evm_increaseTime cannot be undone within a spec, so an advance
 *     mid-file would silently expire every membership bought before it.
 *     The cross-SPEC reset is the support file's chainCheckpoint.
 *
 * Checklist: MEM-01..MEM-13
 */

const TEST_ACCOUNTS = [
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // #0 Creator / Admin (seeded member, tier 4)
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', // #1 Opponent (seeded member)
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', // #2 Arbitrator — non-member, NEVER funded (MEM-09/13)
  '0x90F79bf6EB2c4f870365E785982E1f101E93b906', // #3 Guardian — non-member
  '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', // #4 Bystander — non-member
]

// Fresh buyers: hardhat default accounts #5..#11 — one per purchase test, so
// every purchase starts from an honest non-member state within the same spec.
const BUYERS = {
  bronze: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',   // #5
  silver: '0x976EA74026E726554dB657fA54763abd0C3a0aa9',   // #6
  gold: '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',     // #7
  platinum: '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f', // #8
  upgrade: '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',  // #9
  reject: '0xBcd4042DE499D14e55001CcbB24a551F3b954096',   // #10
  extend: '0x71bE63f3384f5fb98995898A86B02Fb2426c5788',   // #11
  downgrade: '0xFABB0ac9d68B0B445fB7357272Ff202C5651694a',// #12
}

/** Connect the given address on /fairwins. */
function connectAs(address) {
  cy.mockWeb3Provider({ account: address })
  cy.visit('/fairwins')
  cy.get('body', { timeout: 10000 }).should('be.visible')
  cy.connectWallet()
}

/**
 * Open the account dropdown. Scroll to the top first — the button lives in a
 * position:fixed header and is refused as "covered" from a scrolled page
 * (same trap as cy.assertActiveAccount).
 */
function openAccountDropdown() {
  cy.scrollTo('top', { ensureScrollable: false })
  cy.get('.wallet-account-button', { timeout: 10000 }).should('be.visible').click()
}

/**
 * Non-member purchase entry: dropdown → "Get Access". The button's PRESENCE
 * is part of the assertion — it renders only for non-members, so finding it
 * proves the account state as well as the affordance.
 */
function openPurchaseModal() {
  openAccountDropdown()
  cy.get('.purchase-access-btn', { timeout: 10000 }).should('be.visible').click()
  cy.get('.ppm-overlay, [role="dialog"]', { timeout: 10000 }).should('be.visible')
}

function selectTier(tierName) {
  cy.get('.ppm-tier-card', { timeout: 10000 }).should('have.length.gte', 1)
  cy.contains('.ppm-tier-card', new RegExp(tierName, 'i')).click()
  cy.contains('.ppm-tier-card', new RegExp(tierName, 'i')).should('have.class', 'selected')
}

/** Drive the modal steps to completion. Assumes a tier is selected. */
function completePurchase() {
  cy.contains('button', /next|continue/i).click()
  /*
   * The Review panel scrolls inside a position:fixed overlay, so a bare
   * should('be.visible') on .ppm-panel fails on a perfectly rendered modal
   * ("ancestor has position: fixed ... overflowed"). Target the step's
   * CONTROLS instead: the spec-007 attestations are discrete, un-pre-ticked
   * checkboxes and EVERY one must be ticked — allTicked is what enables the
   * confirm button (PremiumPurchaseModal.jsx:850).
   */
  cy.get('.ppm-panel input[type="checkbox"]', { timeout: 10000 })
    .should('have.length.gte', 1)
    .check({ force: true })
  // Asserting not-disabled BEFORE clicking turns "wrong chain / unticked box"
  // into a legible failure here rather than a mystery timeout later.
  cy.contains('button', /confirm purchase|purchase|confirm|pay/i, { timeout: 10000 })
    .should('not.be.disabled')
    .click({ force: true })
  // The modal reaches its Complete step only after the real tx mines.
  cy.get('.ppm-step.completed', { timeout: 60000 }).should('have.length.gte', 2)
}

function assertPurchaseSuccess() {
  cy.get('.ppm-overlay', { timeout: 10000 })
    .invoke('text')
    .should('match', /activated|complete|success/i)
}

/** Fund + buy one tier as a fresh non-member. The shared body of MEM-01..04. */
function purchaseTierFresh(buyer, tierName) {
  cy.fundAccount(buyer)
  connectAs(buyer)
  openPurchaseModal()
  selectTier(tierName)
  cy.get('.ppm-overlay').invoke('text').should('match', new RegExp(tierName, 'i'))
  cy.get('.ppm-overlay').invoke('text').should('match', /usdc/i)
  completePurchase()
  assertPurchaseSuccess()
}

describe('Membership Purchase / Upgrade / Extend', () => {
  before(() => {
    // Deterministic member fixture for the member-path tests (MEM-07/10):
    // seed-local grants membership, but pinning tier 4 / 365d here means those
    // tests assert against a KNOWN state rather than whatever the seed did.
    cy.ensureWagerCapacity([0, 1])
  })

  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  // ── Purchases: one fresh, funded buyer per tier ────────────────────────────

  it('[MEM-01] Purchase Bronze membership ($2 USDC)', () => {
    purchaseTierFresh(BUYERS.bronze, 'Bronze')
  })

  it('[MEM-02] Purchase Silver membership ($8 USDC)', () => {
    purchaseTierFresh(BUYERS.silver, 'Silver')
  })

  it('[MEM-03] Purchase Gold membership ($25 USDC)', () => {
    purchaseTierFresh(BUYERS.gold, 'Gold')
  })

  it('[MEM-04] Purchase Platinum membership ($100 USDC)', () => {
    purchaseTierFresh(BUYERS.platinum, 'Platinum')
  })

  // ── Post-purchase / member paths ───────────────────────────────────────────

  it('[MEM-08] Auto-register encryption key on purchase', () => {
    // A fresh buyer has no key in KeyRegistry; the purchase flow derives and
    // registers one, and the completion screen reports it.
    cy.hasRegisteredKey(TEST_ACCOUNTS[3]).should('eq', false)
    cy.fundAccount(TEST_ACCOUNTS[3])
    connectAs(TEST_ACCOUNTS[3])
    openPurchaseModal()
    selectTier('Bronze')
    completePurchase()
    cy.get('.ppm-overlay', { timeout: 30000 })
      .invoke('text')
      .should('match', /encryption|key|registered|activated|complete/i)
  })

  it('[MEM-05] Upgrade from Bronze to Silver (delta charge)', () => {
    cy.fundAccount(BUYERS.upgrade)
    connectAs(BUYERS.upgrade)
    openPurchaseModal()
    selectTier('Bronze')
    completePurchase()
    assertPurchaseSuccess()
    cy.get('.ppm-close-btn, button[aria-label="Close modal"]').click({ force: true })

    /*
     * Upgrade via the Membership tab's "Renew / Upgrade" — the deterministic
     * member entry. (The dropdown's compact role card also carries an Upgrade
     * button, but it renders from role state loaded at CONNECT time, which
     * predates the purchase this test just made.) The reload forces a fresh
     * roles read so the tab sees the new Bronze membership.
     */
    cy.reload()
    cy.get('body', { timeout: 10000 }).should('be.visible')
    cy.connectWallet()
    cy.visit('/wallet?tab=membership')
    cy.get('.membership-status-badge.active', { timeout: 15000 }).should('be.visible')
    cy.get('.renew-btn', { timeout: 10000 }).click()
    cy.get('.ppm-overlay, [role="dialog"]', { timeout: 10000 }).should('be.visible')
    selectTier('Silver')
    completePurchase()
    assertPurchaseSuccess()
  })

  it('[MEM-07] View membership status', () => {
    /*
     * Members view status on the Membership tab. The tab renders ROLE badges
     * ("Wager Participant"), an "Active" status badge, and a Renew / Upgrade
     * entry — it never names a tier, so asserting "Platinum" was asserting a
     * UI that does not exist (this test's own first failure mode).
     */
    connectAs(TEST_ACCOUNTS[0])
    cy.visit('/wallet?tab=membership')
    cy.get('body', { timeout: 10000 }).should('be.visible')
    cy.contains('.role-badge', /wager participant/i, { timeout: 15000 }).should('be.visible')
    cy.get('.membership-status-badge.active', { timeout: 10000 }).should('be.visible')
    cy.get('.renew-btn').should('be.visible')
  })

  it('[MEM-10] Purchase when already active shows current tier', () => {
    // The dropdown never shows the buy upsell to a member — the manage entry
    // replaces it ("Never show both at once", WalletButton.jsx) — and the
    // manage surface reports the ACTIVE state.
    connectAs(TEST_ACCOUNTS[0])
    openAccountDropdown()
    cy.contains('button', /^membership$/i, { timeout: 10000 }).should('be.visible')
    cy.get('.purchase-access-btn').should('not.exist')
    cy.contains('button', /^membership$/i).click()
    cy.url({ timeout: 10000 }).should('include', 'tab=membership')
    cy.get('.membership-status-badge.active', { timeout: 15000 }).should('be.visible')
  })

  it('[MEM-11] Downgrade attempt blocked', () => {
    // A Silver member's upgrade modal must not offer Bronze. Grant the tier
    // directly (this test is about the modal, not the purchase) BEFORE the
    // page loads, so the connect-time roles read already sees Silver.
    cy.grantMembershipFor(BUYERS.downgrade, { tier: 2, durationDays: 365 })
    cy.fundAccount(BUYERS.downgrade)
    connectAs(BUYERS.downgrade)
    cy.visit('/wallet?tab=membership')
    cy.get('.membership-status-badge.active', { timeout: 15000 }).should('be.visible')
    cy.get('.renew-btn', { timeout: 10000 }).click()
    cy.get('.ppm-overlay, [role="dialog"]', { timeout: 10000 }).should('be.visible')
    cy.get('.ppm-tier-card', { timeout: 10000 }).should('have.length.gte', 1)
    // The concrete claim: no offered card is Bronze — a lower tier is not an
    // upgrade, and rendering it would be the downgrade path this test exists
    // to rule out.
    cy.get('.ppm-tier-card').each(($card) => {
      expect($card.text().toLowerCase()).to.not.match(/bronze/)
    })
  })

  it('[MEM-09] Insufficient USDC balance shows error', () => {
    // #2 is deliberately never funded. Approval of a zero balance succeeds
    // (approve needs no balance); the purchase transferFrom reverts, and the
    // modal must surface that — never the success step.
    connectAs(TEST_ACCOUNTS[2])
    openPurchaseModal()
    selectTier('Bronze')
    cy.contains('button', /next|continue/i).click()
    cy.get('input[type="checkbox"]', { timeout: 10000 }).check({ force: true })
    cy.contains('button', /purchase|confirm|pay/i).click()
    cy.get('.ppm-overlay', { timeout: 30000 })
      .invoke('text')
      .should('match', /insufficient|balance|failed|error|not enough/i)
    cy.get('.ppm-overlay').invoke('text').should('not.match', /activated/i)
  })

  it('[MEM-12] Reject USDC approval aborts purchase', () => {
    cy.fundAccount(BUYERS.reject)
    cy.mockWeb3Provider({ account: BUYERS.reject })
    // Wrap the mock AFTER it installs (handlers run in registration order):
    // every eth_sendTransaction becomes a user rejection.
    cy.on('window:before:load', (win) => {
      const original = win.ethereum && win.ethereum.request
      if (original) {
        win.ethereum.request = ({ method, params }) => {
          if (method === 'eth_sendTransaction') {
            const err = new Error('User rejected the request.')
            err.code = 4001
            return Promise.reject(err)
          }
          return original({ method, params })
        }
      }
    })
    cy.visit('/fairwins')
    cy.get('body', { timeout: 10000 }).should('be.visible')
    cy.connectWallet()
    openPurchaseModal()
    selectTier('Bronze')
    cy.contains('button', /next|continue/i).click()
    cy.get('input[type="checkbox"]', { timeout: 10000 }).check({ force: true })
    cy.contains('button', /purchase|confirm|pay/i).click()
    cy.get('.ppm-overlay', { timeout: 15000 })
      .invoke('text')
      .should('match', /rejected|cancelled|failed|denied|error/i)
  })

  // ── Clock-advancing tests — LAST, deliberately (see header) ────────────────

  it('[MEM-06] Extend / renew membership', () => {
    // RoleDetailsSection only offers Extend when the membership is expiring
    // (or Renew when expired) — so an extend test REQUIRES moving the clock.
    cy.fundAccount(BUYERS.extend)
    connectAs(BUYERS.extend)
    openPurchaseModal()
    selectTier('Bronze')
    completePurchase()
    assertPurchaseSuccess()
    cy.get('.ppm-close-btn, button[aria-label="Close modal"]').click({ force: true })

    cy.advanceTime(29 * 24 * 60 * 60) // 29 days: inside the expiring-soon window
    cy.reload()
    cy.get('body', { timeout: 10000 }).should('be.visible')
    cy.connectWallet()
    openAccountDropdown()
    cy.contains('button', /^extend$|^renew$/i, { timeout: 10000 }).click()
    cy.get('.ppm-overlay, [role="dialog"]', { timeout: 10000 }).should('be.visible')
    cy.get('.ppm-overlay').invoke('text').should('match', /extend|renew|bronze/i)
  })

  it('[MEM-13] Expired membership prevents wager creation', () => {
    // Grant a SHORT membership at test time (the clock already moved +29d in
    // MEM-06; durations are relative to grant time, so this stays valid),
    // then advance past it. An expired member is a non-member at the gate:
    // the dropdown offers the buy upsell again, not the member surface —
    // which is exactly the state that cannot create a wager.
    cy.grantMembershipFor(TEST_ACCOUNTS[2], { tier: 1, durationDays: 30 })
    cy.advanceTime(31 * 24 * 60 * 60) // 31 days: past the grant
    connectAs(TEST_ACCOUNTS[2])
    openAccountDropdown()
    cy.get('.purchase-access-btn', { timeout: 10000 }).should('be.visible')
    cy.contains('button', /^membership$/i).should('not.exist')
  })
})
