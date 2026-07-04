/**
 * Spec 041 T006 — WebAuthn P-256 verification through the vendored stack:
 * ERC-1271 `isValidSignature` accepts WebAuthn-owner assertions (via the
 * FreshCryptoLib Solidity fallback — Hardhat has no RIP-7212 precompile),
 * rejects tampered digests, wrong keys, and malleable (high-s) signatures,
 * and accepts ECDSA EOA-owner signatures through the same entry point.
 *
 * ERC-1271 semantics under test are exactly what USDC (EIP-3009 / ERC-7598)
 * and the ERC-1271-enabled SignerIntentBase call: `isValidSignature(digest,
 * sig)` where the account internally validates against `replaySafeHash(digest)`.
 */

const { expect } = require('chai');
const { ethers } = require('hardhat');
const { AbiCoder } = require('ethers');
const {
  createPasskey,
  signWebAuthn,
  encodeWebAuthnAuth,
  wrapSignature,
  signAsPasskeyOwner,
} = require('./helpers/webauthn');

const abi = AbiCoder.defaultAbiCoder();
const ERC1271_MAGIC = '0x1626ba7e';
const ERC1271_FAIL = '0xffffffff';

describe('CoinbaseSmartWallet (vendored) — WebAuthn + ERC-1271', function () {
  async function deployFixture() {
    const [, eoaOwner] = await ethers.getSigners();
    const Wallet = await ethers.getContractFactory('CoinbaseSmartWallet');
    const impl = await Wallet.deploy();
    const Factory = await ethers.getContractFactory('CoinbaseSmartWalletFactory');
    const factory = await Factory.deploy(await impl.getAddress());
    const passkey = createPasskey();

    const owners = [abi.encode(['address'], [eoaOwner.address]), passkey.ownerBytes];
    const predicted = await factory['getAddress(bytes[],uint256)'](owners, 0);
    await factory.createAccount(owners, 0);
    const account = Wallet.attach(predicted);
    return { eoaOwner, account, passkey };
  }

  const digest = ethers.keccak256(ethers.toUtf8Bytes('fairwins intent digest'));

  it('accepts a WebAuthn assertion from the passkey owner (Solidity P-256 fallback path)', async function () {
    const { account, passkey } = await deployFixture();
    const replaySafe = await account.replaySafeHash(digest);
    const sig = signAsPasskeyOwner(passkey, 1, replaySafe);
    expect(await account.isValidSignature(digest, sig)).to.equal(ERC1271_MAGIC);
  });

  it('rejects the same assertion presented for a different digest (challenge binding)', async function () {
    const { account, passkey } = await deployFixture();
    const replaySafe = await account.replaySafeHash(digest);
    const sig = signAsPasskeyOwner(passkey, 1, replaySafe);
    const otherDigest = ethers.keccak256(ethers.toUtf8Bytes('a different message'));
    expect(await account.isValidSignature(otherDigest, sig)).to.equal(ERC1271_FAIL);
  });

  it('rejects an assertion signed by a different P-256 key', async function () {
    const { account } = await deployFixture();
    const impostor = createPasskey();
    const replaySafe = await account.replaySafeHash(digest);
    // Signature made by the impostor key but presented against owner index 1.
    const sig = signAsPasskeyOwner(impostor, 1, replaySafe);
    expect(await account.isValidSignature(digest, sig)).to.equal(ERC1271_FAIL);
  });

  it('rejects a malleable (high-s) signature', async function () {
    const { account, passkey } = await deployFixture();
    const replaySafe = await account.replaySafeHash(digest);
    // Sign repeatedly until the untouched signature is high-s, then present it raw.
    let auth;
    for (let i = 0; i < 64; i++) {
      const candidate = signWebAuthn(passkey, replaySafe, { keepHighS: true });
      const { P256_N } = require('./helpers/webauthn');
      if (candidate.s > P256_N / 2n) {
        auth = candidate;
        break;
      }
    }
    expect(auth, 'expected to draw a high-s signature within 64 tries').to.not.equal(undefined);
    const sig = wrapSignature(1, encodeWebAuthnAuth(auth));
    expect(await account.isValidSignature(digest, sig)).to.equal(ERC1271_FAIL);
  });

  it('rejects an assertion missing the user-present flag', async function () {
    const { account, passkey } = await deployFixture();
    const replaySafe = await account.replaySafeHash(digest);
    const auth = signWebAuthn(passkey, replaySafe, { flags: 0x00 });
    const sig = wrapSignature(1, encodeWebAuthnAuth(auth));
    expect(await account.isValidSignature(digest, sig)).to.equal(ERC1271_FAIL);
  });

  it('accepts an ECDSA signature from the EOA owner over the replay-safe hash', async function () {
    // Use a raw ethers.Wallet as owner so the test holds the private key
    // (Hardhat signers do not expose their signing key).
    const eoaWallet = ethers.Wallet.createRandom();
    const Wallet = await ethers.getContractFactory('CoinbaseSmartWallet');
    const Factory = await ethers.getContractFactory('CoinbaseSmartWalletFactory');
    const factory = await Factory.deploy(await Wallet.deploy().then((c) => c.getAddress()));
    const owners = [abi.encode(['address'], [eoaWallet.address])];
    await factory.createAccount(owners, 0);
    const account = Wallet.attach(await factory['getAddress(bytes[],uint256)'](owners, 0));

    const replaySafe = await account.replaySafeHash(digest);
    const raw = eoaWallet.signingKey.sign(replaySafe);
    const sig = wrapSignature(0, ethers.Signature.from(raw).serialized);
    expect(await account.isValidSignature(digest, sig)).to.equal(ERC1271_MAGIC);
  });

  it('rejects an ECDSA signature from a non-owner EOA', async function () {
    const { account } = await deployFixture();
    const stranger = ethers.Wallet.createRandom();
    const replaySafe = await account.replaySafeHash(digest);
    const raw = stranger.signingKey.sign(replaySafe);
    const sig = wrapSignature(0, ethers.Signature.from(raw).serialized);
    expect(await account.isValidSignature(digest, sig)).to.equal(ERC1271_FAIL);
  });

  it('replay-safe hash differs per account: a signature for one account fails on another', async function () {
    const { account, passkey, eoaOwner } = await deployFixture();
    // Second account with the SAME owners but a different nonce → different address.
    const Wallet = await ethers.getContractFactory('CoinbaseSmartWallet');
    const Factory = await ethers.getContractFactory('CoinbaseSmartWalletFactory');
    const factory = await Factory.deploy(await Wallet.deploy().then((c) => c.getAddress()));
    const owners = [abi.encode(['address'], [eoaOwner.address]), passkey.ownerBytes];
    await factory.createAccount(owners, 1);
    const account2 = Wallet.attach(await factory['getAddress(bytes[],uint256)'](owners, 1));

    const sigForAccount1 = signAsPasskeyOwner(passkey, 1, await account.replaySafeHash(digest));
    expect(await account.isValidSignature(digest, sigForAccount1)).to.equal(ERC1271_MAGIC);
    expect(await account2.isValidSignature(digest, sigForAccount1)).to.equal(ERC1271_FAIL);
  });
});
