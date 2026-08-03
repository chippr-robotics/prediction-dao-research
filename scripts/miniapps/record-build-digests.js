#!/usr/bin/env node
/**
 * Mini-app build digest baseline (spec 075, FR-019/FR-020/B2).
 *
 * WHY THIS EXISTS
 * tools/miniapp-build/hostScopePlugin.js resolves each shared dependency and `await import()`s it
 * to enumerate its EXPORT NAMES, then bakes those names into the emitted host shim. Those bytes
 * land in dist/entry.js, whose sha256 goes into manifest.json, whose raw bytes are keccak256'd as
 * the on-chain MiniAppRegistry commitment.
 *
 * So: npm hoisting -> module resolution -> shim text -> entry.js -> manifest hash -> on-chain
 * commitment. A change to installation layout (adopting workspaces, bumping a dep) can invalidate
 * an immutable, curated, on-chain record with NO error raised anywhere.
 *
 * WHAT THIS GATE IS, AND IS NOT
 * It compares BEFORE vs AFTER **on the same source tree**. It deliberately does NOT compare against
 * the published CID: the live packages were built on a developer machine from an unrecorded commit
 * against unrecorded dependency versions, so a mismatch there could not distinguish "this change
 * broke it" from "HEAD never reproduced it". Answering that separate question needs an on-chain
 * read (scripts/miniapps/record-baseline.js, spec 075 T031).
 *
 * Usage:
 *   node scripts/miniapps/record-build-digests.js --out <file>
 *   node scripts/miniapps/record-build-digests.js --compare <file>   # exit 1 on any difference
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..", "..");
const APPS = ["token-mint", "clearpath"];
const FILES = ["entry.js", "manifest.json", "style.css"];

function digests() {
  const out = {};
  for (const app of APPS) {
    for (const f of FILES) {
      const p = path.join(ROOT, "frontend", "miniapps", app, "dist", f);
      if (!fs.existsSync(p)) {
        out[`${app}/${f}`] = "MISSING";
        continue;
      }
      out[`${app}/${f}`] = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
    }
  }
  return out;
}

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const cmpIdx = args.indexOf("--compare");
const maxAgeIdx = args.indexOf("--max-age-seconds");
const now = digests();

/**
 * A stale dist is a FALSE PASS, and this gate has already produced one.
 *
 * During the spec-075 workspace conversion both mini-app builds failed (rollup's native binary was
 * missing from a freshly-resolved lockfile) and this script still reported "output bytes
 * unchanged" — because it hashed the dist/ left behind by the PREVIOUS successful build. A gate
 * that passes when the build did not run is worse than no gate, because it is trusted.
 *
 * So when comparing, require the artifacts to be newer than the given age. Callers that just ran
 * a build pass a small window; the default is off only for `--out`, where recording whatever is
 * on disk is the intent.
 */
function assertFresh(maxAgeSeconds) {
  const stale = [];
  const cutoff = Number(process.env.SOURCE_DATE_EPOCH ? 0 : maxAgeSeconds);
  for (const app of APPS) {
    for (const f of FILES) {
      const p = path.join(ROOT, "frontend", "miniapps", app, "dist", f);
      const ageSec = (Date.now() - fs.statSync(p).mtimeMs) / 1000;
      if (ageSec > cutoff) stale.push(`${app}/${f} (${Math.round(ageSec)}s old)`);
    }
  }
  if (stale.length) {
    console.error(
      `\nFAIL: ${stale.length} built file(s) are older than ${maxAgeSeconds}s — the build did not just run.\n` +
        "Refusing to compare a stale dist/: that reports success for a build that never happened.\n" +
        stale.map((s) => `  · ${s}`).join("\n"),
    );
    process.exit(2);
  }
}

const missing = Object.entries(now).filter(([, v]) => v === "MISSING");
if (missing.length) {
  console.error(`FAIL: ${missing.length} built file(s) missing — build both packages first:`);
  missing.forEach(([k]) => console.error(`  · ${k}`));
  process.exit(2);
}

if (outIdx !== -1) {
  fs.writeFileSync(args[outIdx + 1], `${JSON.stringify(now, null, 1)}\n`);
  console.log(`recorded ${Object.keys(now).length} built files -> ${args[outIdx + 1]}`);
  process.exit(0);
}

if (cmpIdx !== -1) {
  // Default window: 10 minutes. Long enough for two real builds, short enough that yesterday's
  // dist cannot masquerade as today's.
  assertFresh(maxAgeIdx !== -1 ? Number(args[maxAgeIdx + 1]) : 600);
  const base = JSON.parse(fs.readFileSync(args[cmpIdx + 1], "utf8"));
  const diff = Object.keys(base).filter((k) => base[k] !== now[k]);
  Object.keys(base).forEach((k) => console.log(`${base[k] === now[k] ? "  match " : "  DIFFER"} ${k}`));
  if (diff.length) {
    console.error(
      `\nFAIL: ${diff.length} mini-app output file(s) changed.\n` +
        "These bytes are keccak-committed on-chain in MiniAppRegistry. Per spec 075 FR-022 this\n" +
        "BLOCKS the change until the difference is explained, and the affected package is\n" +
        "re-published and re-approved on-chain.",
    );
    process.exit(1);
  }
  console.log("\nOK: mini-app output bytes unchanged.");
  process.exit(0);
}

console.error("usage: record-build-digests.js --out <file> | --compare <file>");
process.exit(2);
