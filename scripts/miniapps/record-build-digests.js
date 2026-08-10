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
const sinceIdx = args.indexOf("--since");
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
/**
 * `--since <epoch-ms>` is the CORRECT form and what CI uses: the caller stamps the time before it
 * starts the build, so "fresh" means "written by THIS run". Absolute age cannot express that. A
 * build that FAILED, followed by a compare inside the age window, hashed the previous successful
 * dist/ and printed OK — the very incident the comment above describes, still reachable for ten
 * minutes, which is exactly the iterate-and-rerun cadence.
 *
 * Age remains as a fallback for a human running the sweep by hand.
 */
function assertFresh({ maxAgeSeconds, sinceMs }) {
  const stale = [];
  // SOURCE_DATE_EPOCH means "reproducible build, timestamps are pinned" — freshness is then
  // unknowable and the check must be SKIPPED. It previously set the cutoff to 0, which marked
  // every file stale the instant it was written: the escape hatch was a permanent hard failure,
  // and a gate that always fails is a gate someone deletes.
  if (process.env.SOURCE_DATE_EPOCH) return;

  for (const app of APPS) {
    for (const f of FILES) {
      const p = path.join(ROOT, "frontend", "miniapps", app, "dist", f);
      const mtimeMs = fs.statSync(p).mtimeMs;
      if (sinceMs != null) {
        if (mtimeMs < sinceMs) {
          stale.push(`${app}/${f} (written ${Math.round((sinceMs - mtimeMs) / 1000)}s BEFORE this run)`);
        }
        continue;
      }
      const ageSec = (Date.now() - mtimeMs) / 1000;
      if (ageSec > maxAgeSeconds) stale.push(`${app}/${f} (${Math.round(ageSec)}s old)`);
    }
  }
  if (stale.length) {
    console.error(
      `\nFAIL: ${stale.length} built file(s) predate this verification run — the build did not just run.\n` +
        "Refusing to compare a stale dist/: that reports success for a build that never happened.\n" +
        stale.map((s) => `  · ${s}`).join("\n"),
    );
    process.exit(2);
  }
}

/**
 * Fail CLOSED on an unusable value. `Number(undefined)` and `Number("abc")` are both NaN, and
 * `age > NaN` is always false — so `--max-age-seconds` with a missing or non-numeric argument
 * silently disabled the freshness check entirely and a three-hour-old dist/ reported OK.
 */
function numericArg(flag, raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    console.error(`FAIL: ${flag} needs a non-negative number (got ${JSON.stringify(raw)}).`);
    process.exit(2);
  }
  return n;
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
  // dist cannot masquerade as today's. `--since` supersedes it and is what CI passes.
  assertFresh({
    sinceMs: sinceIdx !== -1 ? numericArg("--since", args[sinceIdx + 1]) : null,
    maxAgeSeconds: maxAgeIdx !== -1 ? numericArg("--max-age-seconds", args[maxAgeIdx + 1]) : 600,
  });
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
