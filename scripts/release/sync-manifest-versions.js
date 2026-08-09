#!/usr/bin/env node
/**
 * Repository-version sync (spec 076, FR-007a).
 *
 * Writes the release version into every workspace manifest that tracks the repository version, so
 * `frontend`'s 0.0.0 and the services' 0.1.0 stop being decorative.
 *
 * WHAT IS DELIBERATELY NOT TOUCHED: frontend/miniapps/*. Those packages version INDEPENDENTLY
 * (FR-007) because they publish at immutable content addresses and are curated on-chain on a
 * schedule the repository release does not control. Overwriting a mini-app version here would break
 * the version↔CID pairing that FR-007b exists to protect.
 *
 * Only the release workflow runs this. A contributor never edits a version by hand — the version
 * gate rejects it (FR-008).
 *
 * Usage:
 *   node scripts/release/sync-manifest-versions.js --version v1.4.0 [--check]
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

/** Independently versioned — never written by this script (FR-007). */
const EXCLUDED_PREFIX = "frontend/miniapps/";

/**
 * The ONLY wildcard shape this understands: a single trailing `/*` on a literal base.
 *
 * npm accepts more than that, and the difference is not academic. Silently mishandling a pattern
 * would drop a manifest out of the release sync, leaving it permanently disagreeing about which
 * release it belongs to — the exact bug this file was just rewritten to prevent, arriving through
 * a different door. Concretely, before this guard:
 *
 *   a doubled trailing wildcard -> base "packages", immediate children only:
 *                                 DEEPER MEMBERS SILENTLY MISSED
 *   a wildcard in the MIDDLE    -> base "services", the trailing segment dropped: WRONG PATHS
 *   a bare wildcard             -> indexOf is -1, base "": PATHS WITH A LEADING SLASH
 *
 * So an unsupported pattern throws. Refusing to guess is the whole point (reported by review on
 * #1080).
 */
const SUPPORTED_GLOB = /^[^*]+\/\*$/;

function expandWorkspaceGlob(glob) {
  if (!glob.includes("*")) return [glob]; // a literal workspace path
  if (!SUPPORTED_GLOB.test(glob)) {
    throw new Error(
      `unsupported workspace pattern "${glob}" in the root package.json. ` +
        `scripts/release/sync-manifest-versions.js understands a literal path or a single trailing ` +
        `"/*", and refuses to guess at anything else rather than silently syncing the wrong set of ` +
        `manifests. Teach expandWorkspaceGlob the new shape, with a test.`,
    );
  }
  const base = glob.slice(0, -2); // drop the trailing "/*"
  const abs = path.join(ROOT, base);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => `${base}/${e.name}`)
    .sort();
}

/**
 * THE TRACKED LIST IS DERIVED, NOT TYPED.
 *
 * It used to be a hardcoded array, and it broke the first real release: `services/relayer` was
 * deleted from the workspace while spec 076 was in flight, and this script — correctly refusing to
 * sync a subset — failed the release step after the tag and the GitHub Release had already been
 * published.
 *
 * `scripts/deps/check-dependency-hygiene.js` learned exactly this lesson under issue #1039 and says
 * so in its own comment: a hardcoded member list is an invariant held by human discipline, and
 * adding or removing a workspace member is routine while remembering to update a second list is
 * not. So the members come from the same source npm itself uses — the root manifest's `workspaces`
 * globs — which means this cannot fall behind the workspace by construction.
 *
 * Mini-apps are excluded because they version INDEPENDENTLY (FR-007): overwriting one here would
 * break the version-to-CID pairing that FR-007b exists to protect.
 */
function trackedManifests() {
  const root = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const members = (root.workspaces || [])
    .flatMap(expandWorkspaceGlob)
    .filter((dir) => !dir.startsWith(EXCLUDED_PREFIX))
    .map((dir) => `${dir}/package.json`)
    .filter((rel) => fs.existsSync(path.join(ROOT, rel)));
  // The root manifest tracks the release too, and is not a workspace member of itself.
  return ["package.json", ...members.sort()];
}

const TRACKED = trackedManifests();

function normalize(version) {
  const v = String(version || "").trim();
  const m = /^v?(\d+\.\d+\.\d+)$/.exec(v);
  if (!m) throw new Error(`"${version}" is not a release version (expected vX.Y.Z)`);
  return m[1]; // package.json versions carry no leading "v"
}

function sync(version, { check = false } = {}) {
  const target = normalize(version);
  const changed = [];
  const missing = [];

  for (const rel of TRACKED) {
    if (rel.startsWith(EXCLUDED_PREFIX)) continue; // defensive: the list must never grow into mini-apps
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      missing.push(rel);
      continue;
    }
    const raw = fs.readFileSync(abs, "utf8");
    const pkg = JSON.parse(raw);
    if (pkg.version === target) continue;
    changed.push({ file: rel, from: pkg.version, to: target });
    if (!check) {
      pkg.version = target;
      // Preserve the file's trailing newline convention rather than reformatting the whole file.
      const trailing = raw.endsWith("\n") ? "\n" : "";
      fs.writeFileSync(abs, `${JSON.stringify(pkg, null, 2)}${trailing}`);
    }
  }

  // Unreachable now that TRACKED is derived and filtered by existsSync, but kept as a belt: if this
  // ever fires again it means the derivation regressed, and syncing a subset silently would leave
  // manifests disagreeing about which release they belong to.
  if (missing.length) {
    throw new Error(`tracked manifests vanished between derivation and read: ${missing.join(", ")}`);
  }

  // A derived list that comes back empty is a coverage hole wearing a green light — rename a
  // directory and this would report "already at vX.Y.Z" having written nothing. Same failure shape
  // check-dependency-hygiene.js guards against with its empty-glob check.
  if (TRACKED.length <= 1) {
    throw new Error(
      `only ${TRACKED.length} manifest(s) derived from the workspace globs — expected the root plus ` +
        `every non-mini-app member. Check "workspaces" in the root package.json.`,
    );
  }
  return changed;
}

module.exports = { TRACKED, EXCLUDED_PREFIX, SUPPORTED_GLOB, expandWorkspaceGlob, normalize, sync };

// ---- CLI ---------------------------------------------------------------------------------------
if (require.main === module) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--version");
  const version = i === -1 ? null : argv[i + 1];
  if (!version) {
    console.error("--version is required");
    process.exit(1);
  }
  try {
    const changed = sync(version, { check: argv.includes("--check") });
    if (changed.length === 0) {
      console.log(`all tracked manifests already at ${normalize(version)}`);
    } else {
      for (const c of changed) console.log(`${c.file}: ${c.from} -> ${c.to}`);
    }
  } catch (err) {
    console.error(`::error::${err.message}`);
    process.exit(1);
  }
}
