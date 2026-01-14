const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const factoryAddress = "0xD9A26537947d99c6961C1013490f0B80d1DFE283";
  const factory = await ethers.getContractAt("FriendGroupMarketFactory", factoryAddress);
  
  console.log("=== SENDING ACTUAL TRANSACTION ===");
  console.log("Deployer:", deployer.address);
  
  // Try to accept market 0 (should fail with AlreadyAccepted)
  console.log("\nAttempting to accept market 0 (should fail)...");
  
  try {
    // Use estimateGas first
    const gasEstimate = await factory.acceptMarket.estimateGas(0);
    console.log("Gas estimate:", gasEstimate.toString());
  } catch (e) {
    console.log("Gas estimation failed:", e.message);
    if (e.data) {
      console.log("Error data:", e.data);
      
      // Decode the error
      const errorSelectors = {
        "0x06417a60": "InvalidMarketId()",
        "0x7dc6505a": "NotPending()",
        "0x70f65caa": "DeadlinePassed()",
        "0x1aa8064c": "AlreadyAccepted()",
        "0x779a6f41": "NotInvited()",
        "0x90b8ec18": "TransferFailed()",
        "0xcd1c8867": "InsufficientPayment()"
      };
      const selector = e.data?.slice(0, 10);
      if (errorSelectors[selector]) {
        console.log("Decoded error:", errorSelectors[selector]);
      }
    }
  }
  
  // Now let's try to create a fresh market and accept it to prove the contract works
  console.log("\n=== CREATING FRESH TEST MARKET ===");
  const uscAddress = "0xDE093684c796204224BC081f937aa059D903c52a";
  const tester1 = "0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E";
  const usc = await ethers.getContractAt("IERC20", uscAddress);
  
  // Use a very small stake - 1 USC
  const stakeAmount = ethers.parseUnits("1", 6);
  
  // Approve
  console.log("Approving 1 USC...");
  const approveTx = await usc.approve(factoryAddress, stakeAmount);
  await approveTx.wait();
  
  // Create market
  const deadline = Math.floor(Date.now() / 1000) + (2 * 60 * 60); // 2 hours
  console.log("Creating market...");
  const createTx = await factory.createOneVsOneMarketPending(
    tester1,
    "Fresh test with 1 USC",
    604800,
    ethers.ZeroAddress,
    deadline,
    stakeAmount,
    uscAddress
  );
  const receipt = await createTx.wait();
  
  // Get market ID
  const event = receipt.logs.find(l => {
    try { return factory.interface.parseLog(l)?.name === "MarketCreatedPending"; }
    catch { return false; }
  });
  const marketId = factory.interface.parseLog(event).args.friendMarketId;
  console.log("Created market ID:", marketId.toString());
  
  // Check Tester1's allowance
  const allowance = await usc.allowance(tester1, factoryAddress);
  console.log("\nTester1 allowance:", ethers.formatUnits(allowance, 6), "USC");
  console.log("Required:", "1 USC");
  console.log("Sufficient:", allowance >= stakeAmount);
  
  console.log("\n=== INSTRUCTIONS FOR TESTER 1 ===");
  console.log("Market ID:", marketId.toString());
  console.log("Stake: 1 USC");
  console.log("Tester1 needs to approve at least 1 USC if allowance < 1");
  console.log("Then call acceptMarket(" + marketId + ")");
}

main().catch(console.error);
