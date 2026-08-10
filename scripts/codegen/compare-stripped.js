#!/usr/bin/env node
/**
 * Metadata-stripped bytecode comparison (spec 080, T007).
 *
 * `bytecode-digest.js` hashes bytecode VERBATIM, so it reports a difference whenever the appended
 * CBOR metadata block moves — and that block carries an IPFS hash of the source, so it moves for a
 * comment change. This tool answers the narrower question that CREATE2 work actually needs: did the
 * EXECUTABLE code change, or only the metadata riding behind it?
 *
 * Usage:
 *   node scripts/codegen/compare-stripped.js <artifactsDirA> <artifactsDirB>
 *
 *   --only-diff         print per-contract lines only for non-identical results
 *   --strict-creation   also exit non-zero when stripped CREATION code differs (see below)
 *
 * HOW THE METADATA BLOCK IS LOCATED
 * ---------------------------------
 * solc appends `<cbor map><uint16 length>` to the RUNTIME object. The length is self-describing:
 * the final two bytes hold the size of the CBOR map, so the block to remove is (length + 2) bytes.
 * Under this repo's default settings that block is 51 + 2 bytes; with `metadata.bytecodeHash="none"`
 * it shrinks to 10 + 2.
 *
 * WHY CREATION CODE IS NOT STRIPPED THE SAME WAY
 * ----------------------------------------------
 * The same trailing-two-bytes trick is WRONG on `bytecode` (creation code) and silently so. Under
 * viaIR, solc lays the creation object out as `<init code><runtime code + metadata><data segments>`,
 * so for 10 of this repo's 133 code-bearing contracts the final two bytes are part of a trailing
 * 32-byte data constant, not a metadata length — SanctionsGuard reads as a 28429-byte block on a
 * 2728-byte object. Two more (ForceSend, ERC1271InputGenerator — constructors that never return
 * runtime code) carry no metadata in the creation object at all, and their trailing two bytes decode
 * to 65022 and 22270.
 *
 * So creation code is stripped by LOCATING the runtime's metadata block inside it and splicing that
 * block out. When the block is not present, nothing is stripped and the WHOLE creation object is
 * compared — strictly stronger than a guess, never weaker.
 *
 * WHY CREATION DIFFERENCES DO NOT GATE BY DEFAULT
 * ----------------------------------------------
 * Creation code cannot be metadata-invariant: the init prologue embeds the runtime object's LENGTH
 * as a push constant for CODECOPY/RETURN, and the metadata block is part of that length. Change the
 * metadata size and every creation object legitimately differs even though every runtime is
 * identical. The gate is therefore on stripped RUNTIME code; creation is reported separately, and
 * --strict-creation makes it fatal for callers that want same-metadata-settings comparisons.
 *
 * FAILURE IS THE DEFAULT FOR ANYTHING UNCERTAIN
 * ---------------------------------------------
 * A contract in one tree and not the other fails. Bytecode that is not clean even-length hex fails.
 * A declared metadata block that overruns the object, or does not begin with a CBOR map header
 * (major type 5), fails — that header check is what stops a naive strip from chopping real code off
 * a build with `appendCBOR:false`, where the trailing two bytes are just opcodes.
 */
const fs = require("fs");
const path = require("path");

/** Recursively collect hardhat artifacts under `root`, keyed by path relative to `root`. */
function collect(root, out = new Map(), dir = root) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // build-info holds solc input/output records, not artifacts.
      if (entry.name === "build-info") continue;
      collect(root, out, p);
      continue;
    }
    if (!entry.name.endsWith(".json") || entry.name.endsWith(".dbg.json")) continue;
    let artifact;
    try {
      artifact = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      continue;
    }
    // A hardhat artifact always carries `bytecode`; anything else in the tree is not one.
    if (typeof artifact.bytecode !== "string") continue;
    const key = path.relative(root, p).split(path.sep).join("/");
    out.set(key, {
      label:
        artifact.sourceName && artifact.contractName
          ? `${artifact.sourceName}:${artifact.contractName}`
          : key,
      bytecode: artifact.bytecode,
      deployedBytecode: artifact.deployedBytecode,
    });
  }
  return out;
}

/**
 * Validate and normalise a bytecode field to lowercase hex without the 0x prefix.
 * Returns { ok:false, reason } rather than throwing — every caller treats that as a FAILURE.
 */
function normalizeHex(value, field) {
  if (typeof value !== "string") return { ok: false, reason: `${field} is not a string` };
  if (value === "") return { ok: true, hex: "", empty: true };
  if (!value.startsWith("0x")) return { ok: false, reason: `${field} does not start with 0x` };
  const hex = value.slice(2).toLowerCase();
  if (hex === "") return { ok: true, hex: "", empty: true };
  if (!/^[0-9a-f]+$/.test(hex)) {
    const why = hex.includes("__")
      ? `${field} contains an unlinked library placeholder`
      : `${field} contains non-hex characters`;
    return { ok: false, reason: why };
  }
  if (hex.length % 2 !== 0) return { ok: false, reason: `${field} has an odd number of hex digits` };
  return { ok: true, hex, empty: false };
}

/**
 * Decode the CBOR item at `offsetBytes` and report how many bytes it consumed.
 *
 * Deliberately a strict, minimal decoder rather than a permissive one: it accepts only the shapes
 * solc actually emits in a metadata trailer (a map of text-string keys to byte strings, text
 * strings, or booleans) and treats everything else as a failure. A permissive decoder would
 * re-open the hole this exists to close — the point is not to understand arbitrary CBOR, it is to
 * refuse anything that is not unmistakably a solc metadata map.
 *
 * Returns { ok, bytes } or { ok: false, reason }.
 */
function cborConsumedBytes(hex, offsetBytes, maxBytes) {
  const byteAt = (i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  const start = offsetBytes;
  const limit = offsetBytes + maxBytes;
  let p = offsetBytes;

  // Read one head: returns { major, value, next } with only the small/1/2/4-byte forms allowed.
  function head(at) {
    if (at >= limit) return { err: "ran past the declared block while reading a CBOR head" };
    const ib = byteAt(at);
    const major = ib >> 5;
    const ai = ib & 0x1f;
    if (ai < 24) return { major, value: ai, next: at + 1 };
    if (ai === 24) {
      if (at + 1 >= limit) return { err: "truncated 1-byte CBOR argument" };
      return { major, value: byteAt(at + 1), next: at + 2 };
    }
    if (ai === 25) {
      if (at + 2 >= limit) return { err: "truncated 2-byte CBOR argument" };
      return { major, value: (byteAt(at + 1) << 8) | byteAt(at + 2), next: at + 3 };
    }
    return { err: `unsupported CBOR additional-info ${ai} in a metadata trailer` };
  }

  const m = head(p);
  if (m.err) return { ok: false, reason: m.err };
  if (m.major !== 5) return { ok: false, reason: `expected a CBOR map, found major type ${m.major}` };
  const pairs = m.value;
  if (pairs === 0 || pairs > 8) return { ok: false, reason: `implausible metadata map with ${pairs} entries` };
  p = m.next;

  for (let i = 0; i < pairs; i++) {
    const k = head(p);
    if (k.err) return { ok: false, reason: `key ${i}: ${k.err}` };
    if (k.major !== 3) return { ok: false, reason: `key ${i} is not a text string (major ${k.major})` };
    p = k.next + k.value;
    if (p > limit) return { ok: false, reason: `key ${i} overruns the declared block` };

    const v = head(p);
    if (v.err) return { ok: false, reason: `value ${i}: ${v.err}` };
    if (v.major === 2 || v.major === 3) {
      p = v.next + v.value; // byte string / text string
    } else if (v.major === 7) {
      p = v.next; // simple value (true/false) — solc emits this for "experimental"
    } else {
      return { ok: false, reason: `value ${i} has unexpected major type ${v.major}` };
    }
    if (p > limit) return { ok: false, reason: `value ${i} overruns the declared block` };
  }
  return { ok: true, bytes: p - start };
}

/**
 * Split a runtime object into executable code + trailing CBOR metadata block.
 * Every uncertainty is an error, never a silent pass-through.
 */
function splitMetadata(hex) {
  const bytes = hex.length / 2;
  // 2 bytes of length suffix + at least 1 byte of CBOR.
  if (bytes < 3) return { ok: false, reason: `only ${bytes} bytes — too short to carry a metadata length suffix` };
  const declared = parseInt(hex.slice(-4), 16);
  const blockBytes = declared + 2;
  if (blockBytes > bytes) {
    return { ok: false, reason: `declared metadata block ${blockBytes} bytes overruns a ${bytes}-byte object` };
  }
  const codeBytes = bytes - blockBytes;
  if (codeBytes === 0) return { ok: false, reason: `metadata block ${blockBytes} bytes is the entire object` };
  const header = parseInt(hex.slice(codeBytes * 2, codeBytes * 2 + 2), 16);
  // CBOR major type 5 (map) => top three bits 101. solc emits a1/a2/a3 here.
  if ((header & 0xe0) !== 0xa0) {
    return {
      ok: false,
      reason: `metadata block does not begin with a CBOR map header (found 0x${hex.slice(
        codeBytes * 2,
        codeBytes * 2 + 2
      )})`,
    };
  }
  /*
   * The header byte alone is NOT enough, and trusting it is a reachable false pass.
   *
   * Found adversarially: replacing the trailing block in place with `a1 6001600155 <tail> 0033`
   * — a valid map header followed by five REAL EVM bytes (PUSH1 1 PUSH1 1 SSTORE) — keeps the
   * object length and the declared length unchanged, so the split point does not move and the
   * fake header satisfies the mask above. Both sides then strip to the same prefix and the tool
   * reported `identical 96 | differ 0`, EXIT=0, on trees whose runtime AND creation bytes
   * genuinely differed and whose keccak(initCode) — i.e. their CREATE2 address — differed.
   *
   * That is precisely the address divergence spec 080 exists to detect, reported as "no change".
   * So the block must be PARSED and must consume exactly `declared` bytes: bytes that are really
   * executable code cannot masquerade as a metadata map without failing to decode.
   */
  const consumed = cborConsumedBytes(hex, codeBytes, declared);
  if (!consumed.ok) {
    return { ok: false, reason: `metadata block is not well-formed CBOR — ${consumed.reason}` };
  }
  if (consumed.bytes !== declared) {
    return {
      ok: false,
      reason:
        `metadata CBOR decodes to ${consumed.bytes} bytes but the length suffix declares ` +
        `${declared} — the trailing block is not purely metadata`,
    };
  }
  return {
    ok: true,
    code: hex.slice(0, codeBytes * 2),
    block: hex.slice(codeBytes * 2),
    codeBytes,
    blockBytes,
    declared,
  };
}

/** Prepare one side's runtime for comparison. */
function runtimeSide(entry) {
  const norm = normalizeHex(entry.deployedBytecode, "deployedBytecode");
  if (!norm.ok) return { state: "malformed", reason: norm.reason };
  if (norm.empty) return { state: "empty" };
  const split = splitMetadata(norm.hex);
  if (!split.ok) return { state: "malformed", reason: split.reason };
  return { state: "ok", ...split };
}

/**
 * Prepare one side's creation code for comparison, splicing out the runtime metadata block when it
 * is present. `metaBlock` is the block recovered from the same side's runtime object.
 */
function creationSide(entry, metaBlock) {
  const norm = normalizeHex(entry.bytecode, "bytecode");
  if (!norm.ok) return { state: "malformed", reason: norm.reason };
  if (norm.empty) return { state: "empty" };
  if (metaBlock) {
    const at = norm.hex.lastIndexOf(metaBlock);
    if (at !== -1) {
      return {
        state: "ok",
        code: norm.hex.slice(0, at) + norm.hex.slice(at + metaBlock.length),
        codeBytes: (norm.hex.length - metaBlock.length) / 2,
        blockBytes: metaBlock.length / 2,
        stripped: true,
      };
    }
  }
  // No metadata to remove (or none recoverable): compare the object whole.
  return { state: "ok", code: norm.hex, codeBytes: norm.hex.length / 2, blockBytes: 0, stripped: false };
}

function pad(s, n) {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function main() {
  const args = process.argv.slice(2);
  const onlyDiff = args.includes("--only-diff");
  const strictCreation = args.includes("--strict-creation");
  const dirs = args.filter((a) => !a.startsWith("--"));

  if (dirs.length !== 2) {
    console.error("usage: compare-stripped.js <artifactsDirA> <artifactsDirB> [--only-diff] [--strict-creation]");
    process.exit(2);
  }
  const [dirA, dirB] = dirs;
  for (const d of dirs) {
    if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) {
      console.error(`FAIL: not a directory: ${d}`);
      process.exit(2);
    }
  }

  const a = collect(dirA);
  const b = collect(dirB);
  if (a.size === 0 || b.size === 0) {
    console.error(`FAIL: no artifacts found (A: ${a.size}, B: ${b.size}) — run \`npm run compile\` first`);
    process.exit(2);
  }

  console.log(`A: ${dirA}  (${a.size} artifacts)`);
  console.log(`B: ${dirB}  (${b.size} artifacts)`);
  console.log("");

  const keys = [...new Set([...a.keys(), ...b.keys()])].sort();
  const runtimeLines = [];
  const creationLines = [];
  const failures = [];
  let compared = 0;
  let identical = 0;
  let differ = 0;
  let skipped = 0;
  let creationCompared = 0;
  let creationIdentical = 0;
  let creationDiffer = 0;

  for (const key of keys) {
    const ea = a.get(key);
    const eb = b.get(key);
    const label = (ea || eb).label;

    // A contract present in one tree and not the other is a FAILURE, not a skip.
    if (!ea || !eb) {
      const where = ea ? `only in A (${dirA})` : `only in B (${dirB})`;
      runtimeLines.push(`  ? ${pad(label, 62)} MISSING — ${where}`);
      failures.push(`${label}: artifact ${where}`);
      continue;
    }

    const ra = runtimeSide(ea);
    const rb = runtimeSide(eb);

    if (ra.state === "malformed" || rb.state === "malformed") {
      const why = [
        ra.state === "malformed" ? `A: ${ra.reason}` : null,
        rb.state === "malformed" ? `B: ${rb.reason}` : null,
      ]
        .filter(Boolean)
        .join("; ");
      runtimeLines.push(`  ? ${pad(label, 62)} MALFORMED — ${why}`);
      failures.push(`${label}: ${why}`);
      continue;
    }

    /*
     * Interfaces / abstract contracts compile to "0x" on both sides: no runtime to compare.
     *
     * This used to `continue`, which ALSO skipped the creation-code comparison below — so
     * `--strict-creation` silently did not gate creation code for any contract whose runtime was
     * empty on both sides. No crafting was needed to reach it; it was a plain control-flow bug,
     * and a flag that quietly covers less than it says is the same defect class this tool exists
     * to catch. Fall through instead, so creation code is still examined.
     */
    const runtimeOutOfScope = ra.state === "empty" && rb.state === "empty";
    if (runtimeOutOfScope) {
      skipped++;
    } else if (ra.state === "empty" || rb.state === "empty") {
      // Code on one side only is a real change, not an empty-vs-empty skip.
      const why = ra.state === "empty" ? "A has no runtime code, B does" : "B has no runtime code, A does";
      runtimeLines.push(`  ! ${pad(label, 62)} CODE PRESENCE — ${why}`);
      failures.push(`${label}: ${why}`);
      continue;
    } else {
      compared++;
      const same = ra.code === rb.code;
      // `declared` is the CBOR map itself; the block actually removed is declared + the 2-byte suffix.
      const meta =
        ra.declared === rb.declared
          ? `meta ${ra.declared}+2 B`
          : `meta ${ra.declared}+2 -> ${rb.declared}+2 B`;
      if (same) {
        identical++;
        if (!onlyDiff) {
          runtimeLines.push(`  = ${pad(label, 62)} ${pad(`runtime ${ra.codeBytes} B`, 20)} ${meta}`);
        }
      } else {
        differ++;
        const size =
          ra.codeBytes === rb.codeBytes
            ? `runtime ${ra.codeBytes} B`
            : `runtime ${ra.codeBytes} -> ${rb.codeBytes} B`;
        runtimeLines.push(`  ! ${pad(label, 62)} ${pad(size, 20)} ${meta}  DIFFERS`);
        failures.push(`${label}: stripped runtime code differs`);
      }
    }

    // ---- creation code, reported separately ----
    const ca = creationSide(ea, ra.block);
    const cb = creationSide(eb, rb.block);
    if (ca.state === "malformed" || cb.state === "malformed") {
      const why = [
        ca.state === "malformed" ? `A: ${ca.reason}` : null,
        cb.state === "malformed" ? `B: ${cb.reason}` : null,
      ]
        .filter(Boolean)
        .join("; ");
      creationLines.push(`  ? ${pad(label, 62)} MALFORMED — ${why}`);
      failures.push(`${label}: creation ${why}`);
      continue;
    }
    if (ca.state === "empty" && cb.state === "empty") continue;
    if (ca.state === "empty" || cb.state === "empty") {
      const why = ca.state === "empty" ? "A has no creation code, B does" : "B has no creation code, A does";
      creationLines.push(`  ! ${pad(label, 62)} CODE PRESENCE — ${why}`);
      failures.push(`${label}: creation ${why}`);
      continue;
    }
    creationCompared++;
    const note = ca.stripped && cb.stripped ? "" : "  [no metadata block found — compared whole]";
    if (ca.code === cb.code) {
      creationIdentical++;
      if (!onlyDiff) {
        creationLines.push(`  = ${pad(label, 62)} ${pad(`init+runtime ${ca.codeBytes} B`, 26)}${note}`);
      }
    } else {
      creationDiffer++;
      const size =
        ca.codeBytes === cb.codeBytes
          ? `init+runtime ${ca.codeBytes} B`
          : `init+runtime ${ca.codeBytes} -> ${cb.codeBytes} B`;
      creationLines.push(`  ! ${pad(label, 62)} ${pad(size, 26)} DIFFERS${note}`);
      if (strictCreation) failures.push(`${label}: stripped creation code differs`);
    }
  }

  console.log("=== RUNTIME (deployedBytecode, CBOR metadata stripped) ===");
  if (runtimeLines.length === 0) console.log("  (no per-contract lines)");
  for (const line of runtimeLines) console.log(line);

  console.log("");
  console.log("=== CREATION (bytecode, runtime metadata block spliced out) ===");
  if (creationLines.length === 0) console.log("  (no per-contract lines)");
  for (const line of creationLines) console.log(line);

  console.log("");
  console.log(
    `RUNTIME  compared ${compared} | identical ${identical} | differ ${differ}` +
      ` | skipped ${skipped} (no runtime code on either side)`
  );
  console.log(
    `CREATION compared ${creationCompared} | identical ${creationIdentical} | differ ${creationDiffer}` +
      (strictCreation ? " (gating: --strict-creation)" : " (reported only — init code embeds the runtime length)")
  );

  if (failures.length) {
    console.error("");
    console.error(`FAIL: ${failures.length} problem(s):`);
    for (const f of failures.slice(0, 50)) console.error(`  - ${f}`);
    if (failures.length > 50) console.error(`  ... and ${failures.length - 50} more`);
    process.exit(1);
  }

  console.log("");
  console.log("OK: every contract's stripped runtime code is IDENTICAL across both trees.");
  process.exit(0);
}

main();
