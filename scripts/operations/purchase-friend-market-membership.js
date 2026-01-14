#!/usr/bin/env node
/**
 * Purchase BRONZE tier FRIEND_MARKET_ROLE membership using floppy wallet
 *
 * Uses the modular RBAC system (PaymentProcessor + USC stablecoin)
 * matching the frontend purchase flow.
 *
 * Usage:
 *   node scripts/purchase-friend-market-membership.js
 *
 * Environment:
 *   FLOPPY_PASSWORD - Password for the floppy keystore
 *
 * Prerequisites:
 *   1. Floppy must be mounted: npm run floppy:mount
 *   2. Keystore must exist: npm run floppy:create
 *   3. Wallet must have sufficient USC for purchase and ETC for gas
 */
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Import keystore functions
const { decryptMnemonic } = require('./floppy-key/keystore');
const CONFIG = require('./floppy-key/config');

// Load .env manually
const envPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

// Constants
const KEYSTORE_PATH = path.join(
  CONFIG.MOUNT_POINT,
  CONFIG.KEYSTORE_DIR,
  CONFIG.KEYSTORE_FILENAME
);

const RPC_URL = 'https://rpc.mordor.etccooperative.org';

// Modular RBAC contracts (same as frontend)
const PAYMENT_PROCESSOR = '0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63';
const TIER_REGISTRY = '0x4eb93BaF14f668F8f67922121A3b9FC3FB5b8A0d';
const USC_TOKEN = '0xDE093684c796204224BC081f937aa059D903c52a';

// Role hash
const FRIEND_MARKET_ROLE = '0xdb55b9a5e3db03c050b2061aa4630dce0551d72bfbab51ffb04a59ffd866d209';

// Tier prices in USC (6 decimals) - matching frontend
const TIER_PRICES = {
  BRONZE: 50,    // 50 USC
  SILVER: 100,   // 100 USC
  GOLD: 175,     // 175 USC
  PLATINUM: 300  // 300 USC
};

const MembershipTier = {
  NONE: 0,
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  PLATINUM: 4
};

// ABIs
const PAYMENT_PROCESSOR_ABI = [
  'function purchaseTierWithToken(bytes32 role, uint8 tier, address paymentToken, uint256 amount) external',
  'function membershipPaymentManager() external view returns (address)'
];

const TIER_REGISTRY_ABI = [
  'function userTiers(address, bytes32) external view returns (uint8)',
  'function tierMetadata(bytes32, uint8) external view returns (string name, string description, uint256 price, tuple(uint256,uint256,uint256,uint256,uint256,uint256,bool,bool,uint256) limits, bool isActive)'
];

const ERC20_ABI = [
  'function balanceOf(address owner) external view returns (uint256)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function decimals() external view returns (uint8)'
];

const TIERED_ROLE_MANAGER_ABI = [
  'function hasRole(bytes32 role, address account) external view returns (bool)',
  'function userTiers(address, bytes32) external view returns (uint8)',
  'function membershipExpiration(address, bytes32) external view returns (uint256)'
];

// TieredRoleManager for verification (same contract used by FriendGroupMarketFactory)
const TIERED_ROLE_MANAGER = '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF';

async function main() {
  console.log('='.repeat(60));
  console.log('Purchase FRIEND_MARKET_ROLE Bronze Tier Membership');
  console.log('Using Modular RBAC (PaymentProcessor + USC)');
  console.log('='.repeat(60));

  // Step 1: Pre-flight checks
  console.log('\n[1/7] Pre-flight checks...');

  if (!fs.existsSync(KEYSTORE_PATH)) {
    console.error('Error: Keystore not found at', KEYSTORE_PATH);
    console.error('Run: npm run floppy:mount && npm run floppy:create');
    process.exit(1);
  }

  const password = process.env.FLOPPY_PASSWORD;
  if (!password) {
    console.error('Error: FLOPPY_PASSWORD not set in environment');
    process.exit(1);
  }

  console.log('Keystore found at:', KEYSTORE_PATH);

  // Step 2: Load and decrypt floppy wallet
  console.log('\n[2/7] Loading floppy wallet...');

  const keystoreJson = fs.readFileSync(KEYSTORE_PATH, 'utf8');
  const keystore = JSON.parse(keystoreJson);
  console.log('Keystore ID:', keystore.id);

  let mnemonic;
  try {
    mnemonic = await decryptMnemonic(keystore, password);
    console.log('Decryption successful!');
  } catch (e) {
    console.error('Decryption failed:', e.message);
    process.exit(1);
  }

  // Derive wallet from mnemonic (first account)
  const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'/0/0");
  console.log('Wallet address:', wallet.address);

  // Connect to provider
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const connectedWallet = wallet.connect(provider);

  // Step 3: Check balances
  console.log('\n[3/7] Checking balances...');

  const etcBalance = await provider.getBalance(wallet.address);
  console.log('ETC balance:', ethers.formatEther(etcBalance), 'ETC');

  const uscContract = new ethers.Contract(USC_TOKEN, ERC20_ABI, connectedWallet);
  const uscBalance = await uscContract.balanceOf(wallet.address);
  const uscDecimals = await uscContract.decimals();
  console.log('USC balance:', ethers.formatUnits(uscBalance, uscDecimals), 'USC');

  // Step 4: Check current tier status
  console.log('\n[4/7] Checking current membership status...');

  const tierRegistry = new ethers.Contract(TIER_REGISTRY, TIER_REGISTRY_ABI, provider);
  const tieredRoleManager = new ethers.Contract(TIERED_ROLE_MANAGER, TIERED_ROLE_MANAGER_ABI, provider);

  const currentTier = await tierRegistry.userTiers(wallet.address, FRIEND_MARKET_ROLE);
  const hasRole = await tieredRoleManager.hasRole(FRIEND_MARKET_ROLE, wallet.address);

  console.log('Current tier:', ['NONE', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'][Number(currentTier)]);
  console.log('Has role:', hasRole);

  if (currentTier !== 0n) {
    console.error(`Error: User already has tier ${['NONE', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'][Number(currentTier)]}`);
    process.exit(1);
  }

  // Step 5: Calculate price and check USC balance
  console.log('\n[5/7] Calculating purchase price...');

  const priceUSC = TIER_PRICES.BRONZE;
  const priceWei = ethers.parseUnits(priceUSC.toString(), uscDecimals);

  console.log('Tier: BRONZE');
  console.log('Price:', priceUSC, 'USC');

  if (uscBalance < priceWei) {
    console.error(`Error: Insufficient USC balance`);
    console.error(`  Required: ${priceUSC} USC`);
    console.error(`  Available: ${ethers.formatUnits(uscBalance, uscDecimals)} USC`);
    process.exit(1);
  }

  // Step 6: Approve USC and execute purchase
  console.log('\n[6/7] Executing purchase...');

  const paymentProcessor = new ethers.Contract(PAYMENT_PROCESSOR, PAYMENT_PROCESSOR_ABI, connectedWallet);

  // Check and set allowance
  const allowance = await uscContract.allowance(wallet.address, PAYMENT_PROCESSOR);
  if (allowance < priceWei) {
    console.log('Approving USC for PaymentProcessor...');
    const approveTx = await uscContract.approve(PAYMENT_PROCESSOR, priceWei);
    console.log('Approval TX:', approveTx.hash);
    await approveTx.wait();
    console.log('Approval confirmed');
  } else {
    console.log('USC already approved');
  }

  // Execute purchase
  console.log('Calling purchaseTierWithToken...');
  const purchaseTx = await paymentProcessor.purchaseTierWithToken(
    FRIEND_MARKET_ROLE,
    MembershipTier.BRONZE,
    USC_TOKEN,
    priceWei
  );

  console.log('Purchase TX:', purchaseTx.hash);
  console.log('Waiting for confirmation...');

  const receipt = await purchaseTx.wait();
  console.log('Confirmed in block:', receipt.blockNumber);
  console.log('Gas used:', receipt.gasUsed.toString());

  // Step 7: Verify membership
  console.log('\n[7/7] Verifying membership...');

  const newTier = await tierRegistry.userTiers(wallet.address, FRIEND_MARKET_ROLE);
  const newHasRole = await tieredRoleManager.hasRole(FRIEND_MARKET_ROLE, wallet.address);
  const expiration = await tieredRoleManager.membershipExpiration(wallet.address, FRIEND_MARKET_ROLE);

  const tierNames = ['NONE', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];
  const expDate = expiration > 0n ? new Date(Number(expiration) * 1000).toISOString() : 'N/A';

  console.log('New tier:', tierNames[Number(newTier)]);
  console.log('Has FRIEND_MARKET_ROLE:', newHasRole);
  console.log('Membership expires:', expDate);

  // Final status
  console.log('\n' + '='.repeat(60));
  if (newTier === BigInt(MembershipTier.BRONZE)) {
    console.log('SUCCESS: Bronze tier FRIEND_MARKET_ROLE purchased!');
    console.log('You can now create friend markets.');
  } else {
    console.log('WARNING: Transaction completed but tier not set');
    console.log('Check transaction on block explorer');
  }
  console.log('='.repeat(60));

  // Show new balances
  const newEtcBalance = await provider.getBalance(wallet.address);
  const newUscBalance = await uscContract.balanceOf(wallet.address);
  console.log('\nNew ETC balance:', ethers.formatEther(newEtcBalance), 'ETC');
  console.log('New USC balance:', ethers.formatUnits(newUscBalance, uscDecimals), 'USC');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n[ERROR]', error.message);
    process.exit(1);
  });
