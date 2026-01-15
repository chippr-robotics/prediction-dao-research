const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  console.log("=".repeat(60));
  console.log("Checking RoleManager Configuration");
  console.log("=".repeat(60));

  const roleManager = await ethers.getContractAt("RoleManager", "0x8aba782765b458Bf2d8DB8eD266D0c785D9F82AD");
  const friendFactory = "0x8cFE477e267bB36925047df8A6E30348f82b0085";

  const [signer] = await ethers.getSigners();
  const signerAddr = await signer.getAddress();
  console.log("\nSigner:", signerAddr);

  const MARKET_MAKER_ROLE = await roleManager.MARKET_MAKER_ROLE();
  const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

  // Check the role admin for MARKET_MAKER_ROLE
  const roleAdmin = await roleManager.getRoleAdmin(MARKET_MAKER_ROLE);
  console.log("\nMARKET_MAKER_ROLE admin:", roleAdmin);

  // Check if signer has the role admin
  const hasRoleAdmin = await roleManager.hasRole(roleAdmin, signerAddr);
  console.log("Signer has role admin:", hasRoleAdmin);

  // Check if signer has DEFAULT_ADMIN_ROLE
  const hasDefaultAdmin = await roleManager.hasRole(DEFAULT_ADMIN_ROLE, signerAddr);
  console.log("Signer has DEFAULT_ADMIN_ROLE:", hasDefaultAdmin);

  // Check the role metadata
  try {
    const metadata = await roleManager.roleMetadata(MARKET_MAKER_ROLE);
    console.log("\nMARKET_MAKER_ROLE metadata:");
    console.log("  Name:", metadata.name);
    console.log("  Is premium:", metadata.isPremium);
    console.log("  Is active:", metadata.isActive);
    console.log("  Max members:", metadata.maxMembers.toString());
    console.log("  Current members:", metadata.currentMembers.toString());
  } catch (e) {
    console.log("Error getting metadata:", e.message);
  }

  // Try to grant the role
  console.log("\n" + "=".repeat(60));
  console.log("Attempting to grant MARKET_MAKER_ROLE to FriendGroupMarketFactory");
  console.log("=".repeat(60));

  try {
    const tx = await roleManager.grantRole(MARKET_MAKER_ROLE, friendFactory);
    console.log("Transaction hash:", tx.hash);
    await tx.wait();
    console.log("SUCCESS!");

    const hasRole = await roleManager.hasRole(MARKET_MAKER_ROLE, friendFactory);
    console.log("FriendGroupMarketFactory now has MARKET_MAKER_ROLE:", hasRole);
  } catch (e) {
    console.log("FAILED:", e.message);

    // Try to decode the error
    if (e.data) {
      console.log("Error data:", e.data);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
