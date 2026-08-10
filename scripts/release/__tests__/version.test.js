/**
 * Tests for scripts/release/version.js (spec 076, T010).
 *
 * `nextVersion` accepts injected commits and a `current` release so the aggregation rules can be
 * proven without fabricating git history. The git-reading paths are exercised separately at the
 * bottom against this repository's real tag list.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  FIRST_VERSION,
  fmt,
  compare,
  applyBump,
  nextVersion,
  currentRelease,
} = require("../version");

const V = (major, minor, patch) => ({ major, minor, patch, tag: `v${major}.${minor}.${patch}` });
const commit = (subject, body = "") => ({ subject, body });

test("formats and compares versions", () => {
  assert.equal(fmt({ major: 1, minor: 4, patch: 0 }), "v1.4.0");
  assert.ok(compare(V(1, 4, 0), V(1, 3, 9)) > 0);
  assert.ok(compare(V(2, 0, 0), V(1, 99, 99)) > 0);
  assert.equal(compare(V(1, 2, 3), V(1, 2, 3)), 0);
});

test("applyBump resets the less significant components", () => {
  assert.deepEqual(applyBump(V(1, 4, 7), "major"), { major: 2, minor: 0, patch: 0 });
  assert.deepEqual(applyBump(V(1, 4, 7), "minor"), { major: 1, minor: 5, patch: 0 });
  assert.deepEqual(applyBump(V(1, 4, 7), "patch"), { major: 1, minor: 4, patch: 8 });
});

// ---- the rule most likely to regress ----------------------------------------------------------

test("ONE feat among many chores yields a MINOR release (FR-013)", () => {
  const commits = [
    commit("chore(deps): Bump a from 1 to 2"),
    commit("chore(deps): Bump b from 1 to 2"),
    commit("feat(earn): show the live fee rate"),
    commit("chore(deps): Bump c from 1 to 2"),
    commit("docs: tidy the runbook"),
  ];
  const r = nextVersion({ commits, current: V(1, 3, 2) });
  assert.equal(r.bump, "minor");
  assert.equal(fmt(r.release), "v1.4.0");
});

test("one breaking change outranks everything else in the range", () => {
  const commits = [
    commit("feat(x): add a thing"),
    commit("fix(y)!: change an intent struct"),
    commit("chore: tidy"),
  ];
  const r = nextVersion({ commits, current: V(1, 3, 2) });
  assert.equal(r.bump, "major");
  assert.equal(fmt(r.release), "v2.0.0");
});

test("a breaking change declared only in the body still wins", () => {
  const commits = [
    commit("chore(deps): Bump a"),
    commit("refactor(host): rework wrappers", "BREAKING CHANGE: submit() signature changed"),
  ];
  const r = nextVersion({ commits, current: V(1, 3, 2) });
  assert.equal(r.bump, "major");
});

test("all-patch input yields a patch", () => {
  const commits = [commit("fix(a): x"), commit("docs: y"), commit("chore: z")];
  const r = nextVersion({ commits, current: V(1, 3, 2) });
  assert.equal(fmt(r.release), "v1.3.3");
});

// ---- boundary cases ---------------------------------------------------------------------------

test("with no previous release the answer is exactly v1.0.0 (FR-006)", () => {
  // Deliberately includes a feat and a breaking change: neither may move the first version, and
  // none of it may be read from a package.json.
  const commits = [commit("feat: everything"), commit("fix!: breaking too")];
  const r = nextVersion({ commits, current: null });
  assert.deepEqual(r.release, FIRST_VERSION);
  assert.equal(fmt(r.release), "v1.0.0");
  assert.equal(r.reason, "no-previous-release");
});

test("an empty commit range produces NO release (FR-021)", () => {
  const r = nextVersion({ commits: [], current: V(1, 3, 2) });
  assert.equal(r.release, null);
  assert.equal(r.reason, "empty-range");
});

test("commits that exist but none classified produces NO release, not an invented patch", () => {
  const commits = [commit("Merge pull request #1072 from x/y"), commit("wip")];
  const r = nextVersion({ commits, current: V(1, 3, 2) });
  assert.equal(r.release, null);
  assert.equal(r.reason, "no-classified-commits");
});

test("unclassified commits are reported, not silently dropped", () => {
  const commits = [commit("Merge pull request #1 from a/b"), commit("fix(a): real change")];
  const r = nextVersion({ commits, current: V(1, 3, 2) });
  assert.equal(r.classifications.length, 2);
  assert.equal(r.classifications[0].unclassified, true);
  assert.equal(r.classifications[1].type, "fix");
  assert.equal(fmt(r.release), "v1.3.3");
});

test("the computed version is always greater than its predecessor (FR-005)", () => {
  for (const [prev, subject] of [
    [V(0, 9, 9), "fix: x"],
    [V(1, 0, 0), "feat: x"],
    [V(9, 9, 9), "chore: x"],
  ]) {
    const r = nextVersion({ commits: [commit(subject)], current: prev });
    assert.ok(compare(r.release, prev) > 0, `${fmt(r.release)} must exceed ${prev.tag}`);
  }
});

// ---- against the real repository ---------------------------------------------------------------

test("reads this repository's tags without throwing", () => {
  // Today this repo has zero tags, so currentRelease() is null and the next release is v1.0.0.
  // Written to keep passing once tags exist: it asserts the shape, not the value.
  const cur = currentRelease();
  assert.ok(cur === null || (typeof cur.tag === "string" && /^v\d+\.\d+\.\d+$/.test(cur.tag)));
});

test("is deterministic (quickstart S1)", () => {
  const commits = [commit("feat: a"), commit("fix: b")];
  const a = nextVersion({ commits, current: V(1, 0, 0) });
  const b = nextVersion({ commits, current: V(1, 0, 0) });
  assert.deepEqual(a.release, b.release);
  assert.equal(a.bump, b.bump);
});

// ---- regression: the release that silently published nothing --------------------------------
//
// The first live run of release.yml reported `commits: 0` on a 192-commit history, exited
// successfully, and published no release. `subjectsSince` read the log with `allowFail: true`, so
// ANY git failure became "" -> zero commits -> "empty-range" -> "no release". A release pipeline
// that silently does nothing is worse than one that fails: nobody investigates a green run.
//
// These tests pin the two properties that make that impossible to repeat.

test("subjectsSince reads the real history rather than reporting zero (regression)", () => {
  const { subjectsSince } = require("../version");
  const { execFileSync } = require("child_process");
  const expected = Number.parseInt(
    execFileSync("git", ["rev-list", "--count", "HEAD"], { encoding: "utf8" }).trim(),
    10,
  );
  const got = subjectsSince(null).length;
  assert.ok(expected > 0, "this repository should have commits");
  assert.equal(got, expected, `parsed ${got} commits but git counts ${expected}`);
});

test("nextVersion never reports empty-range while commits exist in the range (regression)", () => {
  // Originally this asserted `reason !== "empty-range"` unconditionally, which was only correct
  // while the repo had no tags. Once HEAD sat exactly on the newest release tag, an empty range
  // became the RIGHT answer and the test failed on correct behaviour.
  //
  // The invariant that actually matters is narrower: empty-range may only be reported when the
  // range really is empty. Asserted against rev-list, which is the independent source.
  const { execFileSync } = require("child_process");
  const cur = currentRelease();
  const range = cur ? `${cur.tag}..HEAD` : "HEAD";
  const actual = Number.parseInt(
    execFileSync("git", ["rev-list", "--count", range], { encoding: "utf8" }).trim(),
    10,
  );

  const r = nextVersion();
  if (actual > 0) {
    assert.notEqual(r.reason, "empty-range", `${actual} commits in ${range} must not read as empty`);
    assert.ok(r.classifications.length > 0, "classifications must not be empty on a non-empty range");
  } else {
    assert.equal(r.reason, "empty-range", "a genuinely empty range must say so");
    assert.equal(r.release, null, "and must produce no release (FR-021)");
  }
});

test("a git failure propagates instead of becoming 'no release'", () => {
  const { subjectsSince } = require("../version");
  // An unresolvable revision is the cheapest way to make git fail. Before the fix this returned []
  // and the caller reported "nothing to release"; now it throws.
  assert.throws(() => subjectsSince("refs/tags/definitely-not-a-real-tag-076"));
});
