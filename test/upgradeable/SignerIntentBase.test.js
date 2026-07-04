const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

// Direct unit tests for SignerIntentBase — the reusable EIP-712 "signed intent" verifier that backs every
// WagerPool …WithSig twin. Exercised through MockSignerIntent (a plain concrete harness with one
// nonce-consuming action, doThing). Covers: happy path + nonce burn, replay, wrong signer, the
// validAfter/validBefore window, invalidateNonce pre-emption, authorizationState reflection, 2-D
// signer×nonce independence, and EIP-712 domain (contract) binding.

describe('SignerIntentBase (EIP-712 intent verifier)', function () {
  let alice, bob, relayer, mock;

  const DOTHING_TYPES = {
    DoThing: [
      { name: 'x', type: 'uint256' },
      { name: 'signer', type: 'address' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
    ],
  };

  async function deployMock() {
    const Mock = await ethers.getContractFactory('MockSignerIntent');
    const m = await Mock.deploy();
    await m.waitForDeployment();
    await m.initialize();
    return m;
  }

  async function domainOf(m) {
    const { chainId } = await ethers.provider.getNetwork();
    return { name: 'Mock', version: '1', chainId: Number(chainId), verifyingContract: await m.getAddress() };
  }

  /** Sign a DoThing intent for `m`. Returns everything doThing needs. */
  async function signDoThing(m, signer, x, opts = {}) {
    const now = await time.latest();
    const nonce = opts.nonce ?? ethers.hexlify(ethers.randomBytes(32));
    const validAfter = opts.validAfter ?? now - 60;
    const validBefore = opts.validBefore ?? now + (opts.window ?? 3600);
    const domain = await domainOf(m);
    const message = { x, signer: signer.address, nonce, validAfter, validBefore };
    const sig = await signer.signTypedData(domain, DOTHING_TYPES, message);
    return { sig, nonce, validAfter, validBefore, x };
  }

  beforeEach(async function () {
    [alice, bob, relayer] = await ethers.getSigners();
    mock = await deployMock();
  });

  it('accepts a valid intent, records the effect, and burns the nonce', async function () {
    const s = await signDoThing(mock, alice, 42);
    expect(await mock.authorizationState(alice.address, s.nonce)).to.equal(false);

    await mock.connect(relayer).doThing(42, alice.address, s.nonce, s.validAfter, s.validBefore, s.sig);

    expect(await mock.lastValue()).to.equal(42n);
    expect(await mock.callCount()).to.equal(1n);
    expect(await mock.authorizationState(alice.address, s.nonce)).to.equal(true); // nonce burned
  });

  it('rejects a replayed intent (IntentReplayed)', async function () {
    const s = await signDoThing(mock, alice, 7);
    await mock.connect(relayer).doThing(7, alice.address, s.nonce, s.validAfter, s.validBefore, s.sig);
    await expect(
      mock.connect(relayer).doThing(7, alice.address, s.nonce, s.validAfter, s.validBefore, s.sig)
    ).to.be.revertedWithCustomError(mock, 'IntentReplayed');
  });

  it('rejects when the recovered signer != the claimed signer (InvalidIntentSignature)', async function () {
    // alice signs, but the call claims bob as the signer — the recovered key won't match bob.
    const s = await signDoThing(mock, alice, 1);
    await expect(
      mock.connect(relayer).doThing(1, bob.address, s.nonce, s.validAfter, s.validBefore, s.sig)
    ).to.be.revertedWithCustomError(mock, 'InvalidIntentSignature');
  });

  it('rejects a tampered action field (structHash mismatch -> InvalidIntentSignature)', async function () {
    // alice signs for x=1 but the relayer submits x=2 — the struct hash differs, recovery misses.
    const s = await signDoThing(mock, alice, 1);
    await expect(
      mock.connect(relayer).doThing(2, alice.address, s.nonce, s.validAfter, s.validBefore, s.sig)
    ).to.be.revertedWithCustomError(mock, 'InvalidIntentSignature');
  });

  it('rejects an intent whose validAfter is in the future (IntentNotYetValid)', async function () {
    const now = await time.latest();
    const s = await signDoThing(mock, alice, 5, { validAfter: now + 1000, validBefore: now + 5000 });
    await expect(
      mock.connect(relayer).doThing(5, alice.address, s.nonce, s.validAfter, s.validBefore, s.sig)
    ).to.be.revertedWithCustomError(mock, 'IntentNotYetValid');
  });

  it('rejects an expired intent (IntentExpired)', async function () {
    const now = await time.latest();
    const s = await signDoThing(mock, alice, 5, { validAfter: now - 100, validBefore: now - 1 });
    await expect(
      mock.connect(relayer).doThing(5, alice.address, s.nonce, s.validAfter, s.validBefore, s.sig)
    ).to.be.revertedWithCustomError(mock, 'IntentExpired');
  });

  it('window boundaries: validAfter==now is valid; validBefore==now is valid (inclusive)', async function () {
    // validAfter boundary: the check is `block.timestamp < validAfter` (strict), so ts == validAfter passes.
    let base = (await time.latest()) + 100;
    let s = await signDoThing(mock, alice, 11, { validAfter: base, validBefore: base + 5000 });
    await time.setNextBlockTimestamp(base);
    await expect(mock.connect(relayer).doThing(11, alice.address, s.nonce, s.validAfter, s.validBefore, s.sig)).to.not
      .be.reverted;

    // validBefore boundary: the check is `block.timestamp > validBefore` (strict), so ts == validBefore passes.
    base = (await time.latest()) + 100;
    s = await signDoThing(mock, bob, 12, { validAfter: base - 50, validBefore: base });
    await time.setNextBlockTimestamp(base);
    await expect(mock.connect(relayer).doThing(12, bob.address, s.nonce, s.validAfter, s.validBefore, s.sig)).to.not.be
      .reverted;
  });

  it('invalidateNonce pre-empts an unsubmitted intent (self-cancel, FR-006)', async function () {
    const s = await signDoThing(mock, alice, 9);
    await expect(mock.connect(alice).invalidateNonce(s.nonce))
      .to.emit(mock, 'NonceInvalidated')
      .withArgs(alice.address, s.nonce);
    expect(await mock.authorizationState(alice.address, s.nonce)).to.equal(true);
    await expect(
      mock.connect(relayer).doThing(9, alice.address, s.nonce, s.validAfter, s.validBefore, s.sig)
    ).to.be.revertedWithCustomError(mock, 'IntentReplayed');
  });

  it('invalidateNonce only burns the caller\'s own (signer, nonce) slot', async function () {
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    // bob invalidating `nonce` does NOT touch alice's slot for the same value.
    await mock.connect(bob).invalidateNonce(nonce);
    expect(await mock.authorizationState(bob.address, nonce)).to.equal(true);
    expect(await mock.authorizationState(alice.address, nonce)).to.equal(false);

    const s = await signDoThing(mock, alice, 3, { nonce });
    await expect(mock.connect(relayer).doThing(3, alice.address, s.nonce, s.validAfter, s.validBefore, s.sig)).to.not.be
      .reverted;
  });

  it('authorizationState reflects both used and invalidated nonces', async function () {
    const used = await signDoThing(mock, alice, 1);
    const cancelled = ethers.hexlify(ethers.randomBytes(32));
    const fresh = ethers.hexlify(ethers.randomBytes(32));

    await mock.connect(relayer).doThing(1, alice.address, used.nonce, used.validAfter, used.validBefore, used.sig);
    await mock.connect(alice).invalidateNonce(cancelled);

    expect(await mock.authorizationState(alice.address, used.nonce)).to.equal(true); // burned by use
    expect(await mock.authorizationState(alice.address, cancelled)).to.equal(true); // burned by invalidate
    expect(await mock.authorizationState(alice.address, fresh)).to.equal(false); // untouched
  });

  it('the same nonce value is independent across two signers (2-D signer x nonce mapping)', async function () {
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const sa = await signDoThing(mock, alice, 100, { nonce });
    const sb = await signDoThing(mock, bob, 200, { nonce });

    await mock.connect(relayer).doThing(100, alice.address, sa.nonce, sa.validAfter, sa.validBefore, sa.sig);
    // bob's identical nonce value is a distinct slot and still spends fine.
    await mock.connect(relayer).doThing(200, bob.address, sb.nonce, sb.validAfter, sb.validBefore, sb.sig);

    expect(await mock.authorizationState(alice.address, nonce)).to.equal(true);
    expect(await mock.authorizationState(bob.address, nonce)).to.equal(true);
    expect(await mock.callCount()).to.equal(2n);
  });

  it('EIP-712 domain binds to the contract: a signature for one instance is rejected by another', async function () {
    const other = await deployMock();
    expect(await mock.domainSeparator()).to.not.equal(await other.domainSeparator()); // distinct verifyingContract

    // Sign against `mock`'s domain, then submit to `other` — recovery fails (InvalidIntentSignature).
    const s = await signDoThing(mock, alice, 55);
    await expect(
      other.connect(relayer).doThing(55, alice.address, s.nonce, s.validAfter, s.validBefore, s.sig)
    ).to.be.revertedWithCustomError(other, 'InvalidIntentSignature');

    // ...and the very same intent IS accepted by the instance it was signed for.
    await expect(mock.connect(relayer).doThing(55, alice.address, s.nonce, s.validAfter, s.validBefore, s.sig)).to.not
      .be.reverted;
  });
});
