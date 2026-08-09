#!/usr/bin/env node
/**
 * Version computation (spec 076, FR-001..FR-006, FR-013, FR-021).
 *
 * The ONLY thing in this repository that computes a release version. See ./README.md for why that
 * matters and contracts/version-scheme.md for the normative rules.
 *
 * Reads git tags and the commit subjects since the highest one, classifies each subject, and emits
 * the next version. Three behaviours are load-bearing and each has a test:
 *
 *  · AGGREGATION (FR-013): the bump is the MOST SIGNIFICANT classification in the range, not the
 *    most recent. One `feat` among fifty `chore`s is a minor release.
 *  · NO PREVIOUS RELEASE (FR-006): with zero tags the answer is the constant v1.0.0. It is never
 *    read from a package.json — the manifests currently say 1.0.0 / 0.1.0 / 0.0.0 and inheriting
 *    any of them would be arbitrary.
 *  · EMPTY RANGE (FR-021): no commits since the last tag means NO release, not a version bump.
 *
 * Usage:
 *   node scripts/release/version.js                    # print the next version, e.g. v1.4.0
 *   node scripts/release/version.js --explain          # + every commit's classification
 *   node scripts/release/version.js --rc               # next release candidate, e.g. v1.4.0-rc.2
 *   node scripts/release/version.js --json             # machine-readable
 *   node scripts/release/version.js --current          # highest published release, or "none"
 */
const { execFileSync } = require("child_process");
const { classify, aggregateBump } = require("./classify");

/** FR-006: chosen deliberately, not inherited from a manifest. See research R9. */
const FIRST_VERSION = { major: 1, minor: 0, patch: 0 };

const RELEASE_TAG_RE = /^v(\d+)\.(\d+)\.(\d+)$/;
const RC_TAG_RE = /^v(\d+)\.(\d+)\.(\d+)-rc\.(\d+)$/;

function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      // Node's default is 1 MiB. The full-history log with bodies is ~430 KB today and grows with
      // every commit; crossing the default makes execFileSync throw ENOBUFS, which — before the
      // guard in subjectsSince below — was swallowed into "no commits". Sized so it cannot be the
      // cause again.
      maxBuffer: 256 * 1024 * 1024,
    }).trim();
  } catch (err) {
    if (allowFail) return "";
    throw err;
  }
}

/** Cheap, bounded, and immune to buffer limits — used to cross-check the parsed log. */
function commitCount(range) {
  const out = git(["rev-list", "--count", range]);
  return Number.parseInt(out, 10);
}

function fmt(v) {
  return `v${v.major}.${v.minor}.${v.patch}`;
}

function compare(a, b) {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/** All published release tags, highest last. Release-candidate tags are deliberately excluded. */
function releaseTags() {
  const out = git(["tag", "--list", "v*"], { allowFail: true });
  if (!out) return [];
  return out
    .split("\n")
    .map((t) => t.trim())
    .map((t) => {
      const m = RELEASE_TAG_RE.exec(t);
      return m ? { tag: t, major: +m[1], minor: +m[2], patch: +m[3] } : null;
    })
    .filter(Boolean)
    .sort(compare);
}

function currentRelease() {
  const tags = releaseTags();
  return tags.length ? tags[tags.length - 1] : null;
}

/** Commit subjects in (from, HEAD]. With no `from`, the whole history. */
function subjectsSince(fromTag) {
  const range = fromTag ? `${fromTag}..HEAD` : "HEAD";

  // NO `allowFail` HERE — deliberately. It used to be `{ allowFail: true }`, and that turned any
  // git failure into `""` -> zero commits -> "empty-range" -> "no release". The first live run of
  // this workflow did exactly that: it reported `commits: 0` on a 192-commit history, exited
  // successfully, and published nothing. A release pipeline that silently does nothing is worse
  // than one that fails, because nobody investigates a green run.
  //
  // This is the same rule the rest of spec 076 is built on: unknown is not the same as clear.
  const out = git(["log", "--format=%s%x00%b%x1e", range]);

  // Cross-check against a command that cannot plausibly fail the same way. If git can count
  // commits in this range but we parsed none out of the log, something is wrong with the READ,
  // not with the repository — and reporting "nothing to release" would be a lie.
  const expected = commitCount(range);
  const parsed = out ? out.split("\x1e").map((r) => r.trim()).filter(Boolean).length : 0;
  if (expected > 0 && parsed === 0) {
    throw new Error(
      `git rev-list counts ${expected} commit(s) in "${range}" but the formatted log parsed 0. ` +
        `Refusing to report "nothing to release" — that would silently skip a real release. ` +
        `Log length was ${out.length} bytes.`,
    );
  }

  if (!out) return [];
  return out
    .split("\x1e")
    .map((rec) => rec.trim())
    .filter(Boolean)
    .map((rec) => {
      const [subject, body = ""] = rec.split("\x00");
      return { subject: subject.trim(), body: body.trim() };
    });
}

function applyBump(base, bump) {
  if (bump === "major") return { major: base.major + 1, minor: 0, patch: 0 };
  if (bump === "minor") return { major: base.major, minor: base.minor + 1, patch: 0 };
  return { major: base.major, minor: base.minor, patch: base.patch + 1 };
}

/**
 * Compute the next release.
 *
 * Returns { release: null, reason: 'empty-range' } when there is nothing to release (FR-021) —
 * callers must treat that as "do not tag", never as "tag the same version again".
 */
function nextVersion({ commits = null, current = undefined } = {}) {
  const prev = current === undefined ? currentRelease() : current;
  const range = commits === null ? subjectsSince(prev ? prev.tag : null) : commits;

  if (range.length === 0) {
    return { release: null, reason: "empty-range", previous: prev, classifications: [] };
  }

  const classifications = range.map((c) => {
    const r = classify({ subject: c.subject, body: c.body });
    return { subject: c.subject, ...(r.ok ? r : { unclassified: true, reason: r.reason }) };
  });

  // Merge commits and any historical subject that predates the convention simply do not vote.
  // They still appear in --explain, so an operator can see they were ignored rather than
  // silently dropped.
  const bumps = classifications.filter((c) => !c.unclassified).map((c) => c.bump);

  if (!prev) {
    // FR-006: the first release is a constant. The accumulated classifications do not raise or
    // lower it — there is no predecessor for "one more than" to mean anything against.
    return {
      release: FIRST_VERSION,
      reason: "no-previous-release",
      previous: null,
      bump: null,
      classifications,
    };
  }

  const bump = aggregateBump(bumps);
  if (!bump) {
    // Commits exist but none classified. Do not invent a bump; say so.
    return { release: null, reason: "no-classified-commits", previous: prev, classifications };
  }

  const release = applyBump(prev, bump);
  // FR-005: monotonic by construction, but assert it — a moved or hand-created tag would break it.
  if (compare(release, prev) <= 0) {
    throw new Error(`computed ${fmt(release)} is not greater than existing ${prev.tag}`);
  }
  return { release, reason: "computed", previous: prev, bump, classifications };
}

/**
 * The next release candidate on the integration branch (FR-002).
 * `base` tracks the accumulated classification, so a candidate can move from 1.3.1-rc.1 to
 * 1.4.0-rc.2 when a feat lands — the base is not fixed at the first guess.
 */
function nextCandidate(opts = {}) {
  const next = nextVersion(opts);
  if (!next.release) return { ...next, candidate: null };

  const out = git(["tag", "--list", `${fmt(next.release)}-rc.*`], { allowFail: true });
  const iterations = out
    ? out
        .split("\n")
        .map((t) => RC_TAG_RE.exec(t.trim()))
        .filter(Boolean)
        .map((m) => +m[4])
    : [];
  const iteration = (iterations.length ? Math.max(...iterations) : 0) + 1;
  return { ...next, candidate: `${fmt(next.release)}-rc.${iteration}`, iteration };
}

/**
 * The release candidate this release was promoted from (FR-036).
 *
 * Returns the highest `v<version>-rc.N` tag that is an ANCESTOR of the release commit. Ancestry is
 * the point: an rc tag on an abandoned staging line is not what shipped, and naming it would make
 * the record wrong in exactly the way the record exists to prevent.
 *
 * Returns null for a hotfix — one that bypassed staging has no candidate, and the release record
 * prints "none (hotfix)" rather than omitting the line.
 */
function promotedFrom(version, ref = "HEAD") {
  const base = String(version || "").trim();
  if (!RELEASE_TAG_RE.test(base)) return null;
  const out = git(["tag", "--list", `${base}-rc.*`, "--merged", ref], { allowFail: true });
  if (!out) return null;
  const found = out
    .split("\n")
    .map((t) => RC_TAG_RE.exec(t.trim()))
    .filter(Boolean)
    .map((m) => ({ tag: m[0], iteration: +m[4] }))
    .sort((a, b) => a.iteration - b.iteration);
  return found.length ? found[found.length - 1].tag : null;
}

module.exports = {
  FIRST_VERSION,
  promotedFrom,
  fmt,
  compare,
  releaseTags,
  currentRelease,
  subjectsSince,
  applyBump,
  nextVersion,
  nextCandidate,
};

// ---- CLI ---------------------------------------------------------------------------------------
if (require.main === module) {
  const argv = process.argv.slice(2);
  const has = (f) => argv.includes(f);

  if (has("--current")) {
    const cur = currentRelease();
    console.log(cur ? cur.tag : "none");
    process.exit(0);
  }

  // FR-036: which candidate did this release come from?
  const pfIndex = argv.indexOf("--promoted-from");
  if (pfIndex !== -1) {
    console.log(promotedFrom(argv[pfIndex + 1]) || "none (hotfix)");
    process.exit(0);
  }

  const result = has("--rc") ? nextCandidate() : nextVersion();
  const label = has("--rc") ? result.candidate : result.release && fmt(result.release);

  if (has("--json")) {
    console.log(
      JSON.stringify(
        {
          version: label,
          reason: result.reason,
          bump: result.bump ?? null,
          previous: result.previous ? result.previous.tag : null,
          commits: result.classifications.length,
        },
        null,
        2,
      ),
    );
    process.exit(label ? 0 : 0);
  }

  if (has("--explain")) {
    console.log(`previous: ${result.previous ? result.previous.tag : "none"}`);
    console.log(`commits:  ${result.classifications.length}`);
    for (const c of result.classifications) {
      const tag = c.unclassified ? "unclassified" : `${c.type}${c.breaking ? "!" : ""} -> ${c.bump}`;
      console.log(`  [${tag}] ${c.subject}`);
    }
    console.log(`bump:     ${result.bump ?? "n/a"}`);
    console.log(`reason:   ${result.reason}`);
    console.log(`next:     ${label ?? "no release"}`);
    process.exit(0);
  }

  if (!label) {
    console.error(`no release: ${result.reason}`);
    process.exit(0);
  }
  console.log(label);
}
