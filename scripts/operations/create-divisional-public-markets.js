const { ethers } = require("hardhat");
const { loadMnemonicFromFloppy } = require("./floppy-key/loader");

/**
 * Create NFL Divisional Round PUBLIC Prediction Markets
 *
 * Creates 4 public prediction markets using ConditionalMarketFactory.
 * Anyone can bet on these markets, not just invited friends.
 *
 * Usage:
 *   export FLOPPY_KEYSTORE_PASSWORD="password"
 *   npx hardhat run scripts/operations/create-divisional-public-markets.js --network mordor
 */

// Contract addresses
const CONTRACTS = {
  conditionalMarketFactory: "0xd6F4a7059Ed5E1dc7fC8123768C5BC0fbc54A93a",
  ctf1155: "0xE56d9034591C6A6A5C023883354FAeB435E3b441",
  tieredRoleManager: "0xA6F794292488C628f91A0475dDF8dE6cEF2706EF",
  usc: "0xDE093684c796204224BC081f937aa059D903c52a", // USC stablecoin (6 decimals)
};

// NFL Divisional Round matchups (January 17-18, 2026)
const MATCHUPS = [
  { home: "Denver Broncos", away: "Buffalo Bills", conference: "AFC" },
  { home: "Houston Texans", away: "New England Patriots", conference: "AFC" },
  { home: "Seattle Seahawks", away: "San Francisco 49ers", conference: "NFC" },
  { home: "Los Angeles Rams", away: "Chicago Bears", conference: "NFC" },
];

// Configuration
const CONFIG = {
  tradingPeriodDays: 7,       // 7 days trading period
  liquidityAmount: "100",     // 100 USC initial liquidity
  liquidityParameter: "100",  // LMSR beta parameter
  betType: 8,                 // WinLose enum value
};

// ABIs
const FACTORY_ABI = [
  "function owner() external view returns (address)",
  "function roleManager() external view returns (address)",
  "function ctf1155() external view returns (address)",
  "function marketCount() external view returns (uint256)",
  "function deployMarketPair(uint256 proposalId, address collateralToken, uint256 liquidityAmount, uint256 liquidityParameter, uint256 tradingPeriod, uint8 betType) external returns (uint256 marketId)",
  "function getMarket(uint256 marketId) external view returns (tuple(uint256 proposalId, address passToken, address failToken, address collateralToken, uint256 tradingEndTime, uint256 liquidityParameter, uint256 totalLiquidity, bool resolved, uint256 passValue, uint256 failValue, uint8 status, uint8 betType, bool useCTF, bytes32 conditionId, bytes32 questionId, uint256 passPositionId, uint256 failPositionId, uint256 passQuantity, uint256 failQuantity))",
];

const ERC20_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
];

const ROLE_MANAGER_ABI = [
  "function MARKET_MAKER_ROLE() external view returns (bytes32)",
  "function hasRole(bytes32 role, address account) external view returns (bool)",
];

async function main() {
  console.log("=".repeat(60));
  console.log("Create NFL Divisional Round PUBLIC Prediction Markets");
  console.log("=".repeat(60));

  // Load floppy wallet
  console.log("\n[1/5] Loading floppy wallet...");
  const mnemonic = await loadMnemonicFromFloppy();
  const provider = ethers.provider;
  const hdWallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'/0/0");
  const wallet = hdWallet.connect(provider);

  console.log("Wallet address:", wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log("ETC Balance:", ethers.formatEther(balance), "ETC");

  // Check USC balance
  console.log("\n[2/5] Checking USC balance...");
  const usc = new ethers.Contract(CONTRACTS.usc, ERC20_ABI, wallet);
  const uscBalance = await usc.balanceOf(wallet.address);
  const uscDecimals = await usc.decimals();
  const uscSymbol = await usc.symbol();
  console.log("USC Balance:", ethers.formatUnits(uscBalance, uscDecimals), uscSymbol);

  // Check factory configuration
  console.log("\n[3/5] Checking factory configuration...");
  const factory = new ethers.Contract(CONTRACTS.conditionalMarketFactory, FACTORY_ABI, wallet);

  const owner = await factory.owner();
  console.log("Factory owner:", owner);
  console.log("Wallet is owner:", owner.toLowerCase() === wallet.address.toLowerCase());

  const ctf1155 = await factory.ctf1155();
  console.log("CTF1155 configured:", ctf1155 !== ethers.ZeroAddress);

  const roleManagerAddr = await factory.roleManager();
  console.log("RoleManager:", roleManagerAddr);

  const currentMarketCount = await factory.marketCount();
  console.log("Current market count:", currentMarketCount.toString());

  // Verify we can create markets (owner OR has role)
  const isOwner = owner.toLowerCase() === wallet.address.toLowerCase();
  let hasMarketMakerRole = false;

  if (roleManagerAddr !== ethers.ZeroAddress) {
    const roleManager = new ethers.Contract(roleManagerAddr, ROLE_MANAGER_ABI, provider);
    const marketMakerRole = await roleManager.MARKET_MAKER_ROLE();
    hasMarketMakerRole = await roleManager.hasRole(marketMakerRole, wallet.address);
  }

  console.log("Can create markets:", isOwner || hasMarketMakerRole);

  if (!isOwner && !hasMarketMakerRole) {
    console.error("\nError: Wallet cannot create markets");
    console.log("You need to either:");
    console.log("  1. Use the owner wallet (admin floppy disk)");
    console.log("  2. Purchase MARKET_MAKER_ROLE membership");
    process.exit(1);
  }

  // Calculate costs
  const liquidityWei = ethers.parseUnits(CONFIG.liquidityAmount, uscDecimals);
  const totalLiquidity = liquidityWei * BigInt(MATCHUPS.length);

  console.log("\n[4/5] Cost estimate:");
  console.log("  Liquidity per market:", CONFIG.liquidityAmount, "USC");
  console.log("  Number of markets:", MATCHUPS.length);
  console.log("  Total USC needed:", ethers.formatUnits(totalLiquidity, uscDecimals), "USC");

  if (uscBalance < totalLiquidity) {
    console.error("\nError: Insufficient USC balance");
    console.log("Required:", ethers.formatUnits(totalLiquidity, uscDecimals), "USC");
    console.log("Available:", ethers.formatUnits(uscBalance, uscDecimals), "USC");
    process.exit(1);
  }

  // Approve USC spending
  console.log("\n  Approving USC spending...");
  const currentAllowance = await usc.allowance(wallet.address, CONTRACTS.conditionalMarketFactory);
  if (currentAllowance < totalLiquidity) {
    const approveTx = await usc.approve(CONTRACTS.conditionalMarketFactory, totalLiquidity);
    await approveTx.wait();
    console.log("  Approved:", ethers.formatUnits(totalLiquidity, uscDecimals), "USC");
  } else {
    console.log("  Already approved");
  }

  // Create markets
  console.log("\n[5/5] Creating public markets...");
  const tradingPeriod = CONFIG.tradingPeriodDays * 24 * 60 * 60;
  const liquidityParameter = ethers.parseUnits(CONFIG.liquidityParameter, uscDecimals);

  const createdMarkets = [];

  for (let i = 0; i < MATCHUPS.length; i++) {
    const matchup = MATCHUPS[i];

    // Generate unique proposal ID from matchup details
    const proposalId = BigInt(ethers.keccak256(
      ethers.toUtf8Bytes(`NFL-Divisional-2026-${matchup.home}-vs-${matchup.away}`)
    ).slice(0, 18));

    console.log(`\n  [${i + 1}/${MATCHUPS.length}] ${matchup.home} vs ${matchup.away}`);
    console.log(`  Proposal ID: ${proposalId}`);
    console.log(`  Question: Will ${matchup.home} beat ${matchup.away}?`);

    try {
      const tx = await factory.deployMarketPair(
        proposalId,
        CONTRACTS.usc,
        liquidityWei,
        liquidityParameter,
        tradingPeriod,
        CONFIG.betType
      );

      console.log("  Tx:", tx.hash);
      const receipt = await tx.wait();
      console.log("  Confirmed, gas used:", receipt.gasUsed.toString());

      // Get market ID from event or count
      const newCount = await factory.marketCount();
      const marketId = newCount - 1n;
      console.log("  Market ID:", marketId.toString());

      // Get market details
      const market = await factory.getMarket(marketId);
      console.log("  Trading ends:", new Date(Number(market.tradingEndTime) * 1000).toISOString());

      createdMarkets.push({
        id: marketId.toString(),
        proposalId: proposalId.toString(),
        matchup: `${matchup.home} vs ${matchup.away}`,
        conference: matchup.conference,
        txHash: tx.hash,
        tradingEndTime: market.tradingEndTime.toString(),
      });
    } catch (err) {
      console.error("  Error:", err.message);
      if (err.data) {
        console.error("  Revert data:", err.data);
      }
      break;
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("Summary");
  console.log("=".repeat(60));
  console.log("\nCreated", createdMarkets.length, "public prediction markets:");

  for (const market of createdMarkets) {
    console.log(`\n  [Market ${market.id}] ${market.conference}: ${market.matchup}`);
    console.log(`    Proposal ID: ${market.proposalId}`);
    console.log(`    Tx: ${market.txHash}`);
  }

  console.log("\nCollateral token:", CONTRACTS.usc, "(USC)");
  console.log("Trading period:", CONFIG.tradingPeriodDays, "days");
  console.log("Bet type: WinLose");

  console.log("\nAnyone can now bet on these markets by calling buyTokens() on:");
  console.log("ConditionalMarketFactory:", CONTRACTS.conditionalMarketFactory);

  // Final balance
  const finalUscBalance = await usc.balanceOf(wallet.address);
  const finalEtcBalance = await provider.getBalance(wallet.address);
  console.log("\nFinal balances:");
  console.log("  USC:", ethers.formatUnits(finalUscBalance, uscDecimals), "USC");
  console.log("  ETC:", ethers.formatEther(finalEtcBalance), "ETC");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
