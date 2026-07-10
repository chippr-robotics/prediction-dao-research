"use strict";

/**
 * Unit tests for the coverage threshold gate (spec 046-contract-audit-coverage).
 *
 * Pure-JS test (no chain interaction) — runs under `npm test`, NOT under coverage
 * instrumentation (test/coverage/ is intentionally excluded from the coverage glob).
 * Guards against a false-green gate: a broken gate that always exits 0 would silently
 * let coverage regressions merge.
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const fp = require("../../scripts/coverage/lib/first-party");

const GATE = path.join(__dirname, "..", "..", "scripts", "coverage", "check-thresholds.js");

function tmp(name, obj) {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "covgate-")), name);
  fs.writeFileSync(p, JSON.stringify(obj));
  return p;
}

function runGate(summaryObj, policyObj, scope = "gated") {
  const summary = tmp("summary.json", summaryObj);
  const policy = tmp("policy.json", policyObj);
  try {
    const stdout = execFileSync(
      "node",
      [GATE, "--summary", summary, "--policy", policy, "--scope", scope],
      { encoding: "utf8" }
    );
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: (e.stdout || "").toString() };
  }
}

const POLICY = {
  tiers: { A: { minStatements: 95, minBranches: 90 }, B: { minStatements: 90, minBranches: 80 } },
  baseline: { statements: 50, branches: 40, functions: 50, lines: 50 },
  gated: [
    { path: "contracts/wagers/WagerRegistry.sol", tier: "A" },
    { path: "contracts/access/MembershipManager.sol", tier: "B" },
  ],
  reportOnly: [{ path: "contracts/tokens/templates/OpenERC20.sol", tier: "C", rationale: "template" }],
  excluded: [{ pathGlob: "contracts/account/lib/**", reason: "vendored" }],
};

function metric(pct) {
  return { total: 100, covered: pct, skipped: 0, pct };
}
function fileEntry(s, b, f, l) {
  return { statements: metric(s), branches: metric(b), functions: metric(f), lines: metric(l) };
}

describe("coverage gate: first-party lib", function () {
  it("normalizes absolute istanbul keys to contracts/ paths", function () {
    assert.strictEqual(
      fp.toContractsPath("/home/x/repo/contracts/wagers/WagerRegistry.sol"),
      "contracts/wagers/WagerRegistry.sol"
    );
    assert.strictEqual(fp.toContractsPath("total"), null);
  });

  it("excludes vendored/test/interface globs", function () {
    assert.ok(fp.isExcluded("contracts/account/lib/FreshCryptoLib/FCL_elliptic.sol", POLICY));
    assert.ok(!fp.isExcluded("contracts/account/ERC1271.sol", POLICY));
  });

  it("derives a first-party total excluding vendored files", function () {
    const summary = {
      total: {},
      "/r/contracts/access/MembershipManager.sol": fileEntry(80, 80, 80, 80),
      "/r/contracts/account/lib/FreshCryptoLib/FCL_elliptic.sol": fileEntry(0, 0, 0, 0),
    };
    const entries = fp.firstPartyEntries(summary, POLICY);
    assert.deepStrictEqual(Object.keys(entries), ["contracts/access/MembershipManager.sol"]);
    const total = fp.deriveTotal(entries);
    assert.strictEqual(total.statements.pct, 80); // vendored 0% did NOT drag it down
  });
});

describe("coverage gate: CLI exit codes", function () {
  this.timeout(20000); // each case cold-spawns `node` via execFileSync

  it("passes (exit 0) when all gated contracts meet their tier", function () {
    const summary = {
      total: {},
      "/r/contracts/wagers/WagerRegistry.sol": fileEntry(96, 91, 96, 96),
      "/r/contracts/access/MembershipManager.sol": fileEntry(92, 82, 92, 92),
    };
    const { code, stdout } = runGate(summary, POLICY);
    assert.strictEqual(code, 0, stdout);
    assert.match(stdout, /RESULT: PASS/);
  });

  it("fails (exit 1) and names the contract+metric when a gated contract is below tier", function () {
    const summary = {
      total: {},
      "/r/contracts/wagers/WagerRegistry.sol": fileEntry(60, 40, 60, 60),
      "/r/contracts/access/MembershipManager.sol": fileEntry(92, 82, 92, 92),
    };
    const { code, stdout } = runGate(summary, POLICY);
    assert.strictEqual(code, 1, stdout);
    assert.match(stdout, /RESULT: FAIL/);
    assert.match(stdout, /WagerRegistry\.sol/);
    assert.match(stdout, /stmts 60<95/);
  });

  it("fails (exit 1) when a gated contract is missing from the summary (untested)", function () {
    const summary = {
      total: {},
      "/r/contracts/access/MembershipManager.sol": fileEntry(92, 82, 92, 92),
    };
    const { code, stdout } = runGate(summary, POLICY);
    assert.strictEqual(code, 1, stdout);
    assert.match(stdout, /WagerRegistry\.sol/);
  });

  it("never fails on report-only contracts (exit 0 despite 0% template)", function () {
    const summary = {
      total: {},
      "/r/contracts/wagers/WagerRegistry.sol": fileEntry(96, 91, 96, 96),
      "/r/contracts/access/MembershipManager.sol": fileEntry(92, 82, 92, 92),
      "/r/contracts/tokens/templates/OpenERC20.sol": fileEntry(0, 0, 0, 0),
    };
    const { code, stdout } = runGate(summary, POLICY, "all");
    assert.strictEqual(code, 0, stdout);
    assert.match(stdout, /report-only/i);
  });

  it("errors (exit 2) on missing input files", function () {
    let code;
    try {
      execFileSync("node", [GATE, "--summary", "/nope.json", "--policy", "/nope.json"], { encoding: "utf8" });
      code = 0;
    } catch (e) {
      code = e.status;
    }
    assert.strictEqual(code, 2);
  });
});
