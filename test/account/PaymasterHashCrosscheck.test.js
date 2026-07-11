const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// Spec 050 — the CRITICAL cross-layer seam (tasks T006 ≡ T010): the relay-gateway's
// build.js `getHash` MUST be byte-identical to FairWinsVerifyingPaymaster.getHash. A drift
// silently produces AA34 / rejected UserOps. This deploys the real contract and compares.

describe("Paymaster getHash cross-check (contract ≡ gateway build.js)", function () {
  async function fx() {
    const [owner, signer, epEOA] = await ethers.getSigners();
    const PM = await ethers.getContractFactory("FairWinsVerifyingPaymaster");
    const pm = await PM.deploy(epEOA.address, signer.address, owner.address);
    await pm.waitForDeployment();
    // dynamic import of the ESM gateway module from this CJS test
    const build = await import("../../services/relay-gateway/src/paymaster/build.js");
    const { chainId } = await ethers.provider.getNetwork();
    return { pm, build, chainId };
  }

  const VECTORS = [
    { label: "counterfactual first-use (initCode set)", op: { initCode: "0xabcdef", callData: "0x1234" } },
    { label: "deployed account (empty initCode)", op: { initCode: "0x", callData: "0xdeadbeef00" } },
    { label: "empty callData", op: { initCode: "0x", callData: "0x" } },
  ];

  for (const { label, op } of VECTORS) {
    it(`matches for: ${label}`, async function () {
      const { pm, build, chainId } = await loadFixture(fx);
      const userOp = {
        sender: "0x" + "22".repeat(20),
        nonce: 42n,
        initCode: op.initCode,
        callData: op.callData,
        callGasLimit: 100000n,
        verificationGasLimit: 200000n,
        preVerificationGas: 50000n,
        maxFeePerGas: 1_000_000_000n,
        maxPriorityFeePerGas: 2_000_000_000n,
        paymasterAndData: "0x",
        signature: "0x",
      };
      const validUntil = 4_000_000_000;
      const validAfter = 123;

      const onchain = await pm.getHash(userOp, validUntil, validAfter);
      const offchain = build.getHash(userOp, {
        paymaster: await pm.getAddress(),
        chainId,
        validUntil,
        validAfter,
      });
      expect(offchain).to.equal(onchain);
    });
  }

  it("packPaymasterAndData round-trips through the contract's parser (valid sig sponsors)", async function () {
    const { pm, build, chainId } = await loadFixture(fx);
    const [, signer, epEOA] = await ethers.getSigners();
    const userOp = {
      sender: "0x" + "33".repeat(20),
      nonce: 1n,
      initCode: "0x",
      callData: "0x1234",
      callGasLimit: 100000n,
      verificationGasLimit: 200000n,
      preVerificationGas: 50000n,
      maxFeePerGas: 1_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      paymasterAndData: "0x",
      signature: "0x",
    };
    const validUntil = 4_000_000_000;
    const validAfter = 0;
    const hash = build.getHash(userOp, { paymaster: await pm.getAddress(), chainId, validUntil, validAfter });
    const sig = await signer.signMessage(ethers.getBytes(hash)); // signer === verifyingSigner
    userOp.paymasterAndData = build.packPaymasterAndData({
      paymaster: await pm.getAddress(),
      validUntil,
      validAfter,
      signature: sig,
    });
    const [, validationData] = await pm.connect(epEOA).validatePaymasterUserOp(userOp, ethers.ZeroHash, 0n);
    expect(validationData & 1n).to.equal(0n); // sigFailed === 0 → sponsored
  });
});
