const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("KeyRegistry", function () {
  let registry, alice, bob;

  beforeEach(async () => {
    [alice, bob] = await ethers.getSigners();
    const KeyRegistry = await ethers.getContractFactory("KeyRegistry");
    registry = await KeyRegistry.deploy();
    await registry.waitForDeployment();
  });

  it("registers a key and emits event", async () => {
    const key = ethers.hexlify(ethers.randomBytes(32));
    await expect(registry.connect(alice).registerKey(key))
      .to.emit(registry, "KeyRegistered")
      .withArgs(alice.address, key, await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));
    expect(await registry.getPublicKey(alice.address)).to.equal(key);
    expect(await registry.hasKey(alice.address)).to.be.true;
  });

  it("overwrites prior key on second registration", async () => {
    const a = ethers.hexlify(ethers.randomBytes(32));
    const b = ethers.hexlify(ethers.randomBytes(64));
    await registry.connect(alice).registerKey(a);
    await registry.connect(alice).registerKey(b);
    expect(await registry.getPublicKey(alice.address)).to.equal(b);
  });

  it("returns empty bytes / false for unregistered users", async () => {
    expect(await registry.getPublicKey(bob.address)).to.equal("0x");
    expect(await registry.hasKey(bob.address)).to.be.false;
  });

  it("rejects keys that are too short", async () => {
    const tooShort = ethers.hexlify(ethers.randomBytes(31));
    await expect(registry.connect(alice).registerKey(tooShort))
      .to.be.revertedWithCustomError(registry, "KeyTooShort");
  });

  it("rejects keys that are too long", async () => {
    const tooLong = ethers.hexlify(ethers.randomBytes(2049));
    await expect(registry.connect(alice).registerKey(tooLong))
      .to.be.revertedWithCustomError(registry, "KeyTooLong");
  });

  it("accepts X-Wing-sized hybrid keys (~1.2kB)", async () => {
    const xwing = ethers.hexlify(ethers.randomBytes(1216));
    await registry.connect(alice).registerKey(xwing);
    expect(await registry.getPublicKey(alice.address)).to.equal(xwing);
  });
});
