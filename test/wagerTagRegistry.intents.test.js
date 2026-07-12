const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// Spec 054 — gasless intent twins (SignerIntentBase): a relayer submits the owner's signed intent.

const WAGER_PARTICIPANT_ROLE = ethers.id("WAGER_PARTICIPANT_ROLE");
const Tier = { Gold: 3 };
const SALT = ethers.id("intent-salt");

const TRAILING = [
  { name: "nonce", type: "bytes32" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
];
const TYPES = {
  CommitTagIntent: [{ name: "owner", type: "address" }, { name: "commitment", type: "bytes32" }, ...TRAILING],
  RegisterTagIntent: [{ name: "owner", type: "address" }, { name: "tag", type: "string" }, { name: "salt", type: "bytes32" }, ...TRAILING],
  ReleaseTagIntent: [{ name: "owner", type: "address" }, { name: "tagHash", type: "bytes32" }, ...TRAILING],
  RequestRepointIntent: [{ name: "owner", type: "address" }, { name: "tagHash", type: "bytes32" }, { name: "newOwner", type: "address" }, ...TRAILING],
};

async function deployProxy(name, initArgs) {
  const Impl = await ethers.getContractFactory(name);
  const impl = await Impl.deploy();
  await impl.waitForDeployment();
  const initData = Impl.interface.encodeFunctionData("initialize", initArgs);
  const Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const proxy = await Proxy.deploy(await impl.getAddress(), initData);
  await proxy.waitForDeployment();
  return Impl.attach(await proxy.getAddress());
}

async function fixture() {
  const [admin, owner, relayer, target] = await ethers.getSigners();
  const Token = await ethers.getContractFactory("MockERC20");
  const token = await Token.deploy("USD Coin", "USDC", 6);
  await token.waitForDeployment();
  const membership = await deployProxy("MembershipManager", [admin.address, await token.getAddress(), admin.address]);
  const reg = await deployProxy("WagerTagRegistry", [admin.address, await membership.getAddress(), ethers.ZeroAddress, WAGER_PARTICIPANT_ROLE]);
  await membership.connect(admin).grantMembership(owner.address, WAGER_PARTICIPANT_ROLE, Tier.Gold, 365);

  const net = await ethers.provider.getNetwork();
  const domain = { name: "FairWins WagerTagRegistry", version: "1", chainId: net.chainId, verifyingContract: await reg.getAddress() };
  return { admin, owner, relayer, target, reg, domain };
}

const sign = (signer, domain, primaryType, value) => signer.signTypedData(domain, { [primaryType]: TYPES[primaryType] }, value);

describe("WagerTagRegistry — gasless intents", () => {
  it("relayer submits owner-signed commit + register (self-submit rail bypassed)", async () => {
    const { owner, relayer, reg, domain } = await fixture();
    const commitment = await reg.makeCommitment("gasless", owner.address, SALT);
    const now = await time.latest();
    const window = { nonce: ethers.id("n1"), validAfter: 0, validBefore: now + 3600 };

    const commitSig = await sign(owner, domain, "CommitTagIntent", { owner: owner.address, commitment, ...window });
    await reg.connect(relayer).commitWithSig(owner.address, commitment, window.nonce, window.validAfter, window.validBefore, commitSig);

    await time.increase(120);
    const w2 = { nonce: ethers.id("n2"), validAfter: 0, validBefore: (await time.latest()) + 3600 };
    const regSig = await sign(owner, domain, "RegisterTagIntent", { owner: owner.address, tag: "gasless", salt: SALT, ...w2 });
    await reg.connect(relayer).registerWithSig(owner.address, "gasless", SALT, w2.nonce, w2.validAfter, w2.validBefore, regSig);

    expect(await reg.tagOf(owner.address)).to.equal("gasless");
  });

  it("rejects replayed nonce", async () => {
    const { owner, relayer, reg, domain } = await fixture();
    const commitment = await reg.makeCommitment("replayme", owner.address, SALT);
    const w = { nonce: ethers.id("dup"), validAfter: 0, validBefore: (await time.latest()) + 3600 };
    const sig = await sign(owner, domain, "CommitTagIntent", { owner: owner.address, commitment, ...w });
    await reg.connect(relayer).commitWithSig(owner.address, commitment, w.nonce, w.validAfter, w.validBefore, sig);
    await expect(
      reg.connect(relayer).commitWithSig(owner.address, commitment, w.nonce, w.validAfter, w.validBefore, sig)
    ).to.be.revertedWithCustomError(reg, "IntentReplayed");
  });

  it("rejects expired intent", async () => {
    const { owner, relayer, reg, domain } = await fixture();
    const commitment = await reg.makeCommitment("expired", owner.address, SALT);
    const w = { nonce: ethers.id("exp"), validAfter: 0, validBefore: (await time.latest()) - 1 };
    const sig = await sign(owner, domain, "CommitTagIntent", { owner: owner.address, commitment, ...w });
    await expect(
      reg.connect(relayer).commitWithSig(owner.address, commitment, w.nonce, w.validAfter, w.validBefore, sig)
    ).to.be.revertedWithCustomError(reg, "IntentExpired");
  });

  it("rejects a signature from someone other than the owner", async () => {
    const { owner, relayer, target, reg, domain } = await fixture();
    const commitment = await reg.makeCommitment("wrongsig", owner.address, SALT);
    const w = { nonce: ethers.id("ws"), validAfter: 0, validBefore: (await time.latest()) + 3600 };
    const badSig = await sign(target, domain, "CommitTagIntent", { owner: owner.address, commitment, ...w }); // target signs, claims owner
    await expect(
      reg.connect(relayer).commitWithSig(owner.address, commitment, w.nonce, w.validAfter, w.validBefore, badSig)
    ).to.be.revertedWithCustomError(reg, "InvalidIntentSignature");
  });

  it("relayer submits release and repoint intents (pin the tagHash)", async () => {
    const { owner, relayer, target, reg, domain } = await fixture();
    // register via relayer first
    const commitment = await reg.makeCommitment("lifecycle", owner.address, SALT);
    let w = { nonce: ethers.id("c"), validAfter: 0, validBefore: (await time.latest()) + 3600 };
    await reg.connect(relayer).commitWithSig(owner.address, commitment, w.nonce, w.validAfter, w.validBefore,
      await sign(owner, domain, "CommitTagIntent", { owner: owner.address, commitment, ...w }));
    await time.increase(120);
    w = { nonce: ethers.id("r"), validAfter: 0, validBefore: (await time.latest()) + 3600 };
    await reg.connect(relayer).registerWithSig(owner.address, "lifecycle", SALT, w.nonce, w.validAfter, w.validBefore,
      await sign(owner, domain, "RegisterTagIntent", { owner: owner.address, tag: "lifecycle", salt: SALT, ...w }));

    const h = ethers.keccak256(ethers.toUtf8Bytes("lifecycle"));
    // repoint via intent
    w = { nonce: ethers.id("rp"), validAfter: 0, validBefore: (await time.latest()) + 3600 };
    await reg.connect(relayer).requestRepointWithSig(owner.address, h, target.address, w.nonce, w.validAfter, w.validBefore,
      await sign(owner, domain, "RequestRepointIntent", { owner: owner.address, tagHash: h, newOwner: target.address, ...w }));
    expect((await reg.getTagInfoByHash(h)).pendingOwner).to.equal(target.address);
  });
});
