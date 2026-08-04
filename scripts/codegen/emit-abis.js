#!/usr/bin/env node
/**
 * ABI generator (spec 075, FR-030 – FR-034).
 *
 * WHY THIS EXISTS
 * `frontend/src/abis/` held 47 hand-written `.js` + 10 `.json` files with NO generator and no
 * check against the compiled contracts. Because wagerRegistry and membershipManager are UUPS
 * proxies upgraded IN PLACE at stable addresses, the ordinary shipping path is exactly the path
 * that desynchronises them: the implementation changes, the address does not, and nothing notices.
 *
 * Measured drift at adoption:
 *   WagerRegistry     missing 35 members of the MERGED facet pair, incl. 9 intents-facet errors
 *                     (IntentExpired, IntentReplayed, InvalidIntentSignature, PaymentAuthMismatch…)
 *                     that a failing gasless intent reverts with — so the UI could not say WHY.
 *   WagerPoolFactory  missing 28    MembershipManager missing 26    TokenFactory missing 7
 *   WagerPool         carried 3 stale OZ ECDSA errors the contract no longer has
 *
 * Usage:
 *   node scripts/codegen/emit-abis.js            # write packages/abi/{json,src}
 *   node scripts/codegen/emit-abis.js --check    # exit 1 if committed output is stale (CI gate)
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const MANIFEST = path.join(__dirname, "abi-manifest.json");
const OUT_JSON = path.join(ROOT, "packages", "abi", "json");
const OUT_SRC = path.join(ROOT, "packages", "abi", "src");

/** Locate a compiled artifact, either by `path.sol:Name` or by bare contract name. */
function loadArtifact(ref) {
  if (ref.includes(":")) {
    const [solPath, name] = ref.split(":");
    const p = path.join(ROOT, "artifacts", solPath, `${name}.json`);
    if (!fs.existsSync(p)) throw new Error(`artifact not found: ${p} (run \`npm run compile\`)`);
    return JSON.parse(fs.readFileSync(p, "utf8"));
  }
  const stack = [path.join(ROOT, "artifacts", "contracts")];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name === `${ref}.json` && !e.name.endsWith(".dbg.json")) {
        return JSON.parse(fs.readFileSync(p, "utf8"));
      }
    }
  }
  throw new Error(`artifact not found for contract "${ref}" (run \`npm run compile\`)`);
}

/** Stable identity for an ABI entry — name + input types, which is what a selector encodes. */
const sigOf = (e) =>
  `${e.type}:${e.name || ""}(${(e.inputs || []).map((i) => i.type).join(",")})`;

/**
 * Merge facet ABIs, first occurrence winning.
 *
 * This is the whole reason WagerRegistry needs special handling: the proxy delegatecalls unknown
 * selectors to the intents facet, so callers see ONE contract whose ABI is the union. Emitting
 * only the main facet is not "incomplete" — it is wrong, because reverts and events from the
 * other facet become undecodable.
 */
function mergeAbis(abis) {
  const seen = new Set();
  const out = [];
  for (const abi of abis) {
    for (const entry of abi) {
      const s = sigOf(entry);
      if (seen.has(s)) continue;
      seen.add(s);
      out.push(entry);
    }
  }
  return out;
}

/** Deterministic ordering so regeneration is diff-free regardless of compiler output order. */
function sortAbi(abi) {
  const rank = { constructor: 0, receive: 1, fallback: 2, function: 3, event: 4, error: 5 };
  return [...abi].sort((a, b) => {
    const r = (rank[a.type] ?? 9) - (rank[b.type] ?? 9);
    if (r !== 0) return r;
    return sigOf(a).localeCompare(sigOf(b));
  });
}

function generate() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const files = {};
  for (const c of manifest.contracts) {
    let abi;
    let sourceLabel;
    if (c.events) {
      /*
       * Curated SUBSET (e.g. the synthetic TokenInstance template the subgraph uses for cloned
       * tokens). Emitting the whole reference contract would change what the subgraph indexes, so
       * the subset is deliberate — but it is still generated, and a listed member that vanishes
       * from the reference contract is a hard failure rather than silent rot.
       */
      const ref = loadArtifact(c.verifyAgainst).abi;
      const picked = c.events.map((name) => {
        const found = ref.find((e) => e.type === "event" && e.name === name);
        if (!found) {
          throw new Error(
            `${c.name}: event "${name}" is declared in the manifest but no longer exists on ` +
              `${c.verifyAgainst}. Either the contract changed (update the subset and the subgraph ` +
              `mappings together) or the name is a typo.`,
          );
        }
        return found;
      });
      abi = sortAbi(picked);
      sourceLabel = `${c.verifyAgainst} (curated subset: ${c.events.join(", ")})`;
    } else {
      const refs = c.facets || [c.name];
      abi = sortAbi(mergeAbis(refs.map((r) => loadArtifact(r).abi)));
      sourceLabel = refs.join(" + ");
    }
    files[path.join("json", `${c.name}.json`)] = `${JSON.stringify(abi, null, 2)}\n`;
    files[path.join("src", `${c.name}.js`)] =
      `// GENERATED by scripts/codegen/emit-abis.js — do not edit.\n` +
      `// Source: ${sourceLabel}\n` +
      `// Regenerate: npm run codegen:abis    Verify: npm run check:abis\n` +
      `export const ${c.name}Abi = ${JSON.stringify(abi, null, 2)}\n\n` +
      `export default ${c.name}Abi\n`;
  }
  // Barrel so consumers can `import { WagerRegistryAbi } from '@fairwins/abi'`.
  files[path.join("src", "index.js")] =
    `// GENERATED by scripts/codegen/emit-abis.js — do not edit.\n` +
    manifest.contracts.map((c) => `export { ${c.name}Abi } from './${c.name}.js'`).join("\n") +
    "\n";
  return files;
}

const files = generate();
const check = process.argv.includes("--check");
const base = path.join(ROOT, "packages", "abi");

if (check) {
  const stale = [];
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(base, rel);
    if (!fs.existsSync(p)) stale.push(`${rel} (missing)`);
    else if (fs.readFileSync(p, "utf8") !== content) stale.push(`${rel} (differs)`);
  }
  if (stale.length) {
    console.error(
      `::error::${stale.length} generated ABI file(s) are stale:\n  ` +
        stale.join("\n  ") +
        "\n\nThe committed ABIs no longer match the compiled contracts. Because the proxies are\n" +
        "upgraded IN PLACE at stable addresses, shipping this desynchronises the app and the\n" +
        "subgraph from the chain. Run `npm run codegen:abis` and review the diff.",
    );
    process.exit(1);
  }
  console.log(`ABIs up to date — ${Object.keys(files).length} generated files match the compiled contracts.`);
  process.exit(0);
}

fs.mkdirSync(OUT_JSON, { recursive: true });
fs.mkdirSync(OUT_SRC, { recursive: true });
for (const [rel, content] of Object.entries(files)) fs.writeFileSync(path.join(base, rel), content);
console.log(`Wrote ${Object.keys(files).length} files to packages/abi/`);
