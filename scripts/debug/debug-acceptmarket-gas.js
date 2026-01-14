const { ethers } = require("hardhat");

/**
 * Debug acceptMarket with explicit gas settings
 */

async function main() {
  const factoryAddress = "0xD9A26537947d99c6961C1013490f0B80d1DFE283";
  const tester1 = "0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E";

  const [deployer] = await ethers.getSigners();
  const provider = deployer.provider;

  console.log("=".repeat(60));
  console.log("Debug acceptMarket with Gas Settings");
  console.log("=".repeat(60));

  // Encode acceptMarket(0)
  const factoryABI = ["function acceptMarket(uint256 friendMarketId) payable"];
  const factoryIface = new ethers.Interface(factoryABI);
  const calldata = factoryIface.encodeFunctionData("acceptMarket", [0]);

  console.log("\n--- Test 1: eth_call with high gas limit ---");
  try {
    const result = await provider.call({
      to: factoryAddress,
      from: tester1,
      data: calldata,
      gasLimit: 3000000 // 3M gas
    });
    console.log("✅ Success with high gas! Result:", result);
  } catch (e) {
    console.log("❌ Failed:", e.message);
    if (e.data) console.log("Error data:", e.data);
  }

  console.log("\n--- Test 2: Try sending a real transaction via deployer (will fail as wrong sender) ---");
  const factory = await ethers.getContractAt("FriendGroupMarketFactory", factoryAddress, deployer);

  // First let's check if the deployer can accept market 1 (not already accepted by them)
  // Wait - deployer IS the creator, so they've already "accepted" all markets they created

  console.log("\n--- Test 3: Check USC proxy implementation ---");
  const uscAddress = "0xDE093684c796204224BC081f937aa059D903c52a";

  // Try to get implementation via storage slot (EIP-1967)
  // Implementation slot: 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
  const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const implAddress = await provider.getStorage(uscAddress, implSlot);
  console.log("EIP-1967 implementation slot:", implAddress);

  // Try beacon slot
  const beaconSlot = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
  const beaconAddress = await provider.getStorage(uscAddress, beaconSlot);
  console.log("EIP-1967 beacon slot:", beaconAddress);

  // Try admin slot
  const adminSlot = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
  const adminAddress = await provider.getStorage(uscAddress, adminSlot);
  console.log("EIP-1967 admin slot:", adminAddress);

  // Get the actual bytecode to see what kind of proxy it is
  const code = await provider.getCode(uscAddress);
  console.log("\nUSC proxy bytecode:", code);

  console.log("\n--- Test 4: Direct low-level call to factory ---");
  // Let's see what happens when we do a raw call
  try {
    const rawResult = await provider.send("eth_call", [
      {
        to: factoryAddress,
        from: tester1,
        data: calldata,
        gas: "0x2DC6C0" // 3M gas in hex
      },
      "latest"
    ]);
    console.log("Raw eth_call result:", rawResult);
  } catch (e) {
    console.log("Raw eth_call error:", e);
    if (e.error) {
      console.log("Error details:", JSON.stringify(e.error, null, 2));
    }
    if (e.data) {
      console.log("Error data:", e.data);
    }
  }

  console.log("\n--- Test 5: Check if there's any issue with the contract state ---");

  // Get the full market data
  const market = await factory.getFriendMarketWithStatus(0);
  console.log("Market 0 state:");
  console.log("  creator:", market.creator);
  console.log("  stakeToken:", market.stakeToken);
  console.log("  stakePerParticipant:", market.stakePerParticipant.toString());

  // Check the factory's internal state
  console.log("\n--- Test 6: Check factory storage ---");
  // friendMarketCount slot
  const marketCount = await factory.friendMarketCount();
  console.log("Friend market count:", marketCount.toString());

  // Check accepted participant count for market 0
  try {
    const acceptedCount = await factory.acceptedParticipantCount(0);
    console.log("Market 0 accepted count:", acceptedCount.toString());
  } catch (e) {
    console.log("Could not get accepted count:", e.message);
  }
}

main().catch(console.error);
