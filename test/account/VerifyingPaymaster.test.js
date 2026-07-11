const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// Spec 050 — FairWinsVerifyingPaymaster unit tests.
// Signature-only, zero-storage v0.6 verifying paymaster: sponsors a UserOp iff paymasterAndData
// carries a valid verifyingSigner signature over getHash + a validity window.

const MASK_48 = (1n << 48n) - 1n;

function decodeValidationData(vd) {
  return {
    sigFailed: vd & 1n,
    validUntil: (vd >> 160n) & MASK_48,
    validAfter: (vd >> 208n) & MASK_48,
  };
}

function baseUserOp(sender) {
  return {
    sender,
    nonce: 0n,
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
}

describe("FairWinsVerifyingPaymaster (spec 050)", function () {
  async function deployFixture() {
    const [owner, kmsSigner, stranger, epEOA, sender] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory("MockEntryPointStake");
    const mockEP = await Mock.deploy();
    await mockEP.waitForDeployment();

    const PM = await ethers.getContractFactory("FairWinsVerifyingPaymaster");
    // Validation-path paymaster: entryPoint is an EOA so tests can call as the EntryPoint.
    const pm = await PM.deploy(epEOA.address, kmsSigner.address, owner.address);
    await pm.waitForDeployment();
    // Deposit/stake paymaster: entryPoint is the mock contract.
    const pmDep = await PM.deploy(await mockEP.getAddress(), kmsSigner.address, owner.address);
    await pmDep.waitForDeployment();

    return { pm, pmDep, mockEP, owner, kmsSigner, stranger, epEOA, sender };
  }

  async function signApproval(pm, kmsSigner, userOp, validUntil, validAfter) {
    const hash = await pm.getHash(userOp, validUntil, validAfter);
    const sig = await kmsSigner.signMessage(ethers.getBytes(hash));
    const pnd = ethers.solidityPacked(
      ["address", "uint48", "uint48", "bytes"],
      [await pm.getAddress(), validUntil, validAfter, sig]
    );
    return { ...userOp, paymasterAndData: pnd };
  }

  it("sponsors an op with a valid signer signature (sigFailed=0, window echoed)", async function () {
    const { pm, kmsSigner, epEOA, sender } = await loadFixture(deployFixture);
    const validUntil = 4_000_000_000; // far future
    const validAfter = 0;
    const op = await signApproval(pm, kmsSigner, baseUserOp(sender.address), validUntil, validAfter);

    const [context, validationData] = await pm
      .connect(epEOA)
      .validatePaymasterUserOp(op, ethers.ZeroHash, 0n);

    expect(context).to.equal("0x");
    const d = decodeValidationData(validationData);
    expect(d.sigFailed).to.equal(0n);
    expect(d.validUntil).to.equal(BigInt(validUntil));
    expect(d.validAfter).to.equal(BigInt(validAfter));
  });

  it("rejects a signature from the wrong signer (sigFailed=1)", async function () {
    const { pm, stranger, epEOA, sender } = await loadFixture(deployFixture);
    const validUntil = 4_000_000_000;
    // sign with `stranger`, not the verifyingSigner
    const op = await signApproval(pm, stranger, baseUserOp(sender.address), validUntil, 0);
    const [, validationData] = await pm.connect(epEOA).validatePaymasterUserOp(op, ethers.ZeroHash, 0n);
    expect(decodeValidationData(validationData).sigFailed).to.equal(1n);
  });

  it("rejects when the op is tampered after signing (sigFailed=1)", async function () {
    const { pm, kmsSigner, epEOA, sender } = await loadFixture(deployFixture);
    const validUntil = 4_000_000_000;
    const signed = await signApproval(pm, kmsSigner, baseUserOp(sender.address), validUntil, 0);
    // tamper callData but keep the same paymasterAndData (sig)
    const tampered = { ...signed, callData: "0xdeadbeef" };
    const [, validationData] = await pm.connect(epEOA).validatePaymasterUserOp(tampered, ethers.ZeroHash, 0n);
    expect(decodeValidationData(validationData).sigFailed).to.equal(1n);
  });

  it("reverts when called by anyone other than the EntryPoint", async function () {
    const { pm, kmsSigner, stranger, sender } = await loadFixture(deployFixture);
    const op = await signApproval(pm, kmsSigner, baseUserOp(sender.address), 4_000_000_000, 0);
    await expect(
      pm.connect(stranger).validatePaymasterUserOp(op, ethers.ZeroHash, 0n)
    ).to.be.revertedWithCustomError(pm, "NotFromEntryPoint");
  });

  it("reverts on malformed paymasterAndData length", async function () {
    const { pm, epEOA, sender } = await loadFixture(deployFixture);
    const op = { ...baseUserOp(sender.address), paymasterAndData: "0x1234" }; // < 32 bytes
    await expect(
      pm.connect(epEOA).validatePaymasterUserOp(op, ethers.ZeroHash, 0n)
    ).to.be.revertedWithCustomError(pm, "InvalidPaymasterDataLength");
  });

  it("owner can rotate the verifying signer; others cannot; zero rejected", async function () {
    const { pm, owner, kmsSigner, stranger } = await loadFixture(deployFixture);
    await expect(pm.connect(owner).setVerifyingSigner(stranger.address))
      .to.emit(pm, "VerifyingSignerChanged")
      .withArgs(kmsSigner.address, stranger.address);
    expect(await pm.verifyingSigner()).to.equal(stranger.address);

    await expect(pm.connect(stranger).setVerifyingSigner(owner.address))
      .to.be.revertedWithCustomError(pm, "OwnableUnauthorizedAccount");
    await expect(pm.connect(owner).setVerifyingSigner(ethers.ZeroAddress))
      .to.be.revertedWithCustomError(pm, "ZeroSigner");
  });

  it("rotating the signer changes who can sponsor", async function () {
    const { pm, owner, kmsSigner, stranger, epEOA, sender } = await loadFixture(deployFixture);
    // old signer valid now
    let op = await signApproval(pm, kmsSigner, baseUserOp(sender.address), 4_000_000_000, 0);
    let [, vd] = await pm.connect(epEOA).validatePaymasterUserOp(op, ethers.ZeroHash, 0n);
    expect(decodeValidationData(vd).sigFailed).to.equal(0n);
    // rotate to stranger
    await pm.connect(owner).setVerifyingSigner(stranger.address);
    // old signer now fails
    [, vd] = await pm.connect(epEOA).validatePaymasterUserOp(op, ethers.ZeroHash, 0n);
    expect(decodeValidationData(vd).sigFailed).to.equal(1n);
    // new signer succeeds
    op = await signApproval(pm, stranger, baseUserOp(sender.address), 4_000_000_000, 0);
    [, vd] = await pm.connect(epEOA).validatePaymasterUserOp(op, ethers.ZeroHash, 0n);
    expect(decodeValidationData(vd).sigFailed).to.equal(0n);
  });

  it("funds the deposit and only the owner can withdraw it", async function () {
    const { pmDep, mockEP, owner, stranger } = await loadFixture(deployFixture);
    await pmDep.deposit({ value: ethers.parseEther("1") });
    expect(await pmDep.getDeposit()).to.equal(ethers.parseEther("1"));
    expect(await mockEP.balanceOf(await pmDep.getAddress())).to.equal(ethers.parseEther("1"));

    await expect(
      pmDep.connect(stranger).withdrawTo(stranger.address, ethers.parseEther("0.5"))
    ).to.be.revertedWithCustomError(pmDep, "OwnableUnauthorizedAccount");

    await expect(
      pmDep.connect(owner).withdrawTo(owner.address, ethers.parseEther("0.4"))
    ).to.changeEtherBalance(owner, ethers.parseEther("0.4"));
    expect(await pmDep.getDeposit()).to.equal(ethers.parseEther("0.6"));
  });

  it("constructor rejects a zero verifying signer", async function () {
    const { owner, epEOA } = await loadFixture(deployFixture);
    const PM = await ethers.getContractFactory("FairWinsVerifyingPaymaster");
    await expect(PM.deploy(epEOA.address, ethers.ZeroAddress, owner.address)).to.be.revertedWithCustomError(
      PM,
      "ZeroSigner"
    );
  });
});
