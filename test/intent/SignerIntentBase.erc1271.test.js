/**
 * Spec 041 T012 — ERC-1271 contract-account signers on the intent rails.
 *
 * Extends test/upgradeable/SignerIntentBase.test.js (EOA coverage) with the
 * spec-041 enablement: a CoinbaseSmartWallet passkey account signs a
 * MockSignerIntent `DoThing` intent via ERC-1271, malformed 1271 responders
 * are rejected, the EOA path is unchanged, and replay/validity-window/
 * invalidation semantics hold identically for contract signers.
 */

const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { AbiCoder } = require('ethers');
const { createPasskey, signAsPasskeyOwner } = require('../account/helpers/webauthn');

const abi = AbiCoder.defaultAbiCoder();

const DOTHING_TYPES = {
  DoThing: [
    { name: 'x', type: 'uint256' },
    { name: 'signer', type: 'address' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
  ],
};

const INVALIDATE_TYPES = {
  InvalidateNonce: [
    { name: 'signer', type: 'address' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'validBefore', type: 'uint256' },
  ],
};

describe('SignerIntentBase — ERC-1271 contract-account signers (spec 041)', function () {
  let relayer, eoa, mock, account, passkey;

  async function domainOf(m) {
    const { chainId } = await ethers.provider.getNetwork();
    return { name: 'Mock', version: '1', chainId: Number(chainId), verifyingContract: await m.getAddress() };
  }

  /** Build a DoThing message + the smart account's ERC-1271 signature over it. */
  async function signDoThingAsAccount(m, x, opts = {}) {
    const now = await time.latest();
    const nonce = opts.nonce ?? ethers.hexlify(ethers.randomBytes(32));
    const validAfter = opts.validAfter ?? now - 60;
    const validBefore = opts.validBefore ?? now + 3600;
    const signerAddr = await account.getAddress();
    const message = { x, signer: signerAddr, nonce, validAfter, validBefore };
    const digest = ethers.TypedDataEncoder.hash(await domainOf(m), DOTHING_TYPES, message);
    // The account validates against its replay-safe (account-bound) hash.
    const replaySafe = await account.replaySafeHash(digest);
    const sig = signAsPasskeyOwner(passkey, 0, replaySafe);
    return { sig, nonce, validAfter, validBefore, x, signerAddr };
  }

  beforeEach(async function () {
    [relayer, eoa] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory('MockSignerIntent');
    mock = await Mock.deploy();
    await mock.waitForDeployment();
    await mock.initialize();

    const Wallet = await ethers.getContractFactory('CoinbaseSmartWallet');
    const impl = await Wallet.deploy();
    const Factory = await ethers.getContractFactory('CoinbaseSmartWalletFactory');
    const factory = await Factory.deploy(await impl.getAddress());
    passkey = createPasskey();
    const owners = [passkey.ownerBytes];
    await factory.createAccount(owners, 0);
    account = Wallet.attach(await factory['getAddress(bytes[],uint256)'](owners, 0));
  });

  it('accepts an intent signed by a passkey smart account via ERC-1271 and burns its nonce', async function () {
    const s = await signDoThingAsAccount(mock, 41);
    await expect(mock.connect(relayer).doThing(41, s.signerAddr, s.nonce, s.validAfter, s.validBefore, s.sig))
      .to.emit(mock, 'IntentNonceUsed')
      .withArgs(s.signerAddr, s.nonce);
    expect(await mock.lastValue()).to.equal(41n);
    expect(await mock.callCount()).to.equal(1n);
    expect(await mock.authorizationState(s.signerAddr, s.nonce)).to.equal(true);
  });

  it('rejects replay of a contract-signed intent (single-use nonce)', async function () {
    const s = await signDoThingAsAccount(mock, 42);
    await mock.connect(relayer).doThing(42, s.signerAddr, s.nonce, s.validAfter, s.validBefore, s.sig);
    await expect(
      mock.connect(relayer).doThing(42, s.signerAddr, s.nonce, s.validAfter, s.validBefore, s.sig)
    ).to.be.revertedWithCustomError(mock, 'IntentReplayed');
  });

  it('rejects a contract-signed intent whose payload was tampered with', async function () {
    const s = await signDoThingAsAccount(mock, 43);
    await expect(
      mock.connect(relayer).doThing(999, s.signerAddr, s.nonce, s.validAfter, s.validBefore, s.sig)
    ).to.be.revertedWithCustomError(mock, 'InvalidIntentSignature');
  });

  it('rejects an intent signed by a passkey that is not (or no longer) an owner of the account', async function () {
    const impostor = createPasskey();
    const now = await time.latest();
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const signerAddr = await account.getAddress();
    const message = { x: 44, signer: signerAddr, nonce, validAfter: now - 60, validBefore: now + 3600 };
    const digest = ethers.TypedDataEncoder.hash(await domainOf(mock), DOTHING_TYPES, message);
    const sig = signAsPasskeyOwner(impostor, 0, await account.replaySafeHash(digest));
    await expect(
      mock.connect(relayer).doThing(44, signerAddr, nonce, now - 60, now + 3600, sig)
    ).to.be.revertedWithCustomError(mock, 'InvalidIntentSignature');
  });

  it('enforces the validity window for contract signers too', async function () {
    const now = await time.latest();
    const early = await signDoThingAsAccount(mock, 45, { validAfter: now + 600 });
    await expect(
      mock.connect(relayer).doThing(45, early.signerAddr, early.nonce, early.validAfter, early.validBefore, early.sig)
    ).to.be.revertedWithCustomError(mock, 'IntentNotYetValid');

    const expired = await signDoThingAsAccount(mock, 45, { validBefore: now - 1 });
    await expect(
      mock
        .connect(relayer)
        .doThing(45, expired.signerAddr, expired.nonce, expired.validAfter, expired.validBefore, expired.sig)
    ).to.be.revertedWithCustomError(mock, 'IntentExpired');
  });

  it('supports gasless invalidateNonceWithSig from a contract signer', async function () {
    const now = await time.latest();
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const validBefore = now + 3600;
    const signerAddr = await account.getAddress();
    const digest = ethers.TypedDataEncoder.hash(await domainOf(mock), INVALIDATE_TYPES, {
      signer: signerAddr,
      nonce,
      validBefore,
    });
    const sig = signAsPasskeyOwner(passkey, 0, await account.replaySafeHash(digest));

    await expect(mock.connect(relayer).invalidateNonceWithSig(signerAddr, nonce, validBefore, sig))
      .to.emit(mock, 'NonceInvalidated')
      .withArgs(signerAddr, nonce);
    expect(await mock.authorizationState(signerAddr, nonce)).to.equal(true);
  });

  it('keeps the plain-EOA ECDSA path working identically (no behavioral change)', async function () {
    const now = await time.latest();
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const message = { x: 7, signer: eoa.address, nonce, validAfter: now - 60, validBefore: now + 3600 };
    const sig = await eoa.signTypedData(await domainOf(mock), DOTHING_TYPES, message);
    await mock.connect(relayer).doThing(7, eoa.address, nonce, now - 60, now + 3600, sig);
    expect(await mock.authorizationState(eoa.address, nonce)).to.equal(true);
  });

  describe('malformed ERC-1271 responders', function () {
    let bad;
    const x = 90;

    beforeEach(async function () {
      const Bad = await ethers.getContractFactory('MockERC1271');
      bad = await Bad.deploy();
    });

    async function submitFor(badAddr) {
      const now = await time.latest();
      const nonce = ethers.hexlify(ethers.randomBytes(32));
      return mock
        .connect(relayer)
        .doThing(x, badAddr, nonce, now - 60, now + 3600, abi.encode(['string'], ['not-a-real-signature']));
    }

    it('accepts when the contract signer itself validates the signature (AcceptAll)', async function () {
      await bad.setMode(0);
      await submitFor(await bad.getAddress());
      expect(await mock.lastValue()).to.equal(90n);
    });

    it('rejects a wrong magic value', async function () {
      await bad.setMode(1);
      await expect(submitFor(await bad.getAddress())).to.be.revertedWithCustomError(mock, 'InvalidIntentSignature');
    });

    it('rejects a reverting responder', async function () {
      await bad.setMode(2);
      await expect(submitFor(await bad.getAddress())).to.be.revertedWithCustomError(mock, 'InvalidIntentSignature');
    });

    it('rejects a short (non-word) return', async function () {
      await bad.setMode(3);
      await expect(submitFor(await bad.getAddress())).to.be.revertedWithCustomError(mock, 'InvalidIntentSignature');
    });

    it('rejects a codeless signer with a garbage signature', async function () {
      const codeless = ethers.Wallet.createRandom().address;
      const now = await time.latest();
      const nonce = ethers.hexlify(ethers.randomBytes(32));
      await expect(
        mock.connect(relayer).doThing(x, codeless, nonce, now - 60, now + 3600, '0x1234')
      ).to.be.revertedWithCustomError(mock, 'InvalidIntentSignature');
    });
  });
});
