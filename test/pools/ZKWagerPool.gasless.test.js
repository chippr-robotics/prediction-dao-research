const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployPoolFactory, deployToken, defaultParams, createPool, usdc } = require('../helpers/zkpool');

// T043 [US1] — gasless join via EIP-3009 receiveWithAuthorization: a member signs a
// ReceiveWithAuthorization off-chain and a RELAYER submits joinWithAuthorization; the buy-in is
// pulled from the member with no token approval. Replay (same nonce), expired (validBefore past),
// and wrong-value authorizations are rejected (spec 034 FR-006, research.md §5/§7).

const State = { JoiningOpen: 0n, JoiningClosed: 1n, Resolved: 2n, Cancelled: 3n };

// EIP-712 ReceiveWithAuthorization type matching MockUSDCPermit.RECEIVE_WITH_AUTHORIZATION_TYPEHASH.
const AUTH_TYPES = {
  ReceiveWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

describe('ZKWagerPool — gasless join (EIP-3009)', function () {
  let admin, creator, member, relayer;
  let factory, token, pool, tokenAddr, poolAddr, chainId;

  beforeEach(async function () {
    [admin, creator, member, relayer] = await ethers.getSigners();
    ({ factory } = await deployPoolFactory({ admin: admin.address }));
    token = await deployToken([member]);
    ({ pool } = await createPool(factory, creator, await defaultParams(token, { maxMembers: 3 })));
    tokenAddr = await token.getAddress();
    poolAddr = await pool.getAddress();
    ({ chainId } = await ethers.provider.getNetwork());
  });

  // EIP-712 domain for MockUSDCPermit: OZ ERC20Permit name "USD Coin", version "1", this chainId,
  // verified against the token address.
  function domain() {
    return { name: 'USD Coin', version: '1', chainId, verifyingContract: tokenAddr };
  }

  // Sign a ReceiveWithAuthorization from `signer` paying the pool, returning the split signature.
  async function authorize(signer, { value, validAfter, validBefore, nonce }) {
    const message = { from: signer.address, to: poolAddr, value, validAfter, validBefore, nonce };
    const sig = await signer.signTypedData(domain(), AUTH_TYPES, message);
    return ethers.Signature.from(sig);
  }

  async function now() {
    return (await ethers.provider.getBlock('latest')).timestamp;
  }

  it('lets a relayer join on the member\'s behalf — buy-in pulled, no approval', async function () {
    const validBefore = (await now()) + 3600;
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const { v, r, s } = await authorize(member, { value: usdc(10), validAfter: 0, validBefore, nonce });

    // The member granted NO ERC-20 approval to the pool.
    expect(await token.allowance(member.address, poolAddr)).to.equal(0n);

    await expect(
      pool
        .connect(relayer)
        .joinWithAuthorization(777n, member.address, usdc(10), 0, validBefore, nonce, v, r, s)
    )
      .to.emit(pool, 'Joined')
      .withArgs(777n);

    // Buy-in moved from the member (not the relayer); member is recorded.
    expect(await token.balanceOf(poolAddr)).to.equal(usdc(10));
    expect(await token.balanceOf(member.address)).to.equal(usdc(1000) - usdc(10));
    expect(await pool.memberCount()).to.equal(1);
    expect(await pool.hasJoined(member.address)).to.equal(true);
    expect(await pool.state()).to.equal(State.JoiningOpen);
    expect(await token.authorizationState(member.address, nonce)).to.equal(true);
  });

  it('rejects a replayed authorization (same nonce)', async function () {
    const validBefore = (await now()) + 3600;
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const { v, r, s } = await authorize(member, { value: usdc(10), validAfter: 0, validBefore, nonce });

    await pool
      .connect(relayer)
      .joinWithAuthorization(777n, member.address, usdc(10), 0, validBefore, nonce, v, r, s);
    expect(await token.authorizationState(member.address, nonce)).to.equal(true);

    // EIP-3009 nonces are keyed by (from, nonce) — NOT by recipient — so the FIRST use consumes the
    // nonce globally. Replaying the same nonce, even to a different pool, reverts on the token's guard
    // (this is the replay protection that makes the gasless relayer untrusted). The same-pool replay is
    // independently blocked earlier by AlreadyJoined.
    const { pool: pool2 } = await createPool(factory, creator, await defaultParams(token, { maxMembers: 3 }));
    const pool2Addr = await pool2.getAddress();
    const dom = { name: 'USD Coin', version: '1', chainId, verifyingContract: tokenAddr };
    const msg2 = { from: member.address, to: pool2Addr, value: usdc(10), validAfter: 0, validBefore, nonce };
    const sig2 = ethers.Signature.from(await member.signTypedData(dom, AUTH_TYPES, msg2));

    await expect(
      pool2
        .connect(relayer)
        .joinWithAuthorization(778n, member.address, usdc(10), 0, validBefore, nonce, sig2.v, sig2.r, sig2.s)
    ).to.be.revertedWithCustomError(token, 'AuthorizationUsed');
  });

  it('rejects an expired authorization (validBefore in the past)', async function () {
    const validBefore = (await now()) - 1; // already elapsed
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const { v, r, s } = await authorize(member, { value: usdc(10), validAfter: 0, validBefore, nonce });

    await expect(
      pool
        .connect(relayer)
        .joinWithAuthorization(777n, member.address, usdc(10), 0, validBefore, nonce, v, r, s)
    ).to.be.revertedWithCustomError(token, 'AuthorizationExpired');

    expect(await pool.hasJoined(member.address)).to.equal(false);
    expect(await token.balanceOf(poolAddr)).to.equal(0n);
  });

  it('rejects an authorization whose value is not the buy-in', async function () {
    const validBefore = (await now()) + 3600;
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    // Sign for the wrong value; the pool rejects before touching the token (BadValue, FR-006).
    const { v, r, s } = await authorize(member, { value: usdc(9), validAfter: 0, validBefore, nonce });

    await expect(
      pool
        .connect(relayer)
        .joinWithAuthorization(777n, member.address, usdc(9), 0, validBefore, nonce, v, r, s)
    ).to.be.revertedWithCustomError(pool, 'BadValue');

    expect(await pool.hasJoined(member.address)).to.equal(false);
    expect(await token.balanceOf(poolAddr)).to.equal(0n);
  });
});
