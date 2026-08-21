// =============================================================================
// 35-admin-single-chain-write.cy.js
// On-chain E2E test for the operations console's write rule (specs 071 + 093).
//
// Issue #1242, flow `admin.single-chain-write`. Everything else in that issue is
// decided by rendering off a role sweep and lives in the no-chain tier
// (fast/32-admin-console.cy.js). This one is here because it fires a killswitch:
// an operator signs, a contract's state changes, and every wager on that network
// stops. Admission rule 2 puts a signature with consequences on a chain.
//
// What it asserts is spec 071's write rule, which is one sentence with three
// halves: ONE transaction, ONE named chain, authority read from the contract
// that will enforce it — and, deliberately, no control that acts on several
// chains at once (FR-020). A killswitch that fans out is one an operator can
// fire without knowing what they hit.
// =============================================================================

const GUARDIAN = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' // Hardhat #0 — seeded with GUARDIAN_ROLE

/** The local node boots AS Amoy, so the app's testnet cohort resolves it as the registry's home. */
const LOCAL = 'Polygon Amoy'
/** The OTHER cohort network carrying a WagerRegistry — a real second target for the scope picker. */
const OTHER = 'Ethereum Classic Mordor'

const EMERGENCY = '/admin/incident-response?view=emergency'

/*
 * The registry's pause flag, read from the chain.
 *
 * Takes its options, because the first version dropped them on the floor: the helper accepted no
 * arguments while the call sites passed `{ timeout: 60000 }`, so every read ran on the default
 * command timeout. Locally the node mines fast enough that it never showed; on a CI runner it
 * read the flag before the transaction had been mined and reported a pause that had not landed
 * yet as one that never would.
 */
const registryPaused = (options = {}) =>
  cy.task('chainTx', { action: 'registryPaused' }, { timeout: 60000, ...options })

function enterAsGuardian() {
  cy.mockWeb3Provider({ account: GUARDIAN })
  cy.visit('/fairwins')
  cy.connectWallet()
  cy.visit(EMERGENCY)
}

describe('Operations: a write acts on one named chain (specs 071 + 093)', () => {
  /*
   * A pause left behind would break every other spec sharing this node — creation, acceptance and
   * settlement all revert while it stands. The test unpauses through the UI as part of the flow;
   * this is the net under it, and it no-ops when the flow already finished.
   */
  /*
   * The precondition, stated rather than inherited. This spec shares a node with the rest of its
   * shard, and the flow below starts by asserting the registry is unpaused — so a preceding spec
   * that left a pause standing would fail this one for something it did not do.
   */
  before(() => {
    cy.task('chainTx', { action: 'unpause' }, { timeout: 60000 })
  })

  afterEach(() => {
    cy.task('chainTx', { action: 'unpause' }, { timeout: 60000 })
  })

  it('[AD-06] admin.single-chain-write — the pause names its chain, refuses off it, and moves only it', () => {
    enterAsGuardian()

    /*
     * THE CONTROL IS ADDRESSED TO A NETWORK, BY NAME — in the heading, and in the button an
     * operator is about to press. "Pause" alone is the control this rule exists to prevent.
     */
    cy.contains('h3', `Emergency Pause on ${LOCAL}`, { timeout: 40000 }).should('be.visible')
    cy.contains('button', `Pause on ${LOCAL}`).should('not.be.disabled')

    /*
     * Scope elsewhere and the write withdraws — in words, not just as a dead button (FR-018).
     * Reading another network from here is fine and stays fine; only signing needs the wallet
     * there, and the notice says which network to switch to rather than leaving an operator
     * mid-incident to guess why the killswitch will not press.
     */
    cy.get('.admin-card select').first().select(OTHER)
    cy.contains('h3', `Emergency Pause on ${OTHER}`).should('be.visible')
    cy.contains('button', `Pause on ${OTHER}`).should('be.disabled')
    cy.contains(`switch your wallet to it before making one`, { matchCase: false }).should('be.visible')

    // Back to the network the wallet is actually on.
    cy.get('.admin-card select').first().select(`${LOCAL} (wallet is here)`)

    registryPaused().should((r) => {
      expect(r.ok, 'read the registry pause flag').to.equal(true)
      expect(r.paused, 'the registry starts unpaused').to.equal(false)
    })

    // ── THE WRITE ────────────────────────────────────────────────────────────────────────────
    cy.contains('button', `Pause on ${LOCAL}`).click()

    /*
     * WAIT ON THE CONSOLE, THEN ASK THE CHAIN — in that order, and the order is the point.
     *
     * The control flips to its inverse only after `useAdminTx` has awaited `tx.wait()` and the
     * pause estate has re-read the contract, so this assertion is itself the evidence that the
     * console read its own write back rather than trusting the transaction it sent. It also
     * makes the chain read below unambiguous: reading first raced the miner, and a `false` then
     * means "not yet", which is indistinguishable from "never".
     */
    cy.contains('button', `Unpause on ${LOCAL}`, { timeout: 90000 }).should('be.visible')

    // The contract is the authority, so the contract is what is asserted — not the toast.
    registryPaused().should((r) => {
      expect(r.paused, 'the pause reached the registry the button named').to.equal(true)
    })

    cy.contains('button', `Unpause on ${LOCAL}`).click()
    cy.contains('button', `Pause on ${LOCAL}`, { timeout: 90000 }).should('be.visible')
    registryPaused().should((r) => {
      expect(r.paused, 'unpausing restored the network').to.equal(false)
    })
  })
})
