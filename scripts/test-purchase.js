const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Test the purchaseTierWithToken flow step by step
 */

const CONTRACTS = {
  paymentProcessor: '0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63',
  tierRegistry: '0x31405f0359703109C424d31A86bd7CEF08836A12',
  usc: '0xDE093684c796204224BC081f937aa059D903c52a',
};

const MARKET_MAKER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MARKET_MAKER_ROLE"));

async function main() {
  console.log("=".repeat(60));
  console.log("Test purchaseTierWithToken Flow");
  console.log("=".repeat(60));

  // Use the frontend user's address for simulation
  const buyerAddress = '0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E';
  console.log("\nSimulating for buyer:", buyerAddress);

  // Get contracts
  const paymentProcessor = await ethers.getContractAt("PaymentProcessor", CONTRACTS.paymentProcessor);
  const tierRegistry = await ethers.getContractAt("TierRegistry", CONTRACTS.tierRegistry);
  const usc = await ethers.getContractAt("IERC20", CONTRACTS.usc);

  const amount = ethers.parseUnits("100", 6);

  // Step-by-step checks
  console.log("\n--- Step 1: Check PaymentProcessor state ---");
  const ppPaymentManager = await paymentProcessor.paymentManager();
  const ppTierRegistry = await paymentProcessor.tierRegistry();
  const ppRoleManagerCore = await paymentProcessor.roleManagerCore();
  console.log("  paymentManager:", ppPaymentManager);
  console.log("  tierRegistry:", ppTierRegistry);
  console.log("  roleManagerCore:", ppRoleManagerCore);

  console.log("\n--- Step 2: Check tier is active ---");
  const tier1Active = await tierRegistry.isTierActive(MARKET_MAKER_ROLE, 1);
  console.log("  MARKET_MAKER tier 1 active:", tier1Active);

  console.log("\n--- Step 3: Check current user tier ---");
  const currentTier = await tierRegistry.getUserTier(buyerAddress, MARKET_MAKER_ROLE);
  console.log("  Current tier:", currentTier.toString());

  console.log("\n--- Step 4: Check USC balance and allowance ---");
  const uscBalance = await usc.balanceOf(buyerAddress);
  const uscAllowance = await usc.allowance(buyerAddress, CONTRACTS.paymentProcessor);
  console.log("  USC balance:", ethers.formatUnits(uscBalance, 6));
  console.log("  USC allowance for PP:", ethers.formatUnits(uscAllowance, 6));

  console.log("\n--- Step 5: Check PaymentProcessor authorization on TierRegistry ---");
  const ppAuthorized = await tierRegistry.authorizedExtensions(CONTRACTS.paymentProcessor);
  console.log("  PaymentProcessor authorized:", ppAuthorized);

  // Check MembershipPaymentManager
  console.log("\n--- Step 6: Check MembershipPaymentManager ---");
  const paymentManagerAddr = await paymentProcessor.paymentManager();
  const paymentManager = await ethers.getContractAt("MembershipPaymentManager", paymentManagerAddr);

  const uscTokenInfo = await paymentManager.paymentTokens(CONTRACTS.usc);
  console.log("  USC token active:", uscTokenInfo.isActive);

  const mmRolePrice = await paymentManager.getRolePrice(MARKET_MAKER_ROLE, CONTRACTS.usc);
  console.log("  MARKET_MAKER price:", ethers.formatUnits(mmRolePrice, 6), "USC");

  // Test calling setUserTier directly from PaymentProcessor's perspective
  console.log("\n--- Step 7: Simulate TierRegistry.setUserTier from PaymentProcessor ---");
  try {
    const trInterface = new ethers.Interface([
      "function setUserTier(address user, bytes32 role, uint8 tier)"
    ]);

    const callData = trInterface.encodeFunctionData("setUserTier", [
      buyerAddress,
      MARKET_MAKER_ROLE,
      1  // BRONZE tier
    ]);

    console.log("  Simulating setUserTier as PaymentProcessor calling TierRegistry...");

    const result = await ethers.provider.call({
      from: CONTRACTS.paymentProcessor,  // Simulate as PaymentProcessor
      to: CONTRACTS.tierRegistry,
      data: callData
    });

    console.log("  ✅ setUserTier simulation successful!");

  } catch (error) {
    console.log("  ❌ setUserTier simulation failed!");
    console.log("  Error:", error.message);
  }

  // Simulate with eth_call
  console.log("\n--- Step 8: Simulate purchaseTierWithToken via eth_call ---");
  try {
    const ppInterface = new ethers.Interface([
      "function purchaseTierWithToken(bytes32 role, uint8 tier, address paymentToken, uint256 amount)"
    ]);

    const callData = ppInterface.encodeFunctionData("purchaseTierWithToken", [
      MARKET_MAKER_ROLE,
      1,  // BRONZE tier
      CONTRACTS.usc,
      amount
    ]);

    console.log("  Call data:", callData.substring(0, 66) + "...");

    // Use eth_call to simulate
    const result = await ethers.provider.call({
      from: buyerAddress,
      to: CONTRACTS.paymentProcessor,
      data: callData
    });

    console.log("  ✅ Simulation successful! Result:", result);

  } catch (error) {
    console.log("  ❌ Simulation failed!");
    console.log("  Error message:", error.message);

    // Extract revert reason if available
    if (error.data) {
      console.log("  Error data:", error.data);
    }
    if (error.reason) {
      console.log("  Revert reason:", error.reason);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
