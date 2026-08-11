#!/usr/bin/env node
/**
 * Change classification (spec 076, FR-009/FR-011/FR-013/FR-014).
 *
 * Parses a Conventional-Commits subject line into a classification and the version bump it implies.
 * The normative definition is contracts/version-scheme.md; this file implements it and nothing else
 * in the repository may derive a version (see ./README.md).
 *
 * Two design points worth keeping:
 *
 *  1. `classify()` RETURNS a rejection rather than throwing. The merge gate has to render the
 *     accepted values back to the author (FR-011), and an exception carrying a string is a worse
 *     shape for that than a result object.
 *
 *  2. The byte-gate escalation (§4) is evaluated from the CHANGED-FILE LIST, not from job results.
 *     A change that moves deployed bytecode or mini-app output bytes cannot merge without editing a
 *     recorded baseline, so the baseline edit is present in the diff at PR-open time. That makes the
 *     rule checkable immediately and impossible to dodge by a digest job being skipped on a path
 *     filter.
 *
 * Usage:
 *   node scripts/release/classify.js "fix(scope): subject"            # classify one subject
 *   node scripts/release/classify.js --title "..." --files-from <f>   # with escalation check
 *   node scripts/release/classify.js --title "..." --body-from <f>    # honour BREAKING CHANGE footer
 */

/** type -> bump, per contracts/version-scheme.md §2. Every type contributes; none maps to "none". */
const TYPE_BUMP = {
  feat: "minor",
  fix: "patch",
  perf: "patch",
  refactor: "patch",
  docs: "patch",
  spec: "patch",
  test: "patch",
  build: "patch",
  ci: "patch",
  chore: "patch",
  style: "patch",
  revert: "patch",
};

const TYPES = Object.keys(TYPE_BUMP);

/** Bump significance, for aggregation (FR-013). Higher wins. */
const BUMP_RANK = { patch: 1, minor: 2, major: 3 };

/**
 * Byte-gate baselines (contracts/version-scheme.md §4). Editing one of these IS the act of accepting
 * that deployed bytecode or published package bytes changed, which is never housekeeping.
 */
const BASELINE_FILES = [
  "specs/075-monorepo-workspaces/baseline-bytecode.json",
  "specs/075-monorepo-workspaces/baseline-miniapp-builds.json",
];

/** Types that may not carry a baseline edit. */
const TRIVIAL_TYPES = ["chore", "docs", "style"];

/**
 * `<type>[(<scope>)][!]: <subject>`
 * The scope is any run without parentheses; the subject must be non-empty.
 */
const SUBJECT_RE = /^([a-z]+)(?:\(([^()]+)\))?(!)?:\s+(.+)$/;

/**
 * Parse a subject line. Returns either
 *   { ok: true,  type, scope, breaking, bump, subject }
 * or
 *   { ok: false, reason, accepted }
 */
function parseSubject(subject) {
  const line = String(subject ?? "").trim();
  if (!line) {
    return { ok: false, reason: "empty", accepted: TYPES };
  }
  const m = SUBJECT_RE.exec(line);
  if (!m) {
    return {
      ok: false,
      reason: `"${line}" does not match "<type>[(<scope>)][!]: <subject>"`,
      accepted: TYPES,
    };
  }
  const [, type, scope, bang, text] = m;
  if (!Object.prototype.hasOwnProperty.call(TYPE_BUMP, type)) {
    return { ok: false, reason: `unknown type "${type}"`, accepted: TYPES };
  }
  const breaking = Boolean(bang);
  return {
    ok: true,
    type,
    scope: scope || null,
    breaking,
    bump: breaking ? "major" : TYPE_BUMP[type],
    subject: text,
  };
}

/** A `BREAKING CHANGE:` footer is equivalent to `!` (contracts/version-scheme.md §1). */
function bodyDeclaresBreaking(body) {
  if (!body) return false;
  return /^BREAKING[ -]CHANGE:/m.test(String(body));
}

/**
 * The marker the release process writes on its own paperwork, e.g.
 * `chore(release): v1.5.6 [skip release]`.
 */
const SKIP_MARKER_RE = /\[skip[ -]release\]/i;

/**
 * Does this commit say, in its own words, that it must not cause a release?
 *
 * WHY THIS EXISTS. `release.yml` also checks for the marker, but it reads
 * `github.event.head_commit.message` — and the generated CHANGELOG commit reaches `main` inside a
 * pull request, so the head commit of that push is the MERGE commit, whose subject is
 * "Merge pull request #NNNN from …/release/vX.Y.Z-changelog". The marker sits one commit deeper,
 * the guard misses it, and the release runs. `chore(release)` then classifies as a patch and mints
 * the next version, whose record is another such PR, which mints the next one.
 *
 * That is not a hypothetical: `v1.5.6` sits on the merge of the `v1.5.5` record and `v1.5.7` on the
 * merge of the `v1.5.6` record — three versions carrying no product change, while the work waiting
 * to ship sat on `staging` (issue #1026 follow-up, PR #1140).
 *
 * So the marker is honoured HERE, in the authority that decides what a commit is worth, where it
 * holds however the commit arrived. Note it is the MARKER that is honoured and not the
 * `chore(release)` scope: a real change to the release tooling is written `chore(release): …` too
 * (v1.5.2 was exactly that), and it must keep counting.
 */
function carriesSkipMarker({ subject = "", body = "" } = {}) {
  return SKIP_MARKER_RE.test(String(subject)) || SKIP_MARKER_RE.test(String(body));
}

/**
 * Escalation, §4. Returns an error string when a baseline edit rides on a trivial type, else null.
 * Note this only ever ESCALATES: a baseline edit on a `fix` or a `feat` passes untouched, because
 * those already assert that something real changed.
 */
function checkBaselineEscalation(type, changedFiles) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) return null;
  if (!TRIVIAL_TYPES.includes(type)) return null;
  const touched = BASELINE_FILES.filter((b) => changedFiles.includes(b));
  if (touched.length === 0) return null;
  return (
    `type "${type}" is not permitted when a byte-gate baseline is modified ` +
    `(${touched.join(", ")}). Re-recording a baseline means deployed bytecode or published ` +
    `package bytes changed, which is never housekeeping. Use at least "fix", or add "!" if an ` +
    `interface changed. See specs/076-monorepo-semantic-versioning/contracts/version-scheme.md §4.`
  );
}

/**
 * Full classification of a pull request or commit.
 * @param {{subject: string, body?: string, changedFiles?: string[]}} input
 */
function classify({ subject, body = "", changedFiles = [] }) {
  const parsed = parseSubject(subject);
  if (!parsed.ok) return parsed;

  // The footer can only ever add breaking-ness, never remove it.
  if (!parsed.breaking && bodyDeclaresBreaking(body)) {
    parsed.breaking = true;
    parsed.bump = "major";
  }

  const escalation = checkBaselineEscalation(parsed.type, changedFiles);
  if (escalation) {
    return { ok: false, reason: escalation, accepted: TYPES.filter((t) => !TRIVIAL_TYPES.includes(t)) };
  }
  return parsed;
}

/** The most significant bump among many (FR-013). Empty list -> null, so callers can detect it. */
function aggregateBump(bumps) {
  const ranked = bumps.filter(Boolean).map((b) => BUMP_RANK[b] || 0);
  if (ranked.length === 0) return null;
  const top = Math.max(...ranked);
  return Object.keys(BUMP_RANK).find((k) => BUMP_RANK[k] === top) || null;
}

module.exports = {
  TYPES,
  TYPE_BUMP,
  BUMP_RANK,
  BASELINE_FILES,
  TRIVIAL_TYPES,
  parseSubject,
  bodyDeclaresBreaking,
  SKIP_MARKER_RE,
  carriesSkipMarker,
  checkBaselineEscalation,
  classify,
  aggregateBump,
};

// ---- CLI ---------------------------------------------------------------------------------------
if (require.main === module) {
  const fs = require("fs");
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i === -1 ? null : argv[i + 1];
  };
  const readIf = (p) => (p && fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");

  const subject = flag("--title") || argv.find((a) => !a.startsWith("--")) || "";
  const body = readIf(flag("--body-from"));
  const filesRaw = readIf(flag("--files-from"));
  const changedFiles = filesRaw.split("\n").map((s) => s.trim()).filter(Boolean);

  const result = classify({ subject, body, changedFiles });
  if (!result.ok) {
    console.error(`::error::Change classification failed: ${result.reason}`);
    console.error("");
    console.error("Every pull request must declare what kind of change it makes, as a title of the form:");
    console.error("");
    console.error("    <type>[(<scope>)][!]: <subject>");
    console.error("");
    console.error(`Accepted types: ${result.accepted.join(", ")}`);
    console.error('Add "!" before the colon (or a "BREAKING CHANGE:" footer) for a breaking change.');
    console.error("");
    console.error("What counts as breaking in this repository is written down in");
    console.error("specs/076-monorepo-semantic-versioning/contracts/version-scheme.md §3.");
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
}
