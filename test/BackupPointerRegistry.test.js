const { expect } = require("chai");
const { ethers } = require("hardhat");

// Spec 032 — value-free per-wallet backup-pointer registry. Owner-only writes (keyed on msg.sender),
// public reads, overwrite-latest-wins, empty clears, CID length bound, event on every write.

describe("BackupPointerRegistry", function () {
  let registry, alice, bob;
  const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"; // CIDv1 base32 (~59 chars)

  beforeEach(async () => {
    [alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("BackupPointerRegistry");
    registry = await Factory.deploy();
    await registry.waitForDeployment();
  });

  it("sets a pointer and emits the event", async () => {
    await expect(registry.connect(alice).setPointer(CID))
      .to.emit(registry, "BackupPointerSet")
      .withArgs(alice.address, CID, await ethers.provider.getBlock("latest").then((b) => b.timestamp + 1));
    expect(await registry.getPointer(alice.address)).to.equal(CID);
    expect(await registry.hasPointer(alice.address)).to.be.true;
  });

  it("overwrites the prior pointer (latest wins)", async () => {
    const cid2 = "bafkreih2akiscaildcqabsyg3dfr6chu3fgpregiibwffr2qjghyvpvr3a";
    await registry.connect(alice).setPointer(CID);
    await registry.connect(alice).setPointer(cid2);
    expect(await registry.getPointer(alice.address)).to.equal(cid2);
  });

  it("isolates wallets — one wallet cannot affect another's slot", async () => {
    await registry.connect(alice).setPointer(CID);
    expect(await registry.getPointer(bob.address)).to.equal(""); // bob untouched
    expect(await registry.hasPointer(bob.address)).to.be.false;
    // there is no parameter for the owner — writes are keyed strictly on msg.sender
    await registry.connect(bob).setPointer("bobcid");
    expect(await registry.getPointer(alice.address)).to.equal(CID); // alice unchanged
  });

  it("clears the pointer when set to empty string (removal)", async () => {
    await registry.connect(alice).setPointer(CID);
    await registry.connect(alice).setPointer("");
    expect(await registry.getPointer(alice.address)).to.equal("");
    expect(await registry.hasPointer(alice.address)).to.be.false;
  });

  it("returns empty / false for an unset wallet", async () => {
    expect(await registry.getPointer(bob.address)).to.equal("");
    expect(await registry.hasPointer(bob.address)).to.be.false;
  });

  it("reverts a CID over the length bound", async () => {
    const tooLong = "b".repeat(257);
    await expect(registry.connect(alice).setPointer(tooLong)).to.be.revertedWithCustomError(
      registry,
      "CidTooLong"
    );
  });

  it("accepts a CID at the 256-char bound", async () => {
    const atBound = "b".repeat(256);
    await registry.connect(alice).setPointer(atBound);
    expect(await registry.getPointer(alice.address)).to.equal(atBound);
  });
});
