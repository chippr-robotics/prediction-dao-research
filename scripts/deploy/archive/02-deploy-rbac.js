/**
 * 02-deploy-rbac.js - Modular RBAC System Deployment
 *
 * Deploys the modular Role-Based Access Control system including:
 * - TieredRoleManager (standalone with tier limits)
 * - TierRegistry
 * - UsageTracker
 * - MembershipManager
 * - PaymentProcessor
 * - MembershipPaymentManager
 *
 * Prerequisites:
 *   - Run 01-deploy-core.js first
 *
 * Usage:
 *   npx hardhat run scripts/deploy/02-deploy-rbac.js --network localhost
 *   npx hardhat run scripts/deploy/02-deploy-rbac.js --network mordor
 */

const hre = require("hardhat");
const { ethers } = require("hardhat");

const {
  SALT_PREFIXES,
  TOKENS,
  ROLE_HASHES,
  MembershipTier,
  FRIEND_MARKET_TIERS,
  MARKET_MAKER_TIERS,
} = require("./lib/constants");

const {
  generateSalt,
  deployDeterministic,
  ensureSingletonFactory,
  tryInitialize,
  saveDeployment,
  getDeploymentFilename,
  loadDeployment,
  configureTier,
} = require("./lib/helpers");

async function main() {
  console.log("=".repeat(60));
  console.log("02 - Modular RBAC System Deployment");
  console.log("=".repeat(60));

  const network = await ethers.provider.getNetwork();
  console.log(`\nNetwork: ${hre.network.name} (Chain ID: ${network.chainId})`);

  await ensureSingletonFactory();

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer available");
  }
  console.log("\nDeployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Load core deployment to get RoleManagerCore address
  const coreDeployment = loadDeployment(getDeploymentFilename(network, "core-deployment"));
  if (coreDeployment?.contracts?.roleManagerCore) {
    console.log("\nCore deployment found:");
    console.log("  RoleManagerCore:", coreDeployment.contracts.roleManagerCore);
  }

  const saltPrefixModular = SALT_PREFIXES.RBAC;
  const saltPrefixTRM = SALT_PREFIXES.TIERED_ROLE_MANAGER;
  const deployments = {};

  // =========================================================================
  // Part 1: Deploy TieredRoleManager (standalone with tier limits)
  // =========================================================================
  console.log("\n\n--- Part 1: TieredRoleManager ---");

  const tieredRoleManager = await deployDeterministic(
    "TieredRoleManager",
    [],
    generateSalt(saltPrefixTRM + "TieredRoleManager"),
    deployer
  );
  deployments.tieredRoleManager = tieredRoleManager.address;

  if (!tieredRoleManager.alreadyDeployed) {
    console.log("  Initializing TieredRoleManager...");
    try {
      const tx = await tieredRoleManager.contract.initialize(deployer.address);
      await tx.wait();
      console.log("  ✓ TieredRoleManager initialized");
    } catch (error) {
      const msg = error?.message || "";
      if (msg.includes("TRMAlreadyInit") || msg.includes("Already initialized")) {
        console.log("  ✓ Already initialized");
      } else {
        console.warn(`  ⚠️  Initialize skipped: ${msg.split("\n")[0]}`);
      }
    }
  }

  // Configure Friend Market tiers
  console.log("\n  Configuring Friend Market tiers...");
  for (const tierConfig of FRIEND_MARKET_TIERS) {
    await configureTier(
      tieredRoleManager.contract,
      ROLE_HASHES.FRIEND_MARKET_ROLE,
      tierConfig,
      "FRIEND_MARKET"
    );
  }

  // Configure Market Maker tiers
  console.log("\n  Configuring Market Maker tiers...");
  for (const tierConfig of MARKET_MAKER_TIERS) {
    await configureTier(
      tieredRoleManager.contract,
      ROLE_HASHES.MARKET_MAKER_ROLE,
      tierConfig,
      "MARKET_MAKER"
    );
  }

  // Configure role metadata if available
  if (typeof tieredRoleManager.contract.setRoleMetadata === "function") {
    console.log("\n  Configuring role metadata...");
    try {
      await tieredRoleManager.contract.setRoleMetadata(
        ROLE_HASHES.FRIEND_MARKET_ROLE,
        "Friend Market Role",
        "Create private prediction markets with friends",
        true, // isPremium
        0     // maxMembers (unlimited)
      );
      console.log("    ✓ FRIEND_MARKET_ROLE metadata set");
    } catch (e) {
      console.warn(`    ⚠️  FRIEND_MARKET_ROLE metadata skipped`);
    }

    try {
      await tieredRoleManager.contract.setRoleMetadata(
        ROLE_HASHES.MARKET_MAKER_ROLE,
        "Market Maker Role",
        "Create public prediction markets",
        true,
        0
      );
      console.log("    ✓ MARKET_MAKER_ROLE metadata set");
    } catch (e) {
      console.warn(`    ⚠️  MARKET_MAKER_ROLE metadata skipped`);
    }
  }

  // =========================================================================
  // Part 2: Deploy Modular RBAC Stack
  // =========================================================================
  console.log("\n\n--- Part 2: Modular RBAC Stack ---");

  // RoleManagerCore (if not already deployed in core)
  let roleManagerCoreAddress = coreDeployment?.contracts?.roleManagerCore;
  let roleManagerCore;

  if (!roleManagerCoreAddress) {
    console.log("\n  Deploying RoleManagerCore...");
    roleManagerCore = await deployDeterministic(
      "RoleManagerCore",
      [],
      generateSalt(saltPrefixModular + "RoleManagerCore"),
      deployer
    );
    roleManagerCoreAddress = roleManagerCore.address;
    await tryInitialize("RoleManagerCore", roleManagerCore.contract, deployer);
  } else {
    console.log(`\n  Using existing RoleManagerCore: ${roleManagerCoreAddress}`);
    const Factory = await ethers.getContractFactory("RoleManagerCore", deployer);
    roleManagerCore = { address: roleManagerCoreAddress, contract: Factory.attach(roleManagerCoreAddress) };
  }
  deployments.roleManagerCore = roleManagerCoreAddress;

  // TierRegistry
  console.log("\n  Deploying TierRegistry...");
  const tierRegistry = await deployDeterministic(
    "TierRegistry",
    [],
    generateSalt(saltPrefixModular + "TierRegistry"),
    deployer
  );
  deployments.tierRegistry = tierRegistry.address;
  await tryInitialize("TierRegistry", tierRegistry.contract, deployer);

  // UsageTracker
  console.log("\n  Deploying UsageTracker...");
  const usageTracker = await deployDeterministic(
    "UsageTracker",
    [],
    generateSalt(saltPrefixModular + "UsageTracker"),
    deployer
  );
  deployments.usageTracker = usageTracker.address;
  await tryInitialize("UsageTracker", usageTracker.contract, deployer);

  // MembershipManager
  console.log("\n  Deploying MembershipManager...");
  const membershipManager = await deployDeterministic(
    "MembershipManager",
    [],
    generateSalt(saltPrefixModular + "MembershipManager"),
    deployer
  );
  deployments.membershipManager = membershipManager.address;
  await tryInitialize("MembershipManager", membershipManager.contract, deployer);

  // PaymentProcessor
  console.log("\n  Deploying PaymentProcessor...");
  const paymentProcessor = await deployDeterministic(
    "PaymentProcessor",
    [],
    generateSalt(saltPrefixModular + "PaymentProcessor"),
    deployer
  );
  deployments.paymentProcessor = paymentProcessor.address;
  await tryInitialize("PaymentProcessor", paymentProcessor.contract, deployer);

  // MembershipPaymentManager
  const treasuryAddress = process.env.TREASURY_ADDRESS || deployer.address;
  console.log(`\n  Deploying MembershipPaymentManager (treasury: ${treasuryAddress})...`);
  const membershipPaymentManager = await deployDeterministic(
    "MembershipPaymentManager",
    [treasuryAddress],
    generateSalt(saltPrefixModular + "MembershipPaymentManager"),
    deployer
  );
  deployments.membershipPaymentManager = membershipPaymentManager.address;

  // =========================================================================
  // Wire up contracts
  // =========================================================================
  console.log("\n\n--- Wiring Contracts ---");

  // Wire RoleManagerCore extensions
  try {
    console.log("  Setting RoleManagerCore extensions...");
    const tx = await roleManagerCore.contract.setAllExtensions(
      tierRegistry.address,
      paymentProcessor.address,
      usageTracker.address,
      membershipManager.address
    );
    await tx.wait();
    console.log("  ✓ RoleManagerCore extensions set");
  } catch (error) {
    console.warn("  ⚠️  RoleManagerCore extensions may already be set");
  }

  // Wire TierRegistry
  try {
    const tx = await tierRegistry.contract.setRoleManagerCore(roleManagerCoreAddress);
    await tx.wait();
    console.log("  ✓ TierRegistry linked to RoleManagerCore");
  } catch (error) {
    console.warn("  ⚠️  TierRegistry may already be linked");
  }

  // Wire UsageTracker
  try {
    const tx = await usageTracker.contract.configureAll(roleManagerCoreAddress, tierRegistry.address);
    await tx.wait();
    console.log("  ✓ UsageTracker configured");
  } catch (error) {
    console.warn("  ⚠️  UsageTracker may already be configured");
  }

  // Wire MembershipManager
  try {
    const tx = await membershipManager.contract.configureAll(roleManagerCoreAddress, tierRegistry.address);
    await tx.wait();
    console.log("  ✓ MembershipManager configured");
  } catch (error) {
    console.warn("  ⚠️  MembershipManager may already be configured");
  }

  // Wire PaymentProcessor
  try {
    const tx = await paymentProcessor.contract.configureAll(
      roleManagerCoreAddress,
      tierRegistry.address,
      membershipManager.address,
      membershipPaymentManager.address
    );
    await tx.wait();
    console.log("  ✓ PaymentProcessor configured");
  } catch (error) {
    console.warn("  ⚠️  PaymentProcessor may already be configured");
  }

  // =========================================================================
  // Configure MembershipPaymentManager
  // =========================================================================
  console.log("\n\n--- Configuring Payment Manager ---");

  // Get USC address for network
  const networkName = hre.network.name;
  const uscAddress = TOKENS[networkName]?.USC;

  if (uscAddress) {
    // Add USC as payment token
    try {
      const tx = await membershipPaymentManager.contract.addPaymentToken(
        uscAddress,
        "USC",
        6  // USC has 6 decimals
      );
      await tx.wait();
      console.log(`  ✓ USC added as payment token: ${uscAddress}`);
    } catch (error) {
      console.warn("  ⚠️  USC may already be configured");
    }

    // Set role prices
    const rolePrices = [
      { role: ROLE_HASHES.MARKET_MAKER_ROLE, name: "MARKET_MAKER_ROLE", price: "100" },
      { role: ROLE_HASHES.FRIEND_MARKET_ROLE, name: "FRIEND_MARKET_ROLE", price: "50" },
      { role: ROLE_HASHES.TOKENMINT_ROLE, name: "TOKENMINT_ROLE", price: "25" },
      { role: ROLE_HASHES.CLEARPATH_USER_ROLE, name: "CLEARPATH_USER_ROLE", price: "10" },
    ];

    for (const { role, name, price } of rolePrices) {
      try {
        const priceWei = ethers.parseUnits(price, 6);
        const tx = await membershipPaymentManager.contract.setRolePrice(role, uscAddress, priceWei);
        await tx.wait();
        console.log(`  ✓ ${name} price set to ${price} USC`);
      } catch (error) {
        console.warn(`  ⚠️  ${name} price may already be set`);
      }
    }
  } else {
    console.log("  ⚠️  No USC address configured for this network - skipping payment setup");
  }

  // =========================================================================
  // Summary
  // =========================================================================
  console.log("\n\n" + "=".repeat(60));
  console.log("RBAC Deployment Summary");
  console.log("=".repeat(60));
  console.log(`\nNetwork: ${hre.network.name} (Chain ID: ${network.chainId})`);
  console.log("\nDeployed Contracts:");
  console.log("─".repeat(50));
  Object.entries(deployments).forEach(([name, address]) => {
    console.log(`  ${name.padEnd(30)} ${address}`);
  });

  console.log("\nRole Hashes:");
  console.log("─".repeat(50));
  console.log(`  FRIEND_MARKET_ROLE:  ${ROLE_HASHES.FRIEND_MARKET_ROLE}`);
  console.log(`  MARKET_MAKER_ROLE:   ${ROLE_HASHES.MARKET_MAKER_ROLE}`);

  // Save deployment
  const deploymentInfo = {
    network: hre.network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    contracts: deployments,
    roles: {
      FRIEND_MARKET_ROLE: ROLE_HASHES.FRIEND_MARKET_ROLE,
      MARKET_MAKER_ROLE: ROLE_HASHES.MARKET_MAKER_ROLE,
    },
    timestamp: new Date().toISOString()
  };

  saveDeployment(getDeploymentFilename(network, "rbac-deployment"), deploymentInfo);

  console.log("\n✓ RBAC deployment completed!");
  console.log("\nNext steps:");
  console.log("  1. Run 03-deploy-markets.js for market factories");
  console.log("  2. Users can purchase tiers via PaymentProcessor");
  console.log("  3. Admins can grant tiers via TieredRoleManager.grantTier()");

  return deploymentInfo;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
