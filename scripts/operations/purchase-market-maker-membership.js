const { ethers } = require("hardhat");
const { loadMnemonicFromFloppy } = require("./floppy-key/loader");

/**
 * Purchase MARKET_MAKER_ROLE membership using USC
 *
 * This grants the ability to create PUBLIC prediction markets
 * on the ConditionalMarketFactory.
 *
 * Usage:
 *   export FLOPPY_KEYSTORE_PASSWORD="password"
 *   npx hardhat run scripts/operations/purchase-market-maker-membership.js --network mordor
 */

// Contract addresses (modular RBAC system)
const CONTRACTS = {
  paymentProcessor: "0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63",
  tierRegistry: "0x31405f0359703109C424d31A86bd7CEF08836A12",
  tieredRoleManager: "0xA6F794292488C628f91A0475dDF8dE6cEF2706EF",
  usc: "0xDE093684c796204224BC081f937aa059D903c52a",
  conditionalMarketFactory: "0xd6F4a7059Ed5E1dc7fC8123768C5BC0fbc54A93a",
};

// Role hash
const MARKET_MAKER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MARKET_MAKER_ROLE"));

// Tier prices in USC (6 decimals)
const TIER_PRICES = {
  BRONZE: 100,   // 100 USC
  SILVER: 200,   // 200 USC
  GOLD: 350,     // 350 USC
  PLATINUM: 600, // 600 USC
};

const MembershipTier = {
  NONE: 0,
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  PLATINUM: 4,
};

// ABIs
const PAYMENT_PROCESSOR_ABI = [
  "function purchaseTierWithToken(bytes32 role, uint8 tier, address paymentToken, uint256 amount) external",
  "function paymentManager() external view returns (address)",
];

const TIER_REGISTRY_ABI = [
  "function getUserTier(address user, bytes32 role) external view returns (uint8)",
  "function isTierActive(bytes32 role, uint8 tier) external view returns (bool)",
];

const TIERED_ROLE_MANAGER_ABI = [
  "function hasRole(bytes32 role, address account) external view returns (bool)",
  "function MARKET_MAKER_ROLE() external view returns (bytes32)",
  "function getUserTier(address user, bytes32 role) external view returns (uint8)",
  "function membershipExpiration(address user, bytes32 role) external view returns (uint256)",
];

const PAYMENT_MANAGER_ABI = [
  "function getRolePrice(bytes32 role, address token) external view returns (uint256)",
  "function paymentTokens(address token) external view returns (bool isActive, string memory symbol, uint8 decimals)",
];

const ERC20_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
];

async function main() {
  console.log("=".repeat(60));
  console.log("Purchase MARKET_MAKER_ROLE Membership");
  console.log("=".repeat(60));

  // Load floppy wallet
  console.log("\n[1/6] Loading floppy wallet...");
  const mnemonic = await loadMnemonicFromFloppy();
  const provider = ethers.provider;
  const hdWallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'/0/0");
  const wallet = hdWallet.connect(provider);

  console.log("Wallet address:", wallet.address);

  // Check balances
  console.log("\n[2/6] Checking balances...");
  const etcBalance = await provider.getBalance(wallet.address);
  console.log("ETC balance:", ethers.formatEther(etcBalance), "ETC");

  const usc = new ethers.Contract(CONTRACTS.usc, ERC20_ABI, wallet);
  const uscBalance = await usc.balanceOf(wallet.address);
  const uscDecimals = await usc.decimals();
  console.log("USC balance:", ethers.formatUnits(uscBalance, uscDecimals), "USC");

  // Check current membership status
  console.log("\n[3/6] Checking current membership status...");
  const tieredRoleManager = new ethers.Contract(
    CONTRACTS.tieredRoleManager,
    TIERED_ROLE_MANAGER_ABI,
    provider
  );

  const roleHash = await tieredRoleManager.MARKET_MAKER_ROLE();
  console.log("MARKET_MAKER_ROLE hash:", roleHash);

  const hasRole = await tieredRoleManager.hasRole(roleHash, wallet.address);
  const currentTier = await tieredRoleManager.getUserTier(wallet.address, roleHash);

  const tierNames = ["NONE", "BRONZE", "SILVER", "GOLD", "PLATINUM"];
  console.log("Current tier:", tierNames[Number(currentTier)]);
  console.log("Has MARKET_MAKER_ROLE:", hasRole);

  if (hasRole) {
    console.log("\nYou already have MARKET_MAKER_ROLE!");
    const expiration = await tieredRoleManager.membershipExpiration(wallet.address, roleHash);
    if (expiration > 0n) {
      console.log("Expires:", new Date(Number(expiration) * 1000).toISOString());
    }
    console.log("\nYou can create public markets. Run:");
    console.log("  npx hardhat run scripts/operations/create-divisional-public-markets.js --network mordor");
    return;
  }

  // Get price from PaymentManager
  console.log("\n[4/6] Getting membership price...");
  const paymentProcessor = new ethers.Contract(
    CONTRACTS.paymentProcessor,
    PAYMENT_PROCESSOR_ABI,
    wallet
  );

  const paymentManagerAddr = await paymentProcessor.paymentManager();
  const paymentManager = new ethers.Contract(paymentManagerAddr, PAYMENT_MANAGER_ABI, provider);

  const price = await paymentManager.getRolePrice(roleHash, CONTRACTS.usc);
  console.log("MARKET_MAKER_ROLE price:", ethers.formatUnits(price, uscDecimals), "USC");

  // Use price from contract, fallback to TIER_PRICES if zero
  const priceWei = price > 0n ? price : ethers.parseUnits(TIER_PRICES.BRONZE.toString(), uscDecimals);
  const priceFormatted = ethers.formatUnits(priceWei, uscDecimals);

  console.log("Using price:", priceFormatted, "USC");

  if (uscBalance < priceWei) {
    console.error("\nError: Insufficient USC balance");
    console.log("Required:", priceFormatted, "USC");
    console.log("Available:", ethers.formatUnits(uscBalance, uscDecimals), "USC");
    process.exit(1);
  }

  // Check tier is active
  const tierRegistry = new ethers.Contract(CONTRACTS.tierRegistry, TIER_REGISTRY_ABI, provider);
  const tierActive = await tierRegistry.isTierActive(roleHash, MembershipTier.BRONZE);
  console.log("BRONZE tier active:", tierActive);

  if (!tierActive) {
    console.error("\nError: BRONZE tier is not active for MARKET_MAKER_ROLE");
    process.exit(1);
  }

  // Approve USC and execute purchase
  console.log("\n[5/6] Executing purchase...");

  // Check and set allowance
  const allowance = await usc.allowance(wallet.address, CONTRACTS.paymentProcessor);
  if (allowance < priceWei) {
    console.log("Approving USC for PaymentProcessor...");
    const approveTx = await usc.approve(CONTRACTS.paymentProcessor, priceWei);
    console.log("Approval TX:", approveTx.hash);
    await approveTx.wait();
    console.log("Approval confirmed");
  } else {
    console.log("USC already approved");
  }

  // Execute purchase
  console.log("Calling purchaseTierWithToken...");
  const purchaseTx = await paymentProcessor.purchaseTierWithToken(
    roleHash,
    MembershipTier.BRONZE,
    CONTRACTS.usc,
    priceWei
  );

  console.log("Purchase TX:", purchaseTx.hash);
  console.log("Waiting for confirmation...");

  const receipt = await purchaseTx.wait();
  console.log("Confirmed in block:", receipt.blockNumber);
  console.log("Gas used:", receipt.gasUsed.toString());

  // Verify membership
  console.log("\n[6/6] Verifying membership...");

  const newHasRole = await tieredRoleManager.hasRole(roleHash, wallet.address);
  const newTier = await tieredRoleManager.getUserTier(wallet.address, roleHash);
  const expiration = await tieredRoleManager.membershipExpiration(wallet.address, roleHash);

  console.log("New tier:", tierNames[Number(newTier)]);
  console.log("Has MARKET_MAKER_ROLE:", newHasRole);
  if (expiration > 0n) {
    console.log("Expires:", new Date(Number(expiration) * 1000).toISOString());
  }

  // Final status
  console.log("\n" + "=".repeat(60));
  if (newHasRole) {
    console.log("SUCCESS: MARKET_MAKER_ROLE membership purchased!");
    console.log("\nYou can now create public prediction markets:");
    console.log("  npx hardhat run scripts/operations/create-divisional-public-markets.js --network mordor");
  } else {
    console.log("WARNING: Transaction completed but role not granted");
    console.log("Check transaction on block explorer");
  }
  console.log("=".repeat(60));

  // Show new balances
  const newEtcBalance = await provider.getBalance(wallet.address);
  const newUscBalance = await usc.balanceOf(wallet.address);
  console.log("\nNew ETC balance:", ethers.formatEther(newEtcBalance), "ETC");
  console.log("New USC balance:", ethers.formatUnits(newUscBalance, uscDecimals), "USC");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n[ERROR]", err.message);
    process.exit(1);
  });
