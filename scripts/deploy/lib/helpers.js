/**
 * Shared Deployment Utilities
 *
 * This file contains all shared helper functions used across deployment scripts.
 */

const hre = require("hardhat");
const { ethers } = require("hardhat");
const { getSingletonFactoryInfo } = require("@safe-global/safe-singleton-factory");
const fs = require("fs");
const path = require("path");

const {
  SINGLETON_FACTORY_ADDRESS,
  DEFAULT_MAX_INITCODE_BYTES,
  DEFAULT_MAX_RUNTIME_BYTES,
} = require("./constants");

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Sleep for a specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate byte length from hex string
 * @param {string} hex - Hex string
 * @returns {number} Byte length
 */
function hexByteLength(hex) {
  if (!hex) return 0;
  const s = String(hex);
  const normalized = s.startsWith("0x") ? s.slice(2) : s;
  return Math.floor(normalized.length / 2);
}

/**
 * Resolve the active tenant id from the TENANT_ID env var (spec 072).
 *
 * Returns null when no tenant is in scope — including TENANT_ID=fairwins,
 * because the default tenant IS the shared estate (unprefixed salts, records
 * at deployments/<network>-chain<id>-v2.json). With a non-default tenant set,
 * salts are tenant-prefixed and records live under deployments/tenants/<id>/,
 * yielding a deterministic, isolated address set per tenant on the same chain.
 *
 * The id is validated against the manifest id pattern; the id feeds CREATE2
 * salts, so it must never change once a tenant has deployed (see tenants/README.md).
 */
function activeTenantId() {
  const id = (process.env.TENANT_ID || "").trim();
  if (!id || id === "fairwins") return null;
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(id)) {
    throw new Error(
      `TENANT_ID "${id}" is invalid — must match ^[a-z][a-z0-9-]{1,30}$ (see tenants/README.md)`
    );
  }
  return id;
}

/**
 * Generate a deterministic salt from an identifier string.
 * When a tenant is in scope (TENANT_ID env), the salt is tenant-prefixed so
 * the tenant gets its own deterministic address set (spec 072, research D5).
 * @param {string} identifier - Salt identifier
 * @returns {string} 32-byte hex salt
 */
function generateSalt(identifier) {
  const tenant = activeTenantId();
  return ethers.id(tenant ? `tenant:${tenant}:${identifier}` : identifier);
}

// =============================================================================
// VERIFICATION HELPERS
// =============================================================================

/**
 * Check if error indicates contract is already verified
 */
function isLikelyAlreadyVerifiedError(message) {
  const m = (message || "").toLowerCase();
  return (
    m.includes("already verified") ||
    m.includes("contract source code already verified") ||
    m.includes("already been verified")
  );
}

/**
 * Check if error indicates contract is not yet indexed
 */
function isLikelyNotIndexedYetError(message) {
  const m = (message || "").toLowerCase();
  return (
    m.includes("contract not found") ||
    m.includes("unable to locate") ||
    m.includes("does not have bytecode") ||
    m.includes("doesn't have bytecode") ||
    m.includes("not verified") ||
    m.includes("unable to verify") ||
    m.includes("request failed") ||
    m.includes("timeout")
  );
}

/**
 * Get artifacts build-info directory path
 */
function getArtifactsBuildInfoDir() {
  const artifactsDir = hre?.config?.paths?.artifacts
    ? hre.config.paths.artifacts
    : path.join(process.cwd(), "artifacts");
  return path.join(artifactsDir, "build-info");
}

/**
 * Safely read JSON file
 */
function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Find build info file containing a specific contract
 */
function findBuildInfoContainingContract(contractName) {
  const buildInfoDir = getArtifactsBuildInfoDir();
  if (!fs.existsSync(buildInfoDir)) return null;

  const files = fs
    .readdirSync(buildInfoDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(buildInfoDir, f));

  files.sort((a, b) => {
    try {
      return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
    } catch {
      return 0;
    }
  });

  for (const file of files) {
    const buildInfo = safeReadJson(file);
    if (!buildInfo?.output?.contracts) continue;
    for (const sourceName of Object.keys(buildInfo.output.contracts)) {
      if (buildInfo.output.contracts[sourceName]?.[contractName]) {
        return { file, buildInfo };
      }
    }
  }
  return null;
}

/**
 * Export Solc Standard JSON input for manual Blockscout verification
 */
function exportSolcStandardJsonInput(contractName) {
  const found = findBuildInfoContainingContract(contractName);
  if (!found?.buildInfo?.input) return null;

  const outDir = path.join(process.cwd(), "blockscout");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, `${hre.network.name}-${contractName}-solc-input.json`);
  fs.writeFileSync(outPath, JSON.stringify(found.buildInfo.input, null, 2));
  return outPath;
}

/**
 * Verify contract on Blockscout
 * @param {Object} params - Verification parameters
 * @param {string} params.name - Contract name
 * @param {string} params.address - Contract address
 * @param {string} [params.contract] - Full contract path
 * @param {Array} [params.constructorArguments] - Constructor arguments
 * @returns {Object} Verification result
 */
async function verifyOnBlockscout({ name, address, contract, constructorArguments }) {
  const verifyEnabled = (process.env.VERIFY ?? "true").toLowerCase() !== "false";
  const verifyStrict = (process.env.VERIFY_STRICT ?? "false").toLowerCase() === "true";

  if (!verifyEnabled) {
    return { status: "skipped" };
  }

  const networkName = hre.network.name;
  if (networkName === "hardhat" || networkName === "localhost") {
    console.log(`  Skipping verification on local network: ${networkName}`);
    return { status: "skipped" };
  }

  const retries = Number(process.env.VERIFY_RETRIES ?? 6);
  const delayMs = Number(process.env.VERIFY_DELAY_MS ?? 20000);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await hre.run("verify:verify", {
        address,
        constructorArguments: constructorArguments ?? [],
        ...(contract ? { contract } : {}),
      });
      console.log(`  ✓ Verified on Blockscout: ${address}`);
      return { status: "verified" };
    } catch (error) {
      const message = error?.message || String(error);

      if (isLikelyAlreadyVerifiedError(message)) {
        console.log(`  ✓ Already verified: ${address}`);
        return { status: "verified" };
      }

      const shouldRetry = attempt < retries && isLikelyNotIndexedYetError(message);
      console.warn(`  ⚠️  Verify attempt ${attempt}/${retries} failed for ${address}`);
      console.warn(`      ${message.split("\n")[0]}`);

      if (!shouldRetry) {
        let solcInputPath = null;
        const dumpEnabled = (process.env.DUMP_SOLC_INPUT_ON_VERIFY_FAIL ?? "true").toLowerCase() !== "false";
        if (dumpEnabled && name) {
          try {
            const outPath = exportSolcStandardJsonInput(name);
            if (outPath) {
              solcInputPath = outPath;
              console.warn(`      Wrote solc Standard JSON input: ${outPath}`);
            }
          } catch (e) {
            console.warn(`      Failed to write solc input: ${e?.message || String(e)}`);
          }
        }

        if (verifyStrict) {
          throw error;
        }

        return {
          status: "failed",
          error: message.split("\n")[0],
          solcInputPath,
        };
      }
      await sleep(delayMs);
    }
  }

  return { status: "failed", error: "Verification failed after retries" };
}

// =============================================================================
// DEPLOYED-CODE IDENTITY  (spec 080 — T016 / T017, FR-008 / FR-009, G3)
// =============================================================================
//
// `getCode(addr) !== "0x"` answers "is something there", which is not the question a deterministic
// deployment has to answer. G3 names THREE outcomes, and the middle one is the only safe reason to
// skip a deployment:
//
//   address free                  -> deploy, then verify it landed as predicted
//   address holds OUR contract    -> recognised as already deployed, skipped, no transaction
//   address holds SOMETHING ELSE  -> incident: stop, do not proceed
//
// Deciding between the last two means comparing the code on chain against the artifact, and two
// regions legitimately differ there. Both are masked below; nothing else is.
//
//   1. The trailing CBOR metadata block. Its content is provenance (an IPFS hash of the sources),
//      not behaviour.
//   2. Immutable slots. solc ZERO-FILLS them in `deployedBytecode` and the constructor writes them
//      at deploy time, so the artifact never equals the chain for a contract that has any.
//      Measured, not assumed: VoucherBatchMinter carries 16 such 32-byte ranges, so a plain
//      comparison would report a false incident for it on every re-run.
//
// Anything undecidable fails CLOSED — reported as an incident with its own message — because the
// cost of a false incident is a loud stop an operator can read, and the cost of a false skip is a
// deployment silently not happening.
//
// KNOWN BOUNDARY, stated rather than papered over: masked ranges are excluded, not compared, so
// THE SAME contract compiled identically but constructed with DIFFERENT arguments classifies as a
// match. Measured directly — planting a MembershipVoucher built with other constructor arguments at
// the predicted address was accepted as "already deployed". That is sound here and only here: the
// address is CREATE2(factory, salt, keccak(initCode)) and initCode CONTAINS the constructor
// arguments, so a differently-constructed instance cannot occupy this address without a 160-bit
// collision. Do not lift this comparison to an address that is not initcode-committed — at a plain
// CREATE address it would not carry that argument.

/** Normalise a bytecode field to lowercase hex without `0x`. Any doubt is an error, never a guess. */
function normalizeCodeHex(value) {
  if (typeof value !== "string") return { ok: false, reason: "not a string" };
  const hex = (value.startsWith("0x") ? value.slice(2) : value).toLowerCase();
  if (hex === "") return { ok: true, hex: "", empty: true };
  if (!/^[0-9a-f]+$/.test(hex)) {
    return {
      ok: false,
      reason: hex.includes("__")
        ? "contains an unlinked library placeholder"
        : "contains non-hex characters",
    };
  }
  if (hex.length % 2 !== 0) return { ok: false, reason: "has an odd number of hex digits" };
  return { ok: true, hex, empty: false };
}

/**
 * Split the trailing solc CBOR metadata block off a runtime object.
 *
 * A deliberately MINIMAL mirror of `scripts/codegen/compare-stripped.js#splitMetadata` — that file
 * is a CLI that runs `main()` and calls `process.exit()` at import time, so requiring it here would
 * terminate the deploy script. It is not imported; it is re-derived.
 *
 * It is also minimal on purpose. compare-stripped.js fully PARSES the CBOR because it decides
 * whether two build trees are equivalent, where a lax strip produces a false "identical". Here the
 * fallback on any doubt is to strip NOTHING and compare the whole object, which can only make the
 * comparison stricter — the failure direction is a false incident (loud), never a false skip.
 */
function splitTrailingMetadata(hex) {
  const bytes = hex.length / 2;
  if (bytes < 3) return { code: hex, block: "", blockBytes: 0, stripped: false };
  const declared = parseInt(hex.slice(-4), 16);
  if (!Number.isFinite(declared)) return { code: hex, block: "", blockBytes: 0, stripped: false };
  const blockBytes = declared + 2;
  // The block must leave code behind; a block that is the whole object is not a metadata trailer.
  if (blockBytes >= bytes) return { code: hex, block: "", blockBytes: 0, stripped: false };
  const codeBytes = bytes - blockBytes;
  const header = parseInt(hex.slice(codeBytes * 2, codeBytes * 2 + 2), 16);
  // CBOR major type 5 (map): solc emits a1/a2/a3 here.
  if ((header & 0xe0) !== 0xa0) return { code: hex, block: "", blockBytes: 0, stripped: false };
  return {
    code: hex.slice(0, codeBytes * 2),
    block: hex.slice(codeBytes * 2),
    blockBytes,
    stripped: true,
  };
}

/** Flatten hardhat/solc `{ [key]: [{start,length}] }` reference maps into a byte-range list. */
function flattenRefs(refMap) {
  const ranges = [];
  for (const key of Object.keys(refMap || {})) {
    for (const r of refMap[key] || []) {
      if (Number.isInteger(r?.start) && Number.isInteger(r?.length)) {
        ranges.push({ start: r.start, length: r.length, key });
      }
    }
  }
  return ranges;
}

const immutableRefCache = new Map();

/**
 * Resolve the deployed-bytecode immutable ranges for a contract.
 *
 * Hardhat ARTIFACTS do not carry `immutableReferences` (measured: the artifact has exactly
 * `_format, contractName, sourceName, abi, bytecode, deployedBytecode, linkReferences,
 * deployedLinkReferences`) — build-info does. `artifacts.getBuildInfo` resolves the exact build-info
 * for this fully-qualified name via its `.dbg.json`, so this never has to guess between two
 * same-named contracts.
 *
 * Returns `{ ok:true, ranges }`, or `{ ok:false, reason }` when build-info is unavailable — which is
 * NOT treated as "there are no immutables", because that is the assumption that turns into a false
 * incident.
 */
async function deployedImmutableRanges(artifact) {
  const fqName = `${artifact.sourceName}:${artifact.contractName}`;
  if (immutableRefCache.has(fqName)) return immutableRefCache.get(fqName);

  let result;
  try {
    const buildInfo = await hre.artifacts.getBuildInfo(fqName);
    const compiled = buildInfo?.output?.contracts?.[artifact.sourceName]?.[artifact.contractName];
    if (!compiled) {
      result = { ok: false, reason: `build-info has no compiled output for ${fqName}` };
    } else {
      result = { ok: true, ranges: flattenRefs(compiled?.evm?.deployedBytecode?.immutableReferences) };
    }
  } catch (e) {
    result = { ok: false, reason: `build-info unreadable for ${fqName}: ${e?.message || String(e)}` };
  }
  immutableRefCache.set(fqName, result);
  return result;
}

/** Compare two equal-length hex strings, ignoring the given byte ranges. */
function diffOutsideMask(aHex, bHex, ranges) {
  const byteLen = aHex.length / 2;
  const masked = new Uint8Array(byteLen);
  for (const r of ranges) {
    const end = Math.min(r.start + r.length, byteLen);
    for (let i = Math.max(0, r.start); i < end; i++) masked[i] = 1;
  }
  const unmaskedDiffs = [];
  let maskedDiffs = 0;
  for (let i = 0; i < byteLen; i++) {
    if (aHex.charCodeAt(i * 2) === bHex.charCodeAt(i * 2) && aHex.charCodeAt(i * 2 + 1) === bHex.charCodeAt(i * 2 + 1)) {
      continue;
    }
    if (masked[i]) maskedDiffs++;
    else unmaskedDiffs.push(i);
  }
  return { unmaskedDiffs, maskedDiffs };
}

/**
 * Decide whether the runtime code at an address is the code this artifact produces.
 *
 * @returns {Promise<{state:'match'|'mismatch'|'indeterminate', summary:string, detail:string[]}>}
 */
async function classifyDeployedCode(artifact, onChainCode) {
  const detail = [];
  const label = artifact?.contractName || "the target contract";

  const chain = normalizeCodeHex(onChainCode);
  if (!chain.ok) return { state: "indeterminate", summary: `on-chain code ${chain.reason}`, detail };
  if (chain.empty) return { state: "indeterminate", summary: "no code at the address", detail };

  const artifactRaw = artifact?.deployedBytecode;
  if (typeof artifactRaw !== "string" || artifactRaw === "" || artifactRaw === "0x") {
    return {
      state: "indeterminate",
      summary: `no artifact deployedBytecode available for ${label} to compare against`,
      detail,
    };
  }

  // Unlinked library placeholders (`__$…$__`) are not hex. Zero them out and mask those ranges:
  // the artifact cannot know the library addresses, and the CREATE2 address already commits to the
  // linked initcode, so the linked libraries follow from the code matching everywhere else.
  const linkRanges = flattenRefs(artifact.deployedLinkReferences);
  let artifactHexRaw = artifactRaw.startsWith("0x") ? artifactRaw.slice(2) : artifactRaw;
  if (linkRanges.length) {
    const chars = artifactHexRaw.split("");
    for (const r of linkRanges) {
      for (let i = r.start * 2; i < (r.start + r.length) * 2 && i < chars.length; i++) chars[i] = "0";
    }
    artifactHexRaw = chars.join("");
    detail.push(`masked ${linkRanges.length} library link range(s)`);
  }

  const local = normalizeCodeHex(artifactHexRaw);
  if (!local.ok) {
    return {
      state: "indeterminate",
      summary: `the ${label} artifact deployedBytecode ${local.reason}`,
      detail,
    };
  }

  const onChain = splitTrailingMetadata(chain.hex);
  const expected = splitTrailingMetadata(local.hex);
  if (onChain.stripped !== expected.stripped) {
    detail.push(
      `metadata block: ${onChain.stripped ? `${onChain.blockBytes} B on chain` : "none recognised on chain"}, ` +
        `${expected.stripped ? `${expected.blockBytes} B in artifact` : "none recognised in artifact"}`
    );
  } else if (onChain.block !== expected.block) {
    detail.push(`metadata block differs (${onChain.blockBytes} B on chain vs ${expected.blockBytes} B in artifact)`);
  }

  if (onChain.code.length !== expected.code.length) {
    return {
      state: "mismatch",
      summary:
        `runtime code length differs — ${onChain.code.length / 2} bytes on chain vs ` +
        `${expected.code.length / 2} bytes for ${artifact.contractName}`,
      detail,
    };
  }

  const immutables = await deployedImmutableRanges(artifact);
  const maskRanges = [...linkRanges, ...(immutables.ok ? immutables.ranges : [])];
  const { unmaskedDiffs, maskedDiffs } = diffOutsideMask(onChain.code, expected.code, maskRanges);

  if (unmaskedDiffs.length === 0) {
    if (immutables.ok && immutables.ranges.length) {
      detail.push(
        `masked ${immutables.ranges.length} immutable range(s); ${maskedDiffs} byte(s) inside them ` +
          `differ, as expected for constructor-set immutables`
      );
    }
    return { state: "match", summary: `runtime code matches ${artifact.contractName}`, detail };
  }

  // Differences outside every known-variable region. If immutables could not be resolved we cannot
  // honestly call this a foreign contract — but we equally cannot call it ours, so it stops here.
  if (!immutables.ok) {
    detail.push(immutables.reason);
    return {
      state: "indeterminate",
      summary:
        `runtime code differs from ${artifact.contractName} in ${unmaskedDiffs.length} byte(s), and the ` +
        `immutable ranges could not be resolved, so the difference cannot be attributed`,
      detail,
    };
  }

  const shown = unmaskedDiffs.slice(0, 5).map((i) => `0x${i.toString(16)}`).join(", ");
  return {
    state: "mismatch",
    summary:
      `runtime code differs from ${artifact.contractName} in ${unmaskedDiffs.length} byte(s) outside ` +
      `every metadata/immutable/library region`,
    detail: [...detail, `first differing offset(s): ${shown}${unmaskedDiffs.length > 5 ? ", …" : ""}`],
  };
}

// =============================================================================
// DEPLOYMENT HELPERS
// =============================================================================

/**
 * Deploy a contract deterministically using Safe Singleton Factory
 * @param {string} contractName - Name of the contract to deploy
 * @param {Array} constructorArgs - Constructor arguments
 * @param {string} salt - Salt for deterministic deployment (32 bytes hex)
 * @param {Object} deployer - Ethers signer
 * @returns {Object} Contract instance, address, and deployment status
 */
async function deployDeterministic(contractName, constructorArgs, salt, deployer, options) {
  console.log(`\nDeploying ${contractName} deterministically...`);

  // Read the artifact once: it is the diagnostic source for the size log below AND the reference
  // the deployed code is checked against (T016/T017), so it is no longer a throw-away.
  let artifact = null;
  try {
    artifact = await hre.artifacts.readArtifact(contractName);
  } catch {
    // getContractFactory below fails with a better message if the artifact is genuinely missing.
  }

  // Diagnostics: show runtime code size
  try {
    const runtimeBytes = hexByteLength(artifact?.deployedBytecode);
    const maxRuntimeBytes = Number(process.env.MAX_RUNTIME_BYTES ?? DEFAULT_MAX_RUNTIME_BYTES);
    if (runtimeBytes > 0) {
      const warn = Number.isFinite(maxRuntimeBytes) && runtimeBytes > maxRuntimeBytes;
      console.log(
        `  Runtime code size: ${runtimeBytes} bytes` +
        (Number.isFinite(maxRuntimeBytes) ? ` (limit: ${maxRuntimeBytes})` : "") +
        (warn ? " ⚠️ exceeds EIP-170" : "")
      );
    }
  } catch {
    // ignore if artifact isn't readable
  }

  // Get contract factory (with optional library linking)
  const factoryOpts = options?.libraries ? { libraries: options.libraries } : {};
  const ContractFactory = await ethers.getContractFactory(contractName, { ...factoryOpts, signer: deployer });

  // Get deployment bytecode
  const deployTx = await ContractFactory.getDeployTransaction(...constructorArgs);
  const deploymentData = deployTx?.data;
  if (!deploymentData) {
    throw new Error(
      `Failed to build initCode for ${contractName}. ` +
      `Check the contract is compiled and has no unlinked libraries.`
    );
  }

  // Check initcode size (EIP-3860)
  const initCodeBytes = hexByteLength(deploymentData);
  const maxInitCodeBytes = Number(process.env.MAX_INITCODE_BYTES ?? DEFAULT_MAX_INITCODE_BYTES);
  console.log(`  Initcode size: ${initCodeBytes} bytes (limit: ${maxInitCodeBytes})`);

  if (Number.isFinite(maxInitCodeBytes) && initCodeBytes > maxInitCodeBytes) {
    throw new Error(
      `${contractName} initcode is too large (${initCodeBytes} bytes > ${maxInitCodeBytes}). ` +
      `CREATE2 will fail on Shanghai+ networks.`
    );
  }

  // Compute deterministic address
  const initCodeHash = ethers.keccak256(deploymentData);
  const deterministicAddress = ethers.getCreate2Address(
    SINGLETON_FACTORY_ADDRESS,
    salt,
    initCodeHash
  );

  console.log(`  Predicted address: ${deterministicAddress}`);

  // ---------------------------------------------------------------------------------------------
  // T018 / FR-010 / G3 — the deployment facility must exist BEFORE anything is sent.
  //
  // The predicted address above is derived from the Safe Singleton Factory's address. If that
  // factory has no code on this chain, the address is a fiction: a transaction to it is a plain
  // value transfer to an account with no code, which SUCCEEDS and deploys nothing. So this is
  // checked before the occupancy check and before any transaction, and it never falls back.
  // ---------------------------------------------------------------------------------------------
  await ensureSingletonFactory({ quiet: true });

  // ---------------------------------------------------------------------------------------------
  // T017 / FR-009 / G3 — three states at the predicted address, not two.
  // ---------------------------------------------------------------------------------------------
  const existingCode = await ethers.provider.getCode(deterministicAddress);
  if (existingCode !== "0x") {
    const verdict = await classifyDeployedCode(artifact, existingCode);
    for (const line of verdict.detail) console.log(`    ${line}`);

    if (verdict.state === "match") {
      console.log(`  ✓ Contract already deployed at this address (${verdict.summary}) — skipping, no transaction`);
      return {
        address: deterministicAddress,
        contract: ContractFactory.attach(deterministicAddress),
        alreadyDeployed: true,
        codeVerified: true,
      };
    }

    const network = await ethers.provider.getNetwork();
    throw new Error(
      `INCIDENT — ${deterministicAddress} is occupied by something that is not ${contractName}.\n` +
        `  chain:    ${hre.network.name} (chainId ${network.chainId})\n` +
        `  address:  ${deterministicAddress}\n` +
        `  salt:     ${salt}\n` +
        `  verdict:  ${verdict.state} — ${verdict.summary}\n` +
        (verdict.detail.length ? `  detail:   ${verdict.detail.join("; ")}\n` : "") +
        `  on-chain runtime: ${hexByteLength(existingCode)} bytes\n` +
        `\n` +
        `Deployment STOPPED. This address is CREATE2-derived from the factory, this salt and this ` +
        `initcode, so foreign code here means one of those three inputs is not what this script ` +
        `thinks it is. Do NOT redeploy around it: identify what is at the address first ` +
        (verdict.state === "indeterminate"
          ? `(a stale or partial artifact tree also lands here — re-run \`npm run compile\` and retry ` +
            `before concluding anything)`
          : `(explorer, or \`eth_getCode\` against a second RPC)`) +
        `.`
    );
  }

  // Deploy using Safe Singleton Factory
  console.log(`  Deploying via Safe Singleton Factory...`);
  const txData = ethers.concat([salt, deploymentData]);

  // Estimate gas with buffer
  let gasLimit;
  try {
    const estimatedGas = await ethers.provider.estimateGas({
      from: deployer.address,
      to: SINGLETON_FACTORY_ADDRESS,
      data: txData,
    });

    const bufferPct = BigInt(Number(process.env.GAS_BUFFER_PCT ?? 120));
    const latestBlock = await ethers.provider.getBlock("latest");
    const blockGasLimit = latestBlock?.gasLimit;

    let buffered = (estimatedGas * bufferPct) / 100n;
    if (buffered < estimatedGas) buffered = estimatedGas;

    if (blockGasLimit) {
      const capPct = BigInt(Number(process.env.GAS_CAP_PCT ?? 95));
      const cap = (blockGasLimit * capPct) / 100n;
      if (buffered > cap) {
        console.warn(`  ⚠️  Clamping gas to block limit cap: ${cap.toString()}`);
        buffered = cap;
      }
    }

    gasLimit = buffered;
    console.log(`  Estimated gas: ${estimatedGas.toString()} (using ${gasLimit.toString()})`);
  } catch (error) {
    // Fallback gas limit - use reasonable defaults that work on most networks
    // Hardhat localhost has a very high block gas limit (60M+) but a transaction
    // cap of 16,777,216 by default, so we cap at 15M to be safe
    const MAX_FALLBACK_GAS = 15_000_000n;
    const latestBlock = await ethers.provider.getBlock("latest");
    const blockGasLimit = latestBlock?.gasLimit;

    if (blockGasLimit) {
      const blockCap = (blockGasLimit * 95n) / 100n;
      gasLimit = blockCap < MAX_FALLBACK_GAS ? blockCap : MAX_FALLBACK_GAS;
    } else {
      gasLimit = 7_500_000n;
    }
    console.warn(`  ⚠️  Gas estimation failed; using fallback=${gasLimit.toString()}`);
  }

  // Send deployment transaction
  const tx = await deployer.sendTransaction({
    to: SINGLETON_FACTORY_ADDRESS,
    data: txData,
    gasLimit,
  });

  const receipt = await tx.wait();
  if (receipt && receipt.status === 0) {
    throw new Error(`Deployment transaction reverted: ${receipt.hash}`);
  }
  console.log(`  ✓ Deployed in tx: ${receipt.hash}`);
  console.log(`  ✓ Gas used: ${receipt.gasUsed.toString()}`);

  // ---------------------------------------------------------------------------------------------
  // T016 / FR-008 — verify it landed at the PREDICTED address, and that what landed is ours.
  //
  // Poll rather than read once: a load-balanced RPC can serve the receipt from a node that has the
  // block and then serve `getCode` from one that does not yet, so a single read can report "no code"
  // for a deployment that in fact succeeded. Seen on Base, where it aborted a multi-contract run
  // midway and left the deployment record unwritten for a live contract.
  //
  // "Some code exists" is NOT the check. A successful receipt proves the factory call did not
  // revert; it does not prove the contract is at the address this script is about to record. The
  // code found there is classified against the artifact, exactly as on the skip path.
  // ---------------------------------------------------------------------------------------------
  let deployedCode = "0x";
  for (let attempt = 0; attempt < 10; attempt++) {
    deployedCode = await ethers.provider.getCode(deterministicAddress);
    if (deployedCode !== "0x") break;
    if (attempt === 0) console.log("  … code not visible yet; waiting for the RPC to catch up");
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (deployedCode === "0x") {
    throw new Error(
      `Deployment failed - no code at the predicted address ${deterministicAddress} after ${receipt.hash} ` +
        `(status ${receipt.status}). If the receipt succeeded, re-check the address on an explorer ` +
        `before redeploying.`,
    );
  }

  const landed = await classifyDeployedCode(artifact, deployedCode);
  if (landed.state !== "match") {
    const network = await ethers.provider.getNetwork();
    throw new Error(
      `INCIDENT — ${contractName} did not land as predicted.\n` +
        `  chain:    ${hre.network.name} (chainId ${network.chainId})\n` +
        `  expected: ${deterministicAddress}\n` +
        `  salt:     ${salt}\n` +
        `  tx:       ${receipt.hash}\n` +
        `  verdict:  ${landed.state} — ${landed.summary}\n` +
        (landed.detail.length ? `  detail:   ${landed.detail.join("; ")}\n` : "") +
        `\n` +
        `The transaction succeeded but the code at the predicted address is not this contract's. ` +
        `Do NOT record this address. Establish what the factory actually created (trace the tx) ` +
        `before any further deployment on this chain.`
    );
  }
  for (const line of landed.detail) console.log(`    ${line}`);
  console.log(`  ✓ Verified at predicted address ${deterministicAddress} (${landed.summary})`);

  return {
    address: deterministicAddress,
    contract: ContractFactory.attach(deterministicAddress),
    alreadyDeployed: false,
    codeVerified: true,
  };
}

// Chains whose factory has already been reported present in this process. Only the LOG is
// suppressed — the `getCode` check itself always runs, so a chain reset mid-script is still caught.
const singletonFactoryReported = new Set();

/**
 * Ensure Safe Singleton Factory is available on the network.
 *
 * Auto-deploys on local networks (from the project's presigned transaction, so the factory lands at
 * the SAME address there as everywhere else — that is not a fallback, it is the same facility).
 * On any other network an absent factory is fatal: see the error text below for why there is
 * deliberately no alternative path (T018 / FR-010 / G3).
 *
 * @param {{quiet?: boolean}} [opts] - `quiet` suppresses the success line for per-contract callers.
 */
async function ensureSingletonFactory(opts = {}) {
  const quiet = Boolean(opts.quiet);
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const factoryInfo = getSingletonFactoryInfo(chainId);

  if (!factoryInfo && !singletonFactoryReported.has(chainId)) {
    console.warn(`⚠️  Safe Singleton Factory info not found for chain ${chainId}`);
  }

  let factoryCode = await ethers.provider.getCode(SINGLETON_FACTORY_ADDRESS);
  if (factoryCode === "0x") {
    const isLocal = hre.network.name === "hardhat" || hre.network.name === "localhost";

    if (isLocal && factoryInfo?.transaction && factoryInfo?.signerAddress) {
      console.log("⚠️  Safe Singleton Factory not present; deploying for local session...");

      try {
        await hre.network.provider.send("hardhat_setBalance", [
          factoryInfo.signerAddress,
          "0x3635C9ADC5DEA00000", // 1000 ETH
        ]);
      } catch {
        // ignore if not supported
      }

      try {
        const txHash = await hre.network.provider.send("eth_sendRawTransaction", [factoryInfo.transaction]);
        const timeoutMs = Number(process.env.FACTORY_DEPLOY_TIMEOUT_MS ?? 60000);
        const start = Date.now();

        while (true) {
          const receipt = await ethers.provider.getTransactionReceipt(txHash);
          if (receipt) {
            if (receipt.status === 0n || receipt.status === 0) {
              throw new Error(`Factory deployment tx reverted: ${txHash}`);
            }
            break;
          }
          if (Date.now() - start > timeoutMs) {
            throw new Error(`Timed out waiting for factory deployment: ${txHash}`);
          }
          await sleep(250);
        }
      } catch (e) {
        throw new Error(`Failed to deploy Safe Singleton Factory: ${e?.message || String(e)}`);
      }

      factoryCode = await ethers.provider.getCode(SINGLETON_FACTORY_ADDRESS);
    }

    if (factoryCode === "0x") {
      throw new Error(
        `Safe Singleton Factory is NOT deployed on this chain — deployment stopped before ` +
          `any transaction was sent.\n` +
          `  chain:   ${hre.network.name} (chainId ${chainId})\n` +
          `  factory: ${SINGLETON_FACTORY_ADDRESS} (no code)\n` +
          (factoryInfo
            ? `  A presigned deployment transaction EXISTS for this chain in ` +
              `@safe-global/safe-singleton-factory (signer ${factoryInfo.signerAddress}). Fund that ` +
              `signer and broadcast \`factoryInfo.transaction\`, then re-run.\n`
            : `  @safe-global/safe-singleton-factory has no presigned transaction for chain ${chainId}. ` +
              `Request one upstream (github.com/safe-global/safe-singleton-factory) before deploying here.\n`) +
          `\n` +
          `There is deliberately NO fallback to a plain (nonce-based) deployment. A fallback would ` +
          `produce a working contract at an address nobody predicted, on one chain only, and it ` +
          `would look exactly like success — which is the drift this deployment path exists to end.`
      );
    }
  }

  if (!quiet && !singletonFactoryReported.has(chainId)) {
    console.log("✓ Safe Singleton Factory verified");
  }
  singletonFactoryReported.add(chainId);
  return SINGLETON_FACTORY_ADDRESS;
}

// =============================================================================
// CONTRACT INITIALIZATION HELPERS
// =============================================================================

/**
 * Try to initialize a contract if it has an initialize function
 */
async function tryInitialize(name, contract, deployer) {
  if (!contract || typeof contract.initialize !== "function") return;
  try {
    const tx = await contract.initialize(deployer.address);
    await tx.wait();
    console.log(`  ✓ ${name} initialized`);
  } catch (error) {
    const message = error?.message || String(error);
    if (!message.includes("Already initialized") && !message.includes("Initializable:")) {
      console.warn(`  ⚠️  ${name} initialize skipped: ${message.split("\n")[0]}`);
    } else {
      console.log(`  ✓ ${name} already initialized`);
    }
  }
}

/**
 * Try to set role manager on a contract
 */
async function trySetRoleManager(name, contract, roleManagerAddress) {
  if (!contract || typeof contract.setRoleManager !== "function") return;

  try {
    if (typeof contract.roleManager === "function") {
      const current = await contract.roleManager();
      if (String(current).toLowerCase() !== "0x0000000000000000000000000000000000000000") {
        console.log(`  ✓ ${name} roleManager already set (${current})`);
        return;
      }
    }
  } catch {
    // ignore
  }

  try {
    const tx = await contract.setRoleManager(roleManagerAddress);
    await tx.wait();
    console.log(`  ✓ ${name} roleManager set to ${roleManagerAddress}`);
  } catch (error) {
    const message = error?.message || String(error);
    console.warn(`  ⚠️  ${name} setRoleManager skipped: ${message.split("\n")[0]}`);
  }
}

/**
 * Safely transfer ownership if contract is owned by expected address
 */
async function safeTransferOwnership(name, contract, from, to) {
  if (!contract || typeof contract.transferOwnership !== "function") return;
  if (typeof contract.owner !== "function") return;

  try {
    const currentOwner = await contract.owner();
    if (String(currentOwner).toLowerCase() === String(to).toLowerCase()) {
      console.log(`  ✓ ${name} ownership already transferred`);
      return;
    }
    if (String(currentOwner).toLowerCase() !== String(from).toLowerCase()) {
      console.warn(`  ⚠️  ${name} owner is ${currentOwner}; expected ${from}. Skipping.`);
      return;
    }
    const tx = await contract.transferOwnership(to);
    await tx.wait();
    console.log(`  ✓ ${name} ownership transferred to ${to}`);
  } catch (error) {
    const message = error?.message || String(error);
    console.warn(`  ⚠️  ${name} transferOwnership failed: ${message.split("\n")[0]}`);
  }
}

// =============================================================================
// DEPLOYMENT FILE HELPERS
// =============================================================================

/**
 * Resolve the deployments directory for the current scope: the shared estate
 * lives in deployments/, a tenant's dedicated estate under
 * deployments/tenants/<id>/ with the SAME record schema (spec 072).
 */
function deploymentsDirForScope() {
  const base = path.join(process.cwd(), "deployments");
  const tenant = activeTenantId();
  return tenant ? path.join(base, "tenants", tenant) : base;
}

/**
 * Save deployment information to JSON file
 */
function saveDeployment(filename, deploymentInfo) {
  const deploymentsDir = deploymentsDirForScope();
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  const outPath = path.join(deploymentsDir, filename);
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment JSON saved to: ${outPath}`);
  return outPath;
}

/**
 * Load deployment information from JSON file
 */
function loadDeployment(filename) {
  const deploymentsDir = deploymentsDirForScope();
  const filePath = path.join(deploymentsDir, filename);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/**
 * Get deployment filename for network
 */
function getDeploymentFilename(network, suffix = "deployment") {
  const chainId = network.chainId ? Number(network.chainId) : "unknown";
  return `${hre.network.name}-chain${chainId}-${suffix}.json`;
}

// =============================================================================
// TIER CONFIGURATION HELPER
// =============================================================================

/**
 * Configure a tier on TieredRoleManager
 */
async function configureTier(contract, role, tierConfig, roleLabel) {
  const tierNames = ["NONE", "BRONZE", "SILVER", "GOLD", "PLATINUM"];
  const tierName = tierNames[tierConfig.tier];

  console.log(`  Setting ${roleLabel} ${tierName} tier...`);

  const limitsArray = [
    tierConfig.limits.dailyBetLimit,
    tierConfig.limits.weeklyBetLimit,
    tierConfig.limits.monthlyMarketCreation,
    tierConfig.limits.maxPositionSize,
    tierConfig.limits.maxConcurrentMarkets,
    tierConfig.limits.withdrawalLimit,
    tierConfig.limits.canCreatePrivateMarkets,
    tierConfig.limits.canUseAdvancedFeatures,
    tierConfig.limits.feeDiscount
  ];

  try {
    const tx = await contract.setTierMetadata(
      role,
      tierConfig.tier,
      tierConfig.name,
      tierConfig.description,
      tierConfig.price,
      limitsArray,
      true  // isActive
    );
    await tx.wait();
    console.log(`    ✓ ${tierName} configured`);
    return true;
  } catch (error) {
    const message = error?.message || String(error);
    console.warn(`    ⚠️  ${tierName} configuration failed: ${message.split("\n")[0]}`);
    return false;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Utilities
  sleep,
  hexByteLength,
  generateSalt,
  activeTenantId,

  // Verification
  verifyOnBlockscout,
  exportSolcStandardJsonInput,
  isLikelyAlreadyVerifiedError,
  isLikelyNotIndexedYetError,

  // Deployment
  deployDeterministic,
  ensureSingletonFactory,
  classifyDeployedCode,
  splitTrailingMetadata,

  // Initialization
  tryInitialize,
  trySetRoleManager,
  safeTransferOwnership,

  // Files
  saveDeployment,
  loadDeployment,
  getDeploymentFilename,

  // Configuration
  configureTier,
};
