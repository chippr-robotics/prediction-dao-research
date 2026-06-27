// SPDX-License-Identifier: MIT
//
// Deploy + proof helpers for ZK-Wager Pools tests (spec 034). Uses {MockSemaphore} (no real
// Groth16) and {MockUSDCPermit}; the factory is a UUPS proxy cloning immutable {ZKWagerPool}s.

const { ethers, upgrades } = require('hardhat');

const ZERO = ethers.ZeroAddress;
const usdc = (n) => ethers.parseUnits(String(n), 6);

/**
 * Deploy a ZKWagerPoolFactory proxy with a MockSemaphore and an immutable pool template.
 * Local/test mode by default (screeningRequired=false, no guards).
 */
async function deployPoolFactory({
  admin,
  screeningRequired = false,
  sanctionsGuard = ZERO,
  membershipManager = ZERO,
} = {}) {
  const [deployer] = await ethers.getSigners();
  const adminAddr = admin || deployer.address;

  const Semaphore = await ethers.getContractFactory('MockSemaphore');
  const semaphore = await Semaphore.deploy();
  await semaphore.waitForDeployment();

  const Pool = await ethers.getContractFactory('ZKWagerPool');
  const poolImpl = await Pool.deploy();
  await poolImpl.waitForDeployment();

  const Factory = await ethers.getContractFactory('ZKWagerPoolFactory');
  const factory = await upgrades.deployProxy(
    Factory,
    [
      adminAddr,
      await poolImpl.getAddress(),
      await semaphore.getAddress(),
      sanctionsGuard,
      membershipManager,
      screeningRequired,
    ],
    { kind: 'uups' }
  );
  await factory.waitForDeployment();

  return { factory, semaphore, poolImpl };
}

/** Deploy a MockUSDCPermit token and mint `amount` (whole USDC) to each signer in `to`. */
async function deployToken(to = [], amount = 1000) {
  const Token = await ethers.getContractFactory('MockUSDCPermit');
  const token = await Token.deploy();
  await token.waitForDeployment();
  for (const acct of to) {
    await token.mint(acct.address ?? acct, usdc(amount));
  }
  return token;
}

/** Sensible default CreatePoolParams. */
async function defaultParams(token, overrides = {}) {
  const now = (await ethers.provider.getBlock('latest')).timestamp;
  return {
    token: await token.getAddress(),
    buyIn: usdc(10),
    maxMembers: 5,
    thresholdBips: 6000, // 60%
    joinDeadline: now + 7 * 24 * 3600,
    resolutionWindow: 3 * 24 * 3600,
    ...overrides,
  };
}

/** Create a pool and return its {ZKWagerPool} instance + id. */
async function createPool(factory, creator, params) {
  const tx = await factory.connect(creator).createPool(params);
  const rc = await tx.wait();
  const ev = rc.logs.map((l) => {
    try {
      return factory.interface.parseLog(l);
    } catch {
      return null;
    }
  }).find((e) => e && e.name === 'PoolCreated');
  const poolAddr = ev.args.pool;
  const pool = await ethers.getContractAt('ZKWagerPool', poolAddr);
  return { pool, poolId: ev.args.poolId, wordIndices: ev.args.wordIndices };
}

/** A SemaphoreProof tuple for {MockSemaphore} (only nullifier/scope/validity matter to the mock). */
function proof({ nullifier, scope, message = 1n, root = 0n, depth = 16 }) {
  return {
    merkleTreeDepth: BigInt(depth),
    merkleTreeRoot: BigInt(root),
    nullifier: BigInt(nullifier),
    message: BigInt(message),
    scope: BigInt(scope),
    points: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
  };
}

/** The pool's fixed claim scope: keccak256(abi.encodePacked(pool, "ZKPOOL_CLAIM")). */
function claimScope(poolAddr) {
  return BigInt(ethers.keccak256(ethers.solidityPacked(['address', 'string'], [poolAddr, 'ZKPOOL_CLAIM'])));
}

/** keccak256(abi.encode(PayoutEntry[])) — must equal the proposalId/lockedOutcome. */
function matrixHash(entries) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const enc = coder.encode(
    ['tuple(uint256 claimNullifier,uint256 amount)[]'],
    [entries.map((e) => ({ claimNullifier: e.claimNullifier, amount: e.amount }))]
  );
  return ethers.keccak256(enc);
}

module.exports = {
  ZERO,
  usdc,
  deployPoolFactory,
  deployToken,
  defaultParams,
  createPool,
  proof,
  claimScope,
  matrixHash,
};
