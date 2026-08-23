#!/usr/bin/env node
/**
 * Tenant manifest validator (spec 072, FR-008).
 *
 * Validates every tenants/<id>/manifest.json against the structural rules in
 * tenants/manifest.schema.json plus the cross-manifest rules JSON Schema cannot
 * express (domain uniqueness, fee caps, cohort separation, dedicated-mode
 * deployment-record presence). Dependency-free by design so it can run as a
 * bare CI step. Exits non-zero on the first tenant set that is not fully valid,
 * after printing EVERY error found (fail loudly, fail completely).
 *
 * Usage: node scripts/tenants/validate-tenant-manifest.js [tenantId ...]
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const TENANTS_DIR = path.join(REPO_ROOT, "tenants");
const DEPLOYMENTS_DIR = path.join(REPO_ROOT, "deployments");

const ID_PATTERN = /^[a-z][a-z0-9-]{1,30}$/;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const CSS_VAR = /^--[a-z][a-z0-9-]*$/;
const DOMAIN_PATTERN = /^[a-z0-9.-]+$/;

const LIFECYCLES = ["draft", "live", "suspended", "retired"];
const CONTRACT_MODES = ["shared", "dedicated"];

// Platform fee caps in bps (spec 057 + spec 060). Anything not named falls
// under the wrapped-service cap.
const FEE_CAPS = { "polymarket.taker": 100, "polymarket.maker": 50 };
const DEFAULT_FEE_CAP = 250;

// Tokens the theme MUST resolve (mirrors frontend/src/utils/validateTheme.js:
// the brand-scoped subset — neutrals live on :root, not on the platform class).
const REQUIRED_BASE_TOKENS = ["--brand-primary", "--brand-secondary"];
// --primary-button-text is required per MODE, not merely present: it is the
// label on every brand fill in the app (issue #1260) and it is the half of the
// pair that INVERTS between themes — white in light, Gunmetal in dark. A tenant
// declaring the fill but not the label would inherit the light label into its
// dark theme and ship a 2.16:1 control, which is the exact bug that guard
// exists to stop.
const REQUIRED_MODE_TOKENS = [
  "--primary-button",
  "--primary-button-hover",
  "--primary-button-text",
];

// Known chain ids per cohort (source: frontend/src/config/networks.js cohorts).
const MAINNET_CHAINS = new Set([1, 10, 137, 8453, 42161, 61]);
const TESTNET_CHAINS = new Set([80002, 63, 11155111, 560048, 1337]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadFeatureCatalog() {
  const catalog = readJson(path.join(TENANTS_DIR, "features.json"));
  return new Set(catalog.features);
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function validateThemeVars(vars, label, errors) {
  if (!isPlainObject(vars)) {
    errors.push(`brand.theme.${label} must be an object of CSS custom properties`);
    return;
  }
  for (const [name, value] of Object.entries(vars)) {
    if (!CSS_VAR.test(name)) {
      errors.push(`brand.theme.${label}: "${name}" is not a valid CSS custom property name`);
    }
    if (typeof value !== "string" || value.trim() === "") {
      errors.push(`brand.theme.${label}: "${name}" must be a non-empty string`);
    }
  }
}

function validateManifest(id, manifest, knownFeatures) {
  const errors = [];
  const err = (msg) => errors.push(msg);

  if (manifest.schemaVersion !== 1) err("schemaVersion must be 1");
  if (manifest.id !== id) err(`id "${manifest.id}" must equal directory name "${id}"`);
  if (typeof manifest.id !== "string" || !ID_PATTERN.test(manifest.id)) {
    err(`id must match ${ID_PATTERN}`);
  }
  if (!LIFECYCLES.includes(manifest.lifecycle)) {
    err(`lifecycle must be one of ${LIFECYCLES.join(", ")}`);
  }

  // --- identity ---
  const identity = manifest.identity;
  if (!isPlainObject(identity)) {
    err("identity is required");
  } else {
    if (!identity.displayName || typeof identity.displayName !== "string") {
      err("identity.displayName is required");
    }
    if (!Array.isArray(identity.domains) || identity.domains.length === 0) {
      err("identity.domains must be a non-empty array");
    } else {
      for (const domain of identity.domains) {
        if (typeof domain !== "string" || !DOMAIN_PATTERN.test(domain)) {
          err(`identity.domains: "${domain}" is not a valid domain`);
        }
      }
    }
    if (typeof identity.appUrl !== "string" || !identity.appUrl.startsWith("https://")) {
      err("identity.appUrl must be an https:// URL");
    }
  }

  // --- brand ---
  const brand = manifest.brand;
  if (!isPlainObject(brand)) {
    err("brand is required");
  } else {
    for (const key of ["logo", "logoMark", "favicon"]) {
      if (typeof brand[key] !== "string" || brand[key].trim() === "") {
        err(`brand.${key} is required`);
      }
    }
    const pwa = brand.pwa;
    if (!isPlainObject(pwa)) {
      err("brand.pwa is required");
    } else {
      for (const key of ["name", "shortName"]) {
        if (typeof pwa[key] !== "string" || pwa[key].trim() === "") err(`brand.pwa.${key} is required`);
      }
      for (const key of ["themeColor", "backgroundColor"]) {
        if (typeof pwa[key] !== "string" || !HEX_COLOR.test(pwa[key])) {
          err(`brand.pwa.${key} must be a #rrggbb color`);
        }
      }
    }
    const theme = brand.theme;
    if (!isPlainObject(theme) || !isPlainObject(theme.base) || !isPlainObject(theme.light) || !isPlainObject(theme.dark)) {
      err("brand.theme must define base, light, and dark token sets");
    } else {
      validateThemeVars(theme.base, "base", errors);
      validateThemeVars(theme.light, "light", errors);
      validateThemeVars(theme.dark, "dark", errors);
      for (const token of REQUIRED_BASE_TOKENS) {
        if (!theme.base[token]) err(`brand.theme.base must define ${token}`);
      }
      for (const mode of ["light", "dark"]) {
        for (const token of REQUIRED_MODE_TOKENS) {
          if (!theme[mode] || !theme[mode][token]) err(`brand.theme.${mode} must define ${token}`);
        }
      }
    }
  }

  // --- settings ---
  const settings = manifest.settings;
  if (!isPlainObject(settings)) {
    err("settings is required");
  } else {
    if (!Array.isArray(settings.features)) {
      err("settings.features must be an array");
    } else {
      for (const feature of settings.features) {
        if (!knownFeatures.has(feature)) {
          err(`settings.features: "${feature}" is not in tenants/features.json`);
        }
      }
    }

    const chains = settings.chains;
    if (!isPlainObject(chains) || !Array.isArray(chains.mainnet) || !Array.isArray(chains.testnet)) {
      err("settings.chains must define mainnet and testnet arrays");
    } else {
      for (const chainId of chains.mainnet) {
        if (!MAINNET_CHAINS.has(chainId)) {
          err(`settings.chains.mainnet: ${chainId} is not a known mainnet chain (cohorts never mix)`);
        }
      }
      for (const chainId of chains.testnet) {
        if (!TESTNET_CHAINS.has(chainId)) {
          err(`settings.chains.testnet: ${chainId} is not a known testnet chain (cohorts never mix)`);
        }
      }
    }

    if (settings.fees !== undefined) {
      if (!isPlainObject(settings.fees)) {
        err("settings.fees must be an object of serviceId -> bps");
      } else {
        for (const [serviceId, bps] of Object.entries(settings.fees)) {
          const cap = FEE_CAPS[serviceId] ?? DEFAULT_FEE_CAP;
          if (!Number.isInteger(bps) || bps < 0) {
            err(`settings.fees["${serviceId}"] must be a non-negative integer (bps)`);
          } else if (bps > cap) {
            err(`settings.fees["${serviceId}"] = ${bps} bps exceeds the platform cap of ${cap} bps`);
          }
        }
      }
    }
  }

  // --- contractSet ---
  const contractSet = manifest.contractSet;
  if (!isPlainObject(contractSet) || !CONTRACT_MODES.includes(contractSet.mode)) {
    err(`contractSet.mode must be one of ${CONTRACT_MODES.join(", ")}`);
  } else if (contractSet.mode === "dedicated" && manifest.lifecycle === "live") {
    // A live dedicated tenant must have a recorded estate (or an explicit,
    // honest pendingChains entry) for every enabled chain. Silent absence is
    // exactly the failure FR-008 exists to prevent.
    const pending = new Set(contractSet.pendingChains || []);
    const enabled = []
      .concat(settings?.chains?.mainnet || [])
      .concat(settings?.chains?.testnet || []);
    const tenantDeployDir = path.join(DEPLOYMENTS_DIR, "tenants", id);
    const records = fs.existsSync(tenantDeployDir) ? fs.readdirSync(tenantDeployDir) : [];
    for (const chainId of enabled) {
      const hasRecord = records.some((f) => f.endsWith(`-chain${chainId}-v2.json`));
      if (!hasRecord && !pending.has(chainId)) {
        err(
          `contractSet: live dedicated tenant enables chain ${chainId} but has no record at ` +
            `deployments/tenants/${id}/*-chain${chainId}-v2.json and does not list it in pendingChains`
        );
      }
    }
  }

  return errors;
}

function main() {
  const requested = process.argv.slice(2);
  const dirs = fs
    .readdirSync(TENANTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => requested.length === 0 || requested.includes(name));

  if (dirs.length === 0) {
    console.error(requested.length ? `No matching tenant directories for: ${requested.join(", ")}` : "No tenant directories found");
    process.exit(1);
  }

  const knownFeatures = loadFeatureCatalog();
  let failed = false;
  const domainOwners = new Map();
  const manifests = [];

  for (const id of dirs) {
    const manifestPath = path.join(TENANTS_DIR, id, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      console.error(`✖ ${id}: missing manifest.json`);
      failed = true;
      continue;
    }
    let manifest;
    try {
      manifest = readJson(manifestPath);
    } catch (parseError) {
      console.error(`✖ ${id}: manifest.json is not valid JSON — ${parseError.message}`);
      failed = true;
      continue;
    }
    manifests.push({ id, manifest });
  }

  // Cross-manifest rule: domains are globally unique. Checked over ALL
  // manifests even when a subset was requested, so a collision cannot hide
  // behind a partial run.
  const allDirs = fs
    .readdirSync(TENANTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  for (const id of allDirs) {
    const manifestPath = path.join(TENANTS_DIR, id, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;
    let manifest;
    try {
      manifest = readJson(manifestPath);
    } catch {
      continue; // parse failures already reported for requested tenants
    }
    for (const domain of manifest?.identity?.domains || []) {
      const owner = domainOwners.get(domain);
      if (owner && owner !== id) {
        console.error(`✖ domain "${domain}" is claimed by both "${owner}" and "${id}"`);
        failed = true;
      } else {
        domainOwners.set(domain, id);
      }
    }
  }

  for (const { id, manifest } of manifests) {
    const errors = validateManifest(id, manifest, knownFeatures);
    if (errors.length > 0) {
      failed = true;
      console.error(`✖ ${id}: ${errors.length} error(s)`);
      for (const message of errors) console.error(`    - ${message}`);
    } else {
      console.log(`✔ ${id}: valid (${manifest.contractSet.mode}, ${manifest.lifecycle})`);
    }
  }

  if (failed) {
    console.error("\nTenant manifest validation FAILED.");
    process.exit(1);
  }
  console.log(`\n${manifests.length} tenant manifest(s) valid.`);
}

main();
