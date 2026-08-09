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

/** Manifests that track the repository release version (FR-007a). */
const TRACKED = [
  "package.json",
  "frontend/package.json",
  "services/relay-gateway/package.json",
  "services/relayer/package.json",
  "subgraph/package.json",
  "tools/miniapp-build/package.json",
  "packages/abi/package.json",
  "packages/intent-types/package.json",
];

/** Independently versioned — never written by this script (FR-007). */
const EXCLUDED_PREFIX = "frontend/miniapps/";

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

  // A tracked manifest that has vanished is a real problem — the workspace list changed and this
  // script was not updated. Say so rather than silently syncing a subset.
  if (missing.length) {
    throw new Error(
      `tracked manifests are missing: ${missing.join(", ")}. ` +
        `Update TRACKED in scripts/release/sync-manifest-versions.js to match the workspace.`,
    );
  }
  return changed;
}

module.exports = { TRACKED, EXCLUDED_PREFIX, normalize, sync };

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
