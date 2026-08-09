#!/usr/bin/env node
/**
 * Release artifact table (spec 076, FR-034/FR-035).
 *
 * Answers "what did this release actually move?" for an operator mid-incident.
 *
 * TWO RULES SHAPE THIS FILE:
 *
 *  1. EVERY CATEGORY IS LISTED, including the ones that did not change (FR-035). A missing row is
 *     indistinguishable from an unexamined one, and the table's whole value is that it can be
 *     trusted when something is on fire.
 *
 *  2. AN UNREADABLE SOURCE IS REPORTED AS UNREADABLE, never as "unchanged" (constitution III).
 *     `deployments/` may be absent in a checkout, a registry read may fail. Rendering either as
 *     "unchanged" would be a fabricated fact — the same failure the chain-estate reads in spec 071
 *     exist to prevent.
 *
 * Usage:
 *   node scripts/release/artifacts.js --previous v1.3.2 --version v1.4.0 [--out artifacts.md]
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");

const CATEGORIES = [
  { key: "spa-image", label: "SPA image" },
  { key: "gateway-image", label: "Relay gateway image" },
  { key: "contract-impl", label: "Contract implementations" },
  { key: "miniapp-package", label: "Mini-app packages" },
  { key: "subgraph-endpoint", label: "Subgraph endpoint" },
];

/** Files whose change in the range implies the category moved. */
const CATEGORY_PATHS = {
  "spa-image": ["frontend/", "Dockerfile", "tenants/", "packages/"],
  "gateway-image": ["services/relay-gateway/", "packages/"],
  "contract-impl": ["contracts/", "deployments/"],
  "miniapp-package": ["frontend/miniapps/"],
  "subgraph-endpoint": ["subgraph/", "cloudbuild.yaml"],
};

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null; // null means UNREADABLE, which is not the same as empty.
  }
}

/** Changed paths in (previous, version]. `null` when the range itself could not be read. */
function changedPaths(previous, version) {
  const range = previous ? `${previous}..${version || "HEAD"}` : version || "HEAD";
  const out = git(["diff", "--name-only", range]);
  if (out === null) return null;
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

function movedIn(category, paths) {
  if (paths === null) return null;
  const prefixes = CATEGORY_PATHS[category] || [];
  return paths.some((p) => prefixes.some((pre) => p.startsWith(pre)));
}

/** Mini-app package versions, read from their manifests (FR-007). */
function miniAppVersions() {
  const dir = path.join(ROOT, "frontend", "miniapps");
  if (!fs.existsSync(dir)) return null;
  const out = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkg = path.join(dir, entry.name, "package.json");
    if (!fs.existsSync(pkg)) continue;
    try {
      out[entry.name] = JSON.parse(fs.readFileSync(pkg, "utf8")).version || null;
    } catch {
      out[entry.name] = null; // unreadable, not absent
    }
  }
  return out;
}

/**
 * Deployed implementation addresses behind the UUPS proxies, read from deployments/ — the recorded
 * source of truth for on-chain addresses. Returns null when the directory cannot be read.
 */
function contractImplementations() {
  const dir = path.join(ROOT, "deployments");
  if (!fs.existsSync(dir)) return null;
  const impls = {};
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    let record;
    try {
      record = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    } catch {
      continue;
    }
    const contracts = record.contracts || record;
    for (const [name, value] of Object.entries(contracts)) {
      if (!name.endsWith("Impl")) continue;
      const address = typeof value === "string" ? value : value?.address;
      if (address) impls[`${path.basename(file, ".json")}/${name}`] = address;
    }
  }
  return impls;
}

/** The subgraph endpoint version the SPA build consumes — a namespace this scheme does not own. */
function subgraphEndpoint() {
  const cb = path.join(ROOT, "cloudbuild.yaml");
  if (!fs.existsSync(cb)) return null;
  // The value sits inside a quoted YAML list item, so the closing quote must be tolerated:
  //   - 'VITE_SUBGRAPH_URL=https://.../fairwins-polygon/v0.2.0'
  const m = /VITE_SUBGRAPH_URL=[^\n]*\/([^/'"\s]+)['"]?\s*$/m.exec(fs.readFileSync(cb, "utf8"));
  return m ? m[1] : null;
}

function buildRows({ previous, version }) {
  const paths = changedPaths(previous, version);
  const impls = contractImplementations();
  const apps = miniAppVersions();
  const endpoint = subgraphEndpoint();

  return CATEGORIES.map((cat) => {
    const moved = movedIn(cat.key, paths);
    let status;
    if (moved === null) status = "unreadable";
    else status = moved ? "moved" : "unchanged";

    let identity = "—";
    if (cat.key === "contract-impl") {
      if (impls === null) {
        status = "unreadable";
        identity = "deployments/ could not be read";
      } else if (moved) {
        const names = Object.keys(impls);
        identity = names.length ? names.map((n) => `\`${n}\` → \`${impls[n]}\``).join("<br>") : "no implementation recorded";
      }
    } else if (cat.key === "miniapp-package") {
      if (apps === null) {
        status = "unreadable";
        identity = "frontend/miniapps/ could not be read";
      } else if (moved) {
        identity = Object.entries(apps).map(([n, v]) => `\`${n}\` v${v ?? "?"}`).join("<br>");
      }
    } else if (cat.key === "subgraph-endpoint") {
      identity = endpoint ? `\`${endpoint}\`` : "unreadable";
      if (!endpoint) status = "unreadable";
    }

    return { ...cat, status, identity };
  });
}

function render({ previous, version, rows }) {
  const lines = [
    "### Artifacts",
    "",
    `Range: \`${previous || "(no previous release)"}..${version}\``,
    "",
    "| Artifact | Status | Identity |",
    "|---|---|---|",
  ];
  for (const r of rows) {
    lines.push(`| ${r.label} | ${r.status} | ${r.identity} |`);
  }
  if (rows.some((r) => r.status === "unreadable")) {
    lines.push("");
    lines.push(
      "> One or more categories could not be read. They are reported as **unreadable**, not as " +
        "unchanged — an absent source is not evidence that nothing moved.",
    );
  }
  return lines.join("\n") + "\n";
}

module.exports = { CATEGORIES, changedPaths, movedIn, miniAppVersions, contractImplementations, subgraphEndpoint, buildRows, render };

// ---- CLI ---------------------------------------------------------------------------------------
if (require.main === module) {
  const argv = process.argv.slice(2);
  const flag = (n) => {
    const i = argv.indexOf(n);
    return i === -1 ? null : argv[i + 1];
  };
  const previous = flag("--previous") || null;
  const version = flag("--version") || "HEAD";
  const out = flag("--out");

  const rows = buildRows({ previous, version });
  const md = render({ previous, version, rows });
  if (out) fs.writeFileSync(out, md);
  else process.stdout.write(md);
}
