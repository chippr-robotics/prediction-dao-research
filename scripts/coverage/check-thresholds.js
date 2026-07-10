#!/usr/bin/env node
"use strict";

/**
 * Coverage threshold gate (spec 046-contract-audit-coverage).
 *
 * Reads an istanbul coverage-summary.json and the tiered policy, then enforces the
 * per-contract statement/branch minima for the gated security-critical set. Prints a
 * full per-contract table (always) and a derived FIRST-PARTY total, and exits:
 *   0 — all gated contracts meet their tier AND first-party total ≥ baseline
 *   1 — one or more gated contracts below tier, or baseline regression
 *   2 — bad input (missing/invalid summary or policy, unresolved gated path)
 *
 * Usage:
 *   node scripts/coverage/check-thresholds.js \
 *     --summary coverage/coverage-summary.json \
 *     --policy  coverage-threshold-policy.json \
 *     [--scope gated|all]
 *
 * scope=gated (default, per-PR): evaluate only `gated`.
 * scope=all   (weekly): also print `reportOnly` rows and the full first-party total.
 */

const fp = require("./lib/first-party");

function parseArgs(argv) {
  const args = { scope: "gated" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--summary") args.summary = argv[++i];
    else if (a === "--policy") args.policy = argv[++i];
    else if (a === "--scope") args.scope = argv[++i];
  }
  return args;
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function evaluateContract(summary, policy, entryDef) {
  const cpath = entryDef.path;
  const tierKey = entryDef.tier;
  const tier = policy.tiers[tierKey];
  if (!tier) return { path: cpath, tier: tierKey, status: "error", reason: `unknown tier ${tierKey}` };
  // `min` is an optional per-contract ENFORCED floor (ratchet): the gate fails below it,
  // while `tier` remains the documented audit target to raise toward as gaps close.
  // Absent `min` ⇒ enforce the full tier immediately.
  const minStatements = entryDef.min ? entryDef.min.statements : tier.minStatements;
  const minBranches = entryDef.min ? entryDef.min.branches : tier.minBranches;
  const required = `${minStatements}/${minBranches}${entryDef.min ? `→${tier.minStatements}/${tier.minBranches}` : ""}`;
  const entry = fp.lookup(summary, cpath);
  if (!entry) {
    // A gated contract absent from the summary = untested = violation (FR-012).
    return { path: cpath, tier: tierKey, stmts: null, branch: null, required, status: "fail", reason: "not in coverage summary (untested?)" };
  }
  const stmts = entry.statements ? entry.statements.pct : 0;
  const branch = entry.branches ? entry.branches.pct : 0;
  const ok = stmts >= minStatements && branch >= minBranches;
  const fails = [];
  if (stmts < minStatements) fails.push(`stmts ${stmts}<${minStatements}`);
  if (branch < minBranches) fails.push(`branch ${branch}<${minBranches}`);
  return { path: cpath, tier: tierKey, stmts, branch, required, status: ok ? "pass" : "fail", reason: fails.join(", ") };
}

function printTable(title, rows) {
  console.log(title);
  console.log(
    pad("path", 52) + pad("tier", 6) + pad("stmts", 8) + pad("branch", 8) + pad("required", 12) + "status"
  );
  for (const r of rows) {
    const stmts = r.stmts === null ? "-" : r.stmts;
    const branch = r.branch === null ? "-" : r.branch;
    const status = r.status === "fail" ? `FAIL (${r.reason})` : r.status;
    console.log(
      pad(r.path, 52) + pad(r.tier, 6) + pad(stmts, 8) + pad(branch, 8) + pad(r.required || "-", 12) + status
    );
  }
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.summary || !args.policy) {
    console.error("ERROR: --summary and --policy are required");
    process.exit(2);
  }
  let summary, policy;
  try {
    summary = fp.loadJson(args.summary);
  } catch (e) {
    console.error(`ERROR: cannot read summary ${args.summary}: ${e.message}`);
    process.exit(2);
  }
  try {
    policy = fp.loadJson(args.policy);
  } catch (e) {
    console.error(`ERROR: cannot read policy ${args.policy}: ${e.message}`);
    process.exit(2);
  }

  console.log(`COVERAGE GATE (scope=${args.scope})`);

  const gatedRows = (policy.gated || []).map((g) => evaluateContract(summary, policy, g));
  const errored = gatedRows.filter((r) => r.status === "error");
  if (errored.length) {
    for (const e of errored) console.error(`ERROR: ${e.path}: ${e.reason}`);
    process.exit(2);
  }
  printTable("\n-- Gated (security-critical) --", gatedRows);

  if (args.scope === "all") {
    const reportRows = (policy.reportOnly || []).map((g) => {
      const r = evaluateContract(summary, policy, g);
      r.status = "report-only";
      return r;
    });
    if (reportRows.length) printTable("\n-- Report-only (measured, not gated) --", reportRows);
  }

  // Derived first-party total + baseline (FR-016).
  const entries = fp.firstPartyEntries(summary, policy);
  const total = fp.deriveTotal(entries);
  const base = policy.baseline || {};
  const baselineOk =
    total.statements.pct >= (base.statements || 0) &&
    total.branches.pct >= (base.branches || 0) &&
    total.functions.pct >= (base.functions || 0) &&
    total.lines.pct >= (base.lines || 0);
  console.log(
    `\nFirst-party total: stmts ${total.statements.pct}% / branch ${total.branches.pct}% / ` +
      `funcs ${total.functions.pct}% / lines ${total.lines.pct}%  ` +
      `(baseline ${base.statements ?? "-"}/${base.branches ?? "-"}/${base.functions ?? "-"}/${base.lines ?? "-"}: ${baselineOk ? "OK" : "REGRESSION"})`
  );

  const violations = gatedRows.filter((r) => r.status === "fail");
  if (violations.length || !baselineOk) {
    console.log(`\nRESULT: FAIL — ${violations.length} gated contract(s) below threshold${baselineOk ? "" : " + baseline regression"}`);
    for (const v of violations) console.log(`  ✗ ${v.path} (${v.tier}): ${v.reason}`);
    process.exit(1);
  }
  console.log(`\nRESULT: PASS — ${gatedRows.length} gated contracts meet their tier; baseline holds`);
  process.exit(0);
}

main();
