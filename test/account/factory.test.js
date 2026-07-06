/**
 * Spec 041 T007 — CoinbaseSmartWalletFactory determinism (FR-023 basis):
 * `getAddress(owners, nonce)` equals the deployed address, deployment is
 * idempotent, the address is fixed by the INITIAL owner set + nonce and is
 * invariant under later owner changes, and the initCodeHash (the other
 * determinism input besides the factory address) is stable.
 *
 * Cross-NETWORK equality additionally requires the factory itself to sit at
 * the same address on every chain — enforced by scripts/deploy/
 * deploy-account-stack.js (T008), not testable on a single Hardhat chain.
 */

const { expect } = require('chai');
const { ethers } = require('hardhat');
const { AbiCoder } = require('ethers');
const { createPasskey } = require('./helpers/webauthn');

const abi = AbiCoder.defaultAbiCoder();

describe('CoinbaseSmartWalletFactory (vendored) — deterministic addresses', function () {
  async function deployFixture() {
    const [, eoaOwner] = await ethers.getSigners();
    const Wallet = await ethers.getContractFactory('CoinbaseSmartWallet');
    const impl = await Wallet.deploy();
    const Factory = await ethers.getContractFactory('CoinbaseSmartWalletFactory');
    const factory = await Factory.deploy(await impl.getAddress());
    const passkey = createPasskey();
    const owners = [passkey.ownerBytes];
    return { eoaOwner, Wallet, factory, passkey, owners };
  }

  it('getAddress matches the deployed account address', async function () {
    const { factory, owners } = await deployFixture();
    const predicted = await factory['getAddress(bytes[],uint256)'](owners, 0);
    await expect(factory.createAccount(owners, 0)).to.emit(factory, 'AccountCreated');
    expect(ethers.dataLength(await ethers.provider.getCode(predicted))).to.be.greaterThan(0);
  });

  it('createAccount is idempotent for the same (owners, nonce)', async function () {
    const { factory, owners } = await deployFixture();
    const predicted = await factory['getAddress(bytes[],uint256)'](owners, 0);
    await factory.createAccount(owners, 0);
    // Second call must not revert and must resolve to the same account.
    const again = await factory.createAccount.staticCall(owners, 0);
    expect(again).to.equal(predicted);
  });

  it('address is a pure function of initial owners + nonce (counterfactual funding target, FR-007)', async function () {
    const { factory, owners } = await deployFixture();
    const a0 = await factory['getAddress(bytes[],uint256)'](owners, 0);
    const a1 = await factory['getAddress(bytes[],uint256)'](owners, 1);
    expect(a0).to.not.equal(a1);

    const other = createPasskey();
    const aOther = await factory['getAddress(bytes[],uint256)']([other.ownerBytes], 0);
    expect(aOther).to.not.equal(a0);
  });

  it('address is invariant under later owner changes (FR-023: controllers change, identity does not)', async function () {
    const { factory, Wallet, owners, eoaOwner } = await deployFixture();
    const predicted = await factory['getAddress(bytes[],uint256)'](owners, 0);
    await factory.createAccount(owners, 0);
    const account = Wallet.attach(predicted);

    // Mutate the owner set through the account itself (self-call path is
    // exercised in wallet.test.js; here the passkey owner adds via EOA relay
    // is unavailable, so add through executeBatch from... the only owner is a
    // passkey — use the direct fixture shortcut: deploy with an EOA owner too.
    const withEoa = [abi.encode(['address'], [eoaOwner.address]), ...owners];
    const predicted2 = await factory['getAddress(bytes[],uint256)'](withEoa, 7);
    await factory.createAccount(withEoa, 7);
    const account2 = Wallet.attach(predicted2);
    await account2.connect(eoaOwner).addOwnerAddress(ethers.Wallet.createRandom().address);
    await account2.connect(eoaOwner).removeOwnerAtIndex(1, owners[0]);

    // getAddress with the ORIGINAL owner set still resolves to the deployed
    // account, and the deployed code is still there — the on-chain identity
    // never moved even though the controller set changed.
    expect(await factory['getAddress(bytes[],uint256)'](withEoa, 7)).to.equal(predicted2);
    expect(ethers.dataLength(await ethers.provider.getCode(predicted2))).to.be.greaterThan(0);
    expect(await account2.isOwnerBytes(owners[0])).to.equal(false);
    void account; // account with sole passkey owner deployed above remains valid
  });

  it('requires at least one initial owner', async function () {
    const { factory } = await deployFixture();
    await expect(factory.createAccount([], 0)).to.be.revertedWithCustomError(factory, 'OwnerRequired');
  });

  it('initCodeHash is stable for a given implementation (cross-chain determinism input)', async function () {
    const { factory } = await deployFixture();
    const h1 = await factory.initCodeHash();
    const h2 = await factory.initCodeHash();
    expect(h1).to.equal(h2);
    expect(h1).to.not.equal(ethers.ZeroHash);
  });
});
