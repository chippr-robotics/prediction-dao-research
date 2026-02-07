/**
 * Shared Deployment Utilities
 *
 * This file contains all shared helper functions used across deployment scripts.
 */

import hre from "hardhat";
const { ethers } = hre;
import { getSingletonFactoryInfo } from "@safe-global/safe-singleton-factory";
import fs from "fs";
import path from "path";

import {
  SINGLETON_FACTORY_ADDRESS,
  DEFAULT_MAX_INITCODE_BYTES,
  DEFAULT_MAX_RUNTIME_BYTES,
} from "./constants.js";

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Sleep for a specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate byte length from hex string
 * @param {string} hex - Hex string
 * @returns {number} Byte length
 */
export function hexByteLength(hex) {
  if (!hex) return 0;
  const s = String(hex);
  const normalized = s.startsWith("0x") ? s.slice(2) : s;
  return Math.floor(normalized.length / 2);
}

/**
 * Generate a deterministic salt from an identifier string
 * @param {string} identifier - Salt identifier
 * @returns {string} 32-byte hex salt
 */
export function generateSalt(identifier) {
  return ethers.id(identifier);
}

// =============================================================================
// VERIFICATION HELPERS
// =============================================================================

/**
 * Check if error indicates contract is already verified
 */
export function isLikelyAlreadyVerifiedError(message) {
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
export function isLikelyNotIndexedYetError(message) {
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
export function exportSolcStandardJsonInput(contractName) {
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
export async function verifyOnBlockscout({ name, address, contract, constructorArguments }) {
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
export async function deployDeterministic(contractName, constructorArgs, salt, deployer) {
  console.log(`\nDeploying ${contractName} deterministically...`);

  // Diagnostics: show runtime code size
  try {
    const artifact = await hre.artifacts.readArtifact(contractName);
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

  // Get contract factory
  const ContractFactory = await ethers.getContractFactory(contractName, deployer);

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

  // Check if contract is already deployed
  const existingCode = await ethers.provider.getCode(deterministicAddress);
  if (existingCode !== "0x") {
    console.log(`  ✓ Contract already deployed at this address`);
    return {
      address: deterministicAddress,
      contract: ContractFactory.attach(deterministicAddress),
      alreadyDeployed: true
    };
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

  // Verify deployment
  const deployedCode = await ethers.provider.getCode(deterministicAddress);
  if (deployedCode === "0x") {
    throw new Error("Deployment failed - no code at expected address");
  }

  return {
    address: deterministicAddress,
    contract: ContractFactory.attach(deterministicAddress),
    alreadyDeployed: false
  };
}

/**
 * Ensure Safe Singleton Factory is available on the network
 * Auto-deploys on local networks if needed
 */
export async function ensureSingletonFactory() {
  const network = await ethers.provider.getNetwork();
  const factoryInfo = getSingletonFactoryInfo(Number(network.chainId));

  if (!factoryInfo) {
    console.warn(`⚠️  Safe Singleton Factory info not found for chain ${network.chainId}`);
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
        `Safe Singleton Factory not deployed at ${SINGLETON_FACTORY_ADDRESS}. ` +
        `Please deploy the factory first or use a different deployment method.`
      );
    }
  }

  console.log("✓ Safe Singleton Factory verified");
  return SINGLETON_FACTORY_ADDRESS;
}

// =============================================================================
// CONTRACT INITIALIZATION HELPERS
// =============================================================================

/**
 * Try to initialize a contract if it has an initialize function
 */
export async function tryInitialize(name, contract, deployer) {
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
export async function trySetRoleManager(name, contract, roleManagerAddress) {
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
export async function safeTransferOwnership(name, contract, from, to) {
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
 * Save deployment information to JSON file
 */
export function saveDeployment(filename, deploymentInfo) {
  const deploymentsDir = path.join(process.cwd(), "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  const outPath = path.join(deploymentsDir, filename);
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment JSON saved to: ${outPath}`);
  return outPath;
}

/**
 * Load deployment information from JSON file
 */
export function loadDeployment(filename) {
  const deploymentsDir = path.join(process.cwd(), "deployments");
  const filePath = path.join(deploymentsDir, filename);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/**
 * Get deployment filename for network
 */
export function getDeploymentFilename(network, suffix = "deployment") {
  const chainId = network.chainId ? Number(network.chainId) : "unknown";
  return `${hre.network.name}-chain${chainId}-${suffix}.json`;
}

// =============================================================================
// TIER CONFIGURATION HELPER
// =============================================================================

/**
 * Configure a tier on TieredRoleManager
 */
export async function configureTier(contract, role, tierConfig, roleLabel) {
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
