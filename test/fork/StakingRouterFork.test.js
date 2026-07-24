const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { deployFeeRouter, deployStakingRouter } = require("../helpers/proxy");

// spec 066 — StakingRouter LIQUID fee-and-forward against the REAL Lido + sPOL
// contracts on an Ethereum-mainnet fork (constitution II: fork tests where external
// protocols are involved). Verifies the treasury grows by exactly the disclosed fee,
// the net is staked with the provider, the LST is returned to the member, and no
// residual is left in the router.
//
// Requires an Ethereum-mainnet archive RPC (MAINNET_RPC_URL). The sPOL leg
// additionally needs a funded POL holder to impersonate (POL_WHALE); it self-skips
// when that is unset. Pin MAINNET_FORK_BLOCK to a block your provider still serves.
const MAINNET = {
  STETH: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
  WSTETH: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  SPOL_CONTROLLER: "0xEaadA411F2600570796c341552b9869DA708a28B",
  SPOL_TOKEN: "0x3B790d651e950497c7723D47B24E6f61534f7969",
  POL_TOKEN: "0x455e53CBB86018Ac2B8092FdCd39d8444aFFC3F6",
  STAKE_MANAGER: "0x5e3Ef299fDDf15eAa0432E6e66473ace8c13D908",
};
const ERC20 = ["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)"];
const describeFork = process.env.MAINNET_RPC_URL ? describe : describe.skip;

describeFork("StakingRouter (mainnet fork)", function () {
  this.timeout(180_000);

  const STAKE_LIDO = ethers.keccak256(ethers.toUtf8Bytes("stake.lido"));
  const STAKE_POLYGON = ethers.keccak256(ethers.toUtf8Bytes("stake.polygon"));
  const Kind = { Unregistered: 0, Wrapped: 1, ConfigOnly: 2 };

  let admin, member, treasury;
  let router;

  before(async function () {
    const blockTag = process.env.MAINNET_FORK_BLOCK
      ? { blockNumber: parseInt(process.env.MAINNET_FORK_BLOCK, 10) }
      : {};
    await network.provider.request({
      method: "hardhat_reset",
      params: [{ forking: { jsonRpcUrl: process.env.MAINNET_RPC_URL, ...blockTag } }],
    });
    [admin, member, treasury] = await ethers.getSigners();

    const feeRouter = await deployFeeRouter([admin.address, treasury.address]);
    await feeRouter.registerService(STAKE_LIDO, 250, Kind.ConfigOnly);
    await feeRouter.registerService(STAKE_POLYGON, 250, Kind.ConfigOnly);
    await feeRouter.setFeeBps(STAKE_LIDO, 50);
    await feeRouter.setFeeBps(STAKE_POLYGON, 50);

    router = await deployStakingRouter([
      admin.address,
      await feeRouter.getAddress(),
      MAINNET.STETH,
      MAINNET.WSTETH,
      MAINNET.SPOL_CONTROLLER,
      MAINNET.SPOL_TOKEN,
      MAINNET.POL_TOKEN,
      MAINNET.STAKE_MANAGER,
    ]);
  });

  after(async function () {
    await network.provider.request({ method: "hardhat_reset", params: [] });
  });

  it("stakeLido: treasury grows by exactly the fee, member receives wstETH, no residual", async function () {
    const wsteth = new ethers.Contract(MAINNET.WSTETH, ERC20, ethers.provider);
    const gross = ethers.parseEther("1");
    const fee = (gross * 50n) / 10_000n;

    const treasuryBefore = await ethers.provider.getBalance(treasury.address);
    const memberWstBefore = await wsteth.balanceOf(member.address);

    await router.connect(member).stakeLido(50, { value: gross });

    expect(await ethers.provider.getBalance(treasury.address)).to.equal(treasuryBefore + fee);
    expect(await wsteth.balanceOf(member.address)).to.be.gt(memberWstBefore); // received wstETH
    expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(0); // no residual
  });

  it("stakeSpol: treasury grows by exactly the fee, member receives sPOL, no residual", async function () {
    if (!process.env.POL_WHALE) {
      this.skip(); // needs a funded POL holder to impersonate
    }
    const pol = new ethers.Contract(MAINNET.POL_TOKEN, [...ERC20, "function approve(address,uint256) returns (bool)"], ethers.provider);
    const spol = new ethers.Contract(MAINNET.SPOL_TOKEN, ERC20, ethers.provider);
    const amount = ethers.parseEther("100");
    const fee = (amount * 50n) / 10_000n;

    await network.provider.request({ method: "hardhat_impersonateAccount", params: [process.env.POL_WHALE] });
    const whale = await ethers.getSigner(process.env.POL_WHALE);
    await network.provider.send("hardhat_setBalance", [process.env.POL_WHALE, "0x56BC75E2D63100000"]);
    await pol.connect(whale).transfer(member.address, amount);
    await pol.connect(member).approve(await router.getAddress(), amount);

    const treasuryBefore = await pol.balanceOf(treasury.address);
    await router.connect(member).stakeSpol(amount, 50);

    expect(await pol.balanceOf(treasury.address)).to.equal(treasuryBefore + fee);
    expect(await spol.balanceOf(member.address)).to.be.gt(0n);
    expect(await pol.balanceOf(await router.getAddress())).to.equal(0);
  });
});
