const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
  const factory = await ethers.getContractAt("FriendGroupMarketFactory", "0x8cFE477e267bB36925047df8A6E30348f82b0085");
  const usc = await ethers.getContractAt("IERC20", "0xDE093684c796204224BC081f937aa059D903c52a");

  const adminWallet = "0x52502d049571C7893447b86c4d8B38e6184bF6e1";
  const marketId = 6;

  // Use getFriendMarketWithStatus which has all the info we need
  const [
    _marketId,
    marketType,
    creator,
    members,
    arbitrator,
    status,
    acceptanceDeadline,
    stakePerParticipant,
    stakeToken,
    acceptedCount,
    minThreshold,
    description
  ] = await factory.getFriendMarketWithStatus(marketId);

  console.log("\n=== Market 6 Info ===");
  console.log("Status:", Number(status), "(0=Pending, 1=Active, 2=Resolved, 3=Cancelled, 4=Refunded)");
  console.log("Creator:", creator);
  console.log("Members:", members);
  console.log("Arbitrator:", arbitrator);
  console.log("Stake token:", stakeToken);
  console.log("Stake amount:", ethers.formatUnits(stakePerParticipant, 6), "USC");
  console.log("Min acceptance threshold:", Number(minThreshold));
  console.log("Accepted count:", Number(acceptedCount));
  console.log("Acceptance deadline:", new Date(Number(acceptanceDeadline) * 1000).toISOString());
  console.log("Description:", description);

  // Check if deadline passed
  const now = Math.floor(Date.now() / 1000);
  console.log("\nCurrent time:", new Date(now * 1000).toISOString());
  console.log("Deadline passed:", now >= Number(acceptanceDeadline));

  // Check if admin is in members
  const isInMembers = members.some(m => m.toLowerCase() === adminWallet.toLowerCase());
  console.log("\n=== Admin Status ===");
  console.log("Admin wallet:", adminWallet);
  console.log("Is in members array:", isInMembers);

  // Check acceptance status
  const acceptance = await factory.marketAcceptances(marketId, adminWallet);
  console.log("Has accepted:", acceptance.hasAccepted);

  // Check balances
  const balance = await usc.balanceOf(adminWallet);
  const allowance = await usc.allowance(adminWallet, factory.target);
  console.log("\n=== Admin Token Status ===");
  console.log("Balance:", ethers.formatUnits(balance, 6), "USC");
  console.log("Allowance to factory:", ethers.formatUnits(allowance, 6), "USC");
  console.log("Required stake:", ethers.formatUnits(stakePerParticipant, 6), "USC");
  console.log("Has enough balance:", balance >= stakePerParticipant);
  console.log("Has enough allowance:", allowance >= stakePerParticipant);

  // Check each member's acceptance status
  console.log("\n=== All Members Status ===");
  for (const member of members) {
    const memberAcceptance = await factory.marketAcceptances(marketId, member);
    console.log(`${member}: ${memberAcceptance.hasAccepted ? 'ACCEPTED' : 'PENDING'}`);
  }

  // Final assessment
  console.log("\n=== ASSESSMENT ===");
  const issues = [];
  if (Number(status) !== 0) issues.push(`Market not in Pending status (status=${status})`);
  if (now >= Number(acceptanceDeadline)) issues.push("Deadline has passed");
  if (acceptance.hasAccepted) issues.push("Admin already accepted");
  if (!isInMembers && arbitrator.toLowerCase() !== adminWallet.toLowerCase()) issues.push("Admin not in members and not arbitrator");
  if (allowance < stakePerParticipant) issues.push("Insufficient allowance");
  if (balance < stakePerParticipant) issues.push("Insufficient balance");

  if (issues.length === 0) {
    console.log("All checks passed - transaction should succeed");
    console.log("\nThe issue might be in the contract's _collectStake or token transfer.");
    console.log("Let's check the USC token more carefully...");

    // Check if USC has any transfer restrictions
    const uscCode = await ethers.provider.getCode(stakeToken);
    console.log("\nUSC token code length:", uscCode.length);

    // Try to simulate the transferFrom
    console.log("\nSimulating transferFrom...");
    const tokenWithSigner = await ethers.getContractAt([
      "function transferFrom(address,address,uint256) returns (bool)"
    ], stakeToken);

    // Note: We can't actually call this without a signer, but we can check the data
    console.log("TransferFrom would be called with:");
    console.log("  from:", adminWallet);
    console.log("  to:", factory.target);
    console.log("  amount:", stakePerParticipant.toString());
  } else {
    console.log("Found issues:");
    issues.forEach(i => console.log("  -", i));
  }
}

main().catch(console.error);
