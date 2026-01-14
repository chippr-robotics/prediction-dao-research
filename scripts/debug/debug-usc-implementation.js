const { ethers } = require("hardhat");

/**
 * Debug USC implementation contract
 */

async function main() {
  const factoryAddress = "0xD9A26537947d99c6961C1013490f0B80d1DFE283";
  const uscProxyAddress = "0xDE093684c796204224BC081f937aa059D903c52a";
  const uscImplAddress = "0xe856714d339ac62cb71242d25e30867a6358778a";
  const tester1 = "0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E";
  const stakeAmount = ethers.parseUnits("10", 6);

  const [deployer] = await ethers.getSigners();
  const provider = deployer.provider;

  console.log("=".repeat(60));
  console.log("Debug USC Implementation");
  console.log("=".repeat(60));

  // Get implementation bytecode size
  const implCode = await provider.getCode(uscImplAddress);
  console.log("Implementation code size:", implCode.length, "bytes");

  // Try to interact with the implementation
  const erc20ABI = [
    "function transferFrom(address from, address to, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function paused() view returns (bool)",
    "function owner() view returns (address)",
    "function blacklist(address) view returns (bool)",
    "function blacklisted(address) view returns (bool)",
    "function isBlacklisted(address) view returns (bool)"
  ];

  const uscProxy = new ethers.Contract(uscProxyAddress, erc20ABI, provider);

  console.log("\n--- Check for special restrictions ---");

  // Check if there's a pause mechanism
  try {
    const paused = await uscProxy.paused();
    console.log("Contract paused:", paused);
  } catch (e) {
    console.log("No paused() function or error:", e.message);
  }

  // Check if there's a blacklist
  try {
    const isBlacklisted1 = await uscProxy.blacklist(tester1);
    console.log("Tester1 blacklisted (blacklist):", isBlacklisted1);
  } catch (e) {
    console.log("No blacklist() function");
  }

  try {
    const isBlacklisted2 = await uscProxy.blacklisted(tester1);
    console.log("Tester1 blacklisted (blacklisted):", isBlacklisted2);
  } catch (e) {
    console.log("No blacklisted() function");
  }

  try {
    const isBlacklisted3 = await uscProxy.isBlacklisted(tester1);
    console.log("Tester1 blacklisted (isBlacklisted):", isBlacklisted3);
  } catch (e) {
    console.log("No isBlacklisted() function");
  }

  // Check if factory is blacklisted
  try {
    const factoryBlacklisted = await uscProxy.blacklist(factoryAddress);
    console.log("Factory blacklisted:", factoryBlacklisted);
  } catch (e) {
    // Already checked no blacklist function
  }

  // Check owner
  try {
    const owner = await uscProxy.owner();
    console.log("USC owner:", owner);
  } catch (e) {
    console.log("No owner() function or error:", e.message);
  }

  console.log("\n--- Try direct transferFrom call through proxy ---");
  const iface = new ethers.Interface(["function transferFrom(address,address,uint256) returns (bool)"]);
  const calldata = iface.encodeFunctionData("transferFrom", [tester1, factoryAddress, stakeAmount]);

  // First, let's see what happens when we call directly
  console.log("Calling transferFrom via eth_call (from factory perspective)...");
  try {
    const result = await provider.call({
      to: uscProxyAddress,
      from: factoryAddress,
      data: calldata
    });
    console.log("Result:", result);
    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["bool"], result);
    console.log("Decoded:", decoded[0] ? "SUCCESS" : "FAILURE");
  } catch (e) {
    console.log("Failed:", e.message);
    if (e.data) console.log("Error data:", e.data);
  }

  console.log("\n--- Check current block and gas price ---");
  const block = await provider.getBlock("latest");
  console.log("Block number:", block.number);
  console.log("Block timestamp:", block.timestamp);
  console.log("Block gas limit:", block.gasLimit.toString());

  const gasPrice = await provider.getFeeData();
  console.log("Gas price:", ethers.formatUnits(gasPrice.gasPrice || 0, "gwei"), "gwei");

  console.log("\n--- Try to trace the exact failure ---");
  // Let's manually step through what acceptMarket does

  const factory = await ethers.getContractAt("FriendGroupMarketFactory", factoryAddress, deployer);

  console.log("\n1. Check market exists");
  const marketCount = await factory.friendMarketCount();
  console.log("   Market count:", marketCount.toString());
  console.log("   Market 0 exists:", 0 < Number(marketCount));

  console.log("\n2. Check market status");
  const market = await factory.getFriendMarketWithStatus(0);
  console.log("   Status:", Number(market.status));
  console.log("   Is PendingAcceptance (0):", Number(market.status) === 0);

  console.log("\n3. Check deadline");
  const now = Math.floor(Date.now() / 1000);
  const deadline = Number(market.acceptanceDeadline);
  console.log("   Current time:", now);
  console.log("   Deadline:", deadline);
  console.log("   Deadline passed:", now >= deadline);

  console.log("\n4. Check if already accepted");
  try {
    const acceptance = await factory.getParticipantAcceptance(0, tester1);
    console.log("   Has accepted:", acceptance.hasAccepted);
  } catch (e) {
    console.log("   Error checking acceptance:", e.message);
  }

  console.log("\n5. Check if invited");
  const members = market.members;
  const isInvited = members.some(m => m.toLowerCase() === tester1.toLowerCase());
  const isArbitrator = market.arbitrator.toLowerCase() === tester1.toLowerCase();
  console.log("   Is in members:", isInvited);
  console.log("   Is arbitrator:", isArbitrator);
  console.log("   Is invited (either):", isInvited || isArbitrator);

  console.log("\n6. Check stake requirements");
  const balance = await uscProxy.balanceOf(tester1);
  const allowance = await uscProxy.allowance(tester1, factoryAddress);
  console.log("   Balance:", ethers.formatUnits(balance, 6), "USC");
  console.log("   Allowance:", ethers.formatUnits(allowance, 6), "USC");
  console.log("   Required:", ethers.formatUnits(market.stakePerParticipant, 6), "USC");
  console.log("   Balance sufficient:", balance >= market.stakePerParticipant);
  console.log("   Allowance sufficient:", allowance >= market.stakePerParticipant);

  console.log("\n--- All checks passed! The issue must be in _collectStake ---");
  console.log("Let's check if there's something wrong with the low-level call in _collectStake");

  // The _collectStake function does:
  // (bool success, bytes memory returnData) = token.call(
  //     abi.encodeWithSelector(IERC20.transferFrom.selector, from, address(this), amount)
  // );

  // Let's verify the selector is correct
  const transferFromSelector = "0x23b872dd";
  console.log("\nTransferFrom selector:", transferFromSelector);

  // Encode what the factory would encode
  const encodedCall = ethers.solidityPacked(
    ["bytes4", "address", "address", "uint256"],
    [transferFromSelector, tester1, factoryAddress, market.stakePerParticipant]
  );

  console.log("What factory would encode:", encodedCall);

  // Actually use ABI encoding (not packed)
  const properEncodedCall = iface.encodeFunctionData("transferFrom", [tester1, factoryAddress, market.stakePerParticipant]);
  console.log("Proper ABI encoding:", properEncodedCall);
}

main().catch(console.error);
