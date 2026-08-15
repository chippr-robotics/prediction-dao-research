#!/usr/bin/env node
/**
 * Tests for the IaC guardrail gate (spec 087, T008).
 *
 * A gate that silently passes everything is worse than no gate, because it gets cited as evidence
 * that the rules hold. Every rule therefore has a fixture that MUST be rejected, and a compliant
 * fixture that MUST be accepted.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("path");

const { check, stripComments, extractBlocks, attr, nestedBlock } = require("../check-iac-guardrails.js");

const FIXTURES = path.resolve(__dirname, "..", "__fixtures__");
const PASSING = path.join(FIXTURES, "passing");

/** Rules raised when scanning the whole failing-fixture tree. */
const failing = check(FIXTURES, [FIXTURES], { includeFixtures: true });
const rulesRaised = new Set(failing.violations.map((v) => v.rule));

const EXPECTED_RULES = [
  ["G-01", "authoritative project IAM policy"],
  ["G-02", "authoritative project IAM binding"],
  ["G-03", "google_project as a managed resource"],
  ["G-04", "secret version resource writing a payload into state"],
  ["G-05", "google_project_service without disable_on_destroy = false"],
  ["G-06", "protected resource without prevent_destroy"],
  ["G-07", "Cloud Run service without the pipeline-owned ignore_changes set"],
  ["G-08", "hardcoded environment literal inside a module"],
  ["G-09", "provider block inside a module"],
  ["G-10", "reference to another workload"],
  ["G-11", "re-declared Cloud Run alto bundler"],
  ["G-12", "environment root without a GCS backend"],
  ["G-13", "root without a committed provider lockfile"],
  ["G-14", "-target in a committed script"],
  ["G-16", "an external module source that is unpinned or pinned to a branch"],
];

for (const [rule, description] of EXPECTED_RULES) {
  test(`${rule} rejects ${description}`, () => {
    assert.ok(
      rulesRaised.has(rule),
      `${rule} did not fire. A rule that never fires is a rule that is not enforced.\nRaised: ${[...rulesRaised].sort().join(", ")}`
    );
  });
}

test("the compliant fixture is accepted", () => {
  const { violations } = check(PASSING, [PASSING], { includeFixtures: true });
  assert.deepStrictEqual(
    violations,
    [],
    `compliant fixture rejected:\n${violations.map((v) => `${v.rule} ${v.file}:${v.line} ${v.message}`).join("\n")}`
  );
});

test("every violation reports rule, file, line and a rationale", () => {
  for (const v of failing.violations) {
    assert.match(v.rule, /^G-\d\d$/);
    assert.ok(v.file && v.file.length > 0, "violation missing file");
    assert.ok(Number.isInteger(v.line) && v.line >= 1, `violation missing usable line: ${JSON.stringify(v)}`);
    assert.ok(v.message.length > 20, `violation message too terse to act on: ${v.message}`);
  }
});

test("G-16 accepts a 40-character commit SHA pin", () => {
  // A SHA is stricter than a tag: a tag can be repointed, a commit cannot. The passing fixture uses
  // one, so this asserts the rule does not fire on the form we actually ship.
  const { violations } = check(PASSING, [PASSING], { includeFixtures: true });
  assert.deepStrictEqual(violations.filter((v) => v.rule === "G-16"), []);
});

test("G-16 flags a branch pin distinctly from a missing pin", () => {
  const messages = failing.violations.filter((v) => v.rule === "G-16").map((v) => v.message);
  assert.ok(messages.some((m) => /no \?ref= pin/.test(m)), "a missing pin must be reported");
  assert.ok(messages.some((m) => /not immutable/.test(m)), "a branch pin must be reported as mutable");
});

test("G-10 catches a foreign workload that appears in no deny-list", () => {
  // The point of inverting this rule. The company website shares the GCP project and is named in no
  // list of "other people's workloads" anywhere in this repository — a deny-list would have to have
  // anticipated it. The allow-list rejects it because it is not something this repo owns.
  const hit = failing.violations.find(
    (v) => v.rule === "G-10" && v.message.includes("chippr-company-site")
  );
  assert.ok(
    hit,
    "an unrecognised GCP resource name must be rejected by default — that is what makes the rule bounded"
  );
});

test("G-10 does not judge Cloudflare rule labels", () => {
  // Cloudflare is scoped by zone id and a zone-scoped token, a different boundary from the shared
  // GCP project, and its `name` fields are human-readable labels rather than identifiers. Judging
  // them would make the rule fire on correct configuration, which is how a gate gets disabled.
  const { violations } = check(PASSING, [PASSING], { includeFixtures: true });
  assert.deepStrictEqual(violations.filter((v) => v.rule === "G-10"), []);
});

test("G-01 and G-02 name the additive replacement in their message", () => {
  const g01 = failing.violations.find((v) => v.rule === "G-01");
  const g02 = failing.violations.find((v) => v.rule === "G-02");
  assert.match(g01.message, /_iam_member/, "G-01 must tell the reader what to use instead");
  assert.match(g02.message, /_iam_member/, "G-02 must tell the reader what to use instead");
});

test("a secret version DATA source warns but does not fail", () => {
  // The one accepted exception (the origin-lock header value) must stay usable and countable.
  const dir = path.join(FIXTURES, "..", "__fixtures_tmp_data__");
  const fs = require("node:fs");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "data.tf"),
    'data "google_secret_manager_secret_version" "origin_lock" {\n  secret = "origin-lock-secret"\n}\n'
  );
  try {
    const res = check(dir, [dir], { includeFixtures: true });
    assert.deepStrictEqual(
      res.violations,
      [],
      "a data source read must not fail the gate — only the resource form writes a payload into state"
    );
    assert.strictEqual(res.warnings.length, 1, "the exception must be warned about so it stays countable");
    assert.strictEqual(res.warnings[0].rule, "G-04");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── parser behaviour that the rules depend on ─────────────────────────────────────────────────

test("comment stripping preserves string contents and line numbers", () => {
  const src = 'resource "x" "y" {\n  description = "uses # inside a string"\n  # a real comment\n}\n';
  const out = stripComments(src);
  assert.ok(out.includes("uses # inside a string"), "a # inside a string is not a comment");
  assert.ok(!out.includes("a real comment"), "a real comment must be stripped");
  assert.strictEqual(out.split("\n").length, src.split("\n").length, "line numbering must be preserved");
});

test("a violation hidden behind a commented-out block is not reported", () => {
  const fs = require("node:fs");
  const dir = path.join(FIXTURES, "..", "__fixtures_tmp_comment__");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "c.tf"),
    '# resource "google_project_iam_binding" "old" {\n#   role = "roles/viewer"\n# }\n'
  );
  try {
    assert.deepStrictEqual(check(dir, [dir], { includeFixtures: true }).violations, [], "commented-out code is not code");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("block extraction survives braces inside string values", () => {
  const blocks = extractBlocks('\nresource "a" "b" {\n  x = "a { brace"\n  y = 1\n}\n');
  assert.strictEqual(blocks.length, 1);
  assert.deepStrictEqual(blocks[0].labels, ["a", "b"]);
  assert.match(blocks[0].body, /y = 1/, "the block must not have ended early at the brace inside the string");
});

test("nested block and attribute readers work on a lifecycle body", () => {
  const body = '\n  name = "x"\n  lifecycle {\n    prevent_destroy = true\n  }\n';
  const lifecycle = nestedBlock(body, "lifecycle");
  assert.ok(lifecycle, "lifecycle block not found");
  assert.strictEqual(attr(lifecycle, "prevent_destroy"), "true");
});
