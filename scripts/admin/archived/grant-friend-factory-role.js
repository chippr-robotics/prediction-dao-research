const hre = require("hardhat");
const { ethers } = hre;

/**
 * Grant MARKET_MAKER_ROLE to FriendGroupMarketFactory
 *
 * The FriendGroupMarketFactory needs this role to call deployMarketPair
 * on the ConditionalMarketFactory when activating friend markets.
 */
async function main() {
  console.log("=".repeat(60));
  console.log("Granting MARKET_MAKER_ROLE to FriendGroupMarketFactory");
  console.log("=".repeat(60));

  const roleManager = await ethers.getContractAt("TieredRoleManager", "0x8aba782765b458Bf2d8DB8eD266D0c785D9F82AD");
  const friendFactory = "0x8cFE477e267bB36925047df8A6E30348f82b0085";

  const [signer] = await ethers.getSigners();
  console.log("\nSigner:", await signer.getAddress());

  // Get MARKET_MAKER_ROLE
  const MARKET_MAKER_ROLE = await roleManager.MARKET_MAKER_ROLE();
  console.log("\nMARKET_MAKER_ROLE hash:", MARKET_MAKER_ROLE);

  const currentlyHasRole = await roleManager.hasRole(MARKET_MAKER_ROLE, friendFactory);
  console.log("FriendGroupMarketFactory currently has role:", currentlyHasRole);

  if (currentlyHasRole) {
    console.log("\n✅ Role already granted. No action needed.");
    return;
  }

  console.log("\nGranting MARKET_MAKER_ROLE to FriendGroupMarketFactory...");

  // Grant the role with Platinum tier (4) for maximum limits
  // grantTier(address u, bytes32 r, MembershipTier t, uint256 days_)
  // 3650 days = ~10 years
  const tx = await roleManager.grantTier(friendFactory, MARKET_MAKER_ROLE, 4, 3650);
  console.log("Transaction hash:", tx.hash);
  await tx.wait();
  console.log("Transaction confirmed!");

  // Verify
  const hasRole = await roleManager.hasRole(MARKET_MAKER_ROLE, friendFactory);
  console.log("\n✅ FriendGroupMarketFactory now has MARKET_MAKER_ROLE:", hasRole);

  console.log("\n" + "=".repeat(60));
  console.log("Done! Friend markets should now be able to activate.");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
