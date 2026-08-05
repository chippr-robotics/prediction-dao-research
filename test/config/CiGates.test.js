const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

/**
 * Spec 075 — standing guards for the gates this feature repaired.
 *
 * Every check here exists because the repo has ALREADY been in the failing state once:
 *   · FR-007/FR-008 — the e2e gate carried `continue-on-error: true` AND grepped for a token its
 *     reporter never emits, so it reported success on every run while tests failed.
 *   · FR-048 — `contracts/` is one compilation unit for three independent reasons; a change that
 *     quietly narrows it collapses WagerRegistry coverage to ~5% (documented in .solcover.js) or
 *     breaks the two-facet storage-layout diff.
 *
 * These are cheap structural assertions. They are not a substitute for the gates themselves —
 * they stop the gates from being silently removed.
 */
const ROOT = path.join(__dirname, "..", "..");
const WF_DIR = path.join(ROOT, ".github", "workflows");

const readWorkflow = (f) => yaml.load(fs.readFileSync(path.join(WF_DIR, f), "utf8"));
const workflowFiles = () => fs.readdirSync(WF_DIR).filter((f) => f.endsWith(".yml"));

/**
 * Only MERGE-GATING workflows are in scope. A workflow that runs solely on a schedule or manual
 * dispatch cannot hide anything from a merge decision, so `continue-on-error` there is a
 * legitimate choice for exploratory deep analysis (torture-test.yml runs Manticore and extended
 * Medusa this way, and both are documented as environment-flaky).
 *
 * If such a workflow ever gains a `pull_request` trigger it comes into scope automatically —
 * which is the behaviour we want, and why this is computed rather than hardcoded to a filename.
 * NOTE: PyYAML/js-yaml parse a bare `on:` key as boolean `true`, so read both spellings.
 */
function isMergeGating(wf) {
  const triggers = wf.on ?? wf[true] ?? {};
  if (typeof triggers !== "object") return false;
  return "pull_request" in triggers || "workflow_call" in triggers;
}

/** Strip `#` comments so a comment ABOUT a defect is not mistaken for the defect. */
const stripComments = (raw) =>
  raw.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

// Steps that may legitimately continue on error: genuinely auxiliary work whose failure must not
// block a merge. Anything NOT matching these is treated as a quality gate (constitution IV).
const AUXILIARY = /upload|summar|artifact|comment|report|codecov|badge|notify|screenshot|video|cache/i;

describe("CI gates cannot be silently disabled (spec 075)", function () {
  it("no quality gate carries continue-on-error", function () {
    const offenders = [];
    for (const file of workflowFiles()) {
      const wf = readWorkflow(file);
      if (!isMergeGating(wf)) continue;
      for (const [jobId, job] of Object.entries(wf.jobs || {})) {
        for (const step of job.steps || []) {
          if (step["continue-on-error"] !== true) continue;
          const name = step.name || step.uses || step.run || "(unnamed)";
          if (AUXILIARY.test(name)) continue;
          offenders.push(`${file} :: ${jobId} :: ${name}`);
        }
      }
    }
    expect(
      offenders,
      "continue-on-error is forbidden on lint/test/build/security steps (constitution IV).\n" +
        "If a step is genuinely auxiliary, name it so (upload/summarize/report/artifact/...).\n" +
        `Offenders:\n  ${offenders.join("\n  ")}`,
    ).to.deep.equal([]);
  });

  it("the e2e gate asserts on machine-readable results, not a text grep", function () {
    // `grep -q "failing"` against `--reporter json` output could never match: mocha's JSON
    // reporter emits "failures", never "failing". Any reintroduction is a dead gate.
    for (const file of workflowFiles()) {
      const raw = stripComments(fs.readFileSync(path.join(WF_DIR, file), "utf8"));
      expect(
        raw.includes('grep -q "failing"'),
        `${file} reintroduces \`grep -q "failing"\`, which cannot match JSON reporter output`,
      ).to.equal(false);
    }
  });

  it("the Slither severity gate is wired wherever Slither runs", function () {
    for (const file of workflowFiles()) {
      const raw = stripComments(fs.readFileSync(path.join(WF_DIR, file), "utf8"));
      if (!/slither \./.test(raw)) continue;
      expect(
        raw.includes("check-slither-findings.js"),
        `${file} runs Slither but never enforces a severity gate — findings would be reported and ignored`,
      ).to.equal(true);
    }
  });
});

describe("contracts/ remains a single compilation unit (spec 075, FR-048)", function () {
  it("keeps paths.sources pointed at the whole contracts tree", function () {
    const hre = require("hardhat");
    expect(
      path.resolve(hre.config.paths.sources),
      "Splitting paths.sources breaks the two-facet FACET_PAIRS storage diff and solidity-coverage's " +
        "source-map attribution. See specs/075-monorepo-workspaces/research.md R2.",
    ).to.equal(path.join(ROOT, "contracts"));
  });

  it("never excludes the test-only or vendored Solidity from coverage instrumentation", function () {
    const solcover = require(path.join(ROOT, ".solcover.js"));
    const skipped = (solcover.skipFiles || []).map(String);
    // .solcover.js documents in-file that skipping these corrupts source-map attribution and
    // collapses WagerRegistry coverage to ~5%.
    for (const required of ["test", "account/lib"]) {
      const bad = skipped.filter((s) => s === required || s.startsWith(`${required}/`));
      expect(
        bad,
        `.solcover.js skipFiles must not exclude contracts/${required} — doing so corrupts ` +
          "solidity-coverage's source-map attribution (documented in .solcover.js itself)",
      ).to.deep.equal([]);
    }
  });
});

/**
 * Spec 075 T090 / constitution "Archived code": `contracts-archive/` and `test-archive/` are
 * reference only and MUST NOT be imported by, or deployed from, active code.
 *
 * That rule was prose. This makes it mechanical — prose rules in this repo have a track record of
 * being believed rather than checked.
 */
describe("archived code is never referenced by active code (spec 075)", function () {
  const ARCHIVES = ["contracts-archive", "test-archive"];
  // Prose may legitimately discuss the archives; only executable trees are scanned.
  const SCAN = ["contracts", "test", "scripts", "frontend/src", "services", "subgraph/src", "packages"];
  const CODE = /\.(js|jsx|mjs|cjs|ts|tsx|sol)$/;

  it("has no import or require reaching into an archive directory", function () {
    const offenders = [];
    const walk = (dir) => {
      const abs = path.join(ROOT, dir);
      if (!fs.existsSync(abs)) return;
      for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
        const rel = path.join(dir, e.name);
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        if (e.isDirectory()) { walk(rel); continue; }
        if (!CODE.test(e.name)) continue;
        const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
        for (const line of src.split("\n")) {
          const t = line.trim();
          if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) continue;
          if (!/\b(import|require|from)\b/.test(t)) continue;
          for (const a of ARCHIVES) {
            if (t.includes(`${a}/`)) offenders.push(`${rel}: ${t.slice(0, 100)}`);
          }
        }
      }
    };
    SCAN.forEach(walk);
    expect(
      offenders,
      "Archived code is reference-only and must never be imported or deployed from " +
        `(constitution, "Archived code"):\n  ${offenders.join("\n  ")}`,
    ).to.deep.equal([]);
  });
});

/**
 * Spec 075: every top-level directory containing executable code must be matched by at least one
 * ci-manager path filter.
 *
 * Before this, `services/**`, `packages/**`, `tenants/**`, `tools/**`, `subgraph/**`,
 * `deployments/**` and most of `scripts/**` matched NO filter, so a PR touching only one of them
 * ran zero jobs. With required status checks now in force that is worse, not better: the jobs
 * report `skipped`, and a skipped check SATISFIES a required check — so such a PR merges with a
 * green tick and no tests run.
 *
 * The list was never the defect; the mechanism was. This fails when a new top-level code directory
 * appears with nothing matching it.
 */
describe("every code directory is covered by a ci-manager path filter (spec 075)", function () {
  const IGNORED = new Set([
    "node_modules", "artifacts", "cache", "coverage", "dist", "build",
    "docs", "specs", "blockscout", "contracts-archive", "test-archive", ".github", ".specify",
    ".claude", ".openzeppelin", ".git",
  ]);
  const CODE = /\.(js|jsx|mjs|cjs|ts|tsx|sol|sh|py)$/;

  const hasCode = (dir) => {
    const stack = [dir];
    while (stack.length) {
      const d = stack.pop();
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (CODE.test(e.name)) return true;
      }
    }
    return false;
  };

  it("matches every top-level directory that contains executable code", function () {
    const wf = yaml.load(fs.readFileSync(path.join(WF_DIR, "ci-manager.yml"), "utf8"));
    const step = wf.jobs["detect-changes"].steps.find((s) => (s.uses || "").includes("paths-filter"));
    expect(step, "ci-manager no longer uses dorny/paths-filter — this guard needs updating").to.exist;
    const filters = yaml.load(step.with.filters);
    const globs = Object.values(filters).flat().map(String);

    const uncovered = [];
    for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
      if (!e.isDirectory() || IGNORED.has(e.name) || e.name.startsWith(".")) continue;
      if (!hasCode(path.join(ROOT, e.name))) continue;
      // A directory is covered if some glob is rooted at it.
      if (!globs.some((g) => g.replace(/^!/, "").startsWith(`${e.name}/`))) uncovered.push(e.name);
    }

    expect(
      uncovered,
      "These top-level directories contain executable code but match no ci-manager filter, so a PR " +
        "touching only them runs no jobs — and with required checks in force, `skipped` counts as " +
        `success:\n  ${uncovered.join("\n  ")}`,
    ).to.deep.equal([]);
  });
});
