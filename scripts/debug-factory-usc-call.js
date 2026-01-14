const { ethers } = require("hardhat");

/**
 * Debug the exact low-level call that factory makes to USC
 */

async function main() {
  const factoryAddress = "0xD9A26537947d99c6961C1013490f0B80d1DFE283";
  const uscAddress = "0xDE093684c796204224BC081f937aa059D903c52a";
  const tester1 = "0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E";
  const deployer1 = "0x52502d049571C7893447b86c4d8B38e6184bF6e1";
  const stakeAmount = ethers.parseUnits("10", 6);

  const [deployer] = await ethers.getSigners();
  const provider = deployer.provider;

  console.log("=".repeat(60));
  console.log("Debug Factory's Low-Level Call to USC");
  console.log("=".repeat(60));

  // The exact call that _collectStake makes:
  // token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, address(this), amount))

  const transferFromSelector = "0x23b872dd";
  const iface = new ethers.Interface(["function transferFrom(address,address,uint256) returns (bool)"]);

  // What the factory encodes
  const factoryCalldata = iface.encodeFunctionData("transferFrom", [tester1, factoryAddress, stakeAmount]);
  console.log("\nFactory would encode:", factoryCalldata);

  console.log("\n--- Test 1: Direct eth_call to USC (simulating factory's perspective) ---");
  try {
    const result = await provider.call({
      to: uscAddress,
      from: factoryAddress,
      data: factoryCalldata
    });
    console.log("Result:", result);
    console.log("✅ Direct call succeeds");
  } catch (e) {
    console.log("❌ Direct call fails:", e.message);
  }

  console.log("\n--- Test 2: Check if factory has any special restrictions ---");

  // Get the factory ABI to check all functions
  const factory = await ethers.getContractAt("FriendGroupMarketFactory", factoryAddress, deployer);

  // Check conditionalMarketFactory address
  try {
    const cmf = await factory.conditionalMarketFactory();
    console.log("ConditionalMarketFactory:", cmf);
  } catch (e) {
    console.log("Could not get conditionalMarketFactory");
  }

  // Check roleManager
  try {
    const rm = await factory.roleManager();
    console.log("RoleManager:", rm);
  } catch (e) {
    console.log("Could not get roleManager");
  }

  console.log("\n--- Test 3: Try calling transferFrom directly through deployer account ---");
  const usc = await ethers.getContractAt("IERC20", uscAddress, deployer);

  // First check allowances
  const deployerAllowance = await usc.allowance(deployer.address, factoryAddress);
  console.log("Deployer allowance to factory:", ethers.formatUnits(deployerAllowance, 6));

  const deployerBalance = await usc.balanceOf(deployer.address);
  console.log("Deployer USC balance:", ethers.formatUnits(deployerBalance, 6));

  // Try a real transfer to see if USC works at all
  console.log("\n--- Test 4: Try a real USC transfer ---");
  try {
    // Transfer 1 USC to tester1
    const transferAmount = ethers.parseUnits("0.1", 6);
    console.log("Transferring 0.1 USC from deployer to tester1...");
    const tx = await usc.transfer(tester1, transferAmount);
    const receipt = await tx.wait();
    console.log("✅ Transfer succeeded! Block:", receipt.blockNumber);
  } catch (e) {
    console.log("❌ Transfer failed:", e.message);
  }

  console.log("\n--- Test 5: Try a real approve and transferFrom ---");
  try {
    const amount = ethers.parseUnits("0.1", 6);

    // Approve factory to spend deployer's USC
    console.log("Approving factory to spend 0.1 USC...");
    const approveTx = await usc.approve(factoryAddress, amount);
    await approveTx.wait();
    console.log("✅ Approve succeeded");

    // Now check the allowance
    const newAllowance = await usc.allowance(deployer.address, factoryAddress);
    console.log("New allowance:", ethers.formatUnits(newAllowance, 6));

    // Try to call transferFrom directly - this should fail since we're not the factory
    // But let's see what error we get
    console.log("\nTrying to call transferFrom from deployer...");
    try {
      const tfTx = await usc.transferFrom(deployer.address, factoryAddress, amount);
      await tfTx.wait();
      console.log("✅ TransferFrom succeeded (shouldn't happen)");
    } catch (e) {
      console.log("❌ TransferFrom failed (expected since deployer != factory):", e.message);
    }

  } catch (e) {
    console.log("❌ Error:", e.message);
  }

  console.log("\n--- Test 6: Check if factory is paused or has any emergency stops ---");
  try {
    const paused = await factory.paused();
    console.log("Factory paused:", paused);
  } catch (e) {
    // Check if there's an emergency stop
    try {
      const emergencyStop = await factory.emergencyStopped();
      console.log("Emergency stopped:", emergencyStop);
    } catch (e2) {
      console.log("No pause/emergency functions found");
    }
  }

  console.log("\n--- Test 7: Check which markets exist and their state ---");
  const marketCount = await factory.friendMarketCount();
  console.log("Total markets:", marketCount.toString());

  for (let i = 0; i < Math.min(Number(marketCount), 3); i++) {
    const market = await factory.getFriendMarketWithStatus(i);
    console.log(`\nMarket ${i}:`);
    console.log("  Description:", market.description.substring(0, 50));
    console.log("  Status:", Number(market.status));
    console.log("  Stake:", ethers.formatUnits(market.stakePerParticipant, 6), "USC");
  }

  console.log("\n--- Test 8: Deploy a minimal test contract to debug ---");
  // Let's deploy a simple contract that just tries to call transferFrom
  // to see if the issue is with the factory contract specifically

  const TestCallerFactory = await ethers.getContractFactory("FriendGroupMarketFactory");
  // We can't easily deploy a test contract, but let's check if any existing
  // function can help us debug

  console.log("\n--- Summary ---");
  console.log("1. Direct eth_call to USC.transferFrom works");
  console.log("2. But calls through factory.acceptMarket/createMarket fail");
  console.log("3. Regular USC transfers work fine");
  console.log("4. The issue seems to be specific to how the factory interacts with USC");
  console.log("\nPossible causes:");
  console.log("- The low-level call in _collectStake might have an issue");
  console.log("- There might be a gas limit issue in the internal call");
  console.log("- The USC proxy might behave differently with low-level calls");
}

main().catch(console.error);
