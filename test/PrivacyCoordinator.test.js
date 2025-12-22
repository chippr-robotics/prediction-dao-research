const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PrivacyCoordinator", function () {
  let privacyCoordinator;
  let owner;
  let user1;
  let user2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    
    const PrivacyCoordinator = await ethers.getContractFactory("PrivacyCoordinator");
    privacyCoordinator = await PrivacyCoordinator.deploy();
    await privacyCoordinator.initialize(owner.address);
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await privacyCoordinator.owner()).to.equal(owner.address);
    });

    it("Should set owner as coordinator", async function () {
      expect(await privacyCoordinator.coordinator()).to.equal(owner.address);
    });

    it("Should initialize with zero positions", async function () {
      expect(await privacyCoordinator.positionCount()).to.equal(0);
    });

    it("Should set correct epoch duration", async function () {
      expect(await privacyCoordinator.EPOCH_DURATION()).to.equal(1 * 60 * 60); // 1 hour
    });
  });

  describe("Public Key Registration", function () {
    it("Should allow user to register public key", async function () {
      const publicKey = ethers.keccak256(ethers.toUtf8Bytes("public_key_1"));
      
      await expect(
        privacyCoordinator.connect(user1).registerPublicKey(publicKey)
      ).to.emit(privacyCoordinator, "PublicKeyRegistered")
        .withArgs(user1.address, publicKey);
      
      expect(await privacyCoordinator.publicKeys(user1.address)).to.equal(publicKey);
    });

    it("Should allow user to update public key", async function () {
      const publicKey1 = ethers.keccak256(ethers.toUtf8Bytes("public_key_1"));
      const publicKey2 = ethers.keccak256(ethers.toUtf8Bytes("public_key_2"));
      
      await privacyCoordinator.connect(user1).registerPublicKey(publicKey1);
      await privacyCoordinator.connect(user1).registerPublicKey(publicKey2);
      
      expect(await privacyCoordinator.publicKeys(user1.address)).to.equal(publicKey2);
    });

    it("Should reject zero public key", async function () {
      const publicKey = ethers.ZeroHash;
      
      await expect(
        privacyCoordinator.connect(user1).registerPublicKey(publicKey)
      ).to.be.revertedWith("Invalid public key");
    });
  });

  describe("Encrypted Position Submission", function () {
    let publicKey;
    let commitment;
    let zkProof;

    beforeEach(async function () {
      publicKey = ethers.keccak256(ethers.toUtf8Bytes("public_key_1"));
      commitment = ethers.keccak256(ethers.toUtf8Bytes("commitment_1"));
      zkProof = ethers.toUtf8Bytes("zkProof_data");
      
      await privacyCoordinator.connect(user1).registerPublicKey(publicKey);
    });

    it("Should allow user to submit encrypted position", async function () {
      await expect(
        privacyCoordinator.connect(user1).submitEncryptedPosition(commitment, zkProof)
      ).to.emit(privacyCoordinator, "EncryptedPositionSubmitted");
      
      expect(await privacyCoordinator.positionCount()).to.equal(1);
    });

    it("Should reject submission without public key registration", async function () {
      await expect(
        privacyCoordinator.connect(user2).submitEncryptedPosition(commitment, zkProof)
      ).to.be.revertedWith("Public key not registered");
    });

    it("Should reject zero commitment", async function () {
      await expect(
        privacyCoordinator.connect(user1).submitEncryptedPosition(ethers.ZeroHash, zkProof)
      ).to.be.revertedWith("Invalid commitment");
    });
  });

  describe("Coordinator Management", function () {
    it("Should allow owner to change coordinator", async function () {
      await expect(
        privacyCoordinator.setCoordinator(user1.address)
      ).to.emit(privacyCoordinator, "CoordinatorChanged")
        .withArgs(owner.address, user1.address);
      
      expect(await privacyCoordinator.coordinator()).to.equal(user1.address);
    });

    it("Should only allow owner to change coordinator", async function () {
      await expect(
        privacyCoordinator.connect(user1).setCoordinator(user2.address)
      ).to.be.revertedWithCustomError(privacyCoordinator, "OwnableUnauthorizedAccount");
    });

    it("Should reject zero address coordinator", async function () {
      await expect(
        privacyCoordinator.setCoordinator(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid coordinator");
    });
  });
});
