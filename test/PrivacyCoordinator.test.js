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
        privacyCoordinator.connect(user1).submitEncryptedPosition(commitment, zkProof, 1)
      ).to.emit(privacyCoordinator, "EncryptedPositionSubmitted");
      
      expect(await privacyCoordinator.positionCount()).to.equal(1);
    });

    it("Should reject submission without public key registration", async function () {
      await expect(
        privacyCoordinator.connect(user2).submitEncryptedPosition(commitment, zkProof, 1)
      ).to.be.revertedWith("Public key not registered");
    });

    it("Should reject zero commitment", async function () {
      await expect(
        privacyCoordinator.connect(user1).submitEncryptedPosition(ethers.ZeroHash, zkProof, 1)
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

  describe("Key Change Submission", function () {
    beforeEach(async function () {
      const publicKey = ethers.keccak256(ethers.toUtf8Bytes("public_key_1"));
      await privacyCoordinator.connect(user1).registerPublicKey(publicKey);
    });

    it("Should allow user to submit key change", async function () {
      const keyChangeMessage = ethers.toUtf8Bytes("encrypted_key_change");
      
      await expect(
        privacyCoordinator.connect(user1).submitKeyChange(keyChangeMessage)
      ).to.emit(privacyCoordinator, "KeyChangeSubmitted")
        .withArgs(user1.address, 0);
    });

    it("Should store multiple key changes", async function () {
      const keyChange1 = ethers.toUtf8Bytes("key_change_1");
      const keyChange2 = ethers.toUtf8Bytes("key_change_2");
      
      await privacyCoordinator.connect(user1).submitKeyChange(keyChange1);
      await privacyCoordinator.connect(user1).submitKeyChange(keyChange2);
      
      const keyChanges = await privacyCoordinator.getUserKeyChanges(user1.address);
      expect(keyChanges.length).to.equal(2);
    });

    it("Should reject key change without public key", async function () {
      const keyChangeMessage = ethers.toUtf8Bytes("encrypted_key_change");
      
      await expect(
        privacyCoordinator.connect(user2).submitKeyChange(keyChangeMessage)
      ).to.be.revertedWith("Public key not registered");
    });

    it("Should reject empty key change", async function () {
      await expect(
        privacyCoordinator.connect(user1).submitKeyChange("0x")
      ).to.be.revertedWith("Invalid key change");
    });
  });

  describe("Message Processing", function () {
    beforeEach(async function () {
      const publicKey = ethers.keccak256(ethers.toUtf8Bytes("public_key_1"));
      await privacyCoordinator.connect(user1).registerPublicKey(publicKey);
      
      // Submit some positions
      for (let i = 0; i < 3; i++) {
        const commitment = ethers.keccak256(ethers.toUtf8Bytes(`commitment_${i}`));
        const zkProof = ethers.toUtf8Bytes(`proof_${i}`);
        await privacyCoordinator.connect(user1).submitEncryptedPosition(commitment, zkProof, 1);
      }
    });

    it("Should allow coordinator to process messages", async function () {
      const epochId = 0;
      
      await expect(
        privacyCoordinator.processMessages(epochId)
      ).to.emit(privacyCoordinator, "EpochProcessed")
        .withArgs(epochId, 3);
    });

    it("Should mark positions as processed", async function () {
      await privacyCoordinator.processMessages(0);
      
      const position = await privacyCoordinator.getPosition(0);
      expect(position.processed).to.equal(true);
    });

    it("Should not reprocess already processed positions", async function () {
      await privacyCoordinator.processMessages(0);
      
      // Process again - should emit 0 processed
      await expect(
        privacyCoordinator.processMessages(0)
      ).to.emit(privacyCoordinator, "EpochProcessed")
        .withArgs(0, 0);
    });

    it("Should reject processing from non-coordinator", async function () {
      await expect(
        privacyCoordinator.connect(user1).processMessages(0)
      ).to.be.revertedWith("Not coordinator");
    });

    it("Should reject processing future epoch", async function () {
      await expect(
        privacyCoordinator.processMessages(999)
      ).to.be.revertedWith("Invalid epoch");
    });
  });

  describe("Epoch Management", function () {
    it("Should start at epoch 0", async function () {
      expect(await privacyCoordinator.currentEpoch()).to.equal(0);
    });

    it("Should advance epoch after duration", async function () {
      // Fast forward past epoch duration
      await ethers.provider.send("evm_increaseTime", [1 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine");
      
      await privacyCoordinator.advanceEpoch();
      expect(await privacyCoordinator.currentEpoch()).to.equal(1);
    });

    it("Should reject advancing epoch before duration ends", async function () {
      await expect(
        privacyCoordinator.advanceEpoch()
      ).to.be.revertedWith("Epoch not ended");
    });

    it("Should allow anyone to advance epoch", async function () {
      await ethers.provider.send("evm_increaseTime", [1 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine");
      
      await expect(
        privacyCoordinator.connect(user1).advanceEpoch()
      ).to.not.be.reverted;
    });

    it("Should group positions by epoch", async function () {
      const publicKey = ethers.keccak256(ethers.toUtf8Bytes("public_key_1"));
      await privacyCoordinator.connect(user1).registerPublicKey(publicKey);
      
      // Submit positions in epoch 0
      const commitment1 = ethers.keccak256(ethers.toUtf8Bytes("commitment_1"));
      const zkProof1 = ethers.toUtf8Bytes("proof_1");
      await privacyCoordinator.connect(user1).submitEncryptedPosition(commitment1, zkProof1, 1);
      
      let epoch0Positions = await privacyCoordinator.getEpochPositions(0);
      expect(epoch0Positions.length).to.equal(1);
      
      // Advance epoch
      await ethers.provider.send("evm_increaseTime", [1 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine");
      await privacyCoordinator.advanceEpoch();
      
      // Submit positions in epoch 1
      const commitment2 = ethers.keccak256(ethers.toUtf8Bytes("commitment_2"));
      const zkProof2 = ethers.toUtf8Bytes("proof_2");
      await privacyCoordinator.connect(user1).submitEncryptedPosition(commitment2, zkProof2, 1);
      
      epoch0Positions = await privacyCoordinator.getEpochPositions(0);
      const epoch1Positions = await privacyCoordinator.getEpochPositions(1);
      
      expect(epoch0Positions.length).to.equal(1);
      expect(epoch1Positions.length).to.equal(1);
    });
  });

  describe("Query Functions", function () {
    beforeEach(async function () {
      const publicKey = ethers.keccak256(ethers.toUtf8Bytes("public_key_1"));
      await privacyCoordinator.connect(user1).registerPublicKey(publicKey);
      
      const commitment = ethers.keccak256(ethers.toUtf8Bytes("commitment_1"));
      const zkProof = ethers.toUtf8Bytes("proof_1");
      await privacyCoordinator.connect(user1).submitEncryptedPosition(commitment, zkProof, 1);
    });

    it("Should return position details", async function () {
      const position = await privacyCoordinator.getPosition(0);
      
      expect(position.commitment).to.equal(ethers.keccak256(ethers.toUtf8Bytes("commitment_1")));
      expect(position.processed).to.equal(false);
    });

    it("Should reject getting invalid position ID", async function () {
      await expect(
        privacyCoordinator.getPosition(999)
      ).to.be.revertedWith("Invalid position ID");
    });

    it("Should return epoch positions", async function () {
      const positions = await privacyCoordinator.getEpochPositions(0);
      expect(positions.length).to.equal(1);
      expect(positions[0]).to.equal(0);
    });

    it("Should return empty array for epoch with no positions", async function () {
      const positions = await privacyCoordinator.getEpochPositions(999);
      expect(positions.length).to.equal(0);
    });

    it("Should return user key changes", async function () {
      const keyChange = ethers.toUtf8Bytes("key_change_1");
      await privacyCoordinator.connect(user1).submitKeyChange(keyChange);
      
      const keyChanges = await privacyCoordinator.getUserKeyChanges(user1.address);
      expect(keyChanges.length).to.equal(1);
      expect(keyChanges[0].processed).to.equal(false);
    });

    it("Should return empty array for user with no key changes", async function () {
      const keyChanges = await privacyCoordinator.getUserKeyChanges(user2.address);
      expect(keyChanges.length).to.equal(0);
    });
  });

  describe("Position Proof Verification", function () {
    beforeEach(async function () {
      const publicKey = ethers.keccak256(ethers.toUtf8Bytes("public_key_1"));
      await privacyCoordinator.connect(user1).registerPublicKey(publicKey);
    });

    it("Should verify position with valid proof", async function () {
      const commitment = ethers.keccak256(ethers.toUtf8Bytes("commitment_1"));
      const zkProof = ethers.toUtf8Bytes("valid_proof");
      
      await privacyCoordinator.connect(user1).submitEncryptedPosition(commitment, zkProof, 1);
      
      const isValid = await privacyCoordinator.verifyPositionProof(0);
      expect(isValid).to.equal(true);
    });

    it("Should reject verification for invalid position ID", async function () {
      await expect(
        privacyCoordinator.verifyPositionProof(999)
      ).to.be.revertedWith("Invalid position ID");
    });
  });

  describe("Empty Proof Submission", function () {
    beforeEach(async function () {
      const publicKey = ethers.keccak256(ethers.toUtf8Bytes("public_key_1"));
      await privacyCoordinator.connect(user1).registerPublicKey(publicKey);
    });

    it("Should reject submission with empty proof", async function () {
      const commitment = ethers.keccak256(ethers.toUtf8Bytes("commitment_1"));
      
      await expect(
        privacyCoordinator.connect(user1).submitEncryptedPosition(commitment, "0x", 1)
      ).to.be.revertedWith("Invalid proof");
    });
  });
});
