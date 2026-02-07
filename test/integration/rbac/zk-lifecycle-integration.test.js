import { expect } from "chai";
import hre from "hardhat";

describe("ZK Key Lifecycle - Integration Tests", function () {
  let ethers;
  let time;
  let roleManager, zkKeyManager, zkVerifier, privacyCoordinator;
  let owner, admin, user1, user2, user3;
  let CLEARPATH_USER_ROLE, DEFAULT_ADMIN_ROLE, ADMIN_ROLE, VERIFIER_ADMIN_ROLE;

  beforeEach(async function () {
    const connection = await hre.network.connect();
    ethers = connection.ethers;
    time = connection.networkHelpers.time;
    [owner, admin, user1, user2, user3] = await ethers.getSigners();
    
    // Deploy RoleManager
    const RoleManager = await ethers.getContractFactory("RoleManager");
    roleManager = await RoleManager.deploy();
    await roleManager.waitForDeployment();
    
    // Initialize role metadata
    await roleManager.initializeRoleMetadata();
    
    // Deploy ZKKeyManager
    const ZKKeyManager = await ethers.getContractFactory("ZKKeyManager");
    zkKeyManager = await ZKKeyManager.deploy();
    await zkKeyManager.waitForDeployment();
    
    // Deploy ZKVerifier
    const ZKVerifier = await ethers.getContractFactory("ZKVerifier");
    zkVerifier = await ZKVerifier.deploy();
    await zkVerifier.waitForDeployment();
    
    // Deploy PrivacyCoordinator
    const PrivacyCoordinator = await ethers.getContractFactory("PrivacyCoordinator");
    privacyCoordinator = await PrivacyCoordinator.deploy();
    await privacyCoordinator.waitForDeployment();
    await privacyCoordinator.initialize(owner.address);
    
    // Get role constants
    CLEARPATH_USER_ROLE = await roleManager.CLEARPATH_USER_ROLE();
    DEFAULT_ADMIN_ROLE = await roleManager.DEFAULT_ADMIN_ROLE();
    ADMIN_ROLE = await zkKeyManager.ADMIN_ROLE();
    const DELEGATE_ROLE = await zkKeyManager.DELEGATE_ROLE();
    VERIFIER_ADMIN_ROLE = await zkVerifier.VERIFIER_ADMIN_ROLE();
    
    // Link contracts
    await roleManager.setZKKeyManager(await zkKeyManager.getAddress());
    await privacyCoordinator.setZKVerifier(await zkVerifier.getAddress());
    
    // Grant admin roles
    await zkKeyManager.grantRole(ADMIN_ROLE, admin.address);
    await zkKeyManager.grantRole(DELEGATE_ROLE, await roleManager.getAddress()); // Allow RoleManager to act as delegate
    await zkVerifier.grantRole(VERIFIER_ADMIN_ROLE, admin.address);
  });

  describe("Complete Registration Flow", function () {
    it("Should allow user to purchase role and register ZK key", async function () {
      // User1 purchases ClearPath role
      const price = ethers.parseEther("250");
      await roleManager.connect(user1).purchaseRole(CLEARPATH_USER_ROLE, { value: price });
      
      // Verify role was granted
      expect(await roleManager.hasRole(CLEARPATH_USER_ROLE, user1.address)).to.equal(true);
      
      // User1 registers ZK key
      const zkKey = "zkp_clearpath_user1_key_1234567890123456789012345";
      await expect(roleManager.connect(user1).registerZKKey(zkKey))
        .to.emit(zkKeyManager, "KeyRegistered")
        .to.emit(roleManager, "ZKKeyRegistered");
      
      // Verify key was registered in both contracts
      expect(await roleManager.getZKPublicKey(user1.address)).to.equal(zkKey);
      expect(await zkKeyManager.getPublicKey(user1.address)).to.equal(zkKey);
      expect(await roleManager.hasValidZKKey(user1.address)).to.equal(true);
      expect(await zkKeyManager.hasValidKey(user1.address)).to.equal(true);
    });

    it("Should prevent non-ClearPath users from registering keys", async function () {
      const zkKey = "zkp_test_key_12345678901234567890123456789012";
      
      await expect(
        roleManager.connect(user1).registerZKKey(zkKey)
      ).to.be.revertedWithCustomError(roleManager, "RMNotActive");
    });

    it("Should maintain backward compatibility without ZKKeyManager", async function () {
      // Deploy new RoleManager without ZKKeyManager
      const RoleManager = await ethers.getContractFactory("RoleManager");
      const roleManager2 = await RoleManager.deploy();
      await roleManager2.waitForDeployment();
      
      // Initialize role metadata
      await roleManager2.initializeRoleMetadata();
      
      // Purchase role
      const price = ethers.parseEther("250");
      await roleManager2.connect(user1).purchaseRole(CLEARPATH_USER_ROLE, { value: price });
      
      // Register key (should work without ZKKeyManager)
      const zkKey = "zkp_legacy_key_12345678901234567890123456789012";
      await expect(roleManager2.connect(user1).registerZKKey(zkKey))
        .to.emit(roleManager2, "ZKKeyRegistered");
      
      // Key should be stored locally
      expect(await roleManager2.getZKPublicKey(user1.address)).to.equal(zkKey);
    });
  });

  describe("Key Rotation Flow", function () {
    beforeEach(async function () {
      // Setup: User1 has ClearPath role and registered key
      const price = ethers.parseEther("250");
      await roleManager.connect(user1).purchaseRole(CLEARPATH_USER_ROLE, { value: price });
      
      const zkKey = "zkp_clearpath_user1_key_1234567890123456789012345";
      await roleManager.connect(user1).registerZKKey(zkKey);
    });

    it("Should allow user to rotate their ZK key", async function () {
      const newKey = "zkp_rotated_key_98765432109876543210987654321098";
      
      await expect(roleManager.connect(user1).rotateZKKey(newKey))
        .to.emit(zkKeyManager, "KeyRotated")
        .to.emit(roleManager, "ZKKeyRotated");
      
      // Verify new key is active
      expect(await roleManager.getZKPublicKey(user1.address)).to.equal(newKey);
      expect(await zkKeyManager.getPublicKey(user1.address)).to.equal(newKey);
    });

    it("Should maintain key history after rotation", async function () {
      const newKey = "zkp_rotated_key_98765432109876543210987654321098";
      await roleManager.connect(user1).rotateZKKey(newKey);
      
      const history = await zkKeyManager.getKeyHistory(user1.address);
      expect(history.length).to.equal(2); // Original + rotated
    });

    it("Should enforce rate limiting on rotations", async function () {
      const maxRotations = await zkKeyManager.maxRotationsPerYear();
      
      // Perform maximum allowed rotations
      for (let i = 0; i < maxRotations; i++) {
        const newKey = `zkp_rotation_${i}_${"0".repeat(30)}`;
        await roleManager.connect(user1).rotateZKKey(newKey);
      }
      
      // Next rotation should fail
      await expect(
        roleManager.connect(user1).rotateZKKey("zkp_extra_rotation_key_12345678901234567890")
      ).to.be.revertedWithCustomError(zkKeyManager, "RateLimitExceeded");
    });

    it("Should prevent rotation without ZKKeyManager set", async function () {
      // Deploy new RoleManager without ZKKeyManager
      const RoleManager = await ethers.getContractFactory("RoleManager");
      const roleManager2 = await RoleManager.deploy();
      await roleManager2.waitForDeployment();
      
      // Initialize role metadata
      await roleManager2.initializeRoleMetadata();
      
      const price = ethers.parseEther("250");
      await roleManager2.connect(user1).purchaseRole(CLEARPATH_USER_ROLE, { value: price });
      await roleManager2.connect(user1).registerZKKey("zkp_key_12345678901234567890123456789012");
      
      await expect(
        roleManager2.connect(user1).rotateZKKey("zkp_new_key_98765432109876543210987654321098")
      ).to.be.revertedWithCustomError(roleManager2, "RMZKManagerNotSet");
    });
  });

  describe("Key Revocation Flow", function () {
    beforeEach(async function () {
      // Setup: User1 has ClearPath role and registered key
      const price = ethers.parseEther("250");
      await roleManager.connect(user1).purchaseRole(CLEARPATH_USER_ROLE, { value: price });
      
      const zkKey = "zkp_clearpath_user1_key_1234567890123456789012345";
      await roleManager.connect(user1).registerZKKey(zkKey);
    });

    it("Should allow user to revoke their own key", async function () {
      await expect(roleManager.connect(user1).revokeZKKey())
        .to.emit(zkKeyManager, "KeyRevoked");
      
      expect(await roleManager.hasValidZKKey(user1.address)).to.equal(false);
      expect(await zkKeyManager.hasValidKey(user1.address)).to.equal(false);
    });

    it("Should allow admin to revoke user's key", async function () {
      await expect(zkKeyManager.connect(admin).revokeKey(user1.address))
        .to.emit(zkKeyManager, "KeyRevoked");
      
      expect(await zkKeyManager.hasValidKey(user1.address)).to.equal(false);
    });

    it("Should allow re-registration after revocation", async function () {
      // Revoke key
      await roleManager.connect(user1).revokeZKKey();
      
      // Wait a bit
      await time.increase(60);
      
      // Register new key
      const newKey = "zkp_after_revoke_key_12345678901234567890123456789";
      await expect(roleManager.connect(user1).registerZKKey(newKey))
        .to.not.be.reverted;
      
      expect(await roleManager.hasValidZKKey(user1.address)).to.equal(true);
    });
  });

  describe("Key Expiration Flow", function () {
    beforeEach(async function () {
      // Setup: User1 has ClearPath role and registered key
      const price = ethers.parseEther("250");
      await roleManager.connect(user1).purchaseRole(CLEARPATH_USER_ROLE, { value: price });
      
      const zkKey = "zkp_clearpath_user1_key_1234567890123456789012345";
      await roleManager.connect(user1).registerZKKey(zkKey);
    });

    it("Should expire keys after configured duration", async function () {
      // Key should be valid initially
      expect(await zkKeyManager.hasValidKey(user1.address)).to.equal(true);
      
      // Advance time past expiration (365 days + 1)
      await time.increase(366 * 24 * 60 * 60);
      
      // Key should now be expired
      expect(await zkKeyManager.hasValidKey(user1.address)).to.equal(false);
      expect(await roleManager.hasValidZKKey(user1.address)).to.equal(false);
    });

    it("Should allow admin to manually expire keys", async function () {
      // First, get the current key hash to verify it exists
      const keyHash = await zkKeyManager.currentKeyHash(user1.address);
      expect(keyHash).to.not.equal(ethers.ZeroHash);
      
      await expect(zkKeyManager.connect(admin).expireKey(user1.address))
        .to.emit(zkKeyManager, "KeyExpired");
      
      expect(await zkKeyManager.hasValidKey(user1.address)).to.equal(false);
    });

    it("Should allow re-registration after expiration", async function () {
      // First verify key is active
      expect(await zkKeyManager.hasValidKey(user1.address)).to.equal(true);
      
      // Expire key by advancing time
      await time.increase(366 * 24 * 60 * 60);
      
      // Verify key is expired
      expect(await zkKeyManager.hasValidKey(user1.address)).to.equal(false);
      
      // Register new key (should work since old key is expired)
      const newKey = "zkp_after_expire_key_123456789012345678901234567890";
      await expect(roleManager.connect(user1).registerZKKey(newKey))
        .to.not.be.reverted;
      
      expect(await roleManager.hasValidZKKey(user1.address)).to.equal(true);
    });
  });

  describe("Multi-User Scenarios", function () {
    it("Should handle multiple users with independent key lifecycles", async function () {
      // User1 and User2 purchase roles
      const price = ethers.parseEther("250");
      await roleManager.connect(user1).purchaseRole(CLEARPATH_USER_ROLE, { value: price });
      await roleManager.connect(user2).purchaseRole(CLEARPATH_USER_ROLE, { value: price });
      
      // Both register keys
      const key1 = "zkp_user1_key_1234567890123456789012345678901234";
      const key2 = "zkp_user2_key_9876543210987654321098765432109876";
      
      await roleManager.connect(user1).registerZKKey(key1);
      await roleManager.connect(user2).registerZKKey(key2);
      
      // Verify independent keys
      expect(await roleManager.getZKPublicKey(user1.address)).to.equal(key1);
      expect(await roleManager.getZKPublicKey(user2.address)).to.equal(key2);
      
      // User1 rotates, User2 doesn't
      const newKey1 = "zkp_user1_new_key_12345678901234567890123456789";
      await roleManager.connect(user1).rotateZKKey(newKey1);
      
      // Verify User1's key changed, User2's didn't
      expect(await roleManager.getZKPublicKey(user1.address)).to.equal(newKey1);
      expect(await roleManager.getZKPublicKey(user2.address)).to.equal(key2);
      
      // User2 revokes
      await roleManager.connect(user2).revokeZKKey();
      
      // Verify User1 still valid, User2 not
      expect(await roleManager.hasValidZKKey(user1.address)).to.equal(true);
      expect(await roleManager.hasValidZKKey(user2.address)).to.equal(false);
    });
  });

  describe("Privacy Coordinator Integration", function () {
    beforeEach(async function () {
      // Setup verification key
      const sampleVK = {
        alpha: [0, 0],
        beta: [[0, 0], [0, 0]],
        gamma: [[0, 0], [0, 0]],
        delta: [[0, 0], [0, 0]],
        gammaABC: [[0, 0], [0, 0], [0, 0]]
      };
      
      await zkVerifier.connect(admin).setVerificationKey(
        sampleVK.alpha,
        sampleVK.beta,
        sampleVK.gamma,
        sampleVK.delta,
        sampleVK.gammaABC
      );
      
      // User1 setup
      const price = ethers.parseEther("250");
      await roleManager.connect(user1).purchaseRole(CLEARPATH_USER_ROLE, { value: price });
      const zkKey = "zkp_clearpath_user1_key_1234567890123456789012345";
      await roleManager.connect(user1).registerZKKey(zkKey);
    });

    it("Should link ZKVerifier to PrivacyCoordinator", async function () {
      // Register public key in PrivacyCoordinator
      const publicKey = ethers.keccak256(ethers.toUtf8Bytes("test_public_key"));
      await privacyCoordinator.connect(user1).registerPublicKey(publicKey);
      
      // Verify key is registered
      expect(await privacyCoordinator.publicKeys(user1.address)).to.equal(publicKey);
    });

    it("Should verify proof format is validated", async function () {
      // Register public key
      const publicKey = ethers.keccak256(ethers.toUtf8Bytes("test_public_key"));
      await privacyCoordinator.connect(user1).registerPublicKey(publicKey);
      
      // Create a valid-format proof
      const commitment = ethers.keccak256(ethers.toUtf8Bytes("test_commitment"));
      const zkProof = ethers.zeroPadBytes("0x00", 256); // 256 bytes
      const marketId = 1;
      
      // Submit encrypted position
      await expect(
        privacyCoordinator.connect(user1).submitEncryptedPosition(
          commitment,
          zkProof,
          marketId
        )
      ).to.emit(privacyCoordinator, "EncryptedPositionSubmitted");
    });

    it("Should fall back to simple check without ZKVerifier", async function () {
      // Deploy new PrivacyCoordinator without ZKVerifier
      const PrivacyCoordinator = await ethers.getContractFactory("PrivacyCoordinator");
      const privacyCoordinator2 = await PrivacyCoordinator.deploy();
      await privacyCoordinator2.waitForDeployment();
      await privacyCoordinator2.initialize(owner.address);
      
      // Register and submit
      const publicKey = ethers.keccak256(ethers.toUtf8Bytes("test_public_key"));
      await privacyCoordinator2.connect(user1).registerPublicKey(publicKey);
      
      const commitment = ethers.keccak256(ethers.toUtf8Bytes("test_commitment"));
      const zkProof = ethers.zeroPadBytes("0x01", 256);
      const marketId = 1;
      
      await privacyCoordinator2.connect(user1).submitEncryptedPosition(
        commitment,
        zkProof,
        marketId
      );
      
      // Verify should use fallback (just check proof exists)
      expect(await privacyCoordinator2.verifyPositionProof(0)).to.equal(true);
    });
  });

  describe("Configuration Changes", function () {
    it("Should allow admin to update ZKKeyManager configuration", async function () {
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

    it("Should apply new configuration to new registrations", async function () {
      // Update configuration to not require expiration
      await zkKeyManager.connect(admin).updateConfiguration(
        180 * 24 * 60 * 60,
        8,
        false // No expiration
      );
      
      // New user purchases and registers
      const price = ethers.parseEther("250");
      await roleManager.connect(user3).purchaseRole(CLEARPATH_USER_ROLE, { value: price });
      await roleManager.connect(user3).registerZKKey("zkp_key_12345678901234567890123456789012");
      
      // Advance time far into future
      await time.increase(1000 * 24 * 60 * 60); // 1000 days
      
      // Key should still be valid (no expiration)
      expect(await zkKeyManager.hasValidKey(user3.address)).to.equal(true);
    });
  });

  describe("Emergency Scenarios", function () {
    beforeEach(async function () {
      const price = ethers.parseEther("250");
      await roleManager.connect(user1).purchaseRole(CLEARPATH_USER_ROLE, { value: price });
      await roleManager.connect(user1).registerZKKey("zkp_key_12345678901234567890123456789012");
    });

    it("Should allow admin to pause ZKKeyManager", async function () {
      await zkKeyManager.connect(admin).pause();
      
      // Operations should be blocked
      await expect(
        roleManager.connect(user1).rotateZKKey("zkp_new_key_98765432109876543210987654321098")
      ).to.be.revertedWithCustomError(zkKeyManager, "EnforcedPause");
    });

    it("Should allow resumption after unpause", async function () {
      await zkKeyManager.connect(admin).pause();
      await zkKeyManager.connect(admin).unpause();
      
      // Operations should work again
      await expect(
        roleManager.connect(user1).rotateZKKey("zkp_new_key_98765432109876543210987654321098")
      ).to.not.be.reverted;
    });

    it("Should allow admin to manually expire compromised keys", async function () {
      // Verify key exists
      const keyHash = await zkKeyManager.currentKeyHash(user1.address);
      expect(keyHash).to.not.equal(ethers.ZeroHash);
      
      // Admin detects compromise and expires key
      await zkKeyManager.connect(admin).expireKey(user1.address);
      
      // Key should be invalid
      expect(await zkKeyManager.hasValidKey(user1.address)).to.equal(false);
      
      // User can register new key
      await expect(
        roleManager.connect(user1).registerZKKey("zkp_secure_key_12345678901234567890123456789")
      ).to.not.be.reverted;
      
      // New key should be valid
      expect(await zkKeyManager.hasValidKey(user1.address)).to.equal(true);
    });
  });
});
