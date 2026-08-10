#!/usr/bin/env node
/**
 * Slither severity gate (spec 075, FR-007/FR-008; constitution IV).
 *
 * Until spec 075 the Slither step ended in `|| true` and its report was only ever uploaded as an
 * artifact — so the constitution's "security scans MUST fail the pipeline on critical
 * vulnerabilities" was entirely unenforced. Slither could report anything and the job stayed green.
 *
 * A bare removal of `|| true` would have been wrong in the other direction: slither exits non-zero
 * on ANY finding, including informational ones, so it would have failed the pipeline on notes and
 * been reverted within a day — leaving the repo back where it started, but with the appearance of
 * having been fixed.
 *
 * So the gate is on IMPACT: High fails, everything else is reported and does not. That matches what
 * the constitution actually requires, and it is adoptable immediately (measured at adoption:
 * 0 High, 1 Medium, 2 Informational).
 *
 * Usage: node scripts/security/check-slither-findings.js [path-to-slither-report.json]
 */
const fs = require("fs");
const path = require("path");

const FAIL_ON = new Set(["High"]);
const reportPath = process.argv[2] || "slither-report.json";
const BASELINE_PATH = path.join(__dirname, "slither-high-baseline.json");

/*
 * BASELINE — pre-existing High findings, snapshotted when this gate was first enabled.
 *
 * Slither previously ran with `|| true` and no gate at all, so 16 High-impact findings had
 * accumulated untriaged. Failing on all of them here would have meant either blocking a
 * build-system PR on 16 security triages, or turning the gate off again — and turning it off is
 * how it stayed useless for so long.
 *
 * So: NEW High findings fail; baselined ones are reported loudly on every run and do not.
 * That is deliberately weaker than constitution I, which requires accepted findings to carry a
 * written rationale. None of these has one yet. The baseline is a record that they are KNOWN AND
 * UNREVIEWED, not that they are accepted, and it must only ever shrink.
 */
function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return [];
  return (JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")).findings || []);
}
const identity = (d) => {
  const sm = (d.elements && d.elements[0] && d.elements[0].source_mapping) || {};
  const file = sm.filename_relative || "unknown";
  const line = sm.lines && sm.lines.length ? sm.lines[0] : 0;
  return `${d.check}@${file}:${line}`;
};

if (!fs.existsSync(reportPath)) {
  // A missing report means the scan did not run. That is a failure, not a pass — the whole point
  // of this gate is that silence must not read as success.
  console.error(`::error::${reportPath} not found — Slither did not produce a report. Failing rather than assuming success.`);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
} catch (e) {
  console.error(`::error::${reportPath} is not valid JSON (${e.message}). Failing rather than assuming success.`);
  process.exit(1);
}

if (report.success === false && report.error) {
  console.error(`::error::Slither reported an analysis error: ${report.error}`);
  process.exit(1);
}

const detectors = (report.results && report.results.detectors) || [];
const byImpact = detectors.reduce((acc, d) => {
  acc[d.impact] = (acc[d.impact] || 0) + 1;
  return acc;
}, {});

console.log(`Slither findings: ${detectors.length} total`);
for (const impact of ["High", "Medium", "Low", "Informational", "Optimization"]) {
  if (byImpact[impact]) console.log(`  ${impact}: ${byImpact[impact]}`);
}

const baseline = new Set(loadBaseline().map((f) => `${f.check}@${f.file}:${f.line}`));
const highs = detectors.filter((d) => FAIL_ON.has(d.impact));
const known = highs.filter((d) => baseline.has(identity(d)));
const blocking = highs.filter((d) => !baseline.has(identity(d)));

if (known.length > 0) {
  // Printed every run, never folded into the pass line: a known finding that stops being mentioned
  // becomes an unknown one.
  console.log(
    `\n::warning::${known.length} High-impact finding(s) are BASELINED — known, and NOT yet triaged ` +
      "(scripts/security/slither-high-baseline.json). Each needs a fix or a written rationale " +
      "(constitution I); this list must only ever shrink:",
  );
  for (const d of known) console.log(`  · ${identity(d)}`);
}

if (blocking.length > 0) {
  console.error(`\n::error::${blocking.length} NEW HIGH-impact Slither finding(s) block this pipeline:`);
  for (const d of blocking) {
    const where = (d.elements && d.elements[0] && d.elements[0].source_mapping) || {};
    const loc = where.filename_relative ? `${where.filename_relative}:${where.lines ? where.lines[0] : "?"}` : "unknown location";
    console.error(`  · [${d.check}] ${loc}`);
    console.error(`    ${String(d.description || "").trim().split("\n")[0]}`);
  }
  console.error(
    "\nFix the finding, or — if it is genuinely accepted — document the rationale and exclude the\n" +
      "detector in slither.config.json so the acceptance is explicit and reviewable (constitution I).",
  );
  process.exit(1);
}

console.log(
  known.length
    ? `\nOK: no NEW High-impact findings (${known.length} baselined, see above).`
    : "\nOK: no High-impact findings.",
);
