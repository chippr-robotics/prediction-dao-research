const { ethers } = require("hardhat");

/**
 * Debug script to check all preconditions for acceptMarket
 *
 * Usage:
 *   npx hardhat run scripts/debug-accept-market-preconditions.js --network mordor
 */

async function main() {
  const factoryAddress = "0xD9A26537947d99c6961C1013490f0B80d1DFE283";
  const uscAddress = "0xDE093684c796204224BC081f937aa059D903c52a";
  const tester1 = "0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E";

  const [deployer] = await ethers.getSigners();
  const provider = deployer.provider;

  const factory = await ethers.getContractAt("FriendGroupMarketFactory", factoryAddress);
  const usc = await ethers.getContractAt("IERC20", uscAddress);

  console.log("=".repeat(60));
  console.log("Debug acceptMarket Preconditions");
  console.log("=".repeat(60));
  console.log("\nFactory:", factoryAddress);
  console.log("Tester 1:", tester1);
  console.log("Current time:", Math.floor(Date.now() / 1000));

  // Check all 3 markets
  for (let marketId = 0; marketId <= 2; marketId++) {
    console.log("\n" + "=".repeat(60));
    console.log(`MARKET ${marketId}`);
    console.log("=".repeat(60));

    try {
      const market = await factory.getFriendMarketWithStatus(marketId);

      console.log("\n--- Basic Info ---");
      console.log("Description:", market.description);
      console.log("Creator:", market.creator);
      console.log("Status:", Number(market.status), "(0=PendingAcceptance, 1=Active, 2=Resolved, 3=Cancelled, 4=Refunded)");
      console.log("Market Type:", Number(market.marketType));
      console.log("Stake Token:", market.stakeToken);
      console.log("Stake Per Participant:", ethers.formatUnits(market.stakePerParticipant, 6), "USC");

      console.log("\n--- Members Array ---");
      console.log("Members count:", market.members.length);
      for (let i = 0; i < market.members.length; i++) {
        const member = market.members[i];
        const isCreator = member.toLowerCase() === market.creator.toLowerCase();
        const isTester1 = member.toLowerCase() === tester1.toLowerCase();
        console.log(`  [${i}]: ${member}${isCreator ? ' (CREATOR)' : ''}${isTester1 ? ' (TESTER1)' : ''}`);
      }

      console.log("\n--- Deadlines ---");
      const acceptanceDeadline = Number(market.acceptanceDeadline);
      const tradingEndTime = Number(market.tradingEndTime);
      const now = Math.floor(Date.now() / 1000);

      console.log("Acceptance Deadline:", acceptanceDeadline);
      console.log("Acceptance Deadline (Date):", new Date(acceptanceDeadline * 1000).toISOString());
      console.log("Current Time:", now);
      console.log("Deadline Passed?", now >= acceptanceDeadline ? "YES - EXPIRED!" : "No - Still valid");
      console.log("Seconds Until Deadline:", acceptanceDeadline - now);

      console.log("\n--- Arbitrator ---");
      console.log("Arbitrator:", market.arbitrator);
      console.log("Is Zero Address:", market.arbitrator === ethers.ZeroAddress);

      console.log("\n--- Tester1 Acceptance Status ---");
      try {
        const acceptance = await factory.getParticipantAcceptance(marketId, tester1);
        console.log("Has Accepted:", acceptance.hasAccepted);
        console.log("Staked Amount:", ethers.formatUnits(acceptance.stakedAmount, 6), "USC");
        console.log("Is Arbitrator:", acceptance.isArbitrator);
      } catch (e) {
        console.log("Error getting acceptance:", e.message);
      }

      // Check if Tester1 is in members
      const isTester1InMembers = market.members.some(m => m.toLowerCase() === tester1.toLowerCase());
      console.log("\n--- Tester1 Eligibility ---");
      console.log("Is Tester1 in members array:", isTester1InMembers ? "YES" : "NO - NOT INVITED!");
      console.log("Is Tester1 the arbitrator:", market.arbitrator.toLowerCase() === tester1.toLowerCase());

      // Check Tester1's balance and allowance
      console.log("\n--- Tester1 Token Status ---");
      const balance = await usc.balanceOf(tester1);
      const allowance = await usc.allowance(tester1, factoryAddress);
      console.log("USC Balance:", ethers.formatUnits(balance, 6));
      console.log("USC Allowance:", ethers.formatUnits(allowance, 6));
      console.log("Stake Required:", ethers.formatUnits(market.stakePerParticipant, 6));
      console.log("Balance >= Stake:", balance >= market.stakePerParticipant ? "YES" : "NO - INSUFFICIENT!");
      console.log("Allowance >= Stake:", allowance >= market.stakePerParticipant ? "YES" : "NO - NEED APPROVAL!");

      // Summary
      console.log("\n--- SUMMARY ---");
      const issues = [];
      if (Number(market.status) !== 0) issues.push("Status is not PendingAcceptance");
      if (now >= acceptanceDeadline) issues.push("Acceptance deadline has passed");
      if (!isTester1InMembers && market.arbitrator.toLowerCase() !== tester1.toLowerCase()) {
        issues.push("Tester1 is NOT in members array and is NOT arbitrator");
      }
      if (balance < market.stakePerParticipant) issues.push("Insufficient USC balance");
      if (allowance < market.stakePerParticipant) issues.push("Insufficient USC allowance");

      if (issues.length === 0) {
        console.log("✅ All preconditions PASS - acceptMarket should work");
      } else {
        console.log("❌ ISSUES FOUND:");
        issues.forEach(issue => console.log("   -", issue));
      }

    } catch (error) {
      console.log("Error fetching market:", error.message);
    }
  }

  // Try to simulate the acceptMarket call
  console.log("\n" + "=".repeat(60));
  console.log("SIMULATING acceptMarket CALLS");
  console.log("=".repeat(60));

  for (let marketId = 0; marketId <= 2; marketId++) {
    console.log(`\n--- Simulating acceptMarket(${marketId}) ---`);
    try {
      // Try static call first
      await factory.acceptMarket.staticCall(marketId, { from: tester1 });
      console.log("✅ Static call succeeded");
    } catch (e) {
      console.log("❌ Static call failed:", e.message);
      if (e.data) {
        console.log("   Error data:", e.data);
        // Decode known errors
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
          console.log("   Decoded error:", errorSelectors[selector]);
        }
      }
    }
  }
}

main().catch(console.error);
