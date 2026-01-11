const hre = require("hardhat");
const { ethers } = require("hardhat");
const { getSingletonFactoryInfo } = require("@safe-global/safe-singleton-factory");
const fs = require("fs");
const path = require("path");

// Safe Singleton Factory address (same on all EVM networks)
const SINGLETON_FACTORY_ADDRESS = "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hexByteLength(hex) {
  if (!hex) return 0;
  const s = String(hex);
  const normalized = s.startsWith("0x") ? s.slice(2) : s;
  return Math.floor(normalized.length / 2);
}

// EIP-3860 (Shanghai) limits initcode size to 49152 bytes.
// If initcode exceeds this, CREATE/CREATE2 fails (often with no revert data).
const DEFAULT_MAX_INITCODE_BYTES = 49_152;

// EIP-170 limits deployed/runtime code size to 24,576 bytes.
const DEFAULT_MAX_RUNTIME_BYTES = 24_576;

function isLikelyAlreadyVerifiedError(message) {
  const m = (message || "").toLowerCase();
  return (
    m.includes("already verified") ||
    m.includes("contract source code already verified") ||
    m.includes("already been verified")
  );
}

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

function getArtifactsBuildInfoDir() {
  // Prefer Hardhat-configured artifacts dir, fallback to ./artifacts
  const artifactsDir = hre?.config?.paths?.artifacts
    ? hre.config.paths.artifacts
    : path.join(process.cwd(), "artifacts");
  return path.join(artifactsDir, "build-info");
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function findBuildInfoContainingContract(contractName) {
  const buildInfoDir = getArtifactsBuildInfoDir();
  if (!fs.existsSync(buildInfoDir)) return null;

  const files = fs
    .readdirSync(buildInfoDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(buildInfoDir, f));

  // Newest first
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

function exportSolcStandardJsonInput(contractName) {
  const found = findBuildInfoContainingContract(contractName);
  if (!found?.buildInfo?.input) return null;

  const outDir = path.join(process.cwd(), "blockscout");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, `${hre.network.name}-${contractName}-solc-input.json`);
  fs.writeFileSync(outPath, JSON.stringify(found.buildInfo.input, null, 2));
  return outPath;
}

async function verifyOnBlockscout({ name, address, contract, constructorArguments }) {
  const verifyEnabled = (process.env.VERIFY ?? "true").toLowerCase() !== "false";
  const verifyStrict = (process.env.VERIFY_STRICT ?? "false").toLowerCase() === "true";
  if (!verifyEnabled) {
    return { status: "skipped" };
  }

  const networkName = hre.network.name;
  if (networkName === "hardhat" || networkName === "localhost") {
    console.log(`Skipping verification on local network: ${networkName}`);
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
              console.warn(`      Wrote solc Standard JSON input for manual Blockscout upload:`);
              console.warn(`      ${outPath}`);
              console.warn(`      (In Blockscout UI: verify -> Solidity (Standard JSON input))`);
            } else {
              console.warn(`      Could not locate build-info for ${name}; run 'npx hardhat compile' first.`);
            }
          } catch (e) {
            console.warn(`      Failed to write solc input snapshot: ${e?.message || String(e)}`);
          }
        }

        if (verifyStrict) {
          throw error;
        }

        console.warn(`      (Continuing deployment; set VERIFY_STRICT=true to hard-fail on verification errors)`);
        return {
          status: "failed",
          error: message.split("\n")[0],
          solcInputPath,
        };
      }
      await sleep(delayMs);
    }
  }

  // Should be unreachable due to loop logic, but keep a safe return.
  return { status: "failed", error: "Verification failed after retries" };
}

async function tryInitializeIfPresent({ name, contract, deployer }) {
  const initEnabled = (process.env.INIT ?? "true").toLowerCase() !== "false";
  if (!initEnabled) return;

  if (!contract || typeof contract.initialize !== "function") return;

  try {
    const tx = await contract.initialize(deployer.address);
    await tx.wait();
    console.log(`  ✓ ${name} initialized (owner set to ${deployer.address})`);
  } catch (error) {
    const message = error?.message || String(error);
    // If already initialized or initialize doesn't apply, don't hard-fail.
    console.warn(`  ⚠️  ${name} initialize skipped: ${message.split("\n")[0]}`);
  }
}

async function safeTransferOwnership({ name, contract, from, to }) {
  try {
    if (!contract || typeof contract.owner !== "function") {
      console.warn(`  ⚠️  ${name} has no owner(); skipping transfer`);
      return;
    }
    const currentOwner = await contract.owner();
    if (currentOwner.toLowerCase() !== from.toLowerCase()) {
      console.warn(`  ⚠️  ${name} owner is ${currentOwner}; expected ${from}. Skipping transfer.`);
      return;
    }
    const tx = await contract.transferOwnership(to);
    await tx.wait();
    console.log("  ✓ Ownership transferred");
  } catch (error) {
    const message = error?.message || String(error);
    console.warn(`  ⚠️  ${name} transferOwnership failed (continuing): ${message.split("\n")[0]}`);
  }
}

/**
 * Deploy a contract deterministically using Safe Singleton Factory
 * @param {string} contractName - Name of the contract to deploy
 * @param {Array} constructorArgs - Constructor arguments
 * @param {string} salt - Salt for deterministic deployment (32 bytes hex)
 * @param {Object} deployer - Ethers signer
 * @returns {Object} Contract instance and address
 */
async function deployDeterministic(contractName, constructorArgs, salt, deployer) {
  console.log(`\nDeploying ${contractName} deterministically...`);

  // Diagnostics: show sizes that commonly cause CREATE2 failures.
  try {
    const artifact = await hre.artifacts.readArtifact(contractName);
    const runtimeBytes = hexByteLength(artifact?.deployedBytecode);
    const maxRuntimeBytes = Number(process.env.MAX_RUNTIME_BYTES ?? DEFAULT_MAX_RUNTIME_BYTES);
    if (runtimeBytes > 0) {
      const warn = Number.isFinite(maxRuntimeBytes) && runtimeBytes > maxRuntimeBytes;
      console.log(
        `  Runtime code size: ${runtimeBytes} bytes` +
          (Number.isFinite(maxRuntimeBytes) ? ` (MAX_RUNTIME_BYTES=${maxRuntimeBytes})` : "") +
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
        `Hardhat/ethers returned empty deployment data; ` +
        `check the contract is compiled and has no unlinked libraries.`
    );
  }

  // Preflight: initcode size limit (EIP-3860). This is a common cause of
  // silent CREATE2 failures when deploying large factory-style contracts.
  const initCodeBytes = hexByteLength(deploymentData);
  const maxInitCodeBytes = Number(process.env.MAX_INITCODE_BYTES ?? DEFAULT_MAX_INITCODE_BYTES);
  console.log(
    `  Initcode size: ${initCodeBytes} bytes` +
      (Number.isFinite(maxInitCodeBytes) ? ` (MAX_INITCODE_BYTES=${maxInitCodeBytes})` : "")
  );
  if (Number.isFinite(maxInitCodeBytes) && initCodeBytes > maxInitCodeBytes) {
    throw new Error(
      `${contractName} initcode is too large (${initCodeBytes} bytes > ${maxInitCodeBytes}). ` +
        `On Shanghai+ networks (including most public chains), CREATE2 will fail. ` +
        `Fix by reducing initcode size (e.g. split contracts / use minimal proxies).`
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

  // Deploy using the Safe Singleton Factory.
  // IMPORTANT: The factory expects calldata formatted as:
  //   bytes32 salt || initCode
  // (no ABI function selector).
  console.log(`  Deploying via Safe Singleton Factory...`);

  const txData = ethers.concat([salt, deploymentData]);

  // Estimate gas and add 20% buffer for safety
  let gasLimit;
  try {
    const estimatedGas = await ethers.provider.estimateGas({
      from: deployer.address,
      to: SINGLETON_FACTORY_ADDRESS,
      data: txData,
    });

    // Add buffer, but never exceed the block gas limit.
    // IMPORTANT: don't clamp below estimateGas; if estimateGas itself is near the
    // block limit, deploying on this chain may be impossible.
    const bufferPct = BigInt(Number(process.env.GAS_BUFFER_PCT ?? 110));
    const latestBlock = await ethers.provider.getBlock("latest");
    const blockGasLimit = latestBlock?.gasLimit;

    let buffered = (estimatedGas * bufferPct) / 100n;
    if (buffered < estimatedGas) buffered = estimatedGas;

    if (blockGasLimit) {
      const capPct = BigInt(Number(process.env.GAS_CAP_PCT ?? 99));
      const cap = (blockGasLimit * capPct) / 100n;

      if (estimatedGas > cap) {
        console.warn(
          `  ⚠️  estimateGas (${estimatedGas.toString()}) exceeds cap=${cap.toString()} (blockGasLimit=${blockGasLimit.toString()}). ` +
            `This deployment likely cannot fit in a single block on this network.`
        );
      }

      if (buffered > cap) {
        console.warn(
          `  ⚠️  Buffered gas (${buffered.toString()}) exceeds cap=${cap.toString()} (blockGasLimit=${blockGasLimit.toString()}); clamping.`
        );
        buffered = cap;
      }
    }

    gasLimit = buffered;
    console.log(`  Estimated gas: ${estimatedGas.toString()} (using ${gasLimit.toString()} with buffer+cap)`);
  } catch (error) {
    const latestBlock = await ethers.provider.getBlock("latest");
    const blockGasLimit = latestBlock?.gasLimit;
    const message = error?.message || String(error);

    // Best-effort staticcall for more context (some RPCs include additional detail).
    try {
      await ethers.provider.call({
        from: deployer.address,
        to: SINGLETON_FACTORY_ADDRESS,
        data: txData,
      });
    } catch (callErr) {
      const callMsg = callErr?.message || String(callErr);
      console.warn(`  ⚠️  eth_call simulation also failed: ${callMsg.split("\n")[0]}`);
    }

    console.warn(
      `  ℹ️  ${contractName} initcode size: ${initCodeBytes} bytes (MAX_INITCODE_BYTES=${maxInitCodeBytes})`
    );

    // If estimation fails (common on some RPCs / with large initCode), fall back
    // to a near-block gas limit so we don't accidentally OOG.
    if (blockGasLimit) {
      gasLimit = (blockGasLimit * 95n) / 100n;
      console.warn(
        `  ⚠️  Gas estimation failed; using cap=${gasLimit.toString()} blockGasLimit=${blockGasLimit.toString()} (${message.split("\n")[0]})`
      );
    } else {
      gasLimit = 7_500_000n;
      console.warn(
        `  ⚠️  Gas estimation failed; using fallback=${gasLimit.toString()} (${message.split("\n")[0]})`
      );
    }
  }

  const tx = await deployer.sendTransaction({
    to: SINGLETON_FACTORY_ADDRESS,
    data: txData,
    gasLimit,
  });
  
  const receipt = await tx.wait();
  if (receipt && receipt.status === 0) {
    throw new Error(
      `Deployment transaction reverted: ${receipt.hash}. ` +
        `Common causes: (1) initcode too large (EIP-3860), ` +
        `(2) runtime code size too large (EIP-170), ` +
        `(3) not enough gas within block limit for CREATE2.`
    );
  }
  console.log(`  ✓ Deployed in tx: ${receipt.hash}`);
  console.log(`  ✓ Gas used: ${receipt.gasUsed.toString()}`);
  
  // Verify the deployment
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
 * Generate a salt from a string
 */
function generateSalt(identifier) {
  return ethers.id(identifier);
}

async function tryCallNoArgsIfPresent(name, contract, functionName) {
  if (!contract || typeof contract[functionName] !== "function") return;
  try {
    const tx = await contract[functionName]();
    await tx.wait();
    console.log(`  ✓ ${name}.${functionName} executed`);
  } catch (error) {
    const message = error?.message || String(error);
    console.warn(`  ⚠️  ${name}.${functionName} skipped: ${message.split("\n")[0]}`);
  }
}

async function trySetRoleManagerIfPresent(name, contract, roleManagerAddress) {
  if (!contract || typeof contract.setRoleManager !== "function") return;

  try {
    // If the contract exposes roleManager(), skip if already set.
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

async function safeTransferOwnershipIfOwnedBy(name, contract, from, to) {
  if (!contract || typeof contract.transferOwnership !== "function") return;
  if (typeof contract.owner !== "function") return;

  try {
    const currentOwner = await contract.owner();
    if (String(currentOwner).toLowerCase() === String(to).toLowerCase()) {
      console.log(`  ✓ ${name} ownership already transferred (${to})`);
      return;
    }
    if (String(currentOwner).toLowerCase() !== String(from).toLowerCase()) {
      console.log(`  ⚠️  ${name} owner is ${currentOwner}; expected ${from}. Skipping transfer.`);
      return;
    }
    console.log(`Transferring ${name} ownership...`);
    const tx = await contract.transferOwnership(to);
    await tx.wait();
    console.log("  ✓ Ownership transferred");
  } catch (error) {
    const message = error?.message || String(error);
    console.warn(`  ⚠️  ${name} transferOwnership skipped: ${message.split("\n")[0]}`);
  }
}

async function main() {
  console.log("Starting deterministic deployment using Safe Singleton Factory...\n");
  
  // Verify network
  const network = await ethers.provider.getNetwork();
  console.log(`Network: ${network.name} (Chain ID: ${network.chainId})`);
  
  // Security check: Prevent mainnet deployment with placeholder addresses
  const MAINNET_CHAIN_IDS = [1, 61]; // Ethereum Mainnet, Ethereum Classic Mainnet
  const isMainnet = MAINNET_CHAIN_IDS.includes(Number(network.chainId));
  
  if (isMainnet) {
    console.error("\n❌ MAINNET DEPLOYMENT BLOCKED");
    console.error("═".repeat(60));
    console.error("This script uses PLACEHOLDER addresses for:");
    console.error("  - Governance Token");
    console.error("  - Treasury Vault");
    console.error("\nBefore deploying to mainnet, you must:");
    console.error("  1. Update RagequitModule constructor with real token address");
    console.error("  2. Update FutarchyGovernor constructor with real treasury address");
    console.error("  3. Remove this mainnet check after verification");
    console.error("═".repeat(60));
    throw new Error("Mainnet deployment requires manual configuration changes");
  }
  
  // Check if Safe Singleton Factory is available on this network
  const factoryInfo = getSingletonFactoryInfo(Number(network.chainId));
  if (!factoryInfo) {
    console.warn(`⚠️  Warning: Safe Singleton Factory info not found for chain ${network.chainId}`);
    console.warn(`    Factory may still be deployed at ${SINGLETON_FACTORY_ADDRESS}`);
  } else {
    console.log(`✓ Safe Singleton Factory available at: ${factoryInfo.address}`);
  }
  
  // Verify factory is deployed
  let factoryCode = await ethers.provider.getCode(SINGLETON_FACTORY_ADDRESS);
  if (factoryCode === "0x") {
    const isLocal = hre.network.name === "hardhat" || hre.network.name === "localhost";

    if (isLocal && factoryInfo?.transaction && factoryInfo?.signerAddress) {
      console.log("⚠️  Safe Singleton Factory not present locally; deploying it for this session...");

      try {
        // Hardhat network supports these methods; localhost may too if it's a Hardhat node.
        await hre.network.provider.send("hardhat_setBalance", [
          factoryInfo.signerAddress,
          "0x3635C9ADC5DEA00000", // 1000 ETH
        ]);
      } catch {
        // ignore if not supported
      }

      try {
        const txHash = await hre.network.provider.send("eth_sendRawTransaction", [factoryInfo.transaction]);
        // Hardhat's ethers provider does not implement waitForTransaction(), so poll for receipt.
        const start = Date.now();
        const timeoutMs = Number(process.env.FACTORY_DEPLOY_TIMEOUT_MS ?? 60000);
        while (true) {
          const receipt = await ethers.provider.getTransactionReceipt(txHash);
          if (receipt) {
            if (receipt.status === 0n || receipt.status === 0) {
              throw new Error(`Factory deployment tx reverted: ${txHash}`);
            }
            break;
          }
          if (Date.now() - start > timeoutMs) {
            throw new Error(`Timed out waiting for factory deployment tx receipt: ${txHash}`);
          }
          await sleep(250);
        }
      } catch (e) {
        throw new Error(
          `Failed to deploy Safe Singleton Factory on local network via pre-signed tx.\n` +
            `Network: ${hre.network.name}\n` +
            `Reason: ${e?.message || String(e)}`
        );
      }

      factoryCode = await ethers.provider.getCode(SINGLETON_FACTORY_ADDRESS);
    }

    if (factoryCode === "0x") {
      throw new Error(
        `Safe Singleton Factory not deployed at ${SINGLETON_FACTORY_ADDRESS} on this network.\n` +
          `Please deploy the factory first or use a different deployment method.`
      );
    }
  }
  console.log("✓ Factory contract verified\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      `No deployer signer available for network '${hre.network.name}'.\n` +
      `Make sure you have configured an account (e.g. export PRIVATE_KEY=0x... for this network) in hardhat.config.js.`
    );
  }
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log();

  // Use a consistent salt prefix for all contracts in this project
  const saltPrefix = "FairWinsDAO-v1.0-";
  
  // Deploy all contracts deterministically
  const deployments = {};

  // 0. Deploy RoleManagerCore (Modular RBAC) - ultra-lightweight for gas-constrained chains
  const tieredRoleManager = await deployDeterministic(
    "RoleManagerCore",
    [],
    generateSalt(saltPrefix + "RoleManagerCore"),
    deployer
  );
  deployments.tieredRoleManager = tieredRoleManager.address;
  await tryInitializeIfPresent({ name: "RoleManagerCore", contract: tieredRoleManager.contract, deployer });

  // Note: Deploy full modular RBAC system with scripts/deploy-modular-rbac.js for:
  // - TierRegistry (tier metadata & limits)
  // - PaymentProcessor (MembershipPaymentManager integration)
  // - UsageTracker (usage stats & limit checking)
  // - MembershipManager (duration & expiration)

  // 1. Deploy WelfareMetricRegistry
  const welfareRegistry = await deployDeterministic(
    "WelfareMetricRegistry",
    [],
    generateSalt(saltPrefix + "WelfareMetricRegistry"),
    deployer
  );
  deployments.welfareRegistry = welfareRegistry.address;
  await tryInitializeIfPresent({ name: "WelfareMetricRegistry", contract: welfareRegistry.contract, deployer });

  // 2. Deploy ProposalRegistry
  const proposalRegistry = await deployDeterministic(
    "ProposalRegistry",
    [],
    generateSalt(saltPrefix + "ProposalRegistry"),
    deployer
  );
  deployments.proposalRegistry = proposalRegistry.address;
  await tryInitializeIfPresent({ name: "ProposalRegistry", contract: proposalRegistry.contract, deployer });

  // 3. Deploy ConditionalMarketFactory
  const marketFactory = await deployDeterministic(
    "ConditionalMarketFactory",
    [],
    generateSalt(saltPrefix + "ConditionalMarketFactory"),
    deployer
  );
  deployments.marketFactory = marketFactory.address;
  await tryInitializeIfPresent({ name: "ConditionalMarketFactory", contract: marketFactory.contract, deployer });

  // 4. Deploy PrivacyCoordinator
  const privacyCoordinator = await deployDeterministic(
    "PrivacyCoordinator",
    [],
    generateSalt(saltPrefix + "PrivacyCoordinator"),
    deployer
  );
  deployments.privacyCoordinator = privacyCoordinator.address;
  await tryInitializeIfPresent({ name: "PrivacyCoordinator", contract: privacyCoordinator.contract, deployer });

  // 5. Deploy OracleResolver
  const oracleResolver = await deployDeterministic(
    "OracleResolver",
    [],
    generateSalt(saltPrefix + "OracleResolver"),
    deployer
  );
  deployments.oracleResolver = oracleResolver.address;
  await tryInitializeIfPresent({ name: "OracleResolver", contract: oracleResolver.contract, deployer });

  // 6. Deploy RagequitModule
  // Note: RagequitModule uses initialize pattern - deploy without constructor args
  // Using deployer address as placeholder for both governanceToken and treasuryVault in development
  console.log("\n⚠️  Using deployer address as temporary placeholder for governance token and treasury");
  console.log("    In production, update RagequitModule initialization with actual token and treasury addresses");
  const PLACEHOLDER_ADDRESS = deployer.address;
  
  const ragequitModule = await deployDeterministic(
    "RagequitModule",
    [], // No constructor arguments - uses initialize pattern
    generateSalt(saltPrefix + "RagequitModule"),
    deployer
  );
  deployments.ragequitModule = ragequitModule.address;
  
  // Initialize RagequitModule if newly deployed
  if (!ragequitModule.alreadyDeployed) {
    console.log("Initializing RagequitModule...");
    const tx = await ragequitModule.contract.initialize(
      deployer.address, // initialOwner
      "0xec6Ed68627749b9C244a25A6d0bAC8962043fdcB", // governanceToken - same as deployer for development
      "0x93F7ee39C02d99289E3c29696f1F3a70656d0772"  // treasuryVault - same as deployer for development
    );
    await tx.wait();
    console.log("  ✓ RagequitModule initialized");
  }

  await trySetRoleManagerIfPresent(
    "RagequitModule",
    ragequitModule.contract,
    tieredRoleManager.address
  );

  // 7. Deploy FutarchyGovernor
  const futarchyGovernor = await deployDeterministic(
    "FutarchyGovernor",
    [], // No constructor arguments - uses initialize pattern
    generateSalt(saltPrefix + "FutarchyGovernor"),
    deployer
  );
  deployments.futarchyGovernor = futarchyGovernor.address;
  
  // Initialize FutarchyGovernor if newly deployed
  if (!futarchyGovernor.alreadyDeployed) {
    console.log("Initializing FutarchyGovernor...");
    const tx = await futarchyGovernor.contract.initialize(
      deployer.address, // initialOwner
      welfareRegistry.address,
      proposalRegistry.address,
      marketFactory.address,
      privacyCoordinator.address,
      oracleResolver.address,
      ragequitModule.address,
      "0x93F7ee39C02d99289E3c29696f1F3a70656d0772" // Treasury vault placeholder
    );
    await tx.wait();
    console.log("  ✓ FutarchyGovernor initialized");
  }

  // Wire RBAC into FutarchyGovernor (onlyOwner)
  try {
    const current = await futarchyGovernor.contract.roleManager();
    if (String(current).toLowerCase() === "0x0000000000000000000000000000000000000000") {
      console.log("Setting FutarchyGovernor role manager...");
      const tx = await futarchyGovernor.contract.setRoleManager(tieredRoleManager.address);
      await tx.wait();
      console.log(`  ✓ FutarchyGovernor roleManager set to ${tieredRoleManager.address}`);
    } else {
      console.log(`  ✓ FutarchyGovernor roleManager already set (${current})`);
    }
  } catch (error) {
    const message = error?.message || String(error);
    console.warn(`  ⚠️  FutarchyGovernor setRoleManager skipped: ${message.split("\n")[0]}`);
  }

  // 8. Deploy TokenMintFactory
  // TokenMintFactory requires roleManager address for access control
  const tokenMintFactory = await deployDeterministic(
    "TokenMintFactory",
    [tieredRoleManager.address], // Constructor arg: roleManager address
    generateSalt(saltPrefix + "TokenMintFactory"),
    deployer
  );
  deployments.tokenMintFactory = tokenMintFactory.address;

  // 9. Deploy DAOFactory
  // DAOFactory takes implementation addresses (to keep initcode under EIP-3860 limits)
  const daoFactory = await deployDeterministic(
    "DAOFactory",
    [
      welfareRegistry.address,
      proposalRegistry.address,
      marketFactory.address,
      privacyCoordinator.address,
      oracleResolver.address,
      ragequitModule.address,
      futarchyGovernor.address,
    ],
    generateSalt(saltPrefix + "DAOFactory"),
    deployer
  );
  deployments.daoFactory = daoFactory.address;

  // Setup initial configuration (only if contracts are newly deployed)
  console.log("\n\nSetting up initial configuration...");
  
  const txConfirmations = [];
  
  // Only transfer ownership if the contract was just deployed (not already deployed)
  if (!welfareRegistry.alreadyDeployed) {
    console.log("Transferring WelfareMetricRegistry ownership...");
    await safeTransferOwnership({
      name: "WelfareMetricRegistry",
      contract: welfareRegistry.contract,
      from: deployer.address,
      to: futarchyGovernor.address,
    });
  }
  
  if (!proposalRegistry.alreadyDeployed) {
    console.log("Transferring ProposalRegistry ownership...");
    await safeTransferOwnership({
      name: "ProposalRegistry",
      contract: proposalRegistry.contract,
      from: deployer.address,
      to: futarchyGovernor.address,
    });
  }
  
  if (!marketFactory.alreadyDeployed) {
    console.log("Transferring ConditionalMarketFactory ownership...");
    await safeTransferOwnership({
      name: "ConditionalMarketFactory",
      contract: marketFactory.contract,
      from: deployer.address,
      to: futarchyGovernor.address,
    });
  }
  
  if (!oracleResolver.alreadyDeployed) {
    console.log("Transferring OracleResolver ownership...");
    await safeTransferOwnership({
      name: "OracleResolver",
      contract: oracleResolver.contract,
      from: deployer.address,
      to: futarchyGovernor.address,
    });
  }
  
  if (!ragequitModule.alreadyDeployed) {
    console.log("Transferring RagequitModule ownership...");
    await safeTransferOwnership({
      name: "RagequitModule",
      contract: ragequitModule.contract,
      from: deployer.address,
      to: futarchyGovernor.address,
    });
  }

  // PrivacyCoordinator keeps deployer as owner for coordinator role
  console.log("PrivacyCoordinator coordinator remains as deployer");

  // Verify contracts on Blockscout (via Hardhat verify) after deployment
  console.log("\n\nVerifying contracts on Blockscout...");
  console.log("(Set VERIFY=false to skip; tune with VERIFY_RETRIES / VERIFY_DELAY_MS; set VERIFY_STRICT=true to hard-fail)\n");

  const verificationFailures = [];

  const verificationTargets = [
    {
      name: "WelfareMetricRegistry",
      address: welfareRegistry.address,
      constructorArguments: [],
    },
    {
      name: "ProposalRegistry",
      address: proposalRegistry.address,
      constructorArguments: [],
    },
    {
      name: "ConditionalMarketFactory",
      address: marketFactory.address,
      constructorArguments: [],
    },
    {
      name: "PrivacyCoordinator",
      address: privacyCoordinator.address,
      constructorArguments: [],
    },
    {
      name: "OracleResolver",
      address: oracleResolver.address,
      constructorArguments: [],
    },
    {
      name: "RagequitModule",
      address: ragequitModule.address,
      constructorArguments: [],
    },
    {
      name: "FutarchyGovernor",
      address: futarchyGovernor.address,
      constructorArguments: [],
    },
    {
      name: "TokenMintFactory",
      address: tokenMintFactory.address,
      constructorArguments: [tieredRoleManager.address],
    },
    {
      name: "DAOFactory",
      address: daoFactory.address,
      constructorArguments: [
        welfareRegistry.address,
        proposalRegistry.address,
        marketFactory.address,
        privacyCoordinator.address,
        oracleResolver.address,
        ragequitModule.address,
        futarchyGovernor.address,
      ],
    },
  ];

  for (const target of verificationTargets) {
    console.log(`Verifying ${target.name}...`);
    try {
      const result = await verifyOnBlockscout({
        name: target.name,
        address: target.address,
        constructorArguments: target.constructorArguments,
      });

      if (result?.status === "failed") {
        verificationFailures.push({
          name: target.name,
          address: target.address,
          error: result.error ?? "Unknown verification error",
          solcInputPath: result.solcInputPath ?? null,
        });
        console.warn(`  ⚠️  Verification failed for ${target.name} (${target.address})`);
      }
    } catch (error) {
      // In strict mode, verification failures can be fatal. Re-throw to preserve prior behavior.
      throw error;
    }
  }

  if (verificationFailures.length > 0) {
    console.log("\n\n=== Verification Failures Summary ===");
    for (const failure of verificationFailures) {
      console.log(`- ${failure.name}: ${failure.address}`);
      console.log(`  Reason: ${failure.error}`);
      if (failure.solcInputPath) {
        console.log(`  Standard JSON input: ${failure.solcInputPath}`);
      }
    }
    console.log("\nTip: Re-run verification later once Blockscout has indexed the bytecode.");
  }

  // Print deployment summary
  console.log("\n\n=== Deterministic Deployment Summary ===");
  console.log("Network:", network.name, `(Chain ID: ${network.chainId})`);
  console.log("Safe Singleton Factory:", SINGLETON_FACTORY_ADDRESS);
  console.log("Salt Prefix:", saltPrefix);
  console.log("\nDeployed Contracts:");
  console.log("==================");
  console.log("TieredRoleManager:", deployments.tieredRoleManager);
  console.log("WelfareMetricRegistry:", deployments.welfareRegistry);
  console.log("ProposalRegistry:", deployments.proposalRegistry);
  console.log("MetadataRegistry:", deployments.metadataRegistry);
  console.log("MarketCorrelationRegistry:", deployments.marketCorrelationRegistry);
  console.log("ConditionalMarketFactory:", deployments.marketFactory);
  console.log("PrivacyCoordinator:", deployments.privacyCoordinator);
  console.log("OracleResolver:", deployments.oracleResolver);
  console.log("RagequitModule:", deployments.ragequitModule);
  console.log("FutarchyGovernor:", deployments.futarchyGovernor);
  console.log("TokenMintFactory:", deployments.tokenMintFactory);
  console.log("DAOFactory:", deployments.daoFactory);

  console.log("\n✓ Deployment completed successfully!");
  console.log("\nNote: These addresses are deterministic and will be the same on any");
  console.log("      EVM-compatible network where Safe Singleton Factory is deployed.");

  // Save deployment addresses
  const deploymentInfo = {
    network: network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    factoryAddress: SINGLETON_FACTORY_ADDRESS,
    saltPrefix: saltPrefix,
    contracts: deployments,
    timestamp: new Date().toISOString()
  };

  console.log("\nDeployment info:", JSON.stringify(deploymentInfo, null, 2));

  // Write consolidated deployment JSON for re-use by other scripts/tools.
  const deploymentsDir = path.join(process.cwd(), "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });
  const consolidatedOutPath = path.join(
    deploymentsDir,
    `${hre.network.name}-chain${Number(network.chainId)}-deterministic-deployment.json`
  );
  fs.writeFileSync(consolidatedOutPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nWrote consolidated deployment JSON: ${consolidatedOutPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
