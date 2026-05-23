const { expect } = require("chai");
const { ethers } = require("hardhat");
const { ensureSingletonFactory, SINGLETON_FACTORY_ADDRESS } = (() => {
  const helpers = require("../../scripts/deploy/lib/helpers");
  const { SINGLETON_FACTORY_ADDRESS } = require("../../scripts/deploy/lib/constants");
  return { ensureSingletonFactory: helpers.ensureSingletonFactory, SINGLETON_FACTORY_ADDRESS };
})();

// Regression for the bug where `Ownable(msg.sender)` (and `ConfirmedOwner(msg.sender)`)
// in adapter constructors made the Safe Singleton Factory the owner under CREATE2-via-
// factory deploys, leaving the EOA deployer unable to call onlyOwner functions.
//
// Each adapter must now accept an explicit `admin` constructor arg and use that for
// ownership. These tests assemble an initcode with `admin = deployer.address` and
// route it through the SingletonFactory (the exact path scripts/deploy/deploy.js
// takes), then assert `owner()` is the deployer — not the factory.

async function deployViaFactory(deployer, factoryFactory, args, saltSeed) {
  const initCode = (await factoryFactory.getDeployTransaction(...args)).data;
  const salt = ethers.id(saltSeed);
  const initCodeHash = ethers.keccak256(initCode);
  const predicted = ethers.getCreate2Address(SINGLETON_FACTORY_ADDRESS, salt, initCodeHash);
  const tx = await deployer.sendTransaction({
    to: SINGLETON_FACTORY_ADDRESS,
    data: ethers.concat([salt, initCode]),
  });
  await tx.wait();
  const code = await ethers.provider.getCode(predicted);
  expect(code, "factory CREATE2 deploy failed").to.not.equal("0x");
  return predicted;
}

describe("Adapter deterministic-deploy ownership", function () {
  before(async function () {
    await ensureSingletonFactory();
  });

  it("ChainlinkDataFeedOracleAdapter: owner is admin arg, not the factory", async () => {
    const [deployer] = await ethers.getSigners();
    const F = await ethers.getContractFactory("ChainlinkDataFeedOracleAdapter");
    const addr = await deployViaFactory(deployer, F, [deployer.address], "cdf-ownership-regression");
    const adapter = F.attach(addr);
    expect(await adapter.owner()).to.equal(deployer.address);
    expect(await adapter.owner()).to.not.equal(SINGLETON_FACTORY_ADDRESS);
    // setFeedAllowed should now be callable by deployer.
    const feedAddr = "0x000000000000000000000000000000000000dEaD";
    await expect(adapter.connect(deployer).setFeedAllowed(feedAddr, true)).to.not.be.reverted;
  });

  it("UMAOptimisticOracleV3Adapter: owner is admin arg, not the factory", async () => {
    const [deployer] = await ethers.getSigners();
    const OO = await ethers.getContractFactory("MockOptimisticOracleV3");
    const oo = await OO.deploy();
    const F = await ethers.getContractFactory("UMAOptimisticOracleV3Adapter");
    const addr = await deployViaFactory(deployer, F, [deployer.address, await oo.getAddress()], "uma-ownership-regression");
    const adapter = F.attach(addr);
    expect(await adapter.owner()).to.equal(deployer.address);
    expect(await adapter.owner()).to.not.equal(SINGLETON_FACTORY_ADDRESS);
  });

  it("ChainlinkFunctionsOracleAdapter: owner is admin arg, not the factory", async () => {
    const [deployer] = await ethers.getSigners();
    const Router = await ethers.getContractFactory("MockFunctionsRouter");
    const router = await Router.deploy();
    const F = await ethers.getContractFactory("ChainlinkFunctionsOracleAdapter");
    const addr = await deployViaFactory(deployer, F, [deployer.address, await router.getAddress()], "fn-ownership-regression");
    const adapter = F.attach(addr);
    expect(await adapter.owner()).to.equal(deployer.address);
    expect(await adapter.owner()).to.not.equal(SINGLETON_FACTORY_ADDRESS);
  });
});
