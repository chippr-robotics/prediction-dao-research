/**
 * 05-configure.js - Post-Deployment Configuration
 *
 * Configures authorization, wiring, and initial setup after all contracts are deployed:
 * - Authorize PaymentProcessor on TierRegistry/MembershipManager
 * - Set up role pricing and tier metadata
 * - Configure RoleManagerCore extensions
 * - Set up contract interconnections
 *
 * Prerequisites:
 *   - Run 01-deploy-core.js, 02-deploy-rbac.js, 03-deploy-markets.js first
 *
 * Usage:
 *   npx hardhat run scripts/deploy/05-configure.js --network localhost
 *   npx hardhat run scripts/deploy/05-configure.js --network mordor
 */

import hre from "hardhat";

import {
  TOKENS,
  ROLE_HASHES,
  MembershipTier,
  FRIEND_MARKET_TIERS,
  MARKET_MAKER_TIERS,
} from "./lib/constants.js";

import {
  loadDeployment,
  getDeploymentFilename,
  configureTier,
} from "./lib/helpers.js";

async function main() {
  const connection = await hre.network.connect();
  const { ethers } = connection;
  console.log("=".repeat(60));
  console.log("05 - Post-Deployment Configuration");
  console.log("=".repeat(60));

  const network = await ethers.provider.getNetwork();
  console.log(`\nNetwork: ${hre.network.name} (Chain ID: ${network.chainId})`);

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer available");
  }
  console.log("\nDeployer:", deployer.address);

  // Load all deployments
  const coreDeployment = loadDeployment(getDeploymentFilename(network, "core-deployment"));
  const rbacDeployment = loadDeployment(getDeploymentFilename(network, "rbac-deployment"));
  const marketsDeployment = loadDeployment(getDeploymentFilename(network, "markets-deployment"));

  if (!coreDeployment?.contracts) {
    throw new Error("Core deployment not found. Run 01-deploy-core.js first.");
  }
  if (!rbacDeployment?.contracts) {
    throw new Error("RBAC deployment not found. Run 02-deploy-rbac.js first.");
  }

  console.log("\nLoaded deployments:");
  console.log("  Core contracts:", Object.keys(coreDeployment.contracts).length);
  console.log("  RBAC contracts:", Object.keys(rbacDeployment.contracts).length);
  if (marketsDeployment?.contracts) {
    console.log("  Market contracts:", Object.keys(marketsDeployment.contracts).length);
  }

  // =========================================================================
  // Load contract instances
  // =========================================================================
  console.log("\n\n--- Loading Contract Instances ---");

  const contracts = {};

  // Core contracts
  if (coreDeployment.contracts.roleManagerCore) {
    const Factory = await ethers.getContractFactory("RoleManagerCore", deployer);
    contracts.roleManagerCore = Factory.attach(coreDeployment.contracts.roleManagerCore);
    console.log("  ✓ RoleManagerCore loaded");
  }

  if (coreDeployment.contracts.marketFactory) {
    const Factory = await ethers.getContractFactory("ConditionalMarketFactory", deployer);
    contracts.marketFactory = Factory.attach(coreDeployment.contracts.marketFactory);
    console.log("  ✓ ConditionalMarketFactory loaded");
  }

  // RBAC contracts
  if (rbacDeployment.contracts.tieredRoleManager) {
    const Factory = await ethers.getContractFactory("TieredRoleManager", deployer);
    contracts.tieredRoleManager = Factory.attach(rbacDeployment.contracts.tieredRoleManager);
    console.log("  ✓ TieredRoleManager loaded");
  }

  if (rbacDeployment.contracts.tierRegistry) {
    const Factory = await ethers.getContractFactory("TierRegistry", deployer);
    contracts.tierRegistry = Factory.attach(rbacDeployment.contracts.tierRegistry);
    console.log("  ✓ TierRegistry loaded");
  }

  if (rbacDeployment.contracts.membershipManager) {
    const Factory = await ethers.getContractFactory("MembershipManager", deployer);
    contracts.membershipManager = Factory.attach(rbacDeployment.contracts.membershipManager);
    console.log("  ✓ MembershipManager loaded");
  }

  if (rbacDeployment.contracts.paymentProcessor) {
    const Factory = await ethers.getContractFactory("PaymentProcessor", deployer);
    contracts.paymentProcessor = Factory.attach(rbacDeployment.contracts.paymentProcessor);
    console.log("  ✓ PaymentProcessor loaded");
  }

  if (rbacDeployment.contracts.membershipPaymentManager) {
    const Factory = await ethers.getContractFactory("MembershipPaymentManager", deployer);
    contracts.membershipPaymentManager = Factory.attach(rbacDeployment.contracts.membershipPaymentManager);
    console.log("  ✓ MembershipPaymentManager loaded");
  }

  // =========================================================================
  // Authorize PaymentProcessor
  // =========================================================================
  console.log("\n\n--- Authorizing PaymentProcessor ---");

  // Authorize on TierRegistry
  if (contracts.tierRegistry && contracts.paymentProcessor) {
    try {
      const isAuthorized = await contracts.tierRegistry.authorizedExtensions(rbacDeployment.contracts.paymentProcessor);
      if (!isAuthorized) {
        console.log("  Authorizing PaymentProcessor on TierRegistry...");
        const tx = await contracts.tierRegistry.setAuthorizedExtension(
          rbacDeployment.contracts.paymentProcessor,
          true
        );
        await tx.wait();
        console.log("  ✓ PaymentProcessor authorized on TierRegistry");
      } else {
        console.log("  ✓ PaymentProcessor already authorized on TierRegistry");
      }
    } catch (error) {
      console.warn(`  ⚠️  TierRegistry authorization skipped: ${error.message?.split("\n")[0]}`);
    }
  }

  // Authorize on MembershipManager
  if (contracts.membershipManager && contracts.paymentProcessor) {
    try {
      const isAuthorized = await contracts.membershipManager.authorizedExtensions(rbacDeployment.contracts.paymentProcessor);
      if (!isAuthorized) {
        console.log("  Authorizing PaymentProcessor on MembershipManager...");
        const tx = await contracts.membershipManager.setAuthorizedExtension(
          rbacDeployment.contracts.paymentProcessor,
          true
        );
        await tx.wait();
        console.log("  ✓ PaymentProcessor authorized on MembershipManager");
      } else {
        console.log("  ✓ PaymentProcessor already authorized on MembershipManager");
      }
    } catch (error) {
      console.warn(`  ⚠️  MembershipManager authorization skipped: ${error.message?.split("\n")[0]}`);
    }
  }

  // =========================================================================
  // Configure TieredRoleManager authorization
  // =========================================================================
  console.log("\n\n--- Configuring TieredRoleManager ---");

  if (contracts.tieredRoleManager && contracts.paymentProcessor) {
    try {
      // Check if PaymentProcessor can grant roles
      const hasAuth = await contracts.tieredRoleManager.authorizedExtensions
        ? await contracts.tieredRoleManager.authorizedExtensions(rbacDeployment.contracts.paymentProcessor)
        : false;

      if (!hasAuth && typeof contracts.tieredRoleManager.setAuthorizedExtension === "function") {
        console.log("  Authorizing PaymentProcessor on TieredRoleManager...");
        const tx = await contracts.tieredRoleManager.setAuthorizedExtension(
          rbacDeployment.contracts.paymentProcessor,
          true
        );
        await tx.wait();
        console.log("  ✓ PaymentProcessor authorized on TieredRoleManager");
      } else {
        console.log("  ✓ PaymentProcessor already authorized on TieredRoleManager");
      }
    } catch (error) {
      console.warn(`  ⚠️  TieredRoleManager authorization skipped: ${error.message?.split("\n")[0]}`);
    }
  }

  // =========================================================================
  // Configure PaymentProcessor to use TieredRoleManager for role grants
  // =========================================================================
  console.log("\n\n--- Configuring PaymentProcessor Role Manager ---");

  if (contracts.paymentProcessor && rbacDeployment.contracts.tieredRoleManager) {
    try {
      const currentRoleManager = await contracts.paymentProcessor.roleManagerCore();
      const expectedRoleManager = rbacDeployment.contracts.tieredRoleManager;

      if (currentRoleManager.toLowerCase() !== expectedRoleManager.toLowerCase()) {
        console.log(`  Current roleManagerCore: ${currentRoleManager}`);
        console.log(`  Setting to TieredRoleManager: ${expectedRoleManager}`);
        const tx = await contracts.paymentProcessor.setRoleManagerCore(expectedRoleManager);
        await tx.wait();
        console.log("  ✓ PaymentProcessor.roleManagerCore set to TieredRoleManager");
      } else {
        console.log("  ✓ PaymentProcessor.roleManagerCore already correct");
      }
    } catch (error) {
      console.warn(`  ⚠️  PaymentProcessor roleManagerCore skipped: ${error.message?.split("\n")[0]}`);
    }
  }

  // =========================================================================
  // Set up additional role prices
  // =========================================================================
  console.log("\n\n--- Configuring Role Prices ---");

  const networkName = hre.network.name;
  const uscAddress = TOKENS[networkName]?.USC;

  if (contracts.membershipPaymentManager && uscAddress) {
    const additionalRoles = [
      { role: ROLE_HASHES.TOKENMINT_ROLE, name: "TOKENMINT_ROLE", price: "25" },
      { role: ROLE_HASHES.CLEARPATH_USER_ROLE, name: "CLEARPATH_USER_ROLE", price: "10" },
    ];

    for (const { role, name, price } of additionalRoles) {
      try {
        const currentPrice = await contracts.membershipPaymentManager.rolePrices(role, uscAddress);
        if (currentPrice === 0n) {
          const priceWei = ethers.parseUnits(price, 6);
          const tx = await contracts.membershipPaymentManager.setRolePrice(role, uscAddress, priceWei);
          await tx.wait();
          console.log(`  ✓ ${name} price set to ${price} USC`);
        } else {
          console.log(`  ✓ ${name} price already set`);
        }
      } catch (error) {
        console.warn(`  ⚠️  ${name} price configuration skipped: ${error.message?.split("\n")[0]}`);
      }
    }
  } else if (!uscAddress) {
    console.log("  ⚠️  No USC address for this network - skipping role prices");
  }

  // =========================================================================
  // Configure MarketFactory role manager
  // =========================================================================
  console.log("\n\n--- Configuring MarketFactory ---");

  if (contracts.marketFactory && rbacDeployment.contracts.tieredRoleManager) {
    try {
      const currentRM = await contracts.marketFactory.roleManager();
      if (currentRM === ethers.ZeroAddress) {
        console.log("  Setting role manager on MarketFactory...");
        const tx = await contracts.marketFactory.setRoleManager(rbacDeployment.contracts.tieredRoleManager);
        await tx.wait();
        console.log("  ✓ MarketFactory role manager set");
      } else {
        console.log(`  ✓ MarketFactory role manager already set: ${currentRM}`);
      }
    } catch (error) {
      console.warn(`  ⚠️  MarketFactory configuration skipped: ${error.message?.split("\n")[0]}`);
    }
  }

  // =========================================================================
  // Grant MARKET_MAKER_ROLE to FriendGroupMarketFactory
  // =========================================================================
  console.log("\n\n--- Granting MARKET_MAKER_ROLE to FriendGroupMarketFactory ---");

  const friendGroupMarketFactoryAddress = marketsDeployment?.contracts?.friendGroupMarketFactory;

  if (contracts.tieredRoleManager && friendGroupMarketFactoryAddress) {
    try {
      const MARKET_MAKER_ROLE = await contracts.tieredRoleManager.MARKET_MAKER_ROLE();
      const hasRole = await contracts.tieredRoleManager.hasRole(MARKET_MAKER_ROLE, friendGroupMarketFactoryAddress);

      if (hasRole) {
        console.log("  ✓ FriendGroupMarketFactory already has MARKET_MAKER_ROLE");

        // Check if membership is active
        const isActive = await contracts.tieredRoleManager.isMembershipActive(friendGroupMarketFactoryAddress, MARKET_MAKER_ROLE);
        console.log(`  ✓ Membership active: ${isActive}`);
      } else {
        // Grant PLATINUM tier for 100 years
        const PLATINUM = 4; // MembershipTier.PLATINUM
        const DURATION_DAYS = 36500; // 100 years

        console.log(`  Granting PLATINUM tier (${PLATINUM}) for ${DURATION_DAYS} days...`);
        const tx = await contracts.tieredRoleManager.grantTier(
          friendGroupMarketFactoryAddress,
          MARKET_MAKER_ROLE,
          PLATINUM,
          DURATION_DAYS
        );
        await tx.wait();
        console.log("  ✓ MARKET_MAKER_ROLE granted to FriendGroupMarketFactory");

        // Verify
        const verifyHasRole = await contracts.tieredRoleManager.hasRole(MARKET_MAKER_ROLE, friendGroupMarketFactoryAddress);
        console.log(`  ✓ Verification - hasRole: ${verifyHasRole}`);
      }
    } catch (error) {
      console.warn(`  ⚠️  FriendGroupMarketFactory role grant skipped: ${error.message?.split("\n")[0]}`);
    }
  } else if (!friendGroupMarketFactoryAddress) {
    console.log("  ⚠️  FriendGroupMarketFactory not deployed - skipping role grant");
  }

  // =========================================================================
  // Summary
  // =========================================================================
  console.log("\n\n" + "=".repeat(60));
  console.log("Configuration Summary");
  console.log("=".repeat(60));
  console.log("\nAuthorizations configured:");
  console.log("  - PaymentProcessor → TierRegistry");
  console.log("  - PaymentProcessor → MembershipManager");
  console.log("  - PaymentProcessor → TieredRoleManager");
  console.log("  - PaymentProcessor.roleManagerCore → TieredRoleManager (for role grants)");
  console.log("\nRole prices configured:");
  if (uscAddress) {
    console.log("  - TOKENMINT_ROLE: 25 USC");
    console.log("  - CLEARPATH_USER_ROLE: 10 USC");
  } else {
    console.log("  - Skipped (no USC on this network)");
  }
  console.log("\nFactory roles configured:");
  if (friendGroupMarketFactoryAddress) {
    console.log("  - FriendGroupMarketFactory → MARKET_MAKER_ROLE (PLATINUM tier)");
  } else {
    console.log("  - Skipped (FriendGroupMarketFactory not deployed)");
  }

  console.log("\n✓ Configuration completed!");
  console.log("\nNext steps:");
  console.log("  1. Run 06-verify.js to verify all contracts are properly connected");
  console.log("  2. Run npm run sync:frontend-contracts to update frontend");
  console.log("  3. Run npm run seed:local to seed test data");

  return { success: true };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
