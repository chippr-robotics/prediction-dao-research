const { expect } = require("chai");
const { ethers, network } = require("hardhat");

// Amoy (chainId 80002) addresses verified at PR time. If any of these drift,
// the test will fail and the deploy-script constants must be updated alongside.
const AMOY = {
  FUNCTIONS_ROUTER: "0xC22a79eBA640940ABB6dF0f7982cc119578E11De",
  ETH_USD_FEED:     "0xF0d50568e3A7e8259E16663972b11910F89BD8e7",
  UMA_OOV3:         "0xd8866E76441df243fc98B892362Fc6264dC3ca80",
};

// Fork tests require an Amoy RPC URL that serves historical state — i.e. an
// archive node (Alchemy, Infura, QuickNode, etc.). The public endpoint at
// rpc-amoy.polygon.technology is pruned and will fail with "historical state
// is not available" on most calls. Set AMOY_FORK_BLOCK to pin to a block that
// your provider still has.
const describeFork = process.env.AMOY_RPC_URL ? describe : describe.skip;

describeFork("Amoy oracle adapters (fork)", function () {
  this.timeout(120_000);

  before(async function () {
    const blockTag = process.env.AMOY_FORK_BLOCK
      ? { blockNumber: parseInt(process.env.AMOY_FORK_BLOCK, 10) }
      : {};
    await network.provider.request({
      method: "hardhat_reset",
      params: [{ forking: { jsonRpcUrl: process.env.AMOY_RPC_URL, ...blockTag } }],
    });
  });

  after(async function () {
    await network.provider.request({ method: "hardhat_reset", params: [] });
  });

  it("ChainlinkDataFeedOracleAdapter is available and ETH/USD feed has fresh data", async () => {
    const [admin] = await ethers.getSigners();
    const Adapter = await ethers.getContractFactory("ChainlinkDataFeedOracleAdapter");
    const adapter = await Adapter.deploy(admin.address);
    expect(await adapter.isAvailable()).to.equal(true);

    // Verify the live feed returns a non-zero answer and a sane updatedAt.
    const feed = await ethers.getContractAt(
      "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol:AggregatorV3Interface",
      AMOY.ETH_USD_FEED
    );
    const [, answer, , updatedAt] = await feed.latestRoundData();
    expect(answer).to.be.gt(0n, "ETH/USD answer should be positive");
    expect(updatedAt).to.be.gt(0n, "updatedAt should be nonzero");
  });

  it("ChainlinkFunctionsOracleAdapter is available against the real Functions router", async () => {
    const [admin] = await ethers.getSigners();
    const Adapter = await ethers.getContractFactory("ChainlinkFunctionsOracleAdapter");
    const adapter = await Adapter.deploy(admin.address, AMOY.FUNCTIONS_ROUTER);
    expect(await adapter.isAvailable()).to.equal(true);
    expect(await adapter.router()).to.equal(AMOY.FUNCTIONS_ROUTER);
  });

  it("UMAOptimisticOracleV3Adapter is available against the real OOv3 and reads defaultIdentifier", async () => {
    const [admin] = await ethers.getSigners();
    const Adapter = await ethers.getContractFactory("UMAOptimisticOracleV3Adapter");
    const adapter = await Adapter.deploy(admin.address, AMOY.UMA_OOV3);
    expect(await adapter.isAvailable()).to.equal(true);
    const oo = await ethers.getContractAt(
      "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol:OptimisticOracleV3Interface",
      AMOY.UMA_OOV3
    );
    const id = await oo.defaultIdentifier();
    expect(id).to.not.equal(ethers.ZeroHash);
  });
});
