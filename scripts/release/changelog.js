#!/usr/bin/env node
/**
 * CHANGELOG.md generation (spec 076, FR-037).
 *
 * The changelog is PRODUCED by the release process, never written by hand. It is prepended between
 * the RELEASES markers so the file's own header — which says exactly that — is preserved.
 *
 * Usage:
 *   node scripts/release/changelog.js --version v1.4.0 [--previous v1.3.2] [--artifacts artifacts.md]
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { classify, carriesSkipMarker } = require("./classify");
const { promotedFrom } = require("./version");

const ROOT = path.join(__dirname, "..", "..");
const CHANGELOG = path.join(ROOT, "CHANGELOG.md");
const START = "<!-- RELEASES:START -->";
const END = "<!-- RELEASES:END -->";

/** Mirrors the category taxonomy in .github/release-drafter.yml so notes and changelog agree. */
const GROUPS = [
  { title: "🚀 Features", types: ["feat"] },
  { title: "🐛 Bug Fixes", types: ["fix"] },
  { title: "⚡ Performance", types: ["perf"] },
  { title: "🔒 Security", types: [] }, // populated by scope, below
  { title: "♻️ Refactoring", types: ["refactor"] },
  { title: "📚 Documentation", types: ["docs", "spec"] },
  { title: "🧪 Tests", types: ["test"] },
  { title: "🏗️ Infrastructure", types: ["ci", "build"] },
  { title: "🧹 Maintenance", types: ["chore", "style", "revert"] },
];

/**
 * `soft` is for cosmetic reads only (the release date). The COMMIT LOG must never be read softly:
 * swallowing a git failure into "" produces a changelog entry that silently omits every change in
 * the release, which is the same class of defect as version.js reporting "nothing to release" on a
 * 192-commit history. A changelog that is quietly empty is worse than a failed release.
 */
function git(args, { soft = false } = {}) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 256 * 1024 * 1024,
    }).trim();
  } catch (err) {
    if (soft) return "";
    throw err;
  }
}

function commitsIn(previous, version) {
  const range = previous ? `${previous}..${version}` : version;
  const out = git(["log", "--format=%s%x00%b%x1e", range]);

  // Same cross-check as version.js: if git can count commits here but we parsed none, the read
  // failed and an empty changelog would be a lie.
  const expected = Number.parseInt(git(["rev-list", "--count", range]), 10);
  const parsed = out ? out.split("\x1e").map((r) => r.trim()).filter(Boolean).length : 0;
  if (expected > 0 && parsed === 0) {
    throw new Error(
      `git rev-list counts ${expected} commit(s) in "${range}" but the formatted log parsed 0. ` +
        `Refusing to write an empty changelog entry for a non-empty release.`,
    );
  }

  if (!out) return [];
  return out
    .split("\x1e")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [subject, body = ""] = r.split("\x00");
      return { subject: subject.trim(), body: body.trim() };
    });
}

function group(commits) {
  const buckets = new Map(GROUPS.map((g) => [g.title, []]));
  for (const c of commits) {
    // The same rule version.js votes by: a commit the release process marked as its own paperwork
    // is not a change anyone released. Listing "chore(release): v1.5.6" under a later version would
    // describe the machine to the reader instead of the product.
    if (carriesSkipMarker(c)) continue;
    const r = classify({ subject: c.subject, body: c.body });
    if (!r.ok) continue; // merge commits and pre-convention subjects are not release notes
    const g =
      GROUPS.find((x) => x.types.includes(r.type)) ||
      GROUPS[GROUPS.length - 1];
    buckets.get(g.title).push(`- ${c.subject}`);
  }
  return buckets;
}

function entry({ version, previous, commits, artifacts, promotedFrom: from }) {
  // Soft: the tag may not exist yet when this is called from a test or a dry run, and a missing
  // date is cosmetic. The commit list above is not.
  const date =
    git(["log", "-1", "--format=%cs", version], { soft: true }) ||
    git(["log", "-1", "--format=%cs"], { soft: true });
  const lines = [`## ${version} — ${date}`, ""];
  // FR-036: always stated — a missing line reads as an oversight, and this one is load-bearing
  // during an incident.
  //
  // The absent case is NOT labelled "hotfix". It was, and that was wrong: a release can lack a
  // candidate because it was a hotfix, OR because it was cut before the `staging` branch existed —
  // which is true of every release so far. Naming a cause the script cannot actually determine is
  // the same dishonesty this spec exists to remove. It states the observable fact instead.
  lines.push(`Promoted from: ${from || "none — released directly from main"}`);
  lines.push(
    previous
      ? `Previous release: ${previous} · Range: \`${previous}..${version}\` (${commits.length} commits)`
      : `First release · ${commits.length} commits`,
  );
  lines.push("");

  const buckets = group(commits);
  for (const [title, items] of buckets) {
    if (items.length === 0) continue;
    lines.push(`### ${title}`, "", ...items, "");
  }

  if (artifacts) lines.push(artifacts.trim(), "");
  return lines.join("\n");
}

function prepend(md) {
  const current = fs.readFileSync(CHANGELOG, "utf8");
  const s = current.indexOf(START);
  const e = current.indexOf(END);
  if (s === -1 || e === -1) {
    throw new Error(`CHANGELOG.md is missing its ${START} / ${END} markers — refusing to guess where to write`);
  }
  const head = current.slice(0, s + START.length);
  const existing = current.slice(s + START.length, e).trim();
  // The seed placeholder is replaced by the first real entry rather than accumulating beneath it.
  const body = existing.startsWith("_No releases yet") ? "" : existing;
  const tail = current.slice(e);
  return `${head}\n\n${md.trim()}\n\n${body ? `${body}\n\n` : ""}${tail}`;
}

module.exports = { GROUPS, commitsIn, group, entry, prepend };

// ---- CLI ---------------------------------------------------------------------------------------
if (require.main === module) {
  const argv = process.argv.slice(2);
  const flag = (n) => {
    const i = argv.indexOf(n);
    return i === -1 ? null : argv[i + 1];
  };
  const version = flag("--version");
  if (!version) {
    console.error("--version is required");
    process.exit(1);
  }
  const previous = flag("--previous") || null;
  const artifactsPath = flag("--artifacts");
  const artifacts = artifactsPath && fs.existsSync(artifactsPath) ? fs.readFileSync(artifactsPath, "utf8") : "";

  const commits = commitsIn(previous, version);
  const md = entry({ version, previous, commits, artifacts, promotedFrom: promotedFrom(version) });
  fs.writeFileSync(CHANGELOG, prepend(md));
  console.log(`CHANGELOG.md updated with ${version} (${commits.length} commits)`);
}
