#!/usr/bin/env node
/**
 * E2E deploy-order gate (issue #1298).
 *
 * WHY THIS EXISTS
 * The local E2E chain is set up by a fixed, ORDERED list of plain-CREATE deploys. Every address
 * they produce is a function of the deployer's nonce, so inserting or reordering a deploy shifts
 * every address below the insertion point by one slot. The frontend does NOT read those addresses
 * back — it uses the hardcoded `HARDHAT_CONTRACTS` map in frontend/src/config/contracts.js — so a
 * shifted address repoints the app at an address nothing was deployed to.
 *
 * Nothing about that failure names its cause. Every contract call still "succeeds" (a read against
 * an address with no code returns empty), nothing reverts, and the UI simply never renders. It
 * surfaces 10-15 minutes later as unrelated-looking Cypress timeouts in three different
 * subsystems, on whichever shard happened to pack those specs — which reads like flake and invites
 * a re-run. It is not flake. #1289 inserted one deploy mid-list and burned two full CI cycles.
 *
 * The deploy list already carried a comment saying "append new ones at the END". That comment did
 * not prevent the mistake, because a comment is a convention and conventions decay. This is the
 * gate: it runs in seconds immediately after the deploys, compares what the app is hardcoded to
 * use against what was ACTUALLY deployed, and fails naming each mismatched key, expected vs
 * actual, and the rule that was broken.
 *
 * WHAT IT COMPARES
 *   what actually deployed  →  deployments/<network>-chain<chainId>-v2.json (written by the deploy)
 *   what the app will use   →  frontend/src/config/contracts.js, the block NETWORK_CONTRACTS maps
 *                              this chain id to (1337 → HARDHAT_CONTRACTS)
 *
 * The target block is read out of `NETWORK_CONTRACTS` rather than from a table kept here, so this
 * gate cannot drift from the map the app itself resolves.
 *
 * A key the deployment record does not carry is reported as UNVERIFIABLE, never as a pass — the
 * custody contracts (safePolicyGuard, safePolicyGuardV2, policyGuardSetup, safeProposalHub) come
 * from scripts/deploy/custody/, so a record written by the core deploy alone says nothing about
 * them. "Absent from this record" and "matches" are different facts and are printed differently.
 *
 * Usage:
 *   node scripts/e2e/check-local-addresses.js [--network localhost] [--chainId 1337]
 *                                             [--deployment <path>] [--contractsFile <path>]
 *                                             [--json]
 *
 * Exit code 0 = every hardcoded address matches what deployed. 1 = at least one mismatch, or the
 * comparison could not be made at all (missing record, unresolvable block). Warnings alone never
 * fail the run.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Top-level fields of a deployment record that are addresses the frontend also hardcodes. These
 * sit beside `contracts`, not inside it (see the record built at the end of scripts/deploy/deploy.js).
 */
const TOP_LEVEL_ADDRESS_FIELDS = ["deployer", "treasury", "paymentToken", "wmatic", "polymarketCTF"];

// ── parsing ────────────────────────────────────────────────────────────────────────────────────

/**
 * Body of `<const|let|var> <name> = { ... }`, brace-matched. Returns null when there is no such
 * declaration. Same technique as scripts/utils/sync-frontend-contracts.js: contracts.js reaches
 * `virtual:tenant` transitively and cannot be require()d from Node.
 */
function objectLiteralBody(source, name) {
  const start = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*\\{`).exec(source);
  if (!start) return null;

  const bodyStart = start.index + start[0].length;
  let depth = 1;
  for (let i = bodyStart; i < source.length; i++) {
    const c = source[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return source.slice(bodyStart, i);
    }
  }
  return null;
}

/**
 * `{ key: 'value' }` pairs of a named block, in file order. Only single-quoted string literals are
 * collected — every address in contracts.js is written that way, and anything else (a spread, a
 * computed value) is not an address this gate can compare.
 */
function parseContractsBlock(source, blockName) {
  const body = objectLiteralBody(source, blockName);
  if (body === null) return null;

  const entries = {};
  const lineRe = /^\s*([A-Za-z_$][\w$]*)\s*:\s*'([^']*)'\s*,?/;
  for (const line of body.split("\n")) {
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;
    const m = lineRe.exec(line);
    if (m) entries[m[1]] = m[2];
  }
  return entries;
}

/**
 * chainId → block name, read from the app's own `NETWORK_CONTRACTS` map. Deliberately not a table
 * in this file: a second copy of that mapping could disagree with the one the app resolves, and
 * this gate would then check a block the app never reads.
 */
function resolveBlockName(source, chainId) {
  const body = objectLiteralBody(source, "NETWORK_CONTRACTS");
  if (body === null) return null;

  const lineRe = /^\s*(\d+)\s*:\s*([A-Za-z_$][\w$]*)\s*,?/;
  for (const line of body.split("\n")) {
    const m = lineRe.exec(line);
    if (m && Number(m[1]) === Number(chainId)) return m[2];
  }
  return null;
}

/**
 * Flatten a deployment record into one `key → address` map keyed the way contracts.js keys are.
 * `contracts` is applied last so it wins over a same-named top-level field.
 */
function flattenDeployment(record) {
  const flat = {};

  for (const field of TOP_LEVEL_ADDRESS_FIELDS) {
    if (typeof record[field] === "string" && record[field]) flat[field] = record[field];
  }
  for (const [key, value] of Object.entries(record.mocks || {})) {
    if (typeof value === "string" && value) flat[key] = value;
  }
  for (const [key, value] of Object.entries(record.contracts || {})) {
    if (typeof value === "string" && value) flat[key] = value;
  }

  return flat;
}

// ── comparison ─────────────────────────────────────────────────────────────────────────────────

/**
 * Compare every hardcoded address against what deployed.
 *
 * Returns { mismatches, unverifiable, matched }:
 *   mismatches  — the app points somewhere the deploy did not put that contract. FATAL.
 *   unverifiable — hardcoded, but this record does not carry the key, so nothing is known about
 *                  it either way. Reported, never counted as a pass and never counted as a fail.
 *   matched      — count of keys positively verified equal.
 *
 * Addresses are compared case-insensitively: a record and a hardcoded constant can hold the same
 * address in different checksum casings, and that is not a mismatch.
 */
function compareAddresses(hardcoded, deployed) {
  const mismatches = [];
  const unverifiable = [];
  let matched = 0;

  for (const [key, configured] of Object.entries(hardcoded)) {
    // An empty string is the app's "not deployed on this chain" state, not an address.
    if (!configured || !ADDRESS_RE.test(configured)) continue;

    const actual = deployed[key];
    if (!actual) {
      unverifiable.push({ key, configured });
      continue;
    }
    if (actual.toLowerCase() !== configured.toLowerCase()) {
      mismatches.push({ key, configured, actual });
      continue;
    }
    matched++;
  }

  return { mismatches, unverifiable, matched };
}

// ── reporting ──────────────────────────────────────────────────────────────────────────────────

const ORDER_RULE = [
  "THE ORDER OF THE TARGETED E2E DEPLOYS IS LOAD-BEARING. Each uses plain CREATE, so every",
  "address below an insertion point is a function of the deployer's nonce: inserting or",
  "reordering a deploy shifts every later address by one slot and silently repoints the app at",
  "an address nothing was deployed to. APPEND new deploys at the END of the list, then re-derive",
  "the constants above and update them.",
].join("\n  ");

function formatReport({ mismatches, unverifiable, matched }, { blockName, contractsFile, deploymentFile }) {
  const lines = [];
  const rel = (p) => path.relative(ROOT, p) || p;

  for (const { key, configured } of unverifiable) {
    lines.push(
      `  warn  ${key}: hardcoded ${configured}; ${rel(deploymentFile)} carries no such key, so this ` +
        `address is UNVERIFIED — not a pass.`
    );
  }

  if (mismatches.length === 0) {
    lines.push(
      `E2E address gate: PASS (${matched} address${matched === 1 ? "" : "es"} verified, ` +
        `${unverifiable.length} not in this record)`
    );
    return lines.join("\n");
  }

  lines.push("");
  lines.push(
    `E2E address gate: ${mismatches.length} address${mismatches.length === 1 ? "" : "es"} the app ` +
      `uses ${mismatches.length === 1 ? "was" : "were"} NOT deployed there.`
  );
  lines.push("");
  lines.push(`  expected = ${rel(contractsFile)} → ${blockName} (what the app will use)`);
  lines.push(`  actual   = ${rel(deploymentFile)} (what was actually deployed just now)`);
  lines.push("");
  for (const { key, configured, actual } of mismatches) {
    lines.push(`  ${key}`);
    lines.push(`        expected  ${configured}`);
    lines.push(`        actual    ${actual}`);
  }
  lines.push("");
  lines.push(`  ${ORDER_RULE}`);
  lines.push("");
  lines.push("  Do not start the E2E suite against this chain. The app would call addresses with no");
  lines.push("  code: nothing reverts, the UI simply never renders, and it surfaces much later as");
  lines.push("  unrelated-looking Cypress timeouts in whichever specs happen to touch those contracts.");
  lines.push("");

  return lines.join("\n");
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { network: "localhost", chainId: 1337, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--network") out.network = argv[++i];
    else if (a === "--chainId") out.chainId = Number(argv[++i]);
    else if (a === "--deployment") out.deployment = argv[++i];
    else if (a === "--contractsFile") out.contractsFile = argv[++i];
    else if (a === "--json") out.json = true;
  }
  return out;
}

function main(argv) {
  const args = parseArgs(argv);

  const deploymentFile = args.deployment
    ? path.resolve(ROOT, args.deployment)
    : path.join(ROOT, "deployments", `${args.network}-chain${args.chainId}-v2.json`);
  const contractsFile = args.contractsFile
    ? path.resolve(ROOT, args.contractsFile)
    : path.join(ROOT, "frontend", "src", "config", "contracts.js");

  // A missing record is fatal, not a skip. It means the deploys did not run, ran against another
  // network, or failed — and in every one of those cases the suite would run against a chain
  // nobody has checked.
  if (!fs.existsSync(deploymentFile)) {
    console.error(
      `\nE2E address gate: no deployment record at ${path.relative(ROOT, deploymentFile)}.\n\n` +
        `  Run the E2E deploys first (npm run setup:e2e), or point at the record with\n` +
        `  --deployment <path>. Refusing to report a pass: with no record there is nothing to\n` +
        `  compare the hardcoded addresses against.\n`
    );
    return 1;
  }

  const record = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const source = fs.readFileSync(contractsFile, "utf8");

  const chainId = Number(record.chainId) || args.chainId;
  const blockName = resolveBlockName(source, chainId);
  if (!blockName) {
    console.error(
      `\nE2E address gate: NETWORK_CONTRACTS in ${path.relative(ROOT, contractsFile)} maps no block ` +
        `to chain ${chainId}.\n\n` +
        `  The app therefore has no address map for the chain these contracts were deployed to.\n` +
        `  Add the chain to NETWORK_CONTRACTS (and its block) before running the E2E suite.\n`
    );
    return 1;
  }

  const hardcoded = parseContractsBlock(source, blockName);
  if (!hardcoded) {
    console.error(
      `\nE2E address gate: ${path.relative(ROOT, contractsFile)} has no "${blockName}" block, though ` +
        `NETWORK_CONTRACTS maps chain ${chainId} to it.\n`
    );
    return 1;
  }

  const result = compareAddresses(hardcoded, flattenDeployment(record));

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ chainId, blockName, ...result }, null, 2)}\n`);
  } else {
    const report = formatReport(result, { blockName, contractsFile, deploymentFile });
    if (result.mismatches.length === 0) console.log(report);
    else console.error(report);
  }

  return result.mismatches.length === 0 ? 0 : 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  compareAddresses,
  flattenDeployment,
  formatReport,
  objectLiteralBody,
  parseContractsBlock,
  resolveBlockName,
  main,
};
