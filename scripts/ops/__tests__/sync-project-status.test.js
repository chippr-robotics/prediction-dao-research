/**
 * Self-test for the project status mirror's pure decisions (issue #1460).
 *
 * The network half is not tested here — it is one GraphQL call per step and mocking it would test
 * the mock. What IS tested is every place the script decides something, because each of those was
 * a chance to move a card nobody asked to move.
 *
 * Dependency-free: node:test only.
 */

const test = require('node:test');
const assert = require('node:assert');

const {
  parseProjectUrl,
  statusForLabels,
  matchOption,
  STATUS_PRECEDENCE,
} = require('../sync-project-status.js');

test('parseProjectUrl reads org and user project URLs', () => {
  assert.deepStrictEqual(parseProjectUrl('https://github.com/orgs/chippr-robotics/projects/7'), {
    ownerType: 'organization',
    owner: 'chippr-robotics',
    number: 7,
  });
  assert.deepStrictEqual(parseProjectUrl('https://github.com/users/realcodywburns/projects/2'), {
    ownerType: 'user',
    owner: 'realcodywburns',
    number: 2,
  });
});

test('parseProjectUrl refuses anything that is not a project URL', () => {
  for (const bad of [
    '',
    undefined,
    'chippr-robotics/7',
    'https://github.com/chippr-robotics/prediction-dao-research',
    'https://github.com/orgs/chippr-robotics/projects/not-a-number',
  ]) {
    assert.strictEqual(parseProjectUrl(bad), null, `${bad} must not parse as a project`);
  }
});

test('an OPEN issue with no status label moves nothing', () => {
  // The guard against the mirror's worst failure: its first run stampeding every issue in the
  // repo onto one column because "no label" was read as "Todo".
  assert.strictEqual(statusForLabels([], 'open'), null);
  assert.strictEqual(statusForLabels([{ name: 'enhancement' }, { name: 'size:m' }], 'open'), null);
});

test('a CLOSED issue with no status label resolves to Done', () => {
  assert.strictEqual(statusForLabels([], 'closed'), 'Done');
  assert.strictEqual(statusForLabels([{ name: 'bug' }], 'closed'), 'Done');
});

test('overlapping status labels resolve deterministically, never backwards', () => {
  // An agent adds the new label before removing the old, so both are briefly present. Whichever
  // order the API happens to return them in, the later stage must win — a card that flickers
  // back to In progress after review has started is worse than one that moves early.
  const both = [{ name: 'status:in-progress' }, { name: 'status:in-review' }];
  assert.strictEqual(statusForLabels(both, 'open'), 'In review');
  assert.strictEqual(statusForLabels([...both].reverse(), 'open'), 'In review');

  const all = STATUS_PRECEDENCE.map((e) => ({ name: e.label }));
  assert.strictEqual(statusForLabels(all, 'open'), STATUS_PRECEDENCE[0].status);
});

test('statusForLabels accepts bare strings as well as label objects', () => {
  assert.strictEqual(statusForLabels(['status:blocked'], 'open'), 'Blocked');
});

test('matchOption ignores case and separators but never guesses', () => {
  const options = [
    { id: '1', name: 'Todo' },
    { id: '2', name: 'In Progress' },
    { id: '3', name: 'Done' },
  ];
  assert.strictEqual(matchOption(options, 'In progress').id, '2');
  assert.strictEqual(matchOption(options, 'in-progress').id, '2');

  // The board has no such column. Returning the nearest option would file cards in a state
  // nobody configured; the script reports the gap instead.
  assert.strictEqual(matchOption(options, 'In review'), null);
  assert.strictEqual(matchOption(options, 'Blocked'), null);
  assert.strictEqual(matchOption([], 'Done'), null);
});
