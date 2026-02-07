import { expect } from "chai";
import hre from "hardhat";

describe("ZKKeyManager - Unit Tests", function () {
  let ethers;
  let time;
  let zkKeyManager;
  let owner, admin, user1, user2, user3;

  beforeEach(async function () {
    const connection = await hre.network.connect();
    ethers = connection.ethers;
    time = connection.networkHelpers.time;
    [owner, admin, user1, user2, user3] = await ethers.getSigners();
    
    const ZKKeyManager = await ethers.getContractFactory("ZKKeyManager");
    zkKeyManager = await ZKKeyManager.deploy();
    await zkKeyManager.waitForDeployment();
    
    // Grant admin role
    const ADMIN_ROLE = await zkKeyManager.ADMIN_ROLE();
    await zkKeyManager.grantRole(ADMIN_ROLE, admin.address);
  });

  describe("Deployment", function () {
    it("Should set correct default configuration", async function () {
      expect(await zkKeyManager.keyExpirationDuration()).to.equal(365 * 24 * 60 * 60); // 365 days
      expect(await zkKeyManager.maxRotationsPerYear()).to.equal(4);
      expect(await zkKeyManager.requireKeyExpiration()).to.equal(true);
    });

    it("Should grant deployer admin role", async function () {
      const DEFAULT_ADMIN_ROLE = await zkKeyManager.DEFAULT_ADMIN_ROLE();
      expect(await zkKeyManager.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.equal(true);
    });
  });

  describe("Key Registration", function () {
    it("Should allow user to register a ZK key", async function () {
      const publicKey = "zkp_test_key_12345678901234567890123456789012";
      
      await expect(zkKeyManager.connect(user1).registerKey(publicKey))
        .to.emit(zkKeyManager, "KeyRegistered");
      
      const retrievedKey = await zkKeyManager.getPublicKey(user1.address);
      expect(retrievedKey).to.equal(publicKey);
      
      const hasValid = await zkKeyManager.hasValidKey(user1.address);
      expect(hasValid).to.equal(true);
    });

    it("Should reject keys that are too short", async function () {
      const shortKey = "too_short";
      
      await expect(
        zkKeyManager.connect(user1).registerKey(shortKey)
      ).to.be.revertedWithCustomError(zkKeyManager, "InvalidKeyFormat");
    });

    it("Should reject keys that are too long", async function () {
      const longKey = "a".repeat(600);
      
      await expect(
        zkKeyManager.connect(user1).registerKey(longKey)
      ).to.be.revertedWithCustomError(zkKeyManager, "InvalidKeyFormat");
    });

    it("Should reject empty keys", async function () {
      await expect(
        zkKeyManager.connect(user1).registerKey("")
      ).to.be.revertedWithCustomError(zkKeyManager, "InvalidKeyFormat");
    });

    it("Should reject duplicate registration", async function () {
      const publicKey = "zkp_test_key_12345678901234567890123456789012";
      
      await zkKeyManager.connect(user1).registerKey(publicKey);
      
      await expect(
        zkKeyManager.connect(user1).registerKey(publicKey)
      ).to.be.revertedWithCustomError(zkKeyManager, "KeyAlreadyExists");
    });

    it("Should store key in history", async function () {
      const publicKey = "zkp_test_key_12345678901234567890123456789012";
      
      await zkKeyManager.connect(user1).registerKey(publicKey);
      
      const history = await zkKeyManager.getKeyHistory(user1.address);
      expect(history.length).to.equal(1);
    });

    it("Should set expiration time correctly", async function () {
      const publicKey = "zkp_test_key_12345678901234567890123456789012";
      
      const tx = await zkKeyManager.connect(user1).registerKey(publicKey);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      
      const metadata = await zkKeyManager.getKeyMetadata(user1.address);
      expect(metadata.expiresAt).to.equal(block.timestamp + 365 * 24 * 60 * 60);
    });
  });

  describe("Key Rotation", function () {
    beforeEach(async function () {
      const publicKey = "zkp_test_key_12345678901234567890123456789012";
      await zkKeyManager.connect(user1).registerKey(publicKey);
    });

    it("Should allow user to rotate their key", async function () {
      const newPublicKey = "zkp_new_key_98765432109876543210987654321098";
      
      await expect(zkKeyManager.connect(user1).rotateKey(newPublicKey))
        .to.emit(zkKeyManager, "KeyRotated");
      
      const retrievedKey = await zkKeyManager.getPublicKey(user1.address);
      expect(retrievedKey).to.equal(newPublicKey);
    });

    it("Should mark old key as ROTATED", async function () {
      const newPublicKey = "zkp_new_key_98765432109876543210987654321098";
      
      const oldKeyHash = await zkKeyManager.currentKeyHash(user1.address);
      
      await zkKeyManager.connect(user1).rotateKey(newPublicKey);
      
      const oldKey = await zkKeyManager.keys(oldKeyHash);
      expect(oldKey.status).to.equal(2); // ROTATED = 2
    });

    it("Should increment rotation count", async function () {
      const newPublicKey = "zkp_new_key_98765432109876543210987654321098";
      
      await zkKeyManager.connect(user1).rotateKey(newPublicKey);
      
      const metadata = await zkKeyManager.getKeyMetadata(user1.address);
      expect(metadata.rotationCount).to.equal(1);
    });

    it("Should enforce rate limiting", async function () {
      const maxRotations = await zkKeyManager.maxRotationsPerYear();
      
      // Perform max rotations
      for (let i = 0; i < maxRotations; i++) {
        const newKey = `zkp_key_${i}_${"0".repeat(30)}`;
        await zkKeyManager.connect(user1).rotateKey(newKey);
      }
      
      // Try one more rotation
      await expect(
        zkKeyManager.connect(user1).rotateKey("zkp_extra_key_12345678901234567890123456")
      ).to.be.revertedWithCustomError(zkKeyManager, "RateLimitExceeded");
    });

    it("Should reset rate limit after a year", async function () {
      const maxRotations = await zkKeyManager.maxRotationsPerYear();
      
      // Perform max rotations
      for (let i = 0; i < maxRotations; i++) {
        const newKey = `zkp_key_${i}_${"0".repeat(30)}`;
        await zkKeyManager.connect(user1).rotateKey(newKey);
      }
      
      // Advance time by 1 year + 1 day
      await time.increase(366 * 24 * 60 * 60);
      
      // Should be able to rotate again
      await expect(
        zkKeyManager.connect(user1).rotateKey("zkp_after_year_12345678901234567890123")
      ).to.not.be.reverted;
    });

    it("Should maintain key history", async function () {
      await zkKeyManager.connect(user1).rotateKey("zkp_key2_01234567890123456789012345678901");
      await zkKeyManager.connect(user1).rotateKey("zkp_key3_01234567890123456789012345678901");
      
      const history = await zkKeyManager.getKeyHistory(user1.address);
      expect(history.length).to.equal(3); // Original + 2 rotations
    });

    it("Should reject rotation without registered key", async function () {
      await expect(
        zkKeyManager.connect(user2).rotateKey("zkp_new_key_98765432109876543210987654321098")
      ).to.be.revertedWithCustomError(zkKeyManager, "NoKeyRegistered");
    });

    it("Should link to previous key", async function () {
      const oldKeyHash = await zkKeyManager.currentKeyHash(user1.address);
      
      await zkKeyManager.connect(user1).rotateKey("zkp_new_key_98765432109876543210987654321098");
      
      const newKeyHash = await zkKeyManager.currentKeyHash(user1.address);
      const newKey = await zkKeyManager.keys(newKeyHash);
      
      expect(newKey.previousKeyHash).to.equal(oldKeyHash);
    });
  });

  describe("Key Revocation", function () {
    beforeEach(async function () {
      const publicKey = "zkp_test_key_12345678901234567890123456789012";
      await zkKeyManager.connect(user1).registerKey(publicKey);
    });

    it("Should allow user to revoke their own key", async function () {
      await expect(zkKeyManager.connect(user1).revokeKey(user1.address))
        .to.emit(zkKeyManager, "KeyRevoked");
      
      const hasValid = await zkKeyManager.hasValidKey(user1.address);
      expect(hasValid).to.equal(false);
    });

    it("Should allow admin to revoke any key", async function () {
      await expect(zkKeyManager.connect(admin).revokeKey(user1.address))
        .to.emit(zkKeyManager, "KeyRevoked");
      
      const hasValid = await zkKeyManager.hasValidKey(user1.address);
      expect(hasValid).to.equal(false);
    });

    it("Should reject revocation by non-owner/non-admin", async function () {
      await expect(
        zkKeyManager.connect(user2).revokeKey(user1.address)
      ).to.be.revertedWithCustomError(zkKeyManager, "UnauthorizedRevocation");
    });

    it("Should mark key as REVOKED", async function () {
      const keyHash = await zkKeyManager.currentKeyHash(user1.address);
      
      await zkKeyManager.connect(user1).revokeKey(user1.address);
      
      const key = await zkKeyManager.keys(keyHash);
      expect(key.status).to.equal(3); // REVOKED = 3
    });
  });

  describe("Key Expiration", function () {
    it("Should expire keys after configured duration", async function () {
      const publicKey = "zkp_test_key_12345678901234567890123456789012";
      await zkKeyManager.connect(user1).registerKey(publicKey);
      
      // Key should be valid initially
      expect(await zkKeyManager.hasValidKey(user1.address)).to.equal(true);
      
      // Advance time past expiration
      await time.increase(366 * 24 * 60 * 60);
      
      // Key should now be expired
      expect(await zkKeyManager.hasValidKey(user1.address)).to.equal(false);
    });

    it("Should allow admin to manually expire key", async function () {
      const publicKey = "zkp_test_key_12345678901234567890123456789012";
      await zkKeyManager.connect(user1).registerKey(publicKey);
      
      await expect(zkKeyManager.connect(admin).expireKey(user1.address))
        .to.emit(zkKeyManager, "KeyExpired");
      
      const keyHash = await zkKeyManager.currentKeyHash(user1.address);
      const key = await zkKeyManager.keys(keyHash);
      expect(key.status).to.equal(4); // EXPIRED = 4
    });

    it("Should allow key registration after expiration", async function () {
      const publicKey = "zkp_test_key_12345678901234567890123456789012";
      await zkKeyManager.connect(user1).registerKey(publicKey);
      
      // Expire the key
      await time.increase(366 * 24 * 60 * 60);
      
      // Should be able to register a new key
      const newPublicKey = "zkp_new_key_98765432109876543210987654321098";
      await expect(zkKeyManager.connect(user1).registerKey(newPublicKey))
        .to.not.be.reverted;
    });
  });

  describe("Configuration Management", function () {
    it("Should allow admin to update configuration", async function () {
      await expect(
        zkKeyManager.connect(admin).updateConfiguration(
          180 * 24 * 60 * 60, // 180 days
          8, // 8 rotations per year
          false // Don't require expiration
        )
      ).to.emit(zkKeyManager, "ConfigurationUpdated");
      
      expect(await zkKeyManager.keyExpirationDuration()).to.equal(180 * 24 * 60 * 60);
      expect(await zkKeyManager.maxRotationsPerYear()).to.equal(8);
      expect(await zkKeyManager.requireKeyExpiration()).to.equal(false);
    });

    it("Should reject configuration with expiration too short", async function () {
      await expect(
        zkKeyManager.connect(admin).updateConfiguration(
          20 * 24 * 60 * 60, // 20 days - too short
          4,
          true
        )
      ).to.be.revertedWith("Expiration too short");
    });

    it("Should reject configuration with expiration too long", async function () {
      await expect(
        zkKeyManager.connect(admin).updateConfiguration(
          800 * 24 * 60 * 60, // 800 days - too long
          4,
          true
        )
      ).to.be.revertedWith("Expiration too long");
    });

    it("Should reject configuration with zero rotations", async function () {
      await expect(
        zkKeyManager.connect(admin).updateConfiguration(
          365 * 24 * 60 * 60,
          0, // Zero rotations
          true
        )
      ).to.be.revertedWith("Must allow rotations");
    });

    it("Should reject configuration update by non-admin", async function () {
      const ADMIN_ROLE = await zkKeyManager.ADMIN_ROLE();
      
      await expect(
        zkKeyManager.connect(user1).updateConfiguration(
          180 * 24 * 60 * 60,
          8,
          false
        )
      ).to.be.revertedWithCustomError(zkKeyManager, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Pause/Unpause", function () {
    it("Should allow admin to pause contract", async function () {
      await zkKeyManager.connect(admin).pause();
      expect(await zkKeyManager.paused()).to.equal(true);
    });

    it("Should prevent operations when paused", async function () {
      await zkKeyManager.connect(admin).pause();
      
      await expect(
        zkKeyManager.connect(user1).registerKey("zkp_test_key_12345678901234567890123456789012")
      ).to.be.revertedWithCustomError(zkKeyManager, "EnforcedPause");
    });

    it("Should allow admin to unpause contract", async function () {
      await zkKeyManager.connect(admin).pause();
      await zkKeyManager.connect(admin).unpause();
      
      expect(await zkKeyManager.paused()).to.equal(false);
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      const publicKey = "zkp_test_key_12345678901234567890123456789012";
      await zkKeyManager.connect(user1).registerKey(publicKey);
    });

    it("Should return correct public key", async function () {
      const key = await zkKeyManager.getPublicKey(user1.address);
      expect(key).to.equal("zkp_test_key_12345678901234567890123456789012");
    });

    it("Should return empty string for unregistered user", async function () {
      const key = await zkKeyManager.getPublicKey(user2.address);
      expect(key).to.equal("");
    });

    it("Should return correct key metadata", async function () {
      const metadata = await zkKeyManager.getKeyMetadata(user1.address);
      
      expect(metadata.publicKey).to.equal("zkp_test_key_12345678901234567890123456789012");
      expect(metadata.status).to.equal(1); // ACTIVE
      expect(metadata.rotationCount).to.equal(0);
    });

    it("Should validate key hash correctly", async function () {
      const keyHash = await zkKeyManager.currentKeyHash(user1.address);
      expect(await zkKeyManager.isKeyValid(keyHash)).to.equal(true);
    });
  });
});
