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
const UNITS = [
  { manifest: "package.json", label: "root", sources: ["scripts", "test"], rootFallback: true },
  { manifest: "frontend/package.json", label: "frontend", sources: ["frontend/src"], rootFallback: false },
  { manifest: "services/relay-gateway/package.json", label: "relay-gateway", sources: ["services/relay-gateway/src"], rootFallback: false },
  { manifest: "services/relayer/package.json", label: "relayer", sources: ["services/relayer/src"], rootFallback: false },
  { manifest: "subgraph/package.json", label: "subgraph", sources: ["subgraph/src"], rootFallback: false },
  { manifest: "tools/miniapp-build/package.json", label: "miniapp-build", sources: ["tools/miniapp-build"], rootFallback: false },
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
};

const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const declared = (m) => ({ ...(m.dependencies || {}), ...(m.devDependencies || {}), ...(m.peerDependencies || {}) });

/** Bare specifier -> package name (`@scope/pkg/sub` -> `@scope/pkg`). */
function pkgOf(spec) {
  if (spec.startsWith("@")) return spec.split("/").slice(0, 2).join("/");
  return spec.split("/")[0];
}

function walk(dir, out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(js|jsx|mjs|cjs|ts|tsx)$/.test(e.name)) out.push(rel);
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
const nodeBuiltins = new Set(require("module").builtinModules.flatMap((m) => [m, `node:${m}`]));
for (const u of UNITS) {
  if (!fs.existsSync(path.join(ROOT, u.manifest))) continue;
  const own = declared(readJson(u.manifest));
  // The root manifest is a legitimate fallback for scripts/ and test/, which run in the root project.
  const rootDeclared = u.rootFallback ? declared(readJson("package.json")) : {};
  const files = u.sources.flatMap((s) => walk(s));
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
// The recovery is always the same and is NOT `npm install` again:
//     rm -rf node_modules package-lock.json && npm install
const REQUIRED_OPTIONAL = ["@rollup/rollup-linux-x64-gnu"];
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

if (missingOptional.length) {
  failed = true;
  console.error(`\n::error::${missingOptional.length} optional platform binary/ies missing from package-lock.json:`);
  for (const n of missingOptional) console.error(`  · ${n}`);
  console.error(
    "\n  This is npm/cli#4828 — an incremental `npm install` dropped them. Every Vite build will\n" +
      "  fail with \"Cannot find module @rollup/rollup-linux-x64-gnu\", including the mini-app release\n" +
      "  path whose bytes are committed on-chain. Recover with a FULL re-resolve:\n" +
      "      rm -rf node_modules package-lock.json && npm install\n" +
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
console.log(
  `Dependency hygiene OK — ${Object.keys(ranges).length} distinct packages across ${UNITS.length} manifests, ` +
    "no version skew, no phantom imports.",
);
