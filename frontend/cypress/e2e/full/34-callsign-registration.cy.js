/**
 * E2E Tests: registering a %callsign (spec 054, Full-tier)
 *
 * Issue #1241, the one flow of that set that needs a chain.
 *
 *   CR-01  callsign.commit-reveal-register
 *
 * ── WHY THIS ONE IS ON-CHAIN WHEN THE REST OF #1241 IS NOT ────────────────────────────────
 * The other nine flows are decided on the member's own device or by a single read. This one is a
 * two-transaction ceremony whose whole point is the TIME BETWEEN them: a commitment is published,
 * it has to age, and only then does revealing it register the name. Front-running protection that
 * a mock could satisfy is not front-running protection. The contract enforces the minimum age
 * against BLOCK time, so nothing short of a chain can tell a working ceremony from a broken one.
 *
 * ── WHAT IS ARRANGED, AND WHAT IS DRIVEN ─────────────────────────────────────────────────
 * Arranged through fixtures: the Gold membership the registry requires (an authorization the
 * member genuinely needs — the gate is satisfied, never bypassed) and the choice of an account
 * that holds no callsign yet. Driven through the app: both transactions, and the wait between.
 *
 * Nothing on the value path is gated on owning a callsign, and this flow does not assert that it
 * is — a test that required one to send would be asserting a rule the product does not have.
 */

const MEMBERSHIP_URL = '/wallet?tab=membership'

/** Comfortably past the registry's 60s minimum commitment age, and far short of its maximum. */
const COMMIT_WAIT_SECONDS = 120

const callsigns = (action, args = {}) =>
  cy.task('callsignFixture', { action, args }).then((r) => {
    expect(r.ok, `callsignFixture ${action}: ${r.error || 'no error message returned'}`).to.equal(true)
    return r
  })

describe('Callsign registration (spec 054)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  it('[CR-01] callsign.commit-reveal-register — reserve, wait, and register, with the chain as the record', () => {
    /*
     * A name unique to this run. Registration is permanent until released, so a fixed name would
     * make the flow pass exactly once against any given node — the same reason the OWNER is chosen
     * rather than named.
     */
    const NAME = `e2e${Date.now().toString().slice(-8)}`

    callsigns('freshOwner').then(({ address: OWNER }) => {
      callsigns('registryState', { callsign: NAME }).then((before) => {
        expect(before.available, 'the name is free before the flow starts').to.equal(true)
      })

      callsigns('grantGold', { address: OWNER })

      cy.mockWeb3Provider({ account: OWNER, preAuthorized: true, realBalances: true })
      cy.visit(MEMBERSHIP_URL)

      // Gold, so the panel offers the ceremony rather than the upgrade prompt. Asserting the
      // ABSENCE of the gate is what proves the tier grant took effect on the surface, not just in
      // the fixture's own read.
      cy.get('[data-testid="callsign-panel"]', { timeout: 40000 }).should('be.visible')
      cy.get('[data-testid="callsign-upgrade"]').should('not.exist')
      cy.get('[data-testid="callsign-register"]', { timeout: 30000 }).should('be.visible')

      // ── Step 1: commit. ───────────────────────────────────────────────────────────────
      cy.get('#callsign-input').clear().type(NAME, { delay: 0 })
      cy.contains('button', /Reserve callsign/i).should('not.be.disabled').click()

      // The reveal step appears, and it does NOT yet offer completion — the wait is the feature.
      cy.get('[data-testid="callsign-reveal"]', { timeout: 90000 }).should('be.visible')
      cy.contains(/You can complete it in \d+s/i).should('be.visible')
      cy.contains('button', /Complete registration/i).should('not.exist')

      // Nothing is registered yet. A ceremony that wrote the record at commit time would look
      // identical from the interface and would have no front-running protection at all.
      callsigns('registryState', { callsign: NAME }).then((mid) => {
        expect(mid.available, 'committing reserves nothing publicly').to.equal(true)
        expect(mid.owner, 'and assigns no owner').to.equal('0x0000000000000000000000000000000000000000')
      })

      // ── The wait. Both clocks: the contract enforces block time, the countdown runs on browser
      //    time, and a test that moved only one of them would fail on whichever it left behind. ──
      cy.advanceTime(COMMIT_WAIT_SECONDS)

      // ── Step 2: reveal. ───────────────────────────────────────────────────────────────
      cy.contains('button', /Complete registration/i, { timeout: 60000 })
        .should('not.be.disabled')
        .click()

      /*
       * The member is TOLD, and only then is the chain asked.
       *
       * Reading the registry straight after the click races the transaction — the button still
       * reads "Completing…" at that point, and the registry honestly answers that nobody owns the
       * name. Waiting on the panel's own owned-callsign state is not a substitute for the chain
       * read that follows; it is what makes that read meaningful, and it is also half the claim: a
       * ceremony that registered the name without ever saying so leaves a member unsure whether to
       * start over.
       */
      cy.contains(/Your callsign:/i, { timeout: 90000 }).should('be.visible')
      cy.contains(`%${NAME}`).should('be.visible')

      // ── The chain is the record. ──────────────────────────────────────────────────────
      callsigns('registryState', { callsign: NAME }).then((r) => {
        expect(r.owner.toLowerCase(), 'the registry names the member as owner').to.equal(OWNER.toLowerCase())
        expect(r.status, 'and the record is ACTIVE').to.equal(1)
        expect(r.available, 'so the name is no longer free').to.equal(false)
      })

      // And the reverse resolution agrees, which is what every display surface reads.
      callsigns('callsignOf', { address: OWNER }).then((r) => {
        expect(r.callsign, 'the account resolves back to the name it registered').to.equal(NAME)
      })
    })
  })
})
