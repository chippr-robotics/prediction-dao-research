/**
 * Must-fail fixtures for the dismissal plan (issue #1520).
 *
 * A dismissal tells GitHub, permanently, that an alert describes code this repository does not
 * contain. The failure mode is silent by construction: a wrongly dismissed alert looks exactly like
 * a correctly dismissed one, and nothing ever brings it back. So every rule is driven against input
 * it MUST reject, including the two states that would actually happen here — the pin moving out
 * from under the argument, and the live set being a different size than the one that was reviewed.
 *
 * Dependency-free: node:test only. Picked up by `npm run test:dep-alerts`.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
  parseVersion,
  rangeIncludes,
  checkPlanShape,
  ineligibleReason,
  selectAlerts,
  loadPlan,
  MAX_COMMENT,
} = require('../dismiss-alerts.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const rulesOf = (violations) => violations.map((x) => x.rule);

const PKG = { devDependencies: { '@openzeppelin/contracts': '5.4.0', '@openzeppelin/contracts-upgradeable': '5.4.0' } };

const ENTRY = {
  id: 'openzeppelin-nested-unreachable',
  issue: 1520,
  dismissedReason: 'not_used',
  expectedCount: 2,
  match: {
    ecosystem: 'npm',
    packages: ['@openzeppelin/contracts', '@openzeppelin/contracts-upgradeable'],
    scope: 'development',
    maxSeverity: 'high',
    compiledVersion: '5.4.0',
  },
  comment: 'Unreachable: nested 4.7.3 copy under a vendor package that solc never reads. See #1520.',
};

const alert = (over = {}) => ({
  number: over.number || 1,
  dependency: {
    package: { ecosystem: 'npm', name: over.name || '@openzeppelin/contracts' },
    scope: over.scope || 'development',
  },
  security_advisory: { severity: over.severity || 'medium', ghsa_id: 'GHSA-aaaa-bbbb-cccc' },
  security_vulnerability: { vulnerable_version_range: over.range || '>= 4.5.0, < 4.9.6' },
});

/* ------------------------------------------------------------ range logic */

test('a range excluding the compiled version makes an alert eligible', () => {
  assert.equal(rangeIncludes('>= 4.5.0, < 4.9.6', '5.4.0'), false);
  assert.equal(rangeIncludes('< 4.8.3', '5.4.0'), false);
  assert.equal(ineligibleReason(alert(), ENTRY), '');
});

test('a range that INCLUDES the compiled version is never dismissed', () => {
  assert.equal(rangeIncludes('>= 5.0.0, < 5.5.0', '5.4.0'), true);
  const reason = ineligibleReason(alert({ range: '>= 5.0.0, < 5.5.0' }), ENTRY);
  assert.match(reason, /reachable/);
});

test('an unparseable range counts as including it — unproven is not proven safe', () => {
  for (const range of ['', null, '>= 4.0.0-beta.1', 'sometimes', '>= 1.2', undefined]) {
    assert.equal(rangeIncludes(range, '5.4.0'), true, `range ${JSON.stringify(range)} must not be treated as excluding`);
  }
  assert.equal(parseVersion('5.4.0-rc.1'), null);
});

/* -------------------------------------------------------------- selection */

test('a runtime-scope alert on the same package is refused', () => {
  assert.match(ineligibleReason(alert({ scope: 'runtime' }), ENTRY), /scope is runtime/);
});

test('an unknown scope counts as runtime, never as development', () => {
  const a = alert();
  delete a.dependency.scope;
  assert.match(ineligibleReason(a, ENTRY), /scope is runtime/);
});

test('a severity above the reviewed ceiling is refused', () => {
  assert.match(ineligibleReason(alert({ severity: 'critical' }), ENTRY), /above the reviewed ceiling/);
});

test('an alert on another package is not this entry\'s business', () => {
  assert.equal(ineligibleReason(alert({ name: 'axios' }), ENTRY), null);
});

test('near misses are reported, not silently dropped', () => {
  const [sel] = selectAlerts([alert({ number: 1 }), alert({ number: 2, scope: 'runtime' })], { dismissals: [ENTRY] });
  assert.deepEqual(sel.eligible.map((a) => a.number), [1]);
  assert.equal(sel.nearMisses.length, 1);
  assert.equal(sel.nearMisses[0].alert.number, 2);
});

/* ------------------------------------------------------------- plan shape */

test('X-02 fails when the pin moves out from under the argument', () => {
  const bumped = { devDependencies: { ...PKG.devDependencies, '@openzeppelin/contracts': '5.5.0' } };
  const out = checkPlanShape({ dismissals: [ENTRY] }, bumped);
  assert.ok(rulesOf(out).includes('X-02'), 'a pin that disagrees with compiledVersion must fail');
  assert.match(out.find((x) => x.rule === 'X-02').message, /5\.5\.0/);
});

test('X-02 fails when the package is no longer a dependency at all', () => {
  const out = checkPlanShape({ dismissals: [ENTRY] }, { devDependencies: {} });
  assert.ok(rulesOf(out).includes('X-02'));
});

test('X-01 rejects a comment the API would refuse', () => {
  const tooLong = { ...ENTRY, comment: 'x'.repeat(MAX_COMMENT + 1) };
  assert.ok(rulesOf(checkPlanShape({ dismissals: [tooLong] }, PKG)).includes('X-01'));
});

test('X-01 rejects an entry with no reasoning, no issue, or an invented reason', () => {
  const cases = [
    { ...ENTRY, comment: 'nope' },
    { ...ENTRY, issue: undefined },
    { ...ENTRY, dismissedReason: 'because_i_said_so' },
    { ...ENTRY, expectedCount: 0 },
    { ...ENTRY, match: undefined },
  ];
  for (const bad of cases) {
    assert.ok(checkPlanShape({ dismissals: [bad] }, PKG).length > 0, `${JSON.stringify(bad.id)} must be refused`);
  }
});

test('X-01 rejects a duplicate id and an empty plan', () => {
  assert.ok(rulesOf(checkPlanShape({ dismissals: [ENTRY, ENTRY] }, PKG)).includes('X-01'));
  assert.ok(rulesOf(checkPlanShape({ dismissals: [] }, PKG)).includes('X-01'));
});

/* ------------------------------------------------------- the shipped plan */

test('the committed plan is valid against the real package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const out = checkPlanShape(loadPlan(), pkg);
  assert.deepEqual(out, [], out.map((x) => `[${x.rule}] ${x.message}`).join('\n'));
});

test('the committed plan argues about the OZ version the contracts actually compile against', () => {
  const [entry] = loadPlan().dismissals;
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const name of entry.match.packages) {
    assert.equal(pkg.devDependencies[name], entry.match.compiledVersion);
  }
});

/**
 * The reachability claim itself, checked against the source rather than taken on trust.
 *
 * The whole dismissal rests on `contracts/` importing nothing under chainlink's `automation/**`,
 * which is the only route to the nested OpenZeppelin 4.7.3 copy. That is a property of the source
 * tree, so it can rot — and if it ever does, the argument recorded on twelve alerts becomes false
 * with nothing to say so.
 */
test('no contract imports chainlink automation/** — the only route to the nested OZ copy', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.sol')) {
        const text = fs.readFileSync(full, 'utf8');
        if (/@chainlink\/contracts\/src\/v0\.8\/automation/.test(text)) offenders.push(path.relative(ROOT, full));
      }
    }
  };
  walk(path.join(ROOT, 'contracts'));
  assert.deepEqual(offenders, [], `these import chainlink automation/**, which reaches the vulnerable OZ copy:\n${offenders.join('\n')}`);
});
