#!/usr/bin/env node
/**
 * Promotion configuration check (spec 076, FR-024/FR-027a/FR-026b).
 *
 * Runs on a `staging` -> `main` pull request and answers one question: did staging actually rehearse
 * what production is about to run?
 *
 * TWO CHECKS, both of which have to hold:
 *
 *  1. ENUMERATED DIFFERENCES ONLY (FR-027a). Every build arg that differs between cloudbuild.yaml
 *     (production) and cloudbuild.staging.yaml (the mainnet mirror) must be on the list in
 *     contracts/environments.md. An UNLISTED difference means staging exercised a different
 *     configuration, so its green result says nothing about production.
 *
 *  2. THE COHORT BOUNDARY IS UNTOUCHED (FR-026b). frontend/src/config/networks.js must not have
 *     been modified by the staging arrangement. Staging reaches both cohorts by being TWO SERVICES,
 *     not by loosening the build-time cohort rule — and the strongest available proof of "the
 *     production build is unaffected" is that the file deciding it did not change.
 *
 * Usage:
 *   node scripts/release/check-promotion-config.js [--base origin/main] [--head HEAD]
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const PROD = path.join(ROOT, "cloudbuild.yaml");
const STAGING = path.join(ROOT, "cloudbuild.staging.yaml");
const COHORT_FILE = "frontend/src/config/networks.js";

/**
 * Build args permitted to differ between production and the MAINNET staging service.
 * Mirrors contracts/environments.md § "Enumerated differences". Adding to this list is a reviewed
 * decision, which is exactly why the check points at the document.
 */
const ENUMERATED = new Set([
  "VITE_APP_URL", // 1. hostname
  "VITE_RELAYER_URL", // 5. staging's own relayer
  "VITE_BUNDLER_URLS_POLYGON", // 5. staging's own bundler
  "VITE_SPONSOR_PAYMASTER_POLYGON", // 5. staging's own paymaster
  "VITE_STAGING_BANNER", // 4. non-production marker
  "VITE_APP_VERSION", // 6. differs by construction
  "VITE_GIT_SHA", // 6. differs by construction
]);

/** Build args from a cloudbuild file, as name -> value. */
function buildArgs(file, { onlyBefore = null } = {}) {
  if (!fs.existsSync(file)) return null;
  let text = fs.readFileSync(file, "utf8");
  // The staging file builds two images; only the FIRST (mainnet) is the production mirror.
  if (onlyBefore && text.includes(onlyBefore)) {
    text = text.slice(0, text.indexOf(onlyBefore));
  }
  const out = {};
  for (const m of text.matchAll(/^\s*-\s*'([A-Z][A-Z0-9_]*)=(.*)'\s*$/gm)) {
    out[m[1]] = m[2];
  }
  return out;
}

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function checkEnumeratedDifferences() {
  const prod = buildArgs(PROD);
  const staging = buildArgs(STAGING, { onlyBefore: "id: build-testnet" });
  if (!prod || !staging) {
    return [`could not read ${!prod ? "cloudbuild.yaml" : "cloudbuild.staging.yaml"} — cannot verify the mirror`];
  }

  const problems = [];
  const names = new Set([...Object.keys(prod), ...Object.keys(staging)]);
  for (const name of names) {
    if (ENUMERATED.has(name)) continue;
    const a = prod[name];
    const b = staging[name];
    if (a === b) continue;
    if (a === undefined) {
      problems.push(`${name} is set on staging but not production ("${b}")`);
    } else if (b === undefined) {
      problems.push(`${name} is set on production but not staging ("${a}")`);
    } else {
      problems.push(`${name} differs: production "${a}" vs staging "${b}"`);
    }
  }
  return problems;
}

function checkCohortBoundary(base, head) {
  const changed = git(["diff", "--name-only", `${base}...${head}`]);
  if (changed === null) return [`could not diff ${base}...${head} — cannot verify the cohort boundary`];
  if (!changed.split("\n").includes(COHORT_FILE)) return [];
  return [
    `${COHORT_FILE} was modified. Staging reaches both cohorts by being TWO SERVICES, not by ` +
      `changing how a build resolves its cohort (spec 076 FR-026b). If this change is genuinely ` +
      `unrelated to the staging arrangement, it belongs in its own pull request where it can be ` +
      `reviewed as a change to the testnet/mainnet boundary — which is a constitution III concern.`,
  ];
}

module.exports = { ENUMERATED, buildArgs, checkEnumeratedDifferences, checkCohortBoundary };

// ---- CLI ---------------------------------------------------------------------------------------
if (require.main === module) {
  const argv = process.argv.slice(2);
  const flag = (n, d) => {
    const i = argv.indexOf(n);
    return i === -1 ? d : argv[i + 1];
  };
  const base = flag("--base", "origin/main");
  const head = flag("--head", "HEAD");

  const problems = [...checkEnumeratedDifferences(), ...checkCohortBoundary(base, head)];

  if (problems.length) {
    for (const p of problems) console.error(`::error::${p}`);
    console.error("");
    console.error("A promotion may only proceed when staging and production differ in the values");
    console.error("listed in specs/076-monorepo-semantic-versioning/contracts/environments.md.");
    console.error("An unlisted difference means staging did not rehearse what production will run.");
    process.exit(1);
  }
  console.log("promotion config OK: staging mirrors production within the enumerated differences");
}
