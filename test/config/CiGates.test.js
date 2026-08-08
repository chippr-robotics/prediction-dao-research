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

/*
 * A step that INVOKES a build/test/lint tool is a gate no matter what it is called, and this
 * overrides AUXILIARY. Name-matching alone exempted three real gates by pure coincidence:
 *
 *   "Run tests with gas reporting"                   -> matched `report`  (the CONTRACT TEST SUITE)
 *   "Generate coverage report"                       -> matched `report`  (x4, three workflows)
 *   "Root gates via the task graph (cache disabled)" -> matched `cache`   (check:abis + tenants:validate)
 *
 * Verified by mutation before the fix: adding `continue-on-error: true` to the contract test
 * suite in security-testing.yml left this file 10 passing / 0 failing. A guard whose job is to
 * stop gates being disabled could not see the most important gate in the repo being disabled.
 *
 * The tool name is anchored to command position — at line start or after `;`, `&&`, `|`, `(` —
 * because an unanchored /slither|medusa/ matched those words inside echoed markdown prose in
 * security-testing.yml's genuinely-auxiliary "Generate summary" step.
 */
const GATE_COMMAND =
  /(?:^|[;&|(]\s*)\s*(?:npm\s+(?:run\s+)?(?:test|lint|build|compile)|npx\s+(?:turbo|hardhat|vitest|cypress|eslint|graph)|yarn\s+(?:test|lint|build)|forge\s+test|slither|medusa)\b/m;

/** True when the step is auxiliary BY NAME and does not actually invoke a gate tool. */
const isAuxiliary = (step) => {
  const name = step.name || "";
  if (!AUXILIARY.test(name)) return false;
  return !GATE_COMMAND.test(String(step.run || ""));
};

describe("CI gates cannot be silently disabled (spec 075)", function () {
  it("no merge-gating JOB carries continue-on-error", function () {
    // A job-level flag neutralises EVERY step in the job at once — a wider hole than the
    // per-step flag, and the original version of this test never looked at it. Verified by
    // mutation: job-level continue-on-error on smart-contract-tests left the suite fully green.
    const offenders = [];
    for (const file of workflowFiles()) {
      const wf = readWorkflow(file);
      if (!isMergeGating(wf)) continue;
      for (const [jobId, job] of Object.entries(wf.jobs || {})) {
        if (job["continue-on-error"] === true) offenders.push(`${file} :: ${jobId} (JOB-level)`);
      }
    }
    expect(
      offenders,
      "continue-on-error on a merge-gating JOB disables every check inside it:\n  " + offenders.join("\n  "),
    ).to.deep.equal([]);
  });

  /*
   * Steps allowed to discard their own exit code, keyed by `file::job::step`.
   *
   * An explicit allowlist, not a name regex: the previous version exempted anything whose NAME
   * matched /report|summar|.../, so renaming a gating step to "Run tests and report" disabled it.
   * Every entry needs a reason, and an entry whose step no longer exists fails the suite below —
   * so a stale exemption cannot quietly outlive the thing it excused.
   */
  const EXIT_CODE_EXEMPT = {
    "security-testing.yml::slither-analysis::Run Slither analysis":
      "Report GENERATION only. Slither exits non-zero on ANY finding including informational ones, " +
      "so failing here would redden CI on notes. The blocking decision is the next step, " +
      "`Enforce Slither severity gate`, which fails on High impact — asserted separately below.",
    "torture-test.yml::slither-analysis::Run Slither analysis":
      "Same report-generation step in the scheduled deep-analysis workflow.",
  };

  /*
   * continue-on-error exemptions. Same contract as EXIT_CODE_EXEMPT: a reason, and the staleness
   * check below deletes the excuse if the step disappears.
   *
   * These three re-run an ALREADY-GATED suite purely to produce a coverage artifact, so their
   * failure must not double-block a merge. Each reason names the sibling step that carries the
   * real pass/fail signal — if that sibling ever gains continue-on-error itself, the guard above
   * catches it, so this exemption cannot be used to launder a test suite into being advisory.
   */
  const CONTINUE_ON_ERROR_EXEMPT = {
    "frontend-testing.yml::unit-tests::Generate coverage report":
      "Coverage artifact only; re-runs the suite already gated by `Run unit tests` in the same job.",
    "test.yml::frontend-tests::Generate coverage report":
      "Coverage artifact only; re-runs the suite already gated by `Run tests` in the same job.",
    "security-testing.yml::coverage-report::Generate coverage report":
      "Coverage artifact only; the contract suite's pass/fail comes from `Run tests with gas " +
      "reporting` in the hardhat-tests job, which is gating.",
  };

  it("keeps every exit-code exemption justified and still present", function () {
    for (const [key, reason] of Object.entries({
      ...EXIT_CODE_EXEMPT,
      ...CONTINUE_ON_ERROR_EXEMPT,
    })) {
      const [file, jobId, stepName] = key.split("::");
      const wf = readWorkflow(file);
      const job = (wf.jobs || {})[jobId];
      expect(job, `${key}: job no longer exists — drop the exemption`).to.exist;
      const step = (job.steps || []).find((st) => (st.name || "") === stepName);
      expect(step, `${key}: step no longer exists — drop the exemption`).to.exist;
      expect(reason.length, `${key} needs a real reason`).to.be.greaterThan(40);
    }
  });

  it("no gating step swallows its own exit code with `|| true`", function () {
    // `|| true` is the literal mechanism that kept the Slither gate dead. The original test only
    // read step NAMES and never looked at what the step actually ran.
    const offenders = [];
    for (const file of workflowFiles()) {
      const wf = readWorkflow(file);
      if (!isMergeGating(wf)) continue;
      for (const [jobId, job] of Object.entries(wf.jobs || {})) {
        for (const step of job.steps || []) {
          const run = String(step.run || "");
          if (!run) continue;
          const name = step.name || step.uses || "(unnamed)";
          if (EXIT_CODE_EXEMPT[`${file}::${jobId}::${name}`]) continue;
          for (const line of run.split("\n")) {
            const t = line.trim();
            if (t.startsWith("#")) continue;
            if (!/(\|\|\s*true|;\s*true)\s*$/.test(t) && !/^exit 0$/.test(t)) continue;
            /*
             * Judged by BEHAVIOUR, not by step name. The previous version exempted any step whose
             * NAME matched /report|summar|.../, so renaming a gating step to "Run tests and report"
             * disabled the check entirely. A line that only appends to the job summary may swallow
             * its own error — losing a markdown row is not losing a gate. A line that runs a check
             * may not.
             */
            if (/\$GITHUB_STEP_SUMMARY/.test(t)) continue;
            offenders.push(`${file} :: ${jobId} :: ${name} -> ${t.slice(0, 70)}`);
          }
        }
      }
    }
    expect(
      offenders,
      "These gating steps discard their own failure:\n  " + offenders.join("\n  "),
    ).to.deep.equal([]);
  });

  it("every tee'd gating step sets pipefail", function () {
    /*
     * `cmd | tee log` under `bash -e` exits with TEE's status — always 0 — so the gate's failure is
     * discarded exactly as continue-on-error discarded it. This repo had the correct reasoning
     * written in a comment for the Cypress step and never applied it to the six siblings: the
     * CONTRACT TEST SUITE, frontend unit tests (in two workflows), lint and coverage were all
     * throwing away their exit codes. Demonstrated: `bash -e -c 'false | tee f'` exits 0.
     */
    const offenders = [];
    for (const file of workflowFiles()) {
      const wf = readWorkflow(file);
      if (!isMergeGating(wf)) continue;
      for (const [jobId, job] of Object.entries(wf.jobs || {})) {
        for (const step of job.steps || []) {
          const run = String(step.run || "");
          if (!run.includes("| tee")) continue;
          const name = step.name || "(unnamed)";
          if (isAuxiliary(step)) continue;
          if (step["continue-on-error"] === true) continue;
          if (!/pipefail/.test(run) && !/PIPESTATUS/.test(run) && step.shell !== "bash") {
            offenders.push(`${file} :: ${jobId} :: ${name}`);
          }
        }
      }
    }
    expect(
      offenders,
      "These gating steps pipe into tee without pipefail, so their exit code is discarded:\n  " +
        offenders.join("\n  "),
    ).to.deep.equal([]);
  });

  it("no quality gate step carries continue-on-error", function () {
    const offenders = [];
    for (const file of workflowFiles()) {
      const wf = readWorkflow(file);
      if (!isMergeGating(wf)) continue;
      for (const [jobId, job] of Object.entries(wf.jobs || {})) {
        for (const step of job.steps || []) {
          if (step["continue-on-error"] !== true) continue;
          const name = step.name || step.uses || step.run || "(unnamed)";
          if (isAuxiliary(step)) continue;
          if (CONTINUE_ON_ERROR_EXEMPT[`${file}::${jobId}::${name}`]) continue;
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

  it("the dispatcher runs on every pull request, whatever it targets", function () {
    /*
     * ci-manager dispatches test.yml and security-testing.yml — it IS the gate. Restricting it to
     * `branches: [main, develop]` meant a PR into any other base ran nothing but Release Drafter,
     * and stacked PRs (a feature branch collecting fixes before one merge to main) are the normal
     * shape of work here. #1018 merged that way: GitHub reported mergeStateStatus CLEAN, and not
     * one test had run. A base-branch filter is not a decision about whether code needs testing.
     */
    const wf = readWorkflow("ci-manager.yml");
    const triggers = wf.on ?? wf[true] ?? {};
    expect(triggers, "ci-manager must keep a pull_request trigger").to.have.property(
      "pull_request",
    );
    const pr = triggers.pull_request;
    // `pull_request:` with no body parses to null — that is the unrestricted form we want.
    const branches = pr && typeof pr === "object" ? pr.branches : undefined;
    expect(
      branches,
      "ci-manager.pull_request must NOT filter by base branch: a PR into a feature branch would " +
        `run zero jobs and merge on Release Drafter alone (found branches=${JSON.stringify(branches)})`,
    ).to.equal(undefined);
  });

  it("NO workflow filters its pull_request trigger by base branch", function () {
    /*
     * The test above pinned ci-manager alone, which closed one instance and left the class open:
     * frontend-testing.yml and subgraph-build.yml kept `branches: [main, develop]`, so a PR into a
     * feature branch was reviewed against strictly less than a PR into main. That is not
     * hypothetical — the AEAD tamper flake (#1032) failed on the 075 branch in the FULL frontend
     * suite, and the PR fixing it could not run the workflow that caught it, because that PR
     * targeted 075 rather than main.
     *
     * `paths:` is the right way to scope a workflow. The base branch is not: it encodes an
     * assumption that code merging somewhere other than main deserves less checking, and stacked
     * PRs are the normal shape of work in this repo.
     *
     * BOTH filter keys are checked. GitHub accepts `branches` and `branches-ignore` (mutually
     * exclusive per event), and `branches-ignore: ['075-*']` skips stacked PRs exactly as
     * `branches: [main]` does. Checking only the first would leave this test's NAME — no base
     * branch filtering — broader than what it asserts, which is the same over-claiming shape the
     * rest of this file exists to catch. Reported by review on #1033.
     */
    const BASE_FILTER_KEYS = ["branches", "branches-ignore"];
    const offenders = [];
    for (const file of workflowFiles()) {
      const wf = readWorkflow(file);
      const triggers = wf.on ?? wf[true] ?? {};
      if (!triggers || typeof triggers !== "object") continue;
      const pr = triggers.pull_request;
      if (pr == null || typeof pr !== "object") continue; // absent, or the unrestricted `pull_request:` form
      for (const key of BASE_FILTER_KEYS) {
        if (pr[key]) offenders.push(`${file} (${key}=${JSON.stringify(pr[key])})`);
      }
    }
    expect(
      offenders,
      "These workflows skip PRs that target a feature branch, so stacked work is gated more " +
        "weakly than a direct PR to main. Scope with `paths:`, not `branches:`/`branches-ignore:`:" +
        `\n  ${offenders.join("\n  ")}`,
    ).to.deep.equal([]);
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
