/**
 * Tests for scripts/release/classify.js (spec 076, T006).
 *
 * This module decides whether a pull request may merge. Every branch it can take is exercised here,
 * because a gate whose behaviour is unproven is not a gate.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  TYPES,
  TYPE_BUMP,
  BASELINE_FILES,
  parseSubject,
  bodyDeclaresBreaking,
  carriesSkipMarker,
  classify,
  aggregateBump,
} = require("../classify");

test("every accepted type maps to its documented bump", () => {
  // contracts/version-scheme.md §2 — feat is the only non-breaking minor.
  assert.equal(TYPE_BUMP.feat, "minor");
  for (const t of TYPES.filter((x) => x !== "feat")) {
    assert.equal(TYPE_BUMP[t], "patch", `${t} should be a patch`);
  }
  // No type may map to "none": a merged change that contributes nothing would make the release
  // record untrue.
  assert.ok(TYPES.every((t) => ["minor", "patch"].includes(TYPE_BUMP[t])));
});

test("parses type, scope and subject", () => {
  const r = parseSubject("fix(eip712): consolidate the domains");
  assert.equal(r.ok, true);
  assert.equal(r.type, "fix");
  assert.equal(r.scope, "eip712");
  assert.equal(r.breaking, false);
  assert.equal(r.bump, "patch");
  assert.equal(r.subject, "consolidate the domains");
});

test("a scope is optional", () => {
  const r = parseSubject("docs: correct three stale claims");
  assert.equal(r.ok, true);
  assert.equal(r.scope, null);
});

test("`!` makes any type a major bump", () => {
  for (const t of ["feat", "fix", "chore", "refactor"]) {
    const r = parseSubject(`${t}(x)!: drop a host key`);
    assert.equal(r.ok, true, `${t}! should parse`);
    assert.equal(r.breaking, true);
    assert.equal(r.bump, "major", `${t}! should be major`);
  }
});

test("a BREAKING CHANGE footer is equivalent to `!`", () => {
  assert.equal(bodyDeclaresBreaking("BREAKING CHANGE: the host object lost a key"), true);
  assert.equal(bodyDeclaresBreaking("BREAKING-CHANGE: same thing, hyphenated"), true);
  assert.equal(bodyDeclaresBreaking("mentions BREAKING CHANGE: mid-line only"), false);

  const r = classify({
    subject: "feat(host): rework the wallet wrapper",
    body: "Details.\n\nBREAKING CHANGE: submit() no longer returns a tx.",
  });
  assert.equal(r.ok, true);
  assert.equal(r.breaking, true);
  assert.equal(r.bump, "major");
});

test("the footer can only add breaking-ness, never remove it", () => {
  const r = classify({ subject: "feat!: x", body: "no footer here" });
  assert.equal(r.bump, "major");
});

test("Dependabot's exact title passes unmodified (FR-014)", () => {
  // This must hold verbatim: dependency PRs are the highest-volume kind in this repo, and
  // requiring a human to retitle each one would make the gate a tax rather than a control.
  const r = classify({ subject: "chore(deps): Bump @solana/kit from 5.5.1 to 7.0.0" });
  assert.equal(r.ok, true);
  assert.equal(r.type, "chore");
  assert.equal(r.bump, "patch");
});

test("an unknown type is rejected and the accepted values are offered", () => {
  const r = classify({ subject: "wibble: do a thing" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /unknown type "wibble"/);
  assert.deepEqual(r.accepted, TYPES);
});

test("a title with no type at all is rejected (FR-009)", () => {
  for (const bad of ["update some things", "fix stuff", "feat:no space", ""]) {
    const r = classify({ subject: bad });
    assert.equal(r.ok, false, `"${bad}" should be rejected`);
    assert.ok(Array.isArray(r.accepted) && r.accepted.length > 0);
  }
});

test("rejection never throws — the gate needs the message, not an exception", () => {
  assert.doesNotThrow(() => classify({ subject: undefined }));
  assert.equal(classify({ subject: undefined }).ok, false);
});

// ---- byte-gate escalation, contracts/version-scheme.md §4 --------------------------------------

for (const baseline of BASELINE_FILES) {
  test(`a trivial type is rejected when ${baseline.split("/").pop()} is edited`, () => {
    for (const t of ["chore", "docs", "style"]) {
      const r = classify({
        subject: `${t}(deps): Bump @chainlink/contracts`,
        changedFiles: ["package-lock.json", baseline],
      });
      assert.equal(r.ok, false, `${t} should be escalated`);
      assert.match(r.reason, /byte-gate baseline/);
      assert.ok(!r.accepted.includes("chore"), "chore must not be offered as a fix");
    }
  });
}

test("a sufficient type carrying a baseline edit passes untouched", () => {
  // Escalation only ever raises. A `fix` that re-records a baseline is exactly right and must not
  // be blocked, or the rule would punish the correct classification too.
  for (const t of ["fix", "feat", "perf", "refactor", "build"]) {
    const r = classify({
      subject: `${t}(contracts): pin the chainlink source`,
      changedFiles: [BASELINE_FILES[0]],
    });
    assert.equal(r.ok, true, `${t} should pass`);
  }
});

test("a trivial type passes when no baseline is touched", () => {
  const r = classify({
    subject: "chore(deps): Bump actions/checkout from 4 to 5",
    changedFiles: [".github/workflows/test.yml", "package-lock.json"],
  });
  assert.equal(r.ok, true);
});

test("escalation is inert when the changed-file list is unavailable", () => {
  // Commit-range classification has no file list; it must not fail closed there.
  assert.equal(classify({ subject: "chore: x" }).ok, true);
  assert.equal(classify({ subject: "chore: x", changedFiles: [] }).ok, true);
});

// ---- the release process's own paperwork --------------------------------------------------------

test("the skip marker is recognised in a subject or a body, case-insensitively", () => {
  assert.equal(carriesSkipMarker({ subject: "chore(release): v1.5.6 [skip release]" }), true);
  assert.equal(carriesSkipMarker({ subject: "chore(release): v1.5.6 [SKIP RELEASE]" }), true);
  assert.equal(carriesSkipMarker({ subject: "chore(release): v1.5.6 [skip-release]" }), true);
  assert.equal(carriesSkipMarker({ subject: "chore(release): v1", body: "[skip release]" }), true);
});

test("nothing else is mistaken for the marker", () => {
  // Notably a real change to the release tooling, which is written with this scope and must count.
  assert.equal(carriesSkipMarker({ subject: "chore(release): consolidate lost records" }), false);
  assert.equal(carriesSkipMarker({ subject: "feat(ci): skip flaky tests on release day" }), false);
  assert.equal(carriesSkipMarker({}), false);
});

// The marker changes what a commit is WORTH, never whether it parses. A rejected subject would put
// the merge gate in the business of policing the marker, which is not its job.
test("a marked commit still classifies normally", () => {
  const r = classify({ subject: "chore(release): v1.5.6 [skip release]" });
  assert.equal(r.ok, true);
  assert.equal(r.type, "chore");
});

// ---- aggregation ------------------------------------------------------------------------------

test("aggregateBump returns the most significant, not the last (FR-013)", () => {
  assert.equal(aggregateBump(["patch", "minor", "patch"]), "minor");
  assert.equal(aggregateBump(["patch", "major", "minor"]), "major");
  assert.equal(aggregateBump(["patch", "patch"]), "patch");
});

test("aggregateBump reports emptiness rather than defaulting", () => {
  // A silent "patch" here would invent a release out of nothing.
  assert.equal(aggregateBump([]), null);
  assert.equal(aggregateBump([null, undefined]), null);
});
