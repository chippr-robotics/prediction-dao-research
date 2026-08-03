#!/usr/bin/env node
/**
 * Bytecode digest snapshot (spec 075, FR-005 / SC-001).
 *
 * Records a sha256 of `bytecode` + `deployedBytecode` for every compiled contract so a build-system
 * change can be PROVEN byte-neutral. Any change to compiler settings, dependency resolution, or the
 * OpenZeppelin version that wins the hoist shows up here as a differing digest.
 *
 * Usage:
 *   node scripts/codegen/bytecode-digest.js --out <file>          # record
 *   node scripts/codegen/bytecode-digest.js --compare <baseline>  # verify (exit 1 on any diff)
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ARTIFACTS = path.join(__dirname, "..", "..", "artifacts", "contracts");

function collect(dir, out = {}) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collect(p, out);
      continue;
    }
    if (!entry.name.endsWith(".json") || entry.name.endsWith(".dbg.json")) continue;
    let artifact;
    try {
      artifact = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      continue;
    }
    // Interfaces and abstract contracts compile to "0x"; keep them — a contract that STARTS
    // producing bytecode is as much a change as one whose bytecode moves.
    if (typeof artifact.bytecode !== "string") continue;
    const key = path.relative(path.join(__dirname, "..", ".."), p);
    out[key] = crypto
      .createHash("sha256")
      .update(`${artifact.bytecode}|${artifact.deployedBytecode || ""}`)
      .digest("hex");
  }
  return out;
}

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const cmpIdx = args.indexOf("--compare");
const digests = collect(ARTIFACTS);

if (Object.keys(digests).length === 0) {
  console.error("FAIL: no artifacts found — run `npm run compile` first");
  process.exit(2);
}

if (outIdx !== -1) {
  const target = args[outIdx + 1];
  fs.writeFileSync(target, `${JSON.stringify(digests, null, 1)}\n`);
  console.log(`recorded ${Object.keys(digests).length} contracts -> ${target}`);
  process.exit(0);
}

if (cmpIdx !== -1) {
  const baseline = JSON.parse(fs.readFileSync(args[cmpIdx + 1], "utf8"));
  const bKeys = Object.keys(baseline).sort();
  const dKeys = Object.keys(digests).sort();
  const changed = bKeys.filter((k) => digests[k] && digests[k] !== baseline[k]);
  const removed = bKeys.filter((k) => !digests[k]);
  const added = dKeys.filter((k) => !baseline[k]);

  console.log(`baseline: ${bKeys.length} contracts | current: ${dKeys.length} contracts`);
  console.log(`CHANGED: ${changed.length}  REMOVED: ${removed.length}  ADDED: ${added.length}`);
  for (const k of changed.slice(0, 25)) console.log(`  ! changed  ${k}`);
  for (const k of removed.slice(0, 25)) console.log(`  - removed  ${k}`);
  for (const k of added.slice(0, 25)) console.log(`  + added    ${k}`);

  if (changed.length || removed.length || added.length) {
    console.error(
      "\nFAIL: bytecode is NOT byte-identical to the baseline.\n" +
        "Per spec 075 FR-005 this BLOCKS the change. Do not merge.\n" +
        "If the compiler target moved, treat it as an incident against the live implementations first."
    );
    process.exit(1);
  }
  console.log("\nOK: bytecode byte-identical to baseline.");
  process.exit(0);
}

console.error("usage: bytecode-digest.js --out <file> | --compare <baseline>");
process.exit(2);
