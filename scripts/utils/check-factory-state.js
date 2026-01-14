const { ethers } = require("hardhat");

/**
 * Check the state of the new ConditionalMarketFactory
 */

const NEW_FACTORY = '0x08E5a4B716c06e92525E17495d0995A6F7102414';

const FACTORY_ABI = [
  "function owner() view returns (address)",
  "function roleManager() view returns (address)",
  "function ctf1155() view returns (address)",
  "function marketCount() view returns (uint256)",
  "function hasMarketForProposal(uint256 proposalId) view returns (bool)"
];

const ROLE_MANAGER_ABI = [
  "function MARKET_MAKER_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function checkMarketCreationLimitFor(address user, bytes32 role) returns (bool)"
];

const CTF_ABI = [
  "function prepareCondition(address oracle, bytes32 questionId, uint256 outcomeSlotCount) returns (bytes32)"
];

async function main() {
  console.log("=".repeat(60));
  console.log("Checking New Factory State");
  console.log("=".repeat(60));
  console.log("\nFactory address:", NEW_FACTORY);

  const factory = new ethers.Contract(NEW_FACTORY, FACTORY_ABI, ethers.provider);

  // Check basic state
  console.log("\n--- Factory Configuration ---");

  try {
    const owner = await factory.owner();
    console.log("Owner:", owner);
  } catch (e) {
    console.log("Owner: ERROR -", e.message);
  }

  try {
    const roleManager = await factory.roleManager();
    console.log("RoleManager:", roleManager);

    if (roleManager !== ethers.ZeroAddress) {
      const rm = new ethers.Contract(roleManager, ROLE_MANAGER_ABI, ethers.provider);
      const marketMakerRole = await rm.MARKET_MAKER_ROLE();
      console.log("  MARKET_MAKER_ROLE:", marketMakerRole);

      // Check user's role
      const userAddress = '0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E';
      const hasRole = await rm.hasRole(marketMakerRole, userAddress);
      console.log(`  User ${userAddress} hasRole:`, hasRole);

      // Check market creation limit (use staticCall since it's not view)
      try {
        const canCreate = await rm.checkMarketCreationLimitFor.staticCall(userAddress, marketMakerRole);
        console.log("  checkMarketCreationLimitFor:", canCreate);
      } catch (e) {
        console.log("  checkMarketCreationLimitFor: ERROR -", e.message);
      }
    }
  } catch (e) {
    console.log("RoleManager: ERROR -", e.message);
  }

  try {
    const ctf1155 = await factory.ctf1155();
    console.log("CTF1155:", ctf1155);

    if (ctf1155 !== ethers.ZeroAddress) {
      // Try to check if CTF1155 is functional
      const ctf = new ethers.Contract(ctf1155, CTF_ABI, ethers.provider);
      console.log("  CTF1155 contract exists");
    }
  } catch (e) {
    console.log("CTF1155: ERROR -", e.message);
  }

  try {
    const marketCount = await factory.marketCount();
    console.log("Market count:", marketCount.toString());
  } catch (e) {
    console.log("Market count: ERROR -", e.message);
  }

  // Check if test proposal already has a market
  const testProposalId = 1768089435958n;
  try {
    const hasMarket = await factory.hasMarketForProposal(testProposalId);
    console.log(`\nProposal ${testProposalId} has market:`, hasMarket);
  } catch (e) {
    console.log(`Proposal ${testProposalId} check: ERROR -`, e.message);
  }

  // Try to simulate the deployMarketPair call
  console.log("\n--- Simulating deployMarketPair ---");

  const DEPLOY_ABI = [
    "function deployMarketPair(uint256 proposalId, address collateralToken, uint256 liquidityAmount, uint256 liquidityParameter, uint256 tradingPeriod, uint8 betType) returns (uint256)"
  ];

  const factoryWithDeploy = new ethers.Contract(NEW_FACTORY, DEPLOY_ABI, ethers.provider);

  const params = {
    proposalId: testProposalId,
    collateralToken: '0xec6Ed68627749b9C244a25A6d0bAC8962043fdcB',
    liquidityAmount: ethers.parseEther("100.02"),
    liquidityParameter: ethers.parseEther("100"),
    tradingPeriod: 1209600,
    betType: 0
  };

  console.log("Parameters:", params);

  try {
    // Try to estimate gas for the call
    const userAddress = '0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E';
    const callData = factoryWithDeploy.interface.encodeFunctionData("deployMarketPair", [
      params.proposalId,
      params.collateralToken,
      params.liquidityAmount,
      params.liquidityParameter,
      params.tradingPeriod,
      params.betType
    ]);

    const gasEstimate = await ethers.provider.estimateGas({
      from: userAddress,
      to: NEW_FACTORY,
      data: callData
    });
    console.log("Gas estimate:", gasEstimate.toString());
  } catch (e) {
    console.log("Gas estimation failed:", e.message);

    // Try to get more details
    if (e.data) {
      console.log("Revert data:", e.data);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
