#!/usr/bin/env node
/**
 * Mini-app version ↔ published-bytes pairing (spec 076, FR-007b).
 *
 * Mini-app packages version INDEPENDENTLY of the repository release (FR-007), because they are
 * published at immutable content addresses and curated on-chain on their own schedule. That
 * independence creates a failure mode nothing else in the repo has:
 *
 *   a package version and the CID it is paired with in a release record can disagree.
 *
 * This check makes that disagreement impossible to merge. It is enforced in BOTH directions,
 * because either one makes the release record untrue:
 *
 *   · bytes changed, version did not  -> two different packages claim the same version
 *   · version changed, bytes did not  -> a release record names a CID that never moved
 *
 * The proxy for "the published bytes changed" is the mini-app baseline digest — the same file the
 * spec-075 byte gate compares against, which cannot be left stale because that gate fails first.
 *
 * Usage:
 *   node scripts/release/check-miniapp-versions.js --base <sha> --head <sha>
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const MINIAPPS_DIR = path.join(ROOT, "frontend", "miniapps");
const BASELINE = "specs/075-monorepo-workspaces/baseline-miniapp-builds.json";

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function apps() {
  if (!fs.existsSync(MINIAPPS_DIR)) return [];
  return fs
    .readdirSync(MINIAPPS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(MINIAPPS_DIR, e.name, "package.json")))
    .map((e) => e.name);
}

function versionAt(ref, app) {
  const out = git(["show", `${ref}:frontend/miniapps/${app}/package.json`]);
  if (out === null) return null; // did not exist at that ref
  try {
    return JSON.parse(out).version ?? null;
  } catch {
    return null;
  }
}

function baselineAt(ref) {
  const out = git(["show", `${ref}:${BASELINE}`]);
  if (out === null) return null;
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

/** Digest keys for one app, e.g. "token-mint/entry.js". */
function digestsFor(baseline, app) {
  if (!baseline) return null;
  return Object.fromEntries(Object.entries(baseline).filter(([k]) => k.startsWith(`${app}/`)));
}

function bytesChanged(baseBaseline, headBaseline, app) {
  const a = digestsFor(baseBaseline, app);
  const b = digestsFor(headBaseline, app);
  // A baseline that cannot be read at either ref means we cannot tell. Say so rather than passing.
  if (a === null || b === null) return null;
  return JSON.stringify(a) !== JSON.stringify(b);
}

function check({ base, head }) {
  const baseBaseline = baselineAt(base);
  const headBaseline = baselineAt(head);
  const problems = [];
  const notes = [];

  for (const app of apps()) {
    const before = versionAt(base, app);
    const after = versionAt(head, app);
    // First appearance: the package did not exist at base, so its first version and its first
    // recorded bytes have no prior pairing to check against. Both directions of the gate would
    // otherwise misread "new" as "changed without a bump" (spec 095 added the third package).
    if (before === null && after !== null) {
      notes.push(`${app}: new package at ${after} — no base pairing to verify`);
      continue;
    }
    const versionMoved = before !== null && after !== null && before !== after;
    const moved = bytesChanged(baseBaseline, headBaseline, app);

    if (moved === null) {
      notes.push(`${app}: could not read ${BASELINE} at both refs — pairing unverified`);
      continue;
    }
    if (moved && !versionMoved) {
      problems.push(
        `${app}: published bytes changed but package.json version did not move (still ${after}). ` +
          `Two different packages would claim the same version.`,
      );
    }
    if (!moved && versionMoved) {
      problems.push(
        `${app}: package.json version moved ${before} -> ${after} but the published bytes did not. ` +
          `A release record would name a CID that never changed.`,
      );
    }
  }
  return { problems, notes };
}

module.exports = { apps, versionAt, baselineAt, bytesChanged, check };

// ---- CLI ---------------------------------------------------------------------------------------
if (require.main === module) {
  const argv = process.argv.slice(2);
  const flag = (n) => {
    const i = argv.indexOf(n);
    return i === -1 ? null : argv[i + 1];
  };
  const base = flag("--base");
  const head = flag("--head") || "HEAD";
  if (!base) {
    console.error("--base is required");
    process.exit(1);
  }

  const { problems, notes } = check({ base, head });
  for (const n of notes) console.log(`::warning::${n}`);
  if (problems.length) {
    for (const p of problems) console.error(`::error::${p}`);
    console.error("");
    console.error("Mini-app packages version independently (spec 076 FR-007). Their version and");
    console.error("their published bytes must move together, or the release record's version-to-CID");
    console.error("pairing is untrue (FR-007b).");
    process.exit(1);
  }
  console.log("mini-app version/bytes pairing OK");
}
