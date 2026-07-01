const { expect } = require("chai");
const { ethers, network, upgrades } = require("hardhat");

const {
  CANONICAL_SEMAPHORE_V4,
} = require("../../scripts/deploy/lib/zkPoolConfig");
const { deployToken, defaultParams, usdc } = require("../helpers/zkpool");

// Fork test against the REAL canonical Semaphore V4 singleton on Polygon Amoy (chainId 80002).
// Spec 034 (T018): deploy the ZKWagerPool impl + ZKWagerPoolFactory pointed at the live Semaphore
// singleton (not {MockSemaphore}), create a pool, and assert that the factory's createGroup and the
// pool's join path (addMember) succeed against the real contract — i.e. a join actually inserts a
// member into the on-chain Merkle tree. No mocked Semaphore (constitution III): the ZK plumbing is
// exercised against the canonical deployment.
//
// Fork tests require an Amoy RPC URL that serves historical state — i.e. an archive node (Alchemy,
// Infura, QuickNode, drpc, etc.). The public endpoint at rpc-amoy.polygon.technology is pruned and
// will fail with "historical state is not available" on most calls. Set AMOY_FORK_BLOCK to pin to a
// block your provider still has. With no AMOY_RPC_URL set this suite SKIPS cleanly (same gating as
// the other fork tests, e.g. AmoyOracles.fork.test.js / ChainalysisSanctions.fork.test.js).
//
// PROOF-PATH LIMITATION: generating a real Groth16 Semaphore proof requires the off-chain
// @semaphore-protocol/proof prover (witness + circuit artifacts) which is impractical to run inside
// this on-chain fork harness. So this test exercises and asserts the membership-insertion half of
// the integration (createGroup + addMember against the real singleton); the proof-gated paths
// (approve/claim, which call semaphore.validateProof) are covered against {MockSemaphore} in the
// unit/integration suites and are intentionally NOT exercised here.

// Minimal mirror of the canonical Semaphore V4 group getters (ISemaphoreGroups), which the local
// ISemaphore surface (the contracts only need create/add/validate) does not expose. Used to read
// the real on-chain group state after a join.
const SEMAPHORE_GROUPS_ABI = [
  "function getGroupAdmin(uint256 groupId) view returns (address)",
  "function getMerkleTreeSize(uint256 groupId) view returns (uint256)",
  "function getMerkleTreeRoot(uint256 groupId) view returns (uint256)",
  "function hasMember(uint256 groupId, uint256 identityCommitment) view returns (bool)",
];

const describeFork = process.env.AMOY_RPC_URL ? describe : describe.skip;

describeFork("Semaphore V4 singleton (Amoy 80002 fork)", function () {
  this.timeout(180_000);

  let creator, m1;
  let factory, pool, poolId, groupId;
  let semaphore; // real singleton, read via the ISemaphoreGroups ABI
  let token;

  before(async function () {
    const blockTag = process.env.AMOY_FORK_BLOCK
      ? { blockNumber: parseInt(process.env.AMOY_FORK_BLOCK, 10) }
      : {};
    await network.provider.request({
      method: "hardhat_reset",
      params: [{ forking: { jsonRpcUrl: process.env.AMOY_RPC_URL, ...blockTag } }],
    });

    [creator, m1] = await ethers.getSigners();

    // Deploy the immutable pool template + the factory proxy pointed at the REAL Semaphore singleton.
    // screeningRequired=false (no sanctions/membership guards) so the fork only tests the ZK plumbing.
    const Pool = await ethers.getContractFactory("ZKWagerPool");
    const poolImpl = await Pool.deploy();
    await poolImpl.waitForDeployment();

    const Factory = await ethers.getContractFactory("ZKWagerPoolFactory");
    factory = await upgrades.deployProxy(
      Factory,
      [
        creator.address,
        await poolImpl.getAddress(),
        CANONICAL_SEMAPHORE_V4,
        ethers.ZeroAddress, // sanctionsGuard
        ethers.ZeroAddress, // membershipManager
        false, // screeningRequired
      ],
      { kind: "uups" }
    );
    await factory.waitForDeployment();

    semaphore = await ethers.getContractAt(SEMAPHORE_GROUPS_ABI, CANONICAL_SEMAPHORE_V4);
    token = await deployToken([creator, m1]);
  });

  after(async function () {
    await network.provider.request({ method: "hardhat_reset", params: [] });
  });

  it("the factory is wired to the real canonical Semaphore singleton", async function () {
    expect(await factory.semaphore()).to.equal(CANONICAL_SEMAPHORE_V4);
    // Sanity: the address actually has deployed code on the forked chain.
    expect(await ethers.provider.getCode(CANONICAL_SEMAPHORE_V4)).to.not.equal("0x");
  });

  it("createPool creates a real Semaphore group whose admin is the new pool", async function () {
    const tx = await factory
      .connect(creator)
      .createPool(await defaultParams(token, { maxMembers: 3 }));
    const rc = await tx.wait();
    const ev = rc.logs
      .map((l) => {
        try {
          return factory.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((e) => e && e.name === "PoolCreated");
    expect(ev, "PoolCreated event").to.not.equal(undefined);

    poolId = ev.args.poolId;
    pool = await ethers.getContractAt("ZKWagerPool", ev.args.pool);
    groupId = await pool.groupId();

    // The group id must be a real, allocated id (the singleton is shared, so it is non-trivial /
    // monotonic across the chain's lifetime rather than 0).
    expect(groupId).to.be.gt(0n, "real singleton group id should be non-trivial");
    // The pool — not the factory, not the creator — is the group admin (the only path to addMember).
    expect(await semaphore.getGroupAdmin(groupId)).to.equal(await pool.getAddress());
    // A brand-new group has no members yet.
    expect(await semaphore.getMerkleTreeSize(groupId)).to.equal(0n);
  });

  it("join inserts a member into the real Semaphore group (addMember succeeds)", async function () {
    const commitment = 1234567890123456789012345678901234567890n;

    await token.connect(m1).approve(await pool.getAddress(), usdc(10));
    await expect(pool.connect(m1).join(commitment))
      .to.emit(pool, "Joined")
      .withArgs(commitment);

    // Pool-side bookkeeping.
    expect(await pool.memberCount()).to.equal(1);
    expect(await pool.hasJoined(m1.address)).to.equal(true);

    // Real on-chain Semaphore state: the commitment is now a member and the tree grew by one with a
    // non-zero root (i.e. the Merkle insertion actually happened against the live contract).
    expect(await semaphore.getMerkleTreeSize(groupId)).to.equal(1n);
    expect(await semaphore.hasMember(groupId, commitment)).to.equal(true);
    expect(await semaphore.getMerkleTreeRoot(groupId)).to.not.equal(0n);
  });

  it("a second join inserts a second distinct member into the same real group", async function () {
    const commitment = 9876543210987654321098765432109876543210n;

    await token.connect(creator).approve(await pool.getAddress(), usdc(10));
    await expect(pool.connect(creator).join(commitment))
      .to.emit(pool, "Joined")
      .withArgs(commitment);

    expect(await pool.memberCount()).to.equal(2);
    expect(await semaphore.getMerkleTreeSize(groupId)).to.equal(2n);
    expect(await semaphore.hasMember(groupId, commitment)).to.equal(true);
  });
});
