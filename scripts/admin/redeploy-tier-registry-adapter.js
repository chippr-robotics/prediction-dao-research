const { ethers } = require("hardhat");

/**
 * Redeploy TierRegistryAdapter with MARKET_MAKER_ROLE support
 *
 * The original adapter didn't expose MARKET_MAKER_ROLE() function,
 * which is required by ConditionalMarketFactory.
 *
 * This script:
 * 1. Deploys new TierRegistryAdapter
 * 2. Configures it with existing modular system components
 * 3. Authorizes it on UsageTracker
 * 4. Updates ConditionalMarketFactory to use new adapter
 *
 * Run with admin floppy disk:
 *   export FLOPPY_KEYSTORE_PASSWORD="password"
 *   npx hardhat run scripts/admin/redeploy-tier-registry-adapter.js --network mordor
 */

const SINGLETON_FACTORY = "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7";

// Current deployed contracts (checksummed addresses)
const CONTRACTS = {
  // Modular system components (from existing adapter config)
  roleManagerCore: "0x888332df7621EC341131d85e2228f00407777dD7",
  tierRegistry: "0x4eb93BaF14f668F8f67922121A3b9FC3FB5b8A0d",
  membershipManager: "0xB35b9Ef28BA9E50a7ce920E95555f43C3F2Cd3C4",
  usageTracker: "0x82D6dD7E62dfaA9c399e4A707F92bE28a9B0d1DB",

  // Factories to update
  conditionalMarketFactory: "0xd6F4a7059Ed5E1dc7fC8123768C5BC0fbc54A93a",
  friendGroupMarketFactory: "0x8cFE477e267bB36925047df8A6E30348f82b0085",

  // Old adapter (for reference)
  oldAdapter: "0x8e3A4C65a6C22d88515FD356cB00732adac4f4d7",
};

function generateSalt(identifier) {
  return ethers.id(identifier);
}

async function main() {
  console.log("=".repeat(60));
  console.log("Redeploy TierRegistryAdapter with MARKET_MAKER_ROLE");
  console.log("=".repeat(60));

  const [signer] = await ethers.getSigners();
  console.log("\nAdmin address:", signer.address);
  const balance = await ethers.provider.getBalance(signer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETC");

  // Step 1: Deploy new TierRegistryAdapter
  console.log("\n[1/5] Deploying new TierRegistryAdapter...");

  const salt = generateSalt("FairWinsDAO-v1.0-TierRegistryAdapter-v3-market-maker-role");
  const TierRegistryAdapter = await ethers.getContractFactory("TierRegistryAdapter");
  const deployTx = await TierRegistryAdapter.getDeployTransaction();
  const initCodeHash = ethers.keccak256(deployTx.data);

  const predictedAddress = ethers.getCreate2Address(
    SINGLETON_FACTORY,
    salt,
    initCodeHash
  );
  console.log("Predicted address:", predictedAddress);

  // Check if already deployed
  const existingCode = await ethers.provider.getCode(predictedAddress);
  let adapter;

  if (existingCode !== "0x") {
    console.log("Already deployed at this address!");
    adapter = TierRegistryAdapter.attach(predictedAddress);
  } else {
    // Deploy via singleton factory
    const txData = ethers.concat([salt, deployTx.data]);
    const tx = await signer.sendTransaction({
      to: SINGLETON_FACTORY,
      data: txData,
      gasLimit: 3000000n,
    });
    console.log("Deploy tx:", tx.hash);
    await tx.wait();
    console.log("Deployed!");

    adapter = TierRegistryAdapter.attach(predictedAddress);
  }

  // Step 2: Initialize and configure
  console.log("\n[2/5] Configuring adapter...");

  // Check if initialized - also check if owned by singleton factory (needs re-init)
  const owner = await adapter.owner();
  const needsInit = owner === ethers.ZeroAddress || owner.toLowerCase() === SINGLETON_FACTORY.toLowerCase();

  if (needsInit) {
    console.log("Initializing (current owner:", owner, ")...");
    try {
      const initTx = await adapter.initialize(signer.address);
      await initTx.wait();
      console.log("Initialized!");
    } catch (e) {
      console.log("Init failed:", e.message);
      if (owner.toLowerCase() !== signer.address.toLowerCase()) {
        console.error("Cannot configure - not owner");
        process.exit(1);
      }
    }
  } else {
    console.log("Already initialized, owner:", owner);
  }

  // Configure with modular components
  const currentRM = await adapter.roleManagerCore();
  if (currentRM === ethers.ZeroAddress) {
    console.log("Configuring modular components...");
    const configTx = await adapter.configure(
      CONTRACTS.roleManagerCore,
      CONTRACTS.tierRegistry,
      CONTRACTS.membershipManager,
      CONTRACTS.usageTracker
    );
    await configTx.wait();
    console.log("Configured!");
  } else {
    console.log("Already configured");
  }

  // Step 3: Authorize on UsageTracker
  console.log("\n[3/5] Authorizing on UsageTracker...");
  try {
    const usageTracker = await ethers.getContractAt([
      "function authorizedCallers(address) view returns (bool)",
      "function setAuthorizedCaller(address caller, bool authorized)"
    ], CONTRACTS.usageTracker);

    const isAuthorized = await usageTracker.authorizedCallers(predictedAddress);
    if (!isAuthorized) {
      const authTx = await usageTracker.setAuthorizedCaller(predictedAddress, true);
      await authTx.wait();
      console.log("Authorized!");
    } else {
      console.log("Already authorized");
    }
  } catch (e) {
    console.log("UsageTracker authorization skipped:", e.message.slice(0, 80));
    console.log("(May need manual authorization if market creation limits are enforced)");
  }

  // Step 4: Update ConditionalMarketFactory
  console.log("\n[4/5] Updating ConditionalMarketFactory...");
  const cmf = await ethers.getContractAt("ConditionalMarketFactory", CONTRACTS.conditionalMarketFactory);

  const cmfOwner = await cmf.owner();
  if (cmfOwner.toLowerCase() !== signer.address.toLowerCase()) {
    console.log("Warning: Signer is not CMF owner, skipping update");
    console.log("CMF owner:", cmfOwner);
  } else {
    const currentCmfRM = await cmf.roleManager();
    console.log("Current CMF roleManager:", currentCmfRM);

    if (currentCmfRM.toLowerCase() !== predictedAddress.toLowerCase()) {
      const updateTx = await cmf.setRoleManager(predictedAddress);
      await updateTx.wait();
      console.log("Updated CMF roleManager to:", predictedAddress);
    } else {
      console.log("Already using new adapter");
    }
  }

  // Step 5: Update FriendGroupMarketFactory (optional)
  console.log("\n[5/5] Updating FriendGroupMarketFactory...");
  const fgmf = await ethers.getContractAt([
    "function owner() view returns (address)",
    "function tieredRoleManager() view returns (address)",
    "function updateTieredRoleManager(address)"
  ], CONTRACTS.friendGroupMarketFactory);

  const fgmfOwner = await fgmf.owner();
  if (fgmfOwner.toLowerCase() !== signer.address.toLowerCase()) {
    console.log("Warning: Signer is not FGMF owner, skipping update");
  } else {
    const currentFgmfRM = await fgmf.tieredRoleManager();
    console.log("Current FGMF tieredRoleManager:", currentFgmfRM);

    if (currentFgmfRM.toLowerCase() !== predictedAddress.toLowerCase()) {
      const updateTx = await fgmf.updateTieredRoleManager(predictedAddress);
      await updateTx.wait();
      console.log("Updated FGMF tieredRoleManager to:", predictedAddress);
    } else {
      console.log("Already using new adapter");
    }
  }

  // Verify
  console.log("\n" + "=".repeat(60));
  console.log("Verification");
  console.log("=".repeat(60));

  // Test MARKET_MAKER_ROLE on new adapter
  const mmRole = await adapter.MARKET_MAKER_ROLE();
  console.log("\nNew adapter MARKET_MAKER_ROLE():", mmRole);

  const fmRole = await adapter.FRIEND_MARKET_ROLE();
  console.log("New adapter FRIEND_MARKET_ROLE():", fmRole);

  // Test hasRole for user wallet
  const userWallet = "0x0e3542b4C6963d408F1CB02F3AD3A680E06cc0B2";
  const hasMMRole = await adapter.hasRole(mmRole, userWallet);
  const hasFMRole = await adapter.hasRole(fmRole, userWallet);
  console.log("\nUser", userWallet);
  console.log("  hasRole(MARKET_MAKER):", hasMMRole);
  console.log("  hasRole(FRIEND_MARKET):", hasFMRole);

  console.log("\n" + "=".repeat(60));
  console.log("Summary");
  console.log("=".repeat(60));
  console.log("New TierRegistryAdapter:", predictedAddress);
  console.log("\nNext steps (as user):");
  console.log("  npx hardhat run scripts/operations/create-divisional-public-markets.js --network mordor");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
