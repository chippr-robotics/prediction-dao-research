const hre = require("hardhat");

async function main() {
  console.log("Starting Treasury and FairWins Token deployment...\n");

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");
  console.log();

  // Deploy FairWinsToken
  console.log("Deploying FairWinsToken...");
  const FairWinsToken = await hre.ethers.getContractFactory("FairWinsToken");
  const fairWinsToken = await FairWinsToken.deploy(deployer.address);
  await fairWinsToken.waitForDeployment();
  const tokenAddress = await fairWinsToken.getAddress();
  console.log("✓ FairWinsToken deployed to:", tokenAddress);
  
  // Get token details
  const tokenName = await fairWinsToken.name();
  const tokenSymbol = await fairWinsToken.symbol();
  const totalSupply = await fairWinsToken.totalSupply();
  const maxSupply = await fairWinsToken.MAX_SUPPLY();
  
  console.log("  Name:", tokenName);
  console.log("  Symbol:", tokenSymbol);
  console.log("  Total Supply:", hre.ethers.formatEther(totalSupply), "FWGT");
  console.log("  Max Supply:", hre.ethers.formatEther(maxSupply), "FWGT");
  console.log("  Owner:", await fairWinsToken.owner());
  console.log();

  // Deploy TreasuryVault
  console.log("Deploying TreasuryVault...");
  const TreasuryVault = await hre.ethers.getContractFactory("TreasuryVault");
  const treasuryVault = await TreasuryVault.deploy();
  await treasuryVault.waitForDeployment();

  // Initialize (sets guardian and ensures owner is correct)
  console.log("Initializing TreasuryVault...");
  const initTx = await treasuryVault.initialize(deployer.address);
  await initTx.wait();
  const vaultAddress = await treasuryVault.getAddress();
  console.log("✓ TreasuryVault deployed to:", vaultAddress);
  console.log("  Owner:", await treasuryVault.owner());
  console.log("  Guardian:", await treasuryVault.guardian());
  console.log("  Paused:", await treasuryVault.paused());
  console.log();

  // Summary
  console.log("═".repeat(60));
  console.log("DEPLOYMENT SUMMARY");
  console.log("═".repeat(60));
  console.log();
  console.log("FairWinsToken:");
  console.log("  Address:      ", tokenAddress);
  console.log("  Symbol:       ", tokenSymbol);
  console.log("  Initial Supply:", hre.ethers.formatEther(totalSupply), "FWGT");
  console.log();
  console.log("TreasuryVault:");
  console.log("  Address:      ", vaultAddress);
  console.log("  Owner:        ", deployer.address);
  console.log();
  console.log("═".repeat(60));
  console.log();
  console.log("Next steps:");
  console.log("  1. Transfer tokens to TreasuryVault if needed");
  console.log("  2. Authorize spenders on TreasuryVault");
  console.log("  3. Set spending limits on TreasuryVault");
  console.log("  4. Configure FutarchyGovernor with these addresses");
  console.log();

  return {
    fairWinsToken: tokenAddress,
    treasuryVault: vaultAddress,
  };
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
