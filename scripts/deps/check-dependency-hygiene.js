#!/usr/bin/env node
/**
 * Standing dependency-hygiene gate (spec 075, FR-003 / FR-015 / SC-003).
 *
 * WHY THIS EXISTS
 * Spec 075's whole argument is that invariants held by human discipline drift, so a machine must
 * check them. Two of its own invariants were left as conventions:
 *
 *   FR-015  version disagreements across manifests must resolve to ONE installed version
 *   FR-003  every package required at runtime or by a merge gate must be DECLARED
 *
 * Both were fixed once, by hand (`ethers` alignment; `@openzeppelin/upgrades-core` and
 * `@solana-program/system` declared). Nothing stopped the next one. This is that check.
 *
 * It is deliberately conservative: it reports only what it can prove from the manifests and the
 * source tree, and it fails loudly rather than warning, because a warning in CI is a comment.
 *
 * Usage: node scripts/deps/check-dependency-hygiene.js [--json]
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const declared = (m) => ({ ...(m.dependencies || {}), ...(m.devDependencies || {}), ...(m.peerDependencies || {}) });

/** Manifests in the repo, and which source trees each one owns. */
/*
 * `rootFallback` — may a ROOT declaration satisfy this unit's import?
 *
 * Only for code that actually runs inside the root project's module resolution: scripts/ and test/
 * are executed by the root (often through the hardhat runtime), so the root manifest is their
 * manifest.
 *
 * It is FALSE for every other unit, and that distinction is load-bearing. A bundled workspace
 * resolves through its own manifest — Vite will not use a root declaration — and a service is
 * installed scoped (`npm ci --workspace x --include-workspace-root=false`), so a root declaration
 * is simply absent at build time.
 *
 * This was originally true everywhere, and it produced a FALSE NEGATIVE: frontend/src imported
 * `@fairwins/intent-types` while only the ROOT declared it. check:deps passed, and the frontend
 * build then failed in CI with "Rollup failed to resolve import". A gate that reports clean while
 * the build breaks is exactly the failure mode spec 075 exists to remove.
 */
/*
 * ── THE UNIT LIST IS DERIVED, NOT TYPED (issue #1039) ────────────────────────────────────────
 *
 * It used to be a hand-written array of six manifests, and it had silently fallen three members
 * behind the workspace: `frontend/miniapps/token-mint`, `frontend/miniapps/clearpath`,
 * `packages/abi` and `packages/intent-types` were never scanned at all. Proven by injection — a
 * phantom `chalk` in packages/intent-types/src, `axios` in frontend/miniapps/token-mint/src and
 * `fast-glob` in frontend/vite-plugins/ all reported CLEAN.
 *
 * A hardcoded list is the same class of defect the gate exists to catch: an invariant held by
 * human discipline. Adding a workspace member is routine; remembering to add it here is not. So
 * the members come from the root manifest's `workspaces` globs — the same source npm itself uses,
 * which means the gate cannot fall behind the workspace by construction.
 *
 * Coverage inside a unit was also partial: only `<unit>/src` was scanned, so
 * `frontend/vite-plugins/`, `frontend/vite.config.js`, `frontend/cypress.config.js` and
 * `frontend/cypress/` (32 files, several of them merge-gating) were invisible. A unit now owns
 * EVERYTHING under its directory except build output and nested workspace members — a build plugin
 * with an undeclared import breaks the build just as thoroughly as a src/ file does.
 */

/** Directory names that are build output or vendored code — never a unit's own source. */
const IGNORED_DIRS = new Set(["node_modules", "dist", "dist-archive", "build", "coverage", "generated"]);

/** Expand one `workspaces` glob. npm's patterns here are literal paths or a single trailing `/*`. */
function expandWorkspaceGlob(glob) {
  if (!glob.includes("*")) return [glob];
  const base = glob.slice(0, glob.indexOf("/*"));
  const abs = path.join(ROOT, base);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => `${base}/${e.name}`)
    .sort();
}

const workspaceGlobs = readJson("package.json").workspaces || [];

/*
 * A glob that expands to nothing is a coverage hole wearing a green light: rename a directory and
 * every unit under it stops being checked while this script still prints OK. Fail instead.
 */
const emptyGlobs = workspaceGlobs.filter(
  (g) => expandWorkspaceGlob(g).filter((d) => fs.existsSync(path.join(ROOT, d, "package.json"))).length === 0,
);

const workspaceMembers = workspaceGlobs
  .flatMap(expandWorkspaceGlob)
  .filter((dir) => fs.existsSync(path.join(ROOT, dir, "package.json")))
  .sort();

const UNITS = [
  // The root owns the code that runs in the root project: scripts/, test/ and the hardhat config.
  { manifest: "package.json", label: "root", sources: ["scripts", "test", "hardhat.config.js"], rootFallback: true },
  ...workspaceMembers.map((dir) => ({
    manifest: `${dir}/package.json`,
    label: dir,
    sources: [dir],
    rootFallback: false,
    // A nested member owns its own subtree — frontend must not be blamed for frontend/miniapps/*.
    skip: new Set(workspaceMembers.filter((other) => other !== dir && other.startsWith(`${dir}/`))),
  })),
];

/**
 * Specifiers that are legitimately undeclared by the owning manifest.
 * Each entry MUST carry a reason — an unexplained allowlist entry is how a gate rots.
 */
const ALLOW = {
  "hardhat": "injected by the hardhat runtime into scripts/ and test/; declared at the root",
  "@nomicfoundation/hardhat-ethers": "hardhat plugin, resolved through the hardhat runtime",
  "virtual:tenant": "Vite virtual module supplied by frontend/vite-plugins/tenant-branding.js",
  "@fairwins/miniapp-sdk": "host-provided shared scope, externalized by the mini-app build preset",
  "k6": "k6 runtime built-in (k6/http, k6/data, k6/metrics) in services/relay-gateway/load/ — supplied by the k6 binary, never an npm package",
};

/** Bare specifier -> package name (`@scope/pkg/sub` -> `@scope/pkg`). */
function pkgOf(spec) {
  if (spec.startsWith("@")) return spec.split("/").slice(0, 2).join("/");
  return spec.split("/")[0];
}

const SOURCE_EXT = /\.(js|jsx|mjs|cjs|ts|tsx)$/;

/**
 * Every source file a unit owns.
 *
 * `skip` holds nested workspace members, which own themselves. Build output (`dist/`, `build/`,
 * `coverage/`, `generated/`) is excluded because it is derived: a bundle inlines its dependencies,
 * so scanning it reports imports that no manifest should ever have declared.
 */
function walk(dir, skip = new Set(), out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  if (fs.statSync(abs).isFile()) {
    if (SOURCE_EXT.test(dir)) out.push(dir);
    return out;
  }
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (IGNORED_DIRS.has(e.name) || e.name.startsWith(".")) continue;
    if (skip.has(rel)) continue;
    if (e.isDirectory()) walk(rel, skip, out);
    else if (SOURCE_EXT.test(e.name)) out.push(rel);
  }
  return out;
}

// The leading class excludes quotes and backticks so a QUOTED occurrence of the keyword is not
// read as an import. Without that, `'implements', 'import', 'in',` — a reserved-word array in
// tools/miniapp-build/hostScopePlugin.js — parsed as an import of the package `, `.
const IMPORT_RE = /(?:^|[^\w.'"`])(?:import\s+[^'"]*?from\s*|import\s*|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;

/**
 * Scan only lines that could carry a REAL import.
 *
 * A raw-text scan produces confident nonsense: the first run of this gate reported six phantom
 * dependencies, and all six were example code inside doc comments or JSX template literals
 * (`@/components` from a <pre> block, `@vitejs/plugin-react` from a usage comment, and so on).
 * A dependency gate that cries wolf gets an allowlist entry per false positive and stops meaning
 * anything, so drop comment lines before matching. Static imports are statements and always begin
 * a line; nothing real is lost.
 */
function codeLines(src) {
  const out = [];
  let inBlockComment = false;
  for (const line of src.split("\n")) {
    const t = line.trim();
    if (inBlockComment) {
      if (t.includes("*/")) inBlockComment = false;
      continue;
    }
    if (t.startsWith("/*")) {
      if (!t.includes("*/")) inBlockComment = true;
      continue;
    }
    if (t.startsWith("//") || t.startsWith("*")) continue;
    out.push(line);
  }
  return stripTemplateLiterals(out.join("\n"));
}

/**
 * Remove backtick template literals.
 *
 * Two remaining false positives came from here and neither was an import: a JSX <pre> block
 * documenting usage (`@/components/ui`), and a code GENERATOR whose `names.join(", ")` supplied
 * the quote pair the import regex was looking for — so the "package name" was literally `, `.
 * Template literals hold generated or illustrative code, never a static import of this module's
 * own dependencies.
 */
function stripTemplateLiterals(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") { out += "  "; i += 2; continue; }   // skip escaped char, keep offsets sane
    if (ch === "`") {
      i += 1;
      let depth = 0;
      while (i < src.length) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "$" && src[i + 1] === "{") { depth += 1; i += 2; continue; }
        if (src[i] === "}" && depth > 0) { depth -= 1; i += 1; continue; }
        if (src[i] === "`" && depth === 0) { i += 1; break; }
        i += 1;
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

const problems = { versionSkew: [], phantom: [] };
/** unit label -> files actually scanned. Reported, so a unit going dark is visible, not silent. */
const scanned = new Map();

// ── FR-015: one installed version per package name ───────────────────────────────────────────
const ranges = {}; // pkg -> { range -> [units] }
for (const u of UNITS) {
  if (!fs.existsSync(path.join(ROOT, u.manifest))) continue;
  for (const [name, range] of Object.entries(declared(readJson(u.manifest)))) {
    ((ranges[name] ??= {})[range] ??= []).push(u.label);
  }
}
for (const [name, byRange] of Object.entries(ranges)) {
  const rs = Object.keys(byRange);
  if (rs.length > 1) {
    problems.versionSkew.push({
      pkg: name,
      ranges: rs.map((r) => `${r} (${byRange[r].join(", ")})`),
    });
  }
}

// ── FR-003: every imported bare specifier is declared by its owning unit ─────────────────────
// `module.builtinModules` deliberately OMITS the modules that are only importable with the `node:`
// prefix, so deriving the set from it alone under-reports and those modules get flagged as phantom
// dependencies. `node:test` is the one this repo uses (scripts/release/__tests__, spec 076); the
// others are listed so the next one to be adopted does not trip the same false positive.
const PREFIX_ONLY_BUILTINS = ["node:test", "node:test/reporters", "node:sea", "node:sqlite"];
const nodeBuiltins = new Set([
  ...require("module").builtinModules.flatMap((m) => [m, `node:${m}`]),
  ...PREFIX_ONLY_BUILTINS,
]);
for (const u of UNITS) {
  if (!fs.existsSync(path.join(ROOT, u.manifest))) continue;
  const own = declared(readJson(u.manifest));
  // The root manifest is a legitimate fallback for scripts/ and test/, which run in the root project.
  const rootDeclared = u.rootFallback ? declared(readJson("package.json")) : {};
  const files = u.sources.flatMap((s) => walk(s, u.skip || new Set()));
  scanned.set(u.label, files.length);
  const seen = new Map();
  for (const f of files) {
    const src = codeLines(fs.readFileSync(path.join(ROOT, f), "utf8"));
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[1];
      if (spec.startsWith(".") || spec.startsWith("/")) continue;
      if (nodeBuiltins.has(spec) || nodeBuiltins.has(spec.split("/")[0])) continue;
      const pkg = pkgOf(spec);
      if (ALLOW[pkg] || ALLOW[spec]) continue;
      if (own[pkg] || rootDeclared[pkg]) continue;
      if (!seen.has(pkg)) seen.set(pkg, f);
    }
  }
  for (const [pkg, where] of seen) problems.phantom.push({ unit: u.label, pkg, first: where });
}

// ── optional platform binaries must survive in the lockfile ─────────────────────────────────
//
// npm/cli#4828: an INCREMENTAL `npm install` can silently drop optionalDependencies from the
// lockfile. This bit twice during the spec-075 workspace conversion — rollup's native binary
// vanished and every Vite build died, including the mini-app release path whose output bytes are
// keccak-committed on-chain. CI runs ubuntu-x64, so a lockfile missing the linux-x64 entry breaks
// the build for everyone even though it may work on the machine that produced it.
//
// Vite 8 (spec 077) replaced rollup with rolldown, whose linux-x64 binding is the binary the
// build actually needs now — and it is declared `optional` AND `peer`, the exact shape npm is
// known to skip even when locked (see CLAUDE.md on `npm ci`). Rollup itself left the dependency
// tree entirely with that bump, so guarding the old name would pass vacuously.
//
// The recovery is always the same and is NOT `npm install` again:
//     npm run deps:reinstall
const REQUIRED_OPTIONAL = ["@rolldown/binding-linux-x64-gnu"];
const lockPath = path.join(ROOT, "package-lock.json");
const missingOptional = [];
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  const keys = Object.keys(lock.packages || {});
  for (const name of REQUIRED_OPTIONAL) {
    if (!keys.some((k) => k.endsWith(`node_modules/${name}`))) missingOptional.push(name);
  }
}

// ── report ───────────────────────────────────────────────────────────────────────────────────
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(problems, null, 2));
}

let failed = false;

// ── coverage first: a clean report from a gate that scanned nothing is the defect, not the pass ──
if (emptyGlobs.length) {
  failed = true;
  console.error(`\n::error::${emptyGlobs.length} workspaces glob(s) in package.json match no package:`);
  for (const g of emptyGlobs) console.error(`  · "${g}"`);
  console.error(
    "\n  Every unit under such a glob is silently UNCHECKED by this gate (and unlinked by npm).\n" +
      "  Either the directory moved and the glob needs updating, or the members are genuinely gone\n" +
      "  and the glob should be deleted.",
  );
}

const emptyUnits = [...scanned].filter(([, n]) => n === 0).map(([label]) => label);
if (emptyUnits.length) {
  failed = true;
  console.error(`\n::error::${emptyUnits.length} unit(s) contributed 0 source files to the scan:`);
  for (const label of emptyUnits) console.error(`  · ${label}`);
  console.error(
    "\n  This gate reports nothing about them, which reads as a pass. Usually the unit's source moved\n" +
      "  into a directory this script treats as build output (see IGNORED_DIRS). If the package really\n" +
      "  ships no JS/TS, say so explicitly here rather than leaving the silence.",
  );
}

if (missingOptional.length) {
  failed = true;
  console.error(`\n::error::${missingOptional.length} optional platform binary/ies missing from package-lock.json:`);
  for (const n of missingOptional) console.error(`  · ${n}`);
  console.error(
    "\n  This is npm/cli#4828 — an incremental `npm install` dropped them. Every Vite build will\n" +
      "  fail with a missing-native-binding error (rolldown cannot load without its platform\n" +
      "  binding), including the mini-app release path whose bytes are committed on-chain.\n" +
      "  Recover with a FULL re-resolve:\n" +
      "      npm run deps:reinstall\n" +
      "  Re-running `npm install` alone does NOT fix it.",
  );
}

if (problems.versionSkew.length) {
  failed = true;
  console.error(`\n::error::FR-015 — ${problems.versionSkew.length} package(s) declared at disagreeing versions:`);
  for (const p of problems.versionSkew) console.error(`  · ${p.pkg}\n      ${p.ranges.join("\n      ")}`);
  console.error(
    "\n  Align the ranges so a single lockfile dedupes them. Do NOT add a bare root `overrides`\n" +
      "  entry: several older majors are required by unrelated dependencies and forcing one version\n" +
      "  onto them breaks the install. Scope any pin per-package, as the @safe-global one already is.",
  );
}

if (problems.phantom.length) {
  failed = true;
  console.error(`\n::error::FR-003 — ${problems.phantom.length} undeclared (phantom) dependency/ies:`);
  for (const p of problems.phantom) console.error(`  · [${p.unit}] ${p.pkg}  (first seen: ${p.first})`);
  console.error(
    "\n  These resolve today only by npm's hoisting. A transitive dependency dropping them breaks\n" +
      "  a shipped path or a merge gate with no warning. Declare each in its unit's manifest, or add\n" +
      "  it to ALLOW in this script WITH a reason.",
  );
}

if (failed) process.exit(1);

// Name what was covered. "OK across 6 manifests" was true while four workspace members were not
// being scanned at all — the number was the only clue, and nothing compared it to the workspace.
const totalFiles = [...scanned.values()].reduce((a, b) => a + b, 0);
console.log(
  `Dependency hygiene OK — ${Object.keys(ranges).length} distinct packages across ${UNITS.length} manifests ` +
    `(root + ${workspaceMembers.length} workspace members), ${totalFiles} source files scanned, ` +
    "no version skew, no phantom imports.",
);
for (const [label, n] of scanned) console.log(`  · ${label}: ${n} file(s)`);
