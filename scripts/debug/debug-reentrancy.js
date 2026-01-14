const { ethers } = require("hardhat");

/**
 * Debug reentrancy guard and storage state
 */

async function main() {
  const factoryAddress = "0xD9A26537947d99c6961C1013490f0B80d1DFE283";
  const tester1 = "0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E";

  const [deployer] = await ethers.getSigners();
  const provider = deployer.provider;

  console.log("=".repeat(60));
  console.log("Debug Reentrancy Guard and Storage");
  console.log("=".repeat(60));

  // OpenZeppelin's ReentrancyGuard stores status at slot calculated by Solidity
  // For upgradeable contracts, it might be at a different slot

  console.log("\n--- Check reentrancy guard storage ---");

  // Standard ReentrancyGuard slot (slot 0 often, but depends on inheritance)
  for (let slot = 0; slot < 10; slot++) {
    const value = await provider.getStorage(factoryAddress, slot);
    if (value !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
      console.log(`Slot ${slot}:`, value);
    }
  }

  // Try specific slots that might be reentrancy guard
  // ReentrancyGuardUpgradeable uses a specific slot
  const reentrancySlot = ethers.keccak256(ethers.toUtf8Bytes("openzeppelin.storage.ReentrancyGuard"));
  console.log("\nReentrancyGuard storage slot:", reentrancySlot);
  const reentrancyValue = await provider.getStorage(factoryAddress, reentrancySlot);
  console.log("Value at slot:", reentrancyValue);

  // The actual slot might be reentrancySlot + offset
  const slot0 = ethers.toBigInt(reentrancySlot);
  const value0 = await provider.getStorage(factoryAddress, slot0.toString());
  console.log("Value at exact slot:", value0);

  console.log("\n--- Try debug_traceCall ---");
  const factoryABI = ["function acceptMarket(uint256 friendMarketId) payable"];
  const factoryIface = new ethers.Interface(factoryABI);
  const calldata = factoryIface.encodeFunctionData("acceptMarket", [0]);

  try {
    const trace = await provider.send("debug_traceCall", [
      {
        to: factoryAddress,
        from: tester1,
        data: calldata,
        gas: "0x2DC6C0" // 3M gas
      },
      "latest",
      { tracer: "callTracer" }
    ]);
    console.log("Trace result:", JSON.stringify(trace, null, 2));
  } catch (e) {
    console.log("debug_traceCall not available:", e.message);
  }

  console.log("\n--- Try estimateGas with detailed error ---");
  try {
    const gasEstimate = await provider.estimateGas({
      to: factoryAddress,
      from: tester1,
      data: calldata
    });
    console.log("Gas estimate:", gasEstimate.toString());
  } catch (e) {
    console.log("estimateGas failed:", e.message);
    console.log("Full error:", JSON.stringify(e, Object.getOwnPropertyNames(e), 2));
  }

  console.log("\n--- Check if there's a different RPC endpoint ---");
  // Try calling through an alternative RPC if available
  const altRpcUrl = "https://geth-mordor.etc-network.info";
  try {
    const altProvider = new ethers.JsonRpcProvider(altRpcUrl);
    const result = await altProvider.call({
      to: factoryAddress,
      from: tester1,
      data: calldata
    });
    console.log("Alt RPC result:", result);
  } catch (e) {
    console.log("Alt RPC failed:", e.message);
    if (e.data) console.log("Error data:", e.data);
  }

  console.log("\n--- Let's try accepting market as deployer first ---");
  // Deployer should get AlreadyAccepted error, but let's verify the flow works
  const factory = await ethers.getContractAt("FriendGroupMarketFactory", factoryAddress, deployer);

  console.log("Deployer address:", deployer.address);

  // Try to accept market 0 as deployer
  try {
    const tx = await factory.acceptMarket(0);
    console.log("TX sent:", tx.hash);
    const receipt = await tx.wait();
    console.log("Receipt:", receipt);
  } catch (e) {
    console.log("Deployer accept failed (expected):", e.message);
    if (e.data) console.log("Error data:", e.data);
    // Check for specific error
    if (e.message.includes("AlreadyAccepted") || e.data?.includes("0x1aa8064c")) {
      console.log("✅ Contract properly returns AlreadyAccepted error for deployer");
    }
  }

  console.log("\n--- Create a fresh test market with longer deadline ---");
  // Let's create a brand new market and immediately try to accept it from tester1
  // This will help us rule out any state issues with existing markets

  const uscAddress = "0xDE093684c796204224BC081f937aa059D903c52a";
  const usc = await ethers.getContractAt("IERC20", uscAddress, deployer);

  // Approve and create a fresh market
  const stakeAmount = ethers.parseUnits("1", 6); // 1 USC
  const deadline = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours from now

  console.log("Creating fresh market...");
  console.log("  Stake:", "1 USC");
  console.log("  Opponent:", tester1);
  console.log("  Deadline:", new Date(deadline * 1000).toISOString());

  // Check if deployer has enough USC
  const deployerBalance = await usc.balanceOf(deployer.address);
  console.log("  Deployer USC balance:", ethers.formatUnits(deployerBalance, 6));

  if (deployerBalance >= stakeAmount) {
    // Approve
    const approveTx = await usc.approve(factoryAddress, stakeAmount);
    await approveTx.wait();
    console.log("  Approved!");

    // Create market
    const createTx = await factory.createOneVsOneMarketPending(
      tester1,
      "Fresh debug market - 1 USC - 24hr deadline",
      7 * 24 * 60 * 60, // 7 days trading period
      ethers.ZeroAddress, // No arbitrator
      deadline,
      stakeAmount,
      uscAddress
    );
    const receipt = await createTx.wait();

    // Get market ID
    const event = receipt.logs.find(l => {
      try {
        return factory.interface.parseLog(l)?.name === "MarketCreatedPending";
      } catch {
        return false;
      }
    });

    if (event) {
      const parsed = factory.interface.parseLog(event);
      const marketId = parsed.args.friendMarketId;
      console.log("  Created market ID:", marketId.toString());
      console.log("\n  *** Tester1 should try accepting market", marketId.toString(), "***");
    }
  } else {
    console.log("  Not enough USC to create market");
  }
}

main().catch(console.error);
