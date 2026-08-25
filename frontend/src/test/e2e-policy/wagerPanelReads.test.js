import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Regression guard for issue #1250: the on-chain money-path specs must not read the My
 * Wagers LIST PANEL with a one-shot DOM snapshot.
 *
 * ── THE DEFECT ──────────────────────────────────────────────────────────────────────────
 *
 *   cy.get('.mm-panel, [role="tabpanel"]', { timeout: 10000 }).then(($panel) => {
 *     const rows = $panel.find('.mm-table-row')     // ← read ONCE, synchronously
 *     if (rows.length > 0) { …the actual test… }
 *     else { expect(true).to.be.true }
 *   })
 *
 * `cy.get` waits for the PANEL. The rows are not the panel's problem: MyMarketsModal's own
 * `loading` flag clears in the same tick it empties `markets`, while the rows come from
 * `useFriendMarkets()` — a chain scan the modal neither waits on nor renders a pending
 * state for. So the panel appears at once, says "No Active Positions", and fills in
 * seconds later. A `.find()` taken in between reads nothing, both limbs no-op, and the
 * spec dies later somewhere unrelated. It passes whenever the scan happens to land in
 * time, which is exactly what made CLM-01 red one run and green the next on an unchanged
 * commit.
 *
 * ── WHY THIS GUARD IS NARROWER THAN THE ONE #1250 TURNED DOWN ───────────────────────────
 *
 * The issue rejects a lint rule on `$x.find()` inside `.then()`, and it is right to: that
 * shape is legitimate whenever the snapshot is taken AFTER an explicit wait for the thing
 * that gates it — every `$detail.find('button:contains("Claim"))` in these specs runs
 * after `.mm-detail` has been asserted visible, and the detail view renders from data the
 * list already holds. A rule that fired on those would collect exemption comments instead
 * of fixes.
 *
 * This guard fires on ONE shape instead: reading the LIST PANEL itself through a `.then()`
 * callback. There is no legitimate instance of that, because nothing in the app gates the
 * panel's arrival on its contents. The two honest replacements are
 *
 *   · assert the control retryably, where the spec arranged the state itself —
 *       cy.get(PANEL).find(CONTROL, { timeout: … }).should('have.length.greaterThan', 0)
 *   · or `cy.settledWagerPanel()`, which waits for the wager fetch to finish before
 *     yielding the panel, for probes the spec did not arrange.
 *
 * Both are in `cypress/support/commands.js`, which documents the limits of the second.
 */

const CYPRESS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'cypress')

// The on-chain tier's money-path specs — the ones #1250 inventories.
const MONEY_PATH_SPECS = [
  'e2e/full/04-wager-creation-tx.cy.js',
  'e2e/full/05-wager-acceptance.cy.js',
  'e2e/full/06-decline-cancel.cy.js',
  'e2e/full/07-manual-resolution.cy.js',
  'e2e/full/10-claim-payouts.cy.js',
]

/*
 * `cy.get(<selector mentioning .mm-panel>).then(` — the panel handed straight to a
 * callback. Deliberately anchored on `.then(` immediately after the `cy.get(...)` call, so
 * the retryable forms are untouched: `.find(…)` chains and `.invoke('text').then(…)` (a
 * text read, not a child snapshot) both continue past a different command first.
 */
const PANEL_SNAPSHOT = /cy\.get\([^()]*\.mm-panel[^()]*\)\s*\.then\(/g

describe('e2e policy: My Wagers list panel reads (#1250)', () => {
  it('no money-path spec snapshots the list panel through .then()', () => {
    const offenders = []

    for (const rel of MONEY_PATH_SPECS) {
      const source = readFileSync(join(CYPRESS, rel), 'utf8')
      const lines = source.split('\n')
      lines.forEach((line, i) => {
        PANEL_SNAPSHOT.lastIndex = 0
        if (PANEL_SNAPSHOT.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`)
      })
    }

    expect(
      offenders,
      'read the panel retryably — cy.get(PANEL).find(CONTROL).should(…) where the spec ' +
        'arranged the state, or cy.settledWagerPanel() for a genuine probe (#1250)',
    ).to.deep.equal([])
  })

  /*
   * The two halves of the settle-wait, checked in the command BODIES rather than anywhere
   * in the file — a prose mention of `friendMarkets` in the doc block above the command
   * would satisfy a whole-file `include` while the code did nothing.
   */
  const commandBody = (source, name) => {
    const start = source.indexOf(`Cypress.Commands.add('${name}'`)
    expect(start, `cy.${name}() is defined in cypress/support/commands.js (#1250)`)
      .to.be.greaterThan(-1)
    const next = source.indexOf('Cypress.Commands.add(', start + 1)
    return source.slice(start, next === -1 ? source.length : next)
  }

  it('cy.settledWagerPanel() waits on the wager fetch, not on the panel', () => {
    const commands = readFileSync(join(CYPRESS, 'support', 'commands.js'), 'utf8')
    const body = commandBody(commands, 'settledWagerPanel')

    /*
     * Waiting for "a row OR the empty state" would settle instantly and prove nothing: the
     * empty state is what MyMarketsModal renders WHILE the fetch is in flight. The only
     * completion edge the app exposes is FriendMarketsContext's cache write, so the command
     * has to reach into the app window's storage for it.
     */
    expect(body, 'settle on the friendMarkets cache write, not on the panel').to.include(
      'friendMarkets',
    )
    expect(body, 'the cache is read from the application window').to.include('localStorage')
  })

  it('cy.switchAccount() drops the wager cache, so the wait still means something after it', () => {
    const commands = readFileSync(join(CYPRESS, 'support', 'commands.js'), 'utf8')
    const body = commandBody(commands, 'switchAccount')

    /*
     * THIS IS WHAT MAKES THE WAIT SOUND, and it is easy to delete by accident.
     *
     * The cache key is per CHAIN, not per account, and `switchAccount` deliberately does not
     * reload. Leave the previous account's key in place and `cy.settledWagerPanel()` is
     * satisfied the instant it is called, while the new account's scan is still running —
     * every post-switch read back to the one-shot snapshot #1250 is about, with a helper in
     * front of it that reads as though it were fixed.
     */
    expect(body, 'clear the per-chain friendMarkets cache when the account changes').to.include(
      'friendMarkets',
    )
    expect(body, 'the stale key must actually be removed, not merely mentioned').to.match(
      /removeItem/,
    )
  })
})
