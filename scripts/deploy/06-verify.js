/**
 * 06-verify.js - Deployment Verification
 *
 * Verifies all deployed contracts are properly connected and configured:
 * - Contract deployment verification
 * - Role manager wiring
 * - Payment processor configuration
 * - Tier registry setup
 * - Authorization checks
 *
 * Prerequisites:
 *   - Run all deployment scripts (01-05) first
 *
 * Usage:
 *   npx hardhat run scripts/deploy/06-verify.js --network localhost
 *   npx hardhat run scripts/deploy/06-verify.js --network mordor
 */

import hre from "hardhat";

import {
  TOKENS,
  ROLE_HASHES,
  MembershipTier,
} from "./lib/constants.js";

import {
  loadDeployment,
  getDeploymentFilename,
} from "./lib/helpers.js";

// Verification result tracking
let passCount = 0;
let failCount = 0;
let warnCount = 0;

function pass(message) {
  console.log(`  ✓ ${message}`);
  passCount++;
}

function fail(message) {
  console.log(`  ✗ ${message}`);
  failCount++;
}

function warn(message) {
  console.log(`  ⚠ ${message}`);
  warnCount++;
}

// Note: verifyDeployed is now defined inside main() to access ethers from connection

async function main() {
  const connection = await hre.network.connect();
  const { ethers } = connection;

  async function verifyDeployed(address, name) {
    const code = await ethers.provider.getCode(address);
    if (code !== "0x") {
      pass(`${name} deployed at ${address}`);
      return true;
    } else {
      fail(`${name} NOT deployed at ${address}`);
      return false;
    }
  }
  console.log("=".repeat(60));
  console.log("06 - Deployment Verification");
  console.log("=".repeat(60));

  const network = await ethers.provider.getNetwork();
  console.log(`\nNetwork: ${hre.network.name} (Chain ID: ${network.chainId})`);

  const [deployer] = await ethers.getSigners();
  console.log("Verifier:", deployer.address);

  // Load all deployments
  const coreDeployment = loadDeployment(getDeploymentFilename(network, "core-deployment"));
  const rbacDeployment = loadDeployment(getDeploymentFilename(network, "rbac-deployment"));
  const marketsDeployment = loadDeployment(getDeploymentFilename(network, "markets-deployment"));
  const registriesDeployment = loadDeployment(getDeploymentFilename(network, "registries-deployment"));

  // =========================================================================
  // 1. Verify Core Contracts Deployed
  // =========================================================================
  console.log("\n\n--- 1. Core Contracts ---");

  if (!coreDeployment?.contracts) {
    fail("Core deployment file not found");
  } else {
    for (const [name, address] of Object.entries(coreDeployment.contracts)) {
      await verifyDeployed(address, name);
    }
  }

  // =========================================================================
  // 2. Verify RBAC Contracts Deployed
  // =========================================================================
  console.log("\n\n--- 2. RBAC Contracts ---");

  if (!rbacDeployment?.contracts) {
    fail("RBAC deployment file not found");
  } else {
    for (const [name, address] of Object.entries(rbacDeployment.contracts)) {
      await verifyDeployed(address, name);
    }
  }

  // =========================================================================
  // 3. Verify Market Contracts Deployed
  // =========================================================================
  console.log("\n\n--- 3. Market Contracts ---");

  if (!marketsDeployment?.contracts) {
    warn("Markets deployment file not found (optional)");
  } else {
    for (const [name, address] of Object.entries(marketsDeployment.contracts)) {
      await verifyDeployed(address, name);
    }
  }

  // =========================================================================
  // 4. Verify Registry Contracts Deployed
  // =========================================================================
  console.log("\n\n--- 4. Registry Contracts ---");

  if (!registriesDeployment?.contracts) {
    warn("Registries deployment file not found (optional)");
  } else {
    for (const [name, address] of Object.entries(registriesDeployment.contracts)) {
      await verifyDeployed(address, name);
    }
  }

  // =========================================================================
  // 5. Verify Contract Wiring
  // =========================================================================
  console.log("\n\n--- 5. Contract Wiring ---");

  if (coreDeployment?.contracts && rbacDeployment?.contracts) {
    // Check FutarchyGovernor has role manager set
    try {
      const Factory = await ethers.getContractFactory("FutarchyGovernor", deployer);
      const governor = Factory.attach(coreDeployment.contracts.futarchyGovernor);
      const roleManager = await governor.roleManager();
      if (roleManager !== ethers.ZeroAddress) {
        pass(`FutarchyGovernor.roleManager = ${roleManager}`);
      } else {
        fail("FutarchyGovernor.roleManager not set");
      }
    } catch (error) {
      warn(`Could not verify FutarchyGovernor: ${error.message?.split("\n")[0]}`);
    }

    // Check MarketFactory has role manager set
    try {
      const Factory = await ethers.getContractFactory("ConditionalMarketFactory", deployer);
      const marketFactory = Factory.attach(coreDeployment.contracts.marketFactory);
      const roleManager = await marketFactory.roleManager();
      if (roleManager !== ethers.ZeroAddress) {
        pass(`MarketFactory.roleManager = ${roleManager}`);
      } else {
        warn("MarketFactory.roleManager not set");
      }
    } catch (error) {
      warn(`Could not verify MarketFactory: ${error.message?.split("\n")[0]}`);
    }

    // Check RoleManagerCore extensions
    try {
      const Factory = await ethers.getContractFactory("RoleManagerCore", deployer);
      const roleManagerCore = Factory.attach(rbacDeployment.contracts.roleManagerCore);

      const tierReg = await roleManagerCore.tierRegistry();
      const payProc = await roleManagerCore.paymentProcessor();
      const usageTrack = await roleManagerCore.usageTracker();
      const memberMgr = await roleManagerCore.membershipManager();

      if (tierReg !== ethers.ZeroAddress) {
        pass(`RoleManagerCore.tierRegistry = ${tierReg}`);
      } else {
        fail("RoleManagerCore.tierRegistry not set");
      }

      if (payProc !== ethers.ZeroAddress) {
        pass(`RoleManagerCore.paymentProcessor = ${payProc}`);
      } else {
        fail("RoleManagerCore.paymentProcessor not set");
      }

      if (usageTrack !== ethers.ZeroAddress) {
        pass(`RoleManagerCore.usageTracker = ${usageTrack}`);
      } else {
        warn("RoleManagerCore.usageTracker not set");
      }

      if (memberMgr !== ethers.ZeroAddress) {
        pass(`RoleManagerCore.membershipManager = ${memberMgr}`);
      } else {
        warn("RoleManagerCore.membershipManager not set");
      }
    } catch (error) {
      warn(`Could not verify RoleManagerCore: ${error.message?.split("\n")[0]}`);
    }
  }

  // =========================================================================
  // 6. Verify PaymentProcessor Configuration
  // =========================================================================
  console.log("\n\n--- 6. PaymentProcessor Configuration ---");

  if (rbacDeployment?.contracts?.paymentProcessor) {
    try {
      const Factory = await ethers.getContractFactory("PaymentProcessor", deployer);
      const paymentProcessor = Factory.attach(rbacDeployment.contracts.paymentProcessor);

      const rmCore = await paymentProcessor.roleManagerCore();
      const tierReg = await paymentProcessor.tierRegistry();
      const memberMgr = await paymentProcessor.membershipManager();
      const payMgr = await paymentProcessor.paymentManager();

      if (rmCore !== ethers.ZeroAddress) {
        pass(`PaymentProcessor.roleManagerCore = ${rmCore}`);
      } else {
        fail("PaymentProcessor.roleManagerCore not set");
      }

      if (tierReg !== ethers.ZeroAddress) {
        pass(`PaymentProcessor.tierRegistry = ${tierReg}`);
      } else {
        fail("PaymentProcessor.tierRegistry not set");
      }

      if (memberMgr !== ethers.ZeroAddress) {
        pass(`PaymentProcessor.membershipManager = ${memberMgr}`);
      } else {
        fail("PaymentProcessor.membershipManager not set");
      }

      if (payMgr !== ethers.ZeroAddress) {
        pass(`PaymentProcessor.paymentManager = ${payMgr}`);
      } else {
        fail("PaymentProcessor.paymentManager not set");
      }
    } catch (error) {
      warn(`Could not verify PaymentProcessor: ${error.message?.split("\n")[0]}`);
    }
  }

  // =========================================================================
  // 7. Verify Authorization
  // =========================================================================
  console.log("\n\n--- 7. Authorization Checks ---");

  if (rbacDeployment?.contracts) {
    // Check TierRegistry authorization
    try {
      const Factory = await ethers.getContractFactory("TierRegistry", deployer);
      const tierRegistry = Factory.attach(rbacDeployment.contracts.tierRegistry);
      const isAuthorized = await tierRegistry.authorizedExtensions(rbacDeployment.contracts.paymentProcessor);
      if (isAuthorized) {
        pass("PaymentProcessor authorized on TierRegistry");
      } else {
        fail("PaymentProcessor NOT authorized on TierRegistry");
      }
    } catch (error) {
      warn(`Could not verify TierRegistry auth: ${error.message?.split("\n")[0]}`);
    }

    // Check MembershipManager authorization
    try {
      const Factory = await ethers.getContractFactory("MembershipManager", deployer);
      const membershipManager = Factory.attach(rbacDeployment.contracts.membershipManager);
      const isAuthorized = await membershipManager.authorizedExtensions(rbacDeployment.contracts.paymentProcessor);
      if (isAuthorized) {
        pass("PaymentProcessor authorized on MembershipManager");
      } else {
        fail("PaymentProcessor NOT authorized on MembershipManager");
      }
    } catch (error) {
      warn(`Could not verify MembershipManager auth: ${error.message?.split("\n")[0]}`);
    }
  }

  // =========================================================================
  // 8. Verify Tier Configuration
  // =========================================================================
  console.log("\n\n--- 8. Tier Configuration ---");

  if (rbacDeployment?.contracts?.tieredRoleManager) {
    try {
      const Factory = await ethers.getContractFactory("TieredRoleManager", deployer);
      const tieredRoleManager = Factory.attach(rbacDeployment.contracts.tieredRoleManager);

      // Check FRIEND_MARKET_ROLE tiers
      for (const tier of [MembershipTier.BRONZE, MembershipTier.SILVER, MembershipTier.GOLD, MembershipTier.PLATINUM]) {
        const tierNames = ["NONE", "BRONZE", "SILVER", "GOLD", "PLATINUM"];
        try {
          const metadata = await tieredRoleManager.getTierMetadata(ROLE_HASHES.FRIEND_MARKET_ROLE, tier);
          if (metadata && metadata.isActive) {
            pass(`FRIEND_MARKET_ROLE ${tierNames[tier]} tier configured`);
          } else {
            warn(`FRIEND_MARKET_ROLE ${tierNames[tier]} tier not active`);
          }
        } catch (error) {
          warn(`Could not verify FRIEND_MARKET_ROLE ${tierNames[tier]}: ${error.message?.split("\n")[0]}`);
        }
      }
    } catch (error) {
      warn(`Could not verify tier configuration: ${error.message?.split("\n")[0]}`);
    }
  }

  // =========================================================================
  // 9. Verify Payment Token Configuration
  // =========================================================================
  console.log("\n\n--- 9. Payment Token Configuration ---");

  const networkName = hre.network.name;
  const uscAddress = TOKENS[networkName]?.USC;

  if (rbacDeployment?.contracts?.membershipPaymentManager && uscAddress) {
    try {
      const Factory = await ethers.getContractFactory("MembershipPaymentManager", deployer);
      const paymentManager = Factory.attach(rbacDeployment.contracts.membershipPaymentManager);

      const tokenInfo = await paymentManager.acceptedTokens(uscAddress);
      if (tokenInfo && tokenInfo.isAccepted) {
        pass(`USC (${uscAddress}) is accepted payment token`);
      } else {
        fail(`USC (${uscAddress}) NOT configured as payment token`);
      }

      // Check role prices
      const roles = [
        { hash: ROLE_HASHES.MARKET_MAKER_ROLE, name: "MARKET_MAKER_ROLE" },
        { hash: ROLE_HASHES.FRIEND_MARKET_ROLE, name: "FRIEND_MARKET_ROLE" },
      ];

      for (const { hash, name } of roles) {
        const price = await paymentManager.rolePrices(hash, uscAddress);
        if (price > 0n) {
          pass(`${name} price: ${ethers.formatUnits(price, 6)} USC`);
        } else {
          warn(`${name} price not set`);
        }
      }
    } catch (error) {
      warn(`Could not verify payment configuration: ${error.message?.split("\n")[0]}`);
    }
  } else if (!uscAddress) {
    warn("No USC address configured for this network");
  }

  // =========================================================================
  // Summary
  // =========================================================================
  console.log("\n\n" + "=".repeat(60));
  console.log("Verification Summary");
  console.log("=".repeat(60));
  console.log(`\n  ✓ Passed:   ${passCount}`);
  console.log(`  ✗ Failed:   ${failCount}`);
  console.log(`  ⚠ Warnings: ${warnCount}`);
  console.log("─".repeat(30));
  console.log(`  Total:      ${passCount + failCount + warnCount}`);

  if (failCount === 0) {
    console.log("\n✓ All critical checks passed!");
    console.log("\nDeployment is ready for use.");
  } else {
    console.log("\n✗ Some checks failed!");
    console.log("\nPlease fix the issues above before proceeding.");
    console.log("Run 05-configure.js to fix authorization issues.");
  }

  console.log("\nNext steps:");
  console.log("  1. Run npm run sync:frontend-contracts to update frontend");
  console.log("  2. Run npm run seed:local to seed test data");
  console.log("  3. Run npm run test:integration to run integration tests");

  // Return exit code based on failures
  if (failCount > 0) {
    process.exit(1);
  }
  return { passCount, failCount, warnCount };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
