// SPDX-License-Identifier: MIT
//
// Deploy + intent-signing helpers for the address-based WagerPool tests (spec 034, Semaphore removed).
// No MockSemaphore: the factory clones an immutable {WagerPool} and members join/approve/claim by
// wallet address. Timing mirrors WagerRegistry — two ABSOLUTE deadlines (acceptDeadline, resolveDeadline).

const { ethers, upgrades } = require('hardhat');

const ZERO = ethers.ZeroAddress;
const usdc = (n) => ethers.parseUnits(String(n), 6);

/**
 * Deploy a WagerPoolFactory proxy with an immutable WagerPool template.
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

  const Pool = await ethers.getContractFactory('WagerPool');
  const poolImpl = await Pool.deploy();
  await poolImpl.waitForDeployment();

  const Factory = await ethers.getContractFactory('WagerPoolFactory');
  const factory = await upgrades.deployProxy(
    Factory,
    [adminAddr, await poolImpl.getAddress(), sanctionsGuard, membershipManager, screeningRequired],
    { kind: 'uups' }
  );
  await factory.waitForDeployment();

  return { factory, poolImpl };
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

/** Sensible default CreatePoolParams (two absolute deadlines, like WagerRegistry). */
async function defaultParams(token, overrides = {}) {
  const now = (await ethers.provider.getBlock('latest')).timestamp;
  return {
    token: await token.getAddress(),
    buyIn: usdc(10),
    maxMembers: 5,
    thresholdBips: 6000, // 60%
    acceptDeadline: now + 7 * 24 * 3600,
    resolveDeadline: now + 14 * 24 * 3600,
    ...overrides,
  };
}

/** Create a pool and return its {WagerPool} instance + id + wordIndices. */
async function createPool(factory, creator, params) {
  const rc = await (await factory.connect(creator).createPool(params)).wait();
  const ev = rc.logs
    .map((l) => {
      try {
        return factory.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((e) => e && e.name === 'PoolCreated');
  const pool = await ethers.getContractAt('WagerPool', ev.args.pool);
  return { pool, poolId: ev.args.poolId, wordIndices: ev.args.wordIndices, address: ev.args.pool };
}

/** address-keyed payout matrix hash — must equal proposalId / lockedOutcome. */
function matrixHash(entries) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  return ethers.keccak256(
    coder.encode(
      ['tuple(address winner,uint256 amount)[]'],
      [entries.map((e) => ({ winner: e.winner, amount: e.amount }))]
    )
  );
}

// ---------------------------------------------------------------------------
// EIP-712 intent signing (spec 035 withSig twins)
// ---------------------------------------------------------------------------

async function eip712Domain(pool) {
  const { chainId } = await ethers.provider.getNetwork();
  return {
    name: 'FairWins WagerPool',
    version: '1',
    chainId: Number(chainId),
    verifyingContract: await pool.getAddress(),
  };
}

/** Random 32-byte replay nonce. */
function randNonce() {
  return ethers.hexlify(ethers.randomBytes(32));
}

/**
 * Generic intent signer. `primaryType` + `fields` must match a WagerPool typehash exactly.
 * Returns { sig, nonce, validAfter, validBefore } ready to splat into a *WithSig call.
 */
async function signIntent(pool, signer, primaryType, fields, message, opts = {}) {
  const now = (await ethers.provider.getBlock('latest')).timestamp;
  const window = opts.window ?? 3600;
  const nonce = opts.nonce ?? message.nonce ?? randNonce();
  const validAfter = opts.validAfter ?? message.validAfter ?? now - 60;
  const validBefore = opts.validBefore ?? message.validBefore ?? now + window;
  const full = { ...message, nonce, validAfter, validBefore };
  const domain = await eip712Domain(pool);
  const types = { [primaryType]: fields };
  const sig = await signer.signTypedData(domain, types, full);
  return { sig, nonce, validAfter, validBefore };
}

const TAIL = [
  { name: 'nonce', type: 'bytes32' },
  { name: 'validAfter', type: 'uint256' },
  { name: 'validBefore', type: 'uint256' },
];

const signApprove = (pool, signer, proposalId, opts) =>
  signIntent(
    pool,
    signer,
    'ApproveOutcome',
    [{ name: 'member', type: 'address' }, { name: 'proposalId', type: 'bytes32' }, ...TAIL],
    { member: signer.address, proposalId },
    opts
  );

const signClaim = (pool, signer, index, recipient, opts) =>
  signIntent(
    pool,
    signer,
    'ClaimShare',
    [
      { name: 'winner', type: 'address' },
      { name: 'index', type: 'uint256' },
      { name: 'recipient', type: 'address' },
      ...TAIL,
    ],
    { winner: signer.address, index, recipient },
    opts
  );

const signPropose = (pool, signer, proposalId, opts) =>
  signIntent(
    pool,
    signer,
    'ProposeOutcome',
    [{ name: 'creator', type: 'address' }, { name: 'proposalId', type: 'bytes32' }, ...TAIL],
    { creator: signer.address, proposalId },
    opts
  );

const signClose = (pool, signer, opts) =>
  signIntent(pool, signer, 'CloseJoining', [{ name: 'creator', type: 'address' }, ...TAIL], { creator: signer.address }, opts);

const signCancel = (pool, signer, opts) =>
  signIntent(pool, signer, 'Cancel', [{ name: 'creator', type: 'address' }, ...TAIL], { creator: signer.address }, opts);

const signRefund = (pool, signer, opts) =>
  signIntent(pool, signer, 'Refund', [{ name: 'member', type: 'address' }, ...TAIL], { member: signer.address }, opts);

// ---------------------------------------------------------------------------
// Factory-domain intent signing (spec 035/036 Tier 2 — createPoolWithSig)
// ---------------------------------------------------------------------------

/**
 * Sign a CreatePool intent against the FACTORY's own EIP-712 domain
 * ("FairWins WagerPoolFactory"/"1"). Fields must match CREATE_POOL_TYPEHASH exactly.
 * `params` is a CreatePoolParams-shaped object.
 */
async function signCreatePool(factory, signer, params, opts = {}) {
  const { chainId } = await ethers.provider.getNetwork();
  const now = (await ethers.provider.getBlock('latest')).timestamp;
  const window = opts.window ?? 3600;
  const nonce = opts.nonce ?? randNonce();
  const validAfter = opts.validAfter ?? now - 60;
  const validBefore = opts.validBefore ?? now + window;
  const domain = {
    name: 'FairWins WagerPoolFactory',
    version: '1',
    chainId: Number(chainId),
    verifyingContract: await factory.getAddress(),
  };
  const types = {
    CreatePool: [
      { name: 'creator', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'buyIn', type: 'uint256' },
      { name: 'maxMembers', type: 'uint32' },
      { name: 'thresholdBips', type: 'uint16' },
      { name: 'acceptDeadline', type: 'uint64' },
      { name: 'resolveDeadline', type: 'uint64' },
      ...TAIL,
    ],
  };
  const message = {
    creator: signer.address,
    token: params.token,
    buyIn: params.buyIn,
    maxMembers: params.maxMembers,
    thresholdBips: params.thresholdBips,
    acceptDeadline: params.acceptDeadline,
    resolveDeadline: params.resolveDeadline,
    nonce,
    validAfter,
    validBefore,
  };
  const sig = await signer.signTypedData(domain, types, message);
  return { sig, nonce, validAfter, validBefore };
}

/**
 * Sign an EIP-3009 ReceiveWithAuthorization for a MockUSDCPermit-style token (the gasless join leg).
 * Returns split { v, r, s } plus the window/nonce so callers can splat into joinWithAuthorization[For].
 */
async function signReceiveAuth(token, from, to, value, opts = {}) {
  const { chainId } = await ethers.provider.getNetwork();
  const now = (await ethers.provider.getBlock('latest')).timestamp;
  const nonce = opts.nonce ?? randNonce();
  const validAfter = opts.validAfter ?? 0;
  const validBefore = opts.validBefore ?? now + (opts.window ?? 3600);
  const domain = {
    name: 'USD Coin',
    version: '1',
    chainId: Number(chainId),
    verifyingContract: await token.getAddress(),
  };
  const types = {
    ReceiveWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  };
  const sig = await from.signTypedData(domain, types, {
    from: from.address,
    to,
    value,
    validAfter,
    validBefore,
    nonce,
  });
  const { v, r, s } = ethers.Signature.from(sig);
  return { v, r, s, nonce, validAfter, validBefore };
}

module.exports = {
  ZERO,
  usdc,
  deployPoolFactory,
  deployToken,
  defaultParams,
  createPool,
  matrixHash,
  eip712Domain,
  randNonce,
  signIntent,
  signApprove,
  signClaim,
  signPropose,
  signClose,
  signCancel,
  signRefund,
  signCreatePool,
  signReceiveAuth,
};
