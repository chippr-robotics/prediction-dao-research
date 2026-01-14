const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Creating friend market from:", deployer.address);
  
  const factoryAddress = "0xD9A26537947d99c6961C1013490f0B80d1DFE283";
  const uscAddress = "0xDE093684c796204224BC081f937aa059D903c52a";
  const opponent = "0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E";
  
  const factory = await ethers.getContractAt("FriendGroupMarketFactory", factoryAddress);
  const usc = await ethers.getContractAt("IERC20", uscAddress);
  
  // Market parameters
  const description = "Test Market: Will this transaction succeed?";
  const tradingPeriodSeconds = 7 * 24 * 60 * 60; // 7 days
  const arbitrator = ethers.ZeroAddress; // No arbitrator
  const acceptanceDeadline = Math.floor(Date.now() / 1000) + (48 * 60 * 60); // 48 hours from now
  const stakeAmount = ethers.parseUnits("10", 6); // 10 USC
  
  console.log("\n--- Market Parameters ---");
  console.log("Description:", description);
  console.log("Opponent:", opponent);
  console.log("Stake:", "10 USC");
  console.log("Trading period:", "7 days");
  console.log("Acceptance deadline:", new Date(acceptanceDeadline * 1000).toISOString());
  
  // Check USC balance and approve
  const balance = await usc.balanceOf(deployer.address);
  console.log("\nDeployer USC balance:", ethers.formatUnits(balance, 6));
  
  // Approve USC
  console.log("\nApproving USC...");
  const approveTx = await usc.approve(factoryAddress, stakeAmount);
  await approveTx.wait();
  console.log("Approved!");
  
  // Create the market
  console.log("\nCreating 1v1 pending market...");
  try {
    const tx = await factory.createOneVsOneMarketPending(
      opponent,
      description,
      tradingPeriodSeconds,
      arbitrator,
      acceptanceDeadline,
      stakeAmount,
      uscAddress
    );
    console.log("TX hash:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("TX confirmed in block:", receipt.blockNumber);
    
    // Get market ID from events
    const event = receipt.logs.find(log => {
      try {
        const parsed = factory.interface.parseLog(log);
        return parsed?.name === "MarketCreatedPending";
      } catch { return false; }
    });
    
    if (event) {
      const parsed = factory.interface.parseLog(event);
      console.log("\n=== SUCCESS ===");
      console.log("Friend Market ID:", parsed.args.friendMarketId.toString());
      console.log("Creator:", parsed.args.creator);
      console.log("\nThe opponent (0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E) can now accept this market!");
    }
  } catch (err) {
    console.error("ERROR:", err.message);
    if (err.data) console.error("Error data:", err.data);
  }
}

main().catch(console.error);
