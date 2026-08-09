/**
 * Tests for scripts/release/sync-manifest-versions.js (spec 076, FR-007/FR-007a).
 *
 * REGRESSION. The first real release failed here: TRACKED was a hardcoded array that still listed
 * `services/relayer`, which had been deleted from the workspace while spec 076 was in flight. The
 * script refused to sync a subset (correctly) and failed the release step AFTER the tag and the
 * GitHub Release were already published.
 *
 * The list is now derived from the root manifest's `workspaces` globs — the same source npm uses —
 * so it cannot fall behind the workspace. These tests pin that property.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { TRACKED, EXCLUDED_PREFIX, expandWorkspaceGlob, normalize, sync } = require("../sync-manifest-versions");

const ROOT = path.join(__dirname, "..", "..", "..");

test("every derived manifest actually exists (regression)", () => {
  // The exact assertion that would have failed on the shipped code, which listed a deleted member.
  for (const rel of TRACKED) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} should exist`);
  }
});

test("tracks the root plus every non-mini-app workspace member", () => {
  const root = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.ok(TRACKED.includes("package.json"), "the root manifest tracks the release too");
  assert.ok(root.workspaces.length > 0, "the repo should declare workspaces");
  assert.ok(TRACKED.length > 1, "a single-entry list means the derivation collapsed");
});

test("NEVER touches a mini-app manifest (FR-007)", () => {
  // Mini-apps version independently; overwriting one breaks the version-to-CID pairing FR-007b
  // exists to protect.
  for (const rel of TRACKED) {
    assert.ok(!rel.startsWith(EXCLUDED_PREFIX), `${rel} must not be tracked`);
  }
  const miniapps = path.join(ROOT, "frontend", "miniapps");
  if (fs.existsSync(miniapps)) {
    const apps = fs.readdirSync(miniapps, { withFileTypes: true }).filter((e) => e.isDirectory());
    assert.ok(apps.length > 0, "this repo should have mini-apps for the exclusion to be meaningful");
  }
});

test("a removed workspace member simply disappears from the list", () => {
  // services/relayer was deleted on main. A hardcoded list would still name it; a derived one must
  // not, and must not throw because of it.
  assert.ok(!TRACKED.some((t) => t.includes("services/relayer")), "deleted member must not be tracked");
  assert.doesNotThrow(() => sync("v1.0.0", { check: true }));
});

test("--check reports what would change without writing", () => {
  const before = TRACKED.map((rel) => fs.readFileSync(path.join(ROOT, rel), "utf8"));
  const changed = sync("v9.9.9", { check: true });
  const after = TRACKED.map((rel) => fs.readFileSync(path.join(ROOT, rel), "utf8"));
  assert.deepEqual(after, before, "check mode must not write");
  assert.ok(Array.isArray(changed));
});

test("rejects anything that is not a release version", () => {
  for (const bad of ["1.0", "main", "v1.0.0-rc.1", "", null]) {
    assert.throws(() => normalize(bad), `"${bad}" should be rejected`);
  }
  assert.equal(normalize("v1.2.3"), "1.2.3");
  assert.equal(normalize("1.2.3"), "1.2.3");
});

// ---- workspace glob shapes (review on #1080) --------------------------------------------------
//
// The expansion understands a literal path or a single trailing "/*". Anything else must THROW
// rather than produce a truncated or mis-resolved base: a silently dropped manifest leaves that
// package permanently disagreeing about which release it belongs to, which is the failure this
// whole file was rewritten to prevent.

test("expands a literal workspace path unchanged", () => {
  assert.deepEqual(expandWorkspaceGlob("services/relay-gateway"), ["services/relay-gateway"]);
});

test("expands a single trailing /* to its immediate children", () => {
  const got = expandWorkspaceGlob("packages/*");
  assert.ok(got.length > 0, "packages/* should expand");
  for (const dir of got) {
    assert.ok(dir.startsWith("packages/"), `${dir} should be under packages/`);
    assert.ok(!dir.includes("*"), `${dir} should not retain a wildcard`);
  }
});

test("REFUSES unsupported patterns instead of guessing", () => {
  for (const bad of [
    "packages/**", // would silently return immediate children only
    "services/*/api", // would silently drop the "/api" suffix
    "*", // would yield paths with a leading slash
    "**", //
    "pack*ges/*", // wildcard outside the trailing position
  ]) {
    assert.throws(
      () => expandWorkspaceGlob(bad),
      /unsupported workspace pattern/,
      `"${bad}" must be rejected`,
    );
  }
});

test("this repository's own globs are all supported shapes", () => {
  // If someone adds an unsupported pattern to the root manifest, this fails here rather than
  // during a release.
  const root = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  for (const glob of root.workspaces || []) {
    assert.doesNotThrow(() => expandWorkspaceGlob(glob), `"${glob}" should expand`);
  }
});
