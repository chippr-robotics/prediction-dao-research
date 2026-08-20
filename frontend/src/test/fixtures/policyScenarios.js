/**
 * Ordered-policy scenarios (spec 068) — ONE source, read by three suites.
 *
 * `matchPreview` is a client twin of the guard's on-chain matching, and the two are supposed to
 * change in lockstep. Nothing enforced that: the Solidity suite and the Vitest suite each carried
 * their own hand-copied cases, so a divergence would show up as two suites that both pass while
 * disagreeing about what the vault will do. These scenarios are read by all three:
 *
 *   test/custody/PolicyScenarioParity.test.js  — drives the REAL guard and asserts each verdict
 *   frontend/src/test/custody/policyV2.test.js — asserts matchPreview agrees with the same table
 *   frontend/cypress/e2e/full/29-protect-custody.cy.js — composes the rules in the UI and lets
 *                                                        the chain decide (CV-05)
 *
 * Shape notes:
 *  - Amounts are DECIMAL STRINGS of the chain's coin, so each consumer scales them itself (the UI
 *    types them, the contracts take wei). No consumer has to know another's units.
 *  - Destinations are symbolic names, resolved per environment. A fixture that named real
 *    addresses would be tied to one chain's accounts and could not be shared at all.
 *  - `ruleIndex` is the rule that DECIDED, which is not always the rule that allowed: a denial by
 *    rule 001 is still rule 001 governing, and that is the distinction first-match-governs is
 *    about.
 *
 * Mirrors the same-file precedent set by frontend/src/test/fixtures/signedMessages.js (spec 084).
 */

/** Every destination a scenario can name. Consumers map these to real addresses. */
export const DESTINATIONS = ['payee', 'stranger']

export const FIRST_MATCH_SCENARIOS = [
  {
    id: 'tight-rule-first',
    summary: 'the lowest-numbered matching rule governs, even when a later one would allow more',
    cooldown: 0,
    rules: [
      { asset: 'native', perTx: '0.1' },
      { asset: 'native', perTx: '5' },
    ],
    attempts: [
      { amount: '0.05', to: 'payee', allowed: true, ruleIndex: 0 },
      {
        amount: '1',
        to: 'payee',
        allowed: false,
        ruleIndex: 0,
        why: 'rule 001 matched and refused; rule 002 would have allowed it and is never consulted',
      },
    ],
  },
  {
    id: 'no-match-denies',
    summary: 'once a vault has rules, a payload no rule covers is denied — silence is not permission',
    cooldown: 0,
    rules: [{ asset: 'native', perTx: '5', targets: ['payee'] }],
    attempts: [
      { amount: '1', to: 'payee', allowed: true, ruleIndex: 0 },
      {
        amount: '1',
        to: 'stranger',
        allowed: false,
        ruleIndex: null,
        why: 'no rule covers this destination, and no match means denial',
      },
    ],
  },
  {
    id: 'banded-tiers',
    summary: 'banded rules read as tiers: each amount falls to the first band that can hold it',
    cooldown: 0,
    rules: [
      { asset: 'native', perTx: '1', banded: true },
      { asset: 'native', perTx: '10', banded: true },
    ],
    attempts: [
      { amount: '1', to: 'payee', allowed: true, ruleIndex: 0 },
      { amount: '5', to: 'payee', allowed: true, ruleIndex: 1 },
      {
        amount: '50',
        to: 'payee',
        allowed: false,
        ruleIndex: null,
        why: 'above every band, so nothing matches at all',
      },
    ],
  },
]

export default FIRST_MATCH_SCENARIOS
