const { expect } = require("chai");
const { ethers, network } = require("hardhat");

// Fork test against the REAL Chainalysis Sanctions Oracle on Polygon mainnet (chainId 137).
// Spec 007 SC-004/SC-016: a known sanctioned address is blocked, a clean address is allowed,
// verified through SanctionsGuard wired to the live oracle — no mocks (constitution III).
//
// Requires a Polygon mainnet RPC (POLYGON_RPC_URL). The oracle read is a current-state view,
// so a full archive node is not strictly required for the latest block. Amoy has no oracle,
// hence this must run against a 137 fork.

const CHAINALYSIS_ORACLE_137 = "0x40C57923924B5c5c5455c48D93317139ADDaC8fb";
// OFAC-designated, present on the Chainalysis list (Tornado Cash: Router). If Chainalysis
// ever delists it, this test fails loudly and the chosen address must be refreshed.
const SANCTIONED = "0x722122dF12D4e14e13Ac3b6895a86e84145b6967";
// Not sanctioned (vitalik.eth) — sanity for the allow path.
const CLEAN = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

const describeFork = process.env.POLYGON_RPC_URL ? describe : describe.skip;

describeFork("Chainalysis sanctions oracle (Polygon 137 fork)", function () {
  this.timeout(120_000);

  let guard;

  before(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.POLYGON_RPC_URL,
            ...(process.env.POLYGON_FORK_BLOCK
              ? { blockNumber: parseInt(process.env.POLYGON_FORK_BLOCK, 10) }
              : {}),
          },
        },
      ],
    });

    const [admin] = await ethers.getSigners();
    const Guard = await ethers.getContractFactory("SanctionsGuard");
    guard = await Guard.deploy(admin.address, CHAINALYSIS_ORACLE_137);
    await guard.waitForDeployment();
  });

  after(async function () {
    await network.provider.request({ method: "hardhat_reset", params: [] });
  });

  it("reads the live oracle: sanctioned address is not allowed", async function () {
    const oracle = await ethers.getContractAt("IChainalysisSanctionsOracle", CHAINALYSIS_ORACLE_137);
    expect(await oracle.isSanctioned(SANCTIONED)).to.equal(true);
    expect(await guard.isAllowed(SANCTIONED)).to.equal(false);
    await expect(guard.checkBlocked(SANCTIONED))
      .to.be.revertedWithCustomError(guard, "SanctionedAddress")
      .withArgs(SANCTIONED);
  });

  it("allows a clean address", async function () {
    expect(await guard.isAllowed(CLEAN)).to.equal(true);
    await expect(guard.checkBlocked(CLEAN)).to.not.be.reverted;
  });
});
