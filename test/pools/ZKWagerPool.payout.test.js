const { expect } = require('chai');
const { ethers } = require('hardhat');
const {
  deployPoolFactory, deployToken, defaultParams, createPool, proof, claimScope, matrixHash, usdc,
} = require('../helpers/zkpool');

// T015 [US1] — ZKWagerPool payout/refund: winner claims to a fresh address, no double-claim, matrix
// sum/outcome/recipient binding checks, under-quorum timeout refund, cancel-before-fill refund, and
// the no-escrow-exit-outside-claim/refund invariant (spec 034 FR-017/018/019/022/023, SC-007/013).

const State = { JoiningClosed: 1n, Resolved: 2n, Cancelled: 3n };

describe('ZKWagerPool — payout & refund', function () {
  let admin, creator, m1, m2, winnerRecipient, factory, token;

  beforeEach(async function () {
    [admin, creator, m1, m2, winnerRecipient] = await ethers.getSigners();
    ({ factory } = await deployPoolFactory({ admin: admin.address }));
    token = await deployToken([m1, m2]);
  });

  // Build a pool of 2 members (auto-closed, escrow = 20), resolve it to `entries`, return the pool.
  async function resolvedPool(entries) {
    const { pool } = await createPool(
      factory, creator, await defaultParams(token, { maxMembers: 2, thresholdBips: 5000 }) // required = 1
    );
    for (const [m, c] of [[m1, 11n], [m2, 22n]]) {
      await token.connect(m).approve(await pool.getAddress(), usdc(10));
      await pool.connect(m).join(c);
    }
    expect(await pool.state()).to.equal(State.JoiningClosed);
    const pid = matrixHash(entries);
    await pool.connect(creator).proposeOutcome(pid);
    await pool.connect(m1).approve(proof({ nullifier: 90001n, scope: BigInt(pid) }));
    expect(await pool.state()).to.equal(State.Resolved);
    return pool;
  }

  it('pays a winner to a fresh address and blocks double-claims', async function () {
    const entries = [{ claimNullifier: 7001n, amount: usdc(20) }];
    const pool = await resolvedPool(entries);
    const recip = winnerRecipient.address;

    await expect(
      pool.connect(m1).claim(entries, 0, proof({ nullifier: 7001n, scope: claimScope(await pool.getAddress()), message: BigInt(recip) }), recip)
    ).to.emit(pool, 'Claimed');
    expect(await token.balanceOf(recip)).to.equal(usdc(20));

    // second claim reuses the claim nullifier -> mock rejects (no double-claim)
    await expect(
      pool.connect(m1).claim(entries, 0, proof({ nullifier: 7001n, scope: claimScope(await pool.getAddress()), message: BigInt(recip) }), recip)
    ).to.be.reverted;
  });

  it('binds the recipient into the proof (anti front-run)', async function () {
    const entries = [{ claimNullifier: 7001n, amount: usdc(20) }];
    const pool = await resolvedPool(entries);
    const recip = winnerRecipient.address;
    await expect(
      pool.connect(m1).claim(entries, 0, proof({ nullifier: 7001n, scope: claimScope(await pool.getAddress()), message: 12345n }), recip)
    ).to.be.revertedWithCustomError(pool, 'RecipientNotBound');
  });

  it('rejects an index out of bounds and a non-matching outcome', async function () {
    const entries = [{ claimNullifier: 7001n, amount: usdc(20) }];
    const pool = await resolvedPool(entries);
    const recip = winnerRecipient.address;
    await expect(
      pool.connect(m1).claim(entries, 5, proof({ nullifier: 7001n, scope: claimScope(await pool.getAddress()), message: BigInt(recip) }), recip)
    ).to.be.revertedWithCustomError(pool, 'IndexOOB');

    const wrong = [{ claimNullifier: 999n, amount: usdc(20) }];
    await expect(
      pool.connect(m1).claim(wrong, 0, proof({ nullifier: 999n, scope: claimScope(await pool.getAddress()), message: BigInt(recip) }), recip)
    ).to.be.revertedWithCustomError(pool, 'OutcomeMismatch');
  });

  it('rejects a payout matrix that does not allocate the full escrow (no stuck funds)', async function () {
    const entries = [{ claimNullifier: 7001n, amount: usdc(15) }]; // sum 15 != escrow 20
    const pool = await resolvedPool(entries);
    const recip = winnerRecipient.address;
    await expect(
      pool.connect(m1).claim(entries, 0, proof({ nullifier: 7001n, scope: claimScope(await pool.getAddress()), message: BigInt(recip) }), recip)
    ).to.be.revertedWithCustomError(pool, 'MatrixSumMismatch');
  });

  it('refunds every member after the resolution window elapses with no lock (FR-019/SC-007)', async function () {
    const { pool } = await createPool(factory, creator, await defaultParams(token, { maxMembers: 2 }));
    for (const [m, c] of [[m1, 11n], [m2, 22n]]) {
      await token.connect(m).approve(await pool.getAddress(), usdc(10));
      await pool.connect(m).join(c);
    }
    const closedAt = await pool.closedAt();
    const win = await pool.resolutionWindow();
    await ethers.provider.send('evm_setNextBlockTimestamp', [Number(closedAt) + Number(win) + 1]);
    await ethers.provider.send('evm_mine', []);

    await expect(pool.connect(m1).refund()).to.emit(pool, 'Refunded').withArgs(m1.address, usdc(10));
    expect(await token.balanceOf(m1.address)).to.equal(usdc(1000)); // got the 10 back
    await expect(pool.connect(m1).refund()).to.be.revertedWithCustomError(pool, 'NothingToRefund');
  });

  it('refunds members when the creator cancels before the pool fills (FR-023)', async function () {
    const { pool } = await createPool(factory, creator, await defaultParams(token, { maxMembers: 5 }));
    await token.connect(m1).approve(await pool.getAddress(), usdc(10));
    await pool.connect(m1).join(11n);
    await pool.connect(creator).cancel();
    expect(await pool.state()).to.equal(State.Cancelled);
    await expect(pool.connect(m1).refund()).to.emit(pool, 'Refunded');
    expect(await token.balanceOf(m1.address)).to.equal(usdc(1000));
  });

  it('does not allow refund once resolved (escrow is for winners)', async function () {
    const entries = [{ claimNullifier: 7001n, amount: usdc(20) }];
    const pool = await resolvedPool(entries);
    await expect(pool.connect(m1).refund()).to.be.revertedWithCustomError(pool, 'WrongState');
  });
});
