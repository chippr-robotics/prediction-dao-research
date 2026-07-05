/**
 * Seed POOL_PARTICIPANT_ROLE membership tiers (spec 034 gated pools).
 *
 * Pools on value-bearing networks are sanctions-screened AND membership-gated: the WagerPoolFactory
 * calls `membershipManager.checkCanCreate(user, POOL_PARTICIPANT_ROLE)` on create/join, which returns
 * false unless the wallet holds an active POOL_PARTICIPANT_ROLE membership. The contract forbids $0
 * tiers (`_purchaseTier` reverts `PriceZero`), so the compliance gate is a PAID, self-served membership
 * screened for sanctions on purchase — mirroring the 1v1 WAGER_PARTICIPANT ladder (the chosen config).
 *
 * This seeds the SAME 4-tier ladder (2/8/25/100, 30-day, identical limits) for POOL_PARTICIPANT_ROLE
 * on the MembershipManager recorded in deployments/<net>-chain<id>-v2.json. Idempotent-ish: setTier is
 * an upsert, safe to re-run. Run BEFORE deploy-wager-pool-factory.js with POOL_ENABLE_MEMBERSHIP=1.
 *
 * Usage:
 *   POLYGON_RPC_URL=... npx hardhat run scripts/deploy/seed-pool-tiers.js --network polygon
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { WAGER_PARTICIPANT_TIERS } = require("./lib/constants");

const POOL_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("POOL_PARTICIPANT_ROLE"));

// Tier price is authored in 18-decimal ethers (whole dollars); scale to the payment token's decimals.
function toTokenUnits(price18, decimals) {
  return price18 / 10n ** BigInt(18 - decimals);
}

async function main() {
  const net = hre.network.name;
  const { chainId } = await ethers.provider.getNetwork();
  const [deployer] = await ethers.getSigners();

  const filename = `${net}-chain${chainId}-v2.json`;
  const filepath = path.join(process.cwd(), "deployments", filename);
  if (!fs.existsSync(filepath)) throw new Error(`No deployment record at deployments/${filename}`);
  const record = JSON.parse(fs.readFileSync(filepath, "utf8"));
  const contracts = record.contracts || record;
  const mmAddr = contracts.membershipManager;
  if (!mmAddr || !ethers.isAddress(mmAddr)) throw new Error(`No membershipManager in deployments/${filename}`);

  console.log("=".repeat(60));
  console.log("Seed POOL_PARTICIPANT_ROLE tiers (spec 034 gated pools)");
  console.log("=".repeat(60));
  console.log(`Network:            ${net} (chainId ${chainId})`);
  console.log(`Deployer/admin:     ${deployer.address}`);
  console.log(`MembershipManager:  ${mmAddr}`);
  console.log(`POOL_PARTICIPANT_ROLE: ${POOL_PARTICIPANT_ROLE}`);

  const mm = await ethers.getContractAt("MembershipManager", mmAddr, deployer);

  // Payment-token decimals (prices scale to the stablecoin's own decimals; USDC = 6).
  const paymentToken = await mm.paymentToken();
  const erc20 = await ethers.getContractAt(
    ["function decimals() view returns (uint8)"],
    paymentToken
  );
  const decimals = Number(await erc20.decimals());
  console.log(`Payment token:      ${paymentToken} (decimals ${decimals})\n`);

  const tierNames = ["NONE", "BRONZE", "SILVER", "GOLD", "PLATINUM"];
  for (const cfg of WAGER_PARTICIPANT_TIERS) {
    const priceUSDC = toTokenUnits(cfg.price, decimals);
    const limits = {
      monthlyMarketCreation:
        cfg.limits.monthlyMarketCreation > 2n ** 32n - 1n ? 0 : Number(cfg.limits.monthlyMarketCreation),
      maxConcurrentMarkets:
        cfg.limits.maxConcurrentMarkets > 2n ** 32n - 1n ? 0 : Number(cfg.limits.maxConcurrentMarkets),
    };
    console.log(
      `  POOL ${tierNames[cfg.tier]}: ${ethers.formatUnits(priceUSDC, decimals)} ` +
        `(${limits.monthlyMarketCreation || "∞"}/mo, ${limits.maxConcurrentMarkets || "∞"} concurrent, 30-day)`
    );
    const tx = await mm.setTier(POOL_PARTICIPANT_ROLE, cfg.tier, priceUSDC, 30, limits, true);
    await tx.wait();
  }

  // Verify one tier round-trips.
  const bronze = await mm.getTierConfig(POOL_PARTICIPANT_ROLE, 1);
  console.log(`\n  ✓ Verified BRONZE on-chain: price=${ethers.formatUnits(bronze.priceUSDC, decimals)}, active=${bronze.active}`);
  console.log("\nDone. Next: deploy the factory with POOL_ENABLE_MEMBERSHIP=1 (screeningRequired defaults true on mainnet).");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
