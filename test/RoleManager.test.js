import { expect } from "chai";
import hre from "hardhat";

describe("RoleManager - Unit Tests", function () {
  let ethers;
  let time;
  let roleManager;
  let owner, coreAdmin, opsAdmin, guardian, user1, user2, user3, committee1, committee2;

  // Role constants
  let DEFAULT_ADMIN_ROLE;
  let CORE_SYSTEM_ADMIN_ROLE;
  let OPERATIONS_ADMIN_ROLE;
  let EMERGENCY_GUARDIAN_ROLE;
  let MARKET_MAKER_ROLE;
  let CLEARPATH_USER_ROLE;
  let TOKENMINT_ROLE;
  let OVERSIGHT_COMMITTEE_ROLE;

  beforeEach(async function () {
    const connection = await hre.network.connect();
    ethers = connection.ethers;
    time = connection.networkHelpers.time;
    [owner, coreAdmin, opsAdmin, guardian, user1, user2, user3, committee1, committee2] = await ethers.getSigners();
    
    const RoleManager = await ethers.getContractFactory("RoleManager");
    roleManager = await RoleManager.deploy();
    await roleManager.waitForDeployment();
    
    // Initialize role metadata
    await roleManager.initializeRoleMetadata();
    
    // Get role constants
    DEFAULT_ADMIN_ROLE = await roleManager.DEFAULT_ADMIN_ROLE();
    CORE_SYSTEM_ADMIN_ROLE = await roleManager.CORE_SYSTEM_ADMIN_ROLE();
    OPERATIONS_ADMIN_ROLE = await roleManager.OPERATIONS_ADMIN_ROLE();
    EMERGENCY_GUARDIAN_ROLE = await roleManager.EMERGENCY_GUARDIAN_ROLE();
    MARKET_MAKER_ROLE = await roleManager.MARKET_MAKER_ROLE();
    CLEARPATH_USER_ROLE = await roleManager.CLEARPATH_USER_ROLE();
    TOKENMINT_ROLE = await roleManager.TOKENMINT_ROLE();
    OVERSIGHT_COMMITTEE_ROLE = await roleManager.OVERSIGHT_COMMITTEE_ROLE();
  });

  describe("Deployment", function () {
    it("Should set the deployer as default admin", async function () {
      expect(await roleManager.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.equal(true);
    });

    it("Should initialize all role metadata correctly", async function () {
      const coreAdminMeta = await roleManager.getRoleMetadata(CORE_SYSTEM_ADMIN_ROLE);
      expect(coreAdminMeta.name).to.equal("Core System Admin");
      expect(coreAdminMeta.minApprovals).to.equal(3);
      expect(coreAdminMeta.timelockDelay).to.equal(7 * 24 * 60 * 60); // 7 days
      
      const marketMakerMeta = await roleManager.getRoleMetadata(MARKET_MAKER_ROLE);
      expect(marketMakerMeta.isPremium).to.equal(true);
      expect(marketMakerMeta.price).to.equal(ethers.parseEther("100"));
    });

    it("Should set correct role hierarchy", async function () {
      expect(await roleManager.getRoleAdmin(CORE_SYSTEM_ADMIN_ROLE)).to.equal(DEFAULT_ADMIN_ROLE);
      expect(await roleManager.getRoleAdmin(OPERATIONS_ADMIN_ROLE)).to.equal(CORE_SYSTEM_ADMIN_ROLE);
      expect(await roleManager.getRoleAdmin(EMERGENCY_GUARDIAN_ROLE)).to.equal(OPERATIONS_ADMIN_ROLE);
    });
  });

  describe("Role Purchase", function () {
    it("Should allow users to purchase premium roles", async function () {
      const price = ethers.parseEther("100");
      
      const tx = await roleManager.connect(user1).purchaseRole(MARKET_MAKER_ROLE, { value: price });
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      
      await expect(tx)
        .to.emit(roleManager, "RolePurchased")
        .withArgs(user1.address, MARKET_MAKER_ROLE, price, block.timestamp);
      
      expect(await roleManager.hasRole(MARKET_MAKER_ROLE, user1.address)).to.equal(true);
    });

    it("Should reject purchase with insufficient payment", async function () {
      const insufficientPrice = ethers.parseEther("50");
      
      await expect(
        roleManager.connect(user1).purchaseRole(MARKET_MAKER_ROLE, { value: insufficientPrice })
      ).to.be.revertedWithCustomError(roleManager, "RMInsufficientPayment");
    });

    it("Should refund excess payment", async function () {
      const price = ethers.parseEther("100");
      const overpayment = ethers.parseEther("150");
      
      const balanceBefore = await ethers.provider.getBalance(user1.address);
      
      const tx = await roleManager.connect(user1).purchaseRole(MARKET_MAKER_ROLE, { value: overpayment });
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      
      const balanceAfter = await ethers.provider.getBalance(user1.address);
      
      // User should have paid only the role price plus gas
      expect(balanceBefore - balanceAfter).to.be.closeTo(price + gasUsed, ethers.parseEther("0.01"));
    });

    it("Should reject duplicate role purchase", async function () {
      const price = ethers.parseEther("100");
      
      await roleManager.connect(user1).purchaseRole(MARKET_MAKER_ROLE, { value: price });
      
      await expect(
        roleManager.connect(user1).purchaseRole(MARKET_MAKER_ROLE, { value: price })
      ).to.be.revertedWithCustomError(roleManager, "RMAlreadyApproved");
    });

    it("Should track purchased roles per user", async function () {
      const price1 = ethers.parseEther("100");
      const price2 = ethers.parseEther("250");
      
      await roleManager.connect(user1).purchaseRole(MARKET_MAKER_ROLE, { value: price1 });
      await roleManager.connect(user1).purchaseRole(CLEARPATH_USER_ROLE, { value: price2 });
      
      const purchasedRoles = await roleManager.getUserPurchasedRoles(user1.address);
      expect(purchasedRoles.length).to.equal(2);
      expect(purchasedRoles[0]).to.equal(MARKET_MAKER_ROLE);
      expect(purchasedRoles[1]).to.equal(CLEARPATH_USER_ROLE);
    });

    it("Should reject purchase for non-premium roles", async function () {
      await expect(
        roleManager.connect(user1).purchaseRole(CORE_SYSTEM_ADMIN_ROLE, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(roleManager, "RMNotPurchasable");
    });

    it("Should update role member count on purchase", async function () {
      const metaBefore = await roleManager.getRoleMetadata(MARKET_MAKER_ROLE);
      expect(metaBefore.currentMembers).to.equal(0);
      
      await roleManager.connect(user1).purchaseRole(MARKET_MAKER_ROLE, { value: ethers.parseEther("100") });
      
      const metaAfter = await roleManager.getRoleMetadata(MARKET_MAKER_ROLE);
      expect(metaAfter.currentMembers).to.equal(1);
    });
  });

  describe("ZK Key Registration", function () {
    beforeEach(async function () {
      // User1 purchases ClearPath role
      await roleManager.connect(user1).purchaseRole(CLEARPATH_USER_ROLE, { value: ethers.parseEther("250") });
    });

    it("Should allow ClearPath users to register ZK key", async function () {
      const zkKey = "zkp_test_key_12345";
      
      await expect(roleManager.connect(user1).registerZKKey(zkKey))
        .to.emit(roleManager, "ZKKeyRegistered")
        .withArgs(user1.address, CLEARPATH_USER_ROLE, zkKey);
      
      expect(await roleManager.getZKPublicKey(user1.address)).to.equal(zkKey);
    });

    it("Should reject ZK key registration without ClearPath role", async function () {
      await expect(
        roleManager.connect(user2).registerZKKey("zkp_key")
      ).to.be.revertedWithCustomError(roleManager, "RMNotActive");
    });

    it("Should reject empty ZK key", async function () {
      await expect(
        roleManager.connect(user1).registerZKKey("")
      ).to.be.revertedWithCustomError(roleManager, "RMInvalidZKKey");
    });
  });

  describe("Timelock & Multisig - Role Actions", function () {
    beforeEach(async function () {
      // Setup role hierarchy - owner (DEFAULT_ADMIN) can directly grant CORE_SYSTEM_ADMIN_ROLE
      await roleManager.grantRole(CORE_SYSTEM_ADMIN_ROLE, coreAdmin.address);
      // CORE_SYSTEM_ADMIN can directly grant roles under its hierarchy
      await roleManager.connect(coreAdmin).grantRole(OPERATIONS_ADMIN_ROLE, opsAdmin.address);
    });

    it("Should propose role action with timelock", async function () {
      // Operations admin proposes to grant emergency guardian role
      const tx = await roleManager.connect(opsAdmin).proposeRoleAction(
        EMERGENCY_GUARDIAN_ROLE,
        guardian.address,
        true // grant
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const parsed = roleManager.interface.parseLog(log);
          return parsed && parsed.name === "ActionProposed";
        } catch (e) {
          return false;
        }
      });
      
      expect(event).to.not.be.undefined;
    });

    it("Should require multiple approvals before execution", async function () {
      // Setup: Grant CORE_SYSTEM_ADMIN to multiple admins (requires 3 approvals)
      await roleManager.grantRole(CORE_SYSTEM_ADMIN_ROLE, coreAdmin.address);
      await roleManager.grantRole(CORE_SYSTEM_ADMIN_ROLE, user2.address);
      await roleManager.grantRole(CORE_SYSTEM_ADMIN_ROLE, user3.address);
      
      // Propose action by one core admin to grant OPERATIONS_ADMIN_ROLE (proposer = coreAdmin)
      const tx = await roleManager.connect(coreAdmin).proposeRoleAction(
        OPERATIONS_ADMIN_ROLE,
        user1.address,
        true
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const parsed = roleManager.interface.parseLog(log);
          return parsed && parsed.name === "ActionProposed";
        } catch (e) {
          return false;
        }
      });
      
      const actionId = event ? roleManager.interface.parseLog(event).args[0] : null;
      expect(actionId).to.not.be.null;
      
      // Advance time past timelock (2 days for OPERATIONS_ADMIN_ROLE)
      await time.increase(2 * 24 * 60 * 60 + 1);
      
      // Should fail with only 1 approval (proposer) - OPERATIONS_ADMIN needs 2
      await expect(
        roleManager.connect(coreAdmin).executeRoleAction(actionId)
      ).to.be.revertedWithCustomError(roleManager, "RMInsufficientApprovals");
      
      // Add second approval from user2
      await roleManager.connect(user2).approveRoleAction(actionId);
      
      // Now execution should succeed with 2 approvals
      await expect(roleManager.connect(coreAdmin).executeRoleAction(actionId))
        .to.emit(roleManager, "ActionExecuted");
    });

    it("Should enforce timelock delay", async function () {
      const tx = await roleManager.connect(opsAdmin).proposeRoleAction(
        EMERGENCY_GUARDIAN_ROLE,
        guardian.address,
        true
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const parsed = roleManager.interface.parseLog(log);
          return parsed && parsed.name === "ActionProposed";
        } catch (e) {
          return false;
        }
      });
      
      const actionId = event ? roleManager.interface.parseLog(event).args[0] : null;
      expect(actionId).to.not.be.null;
      
      // Try to execute immediately (should fail)
      await expect(
        roleManager.connect(opsAdmin).executeRoleAction(actionId)
      ).to.be.revertedWithCustomError(roleManager, "RMTimelockNotExpired");
      
      // Advance time by 1 hour (emergency guardian has 1 hour timelock)
      await time.increase(60 * 60 + 1);
      
      // Now execution should succeed
      await expect(roleManager.connect(opsAdmin).executeRoleAction(actionId))
        .to.emit(roleManager, "ActionExecuted");
    });

    it("Should allow emergency guardian to cancel pending actions", async function () {
      // Grant guardian role
      await roleManager.connect(opsAdmin).grantRole(EMERGENCY_GUARDIAN_ROLE, guardian.address);
      
      // Propose an action
      const tx = await roleManager.connect(opsAdmin).proposeRoleAction(
        EMERGENCY_GUARDIAN_ROLE,
        user1.address,
        true
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const parsed = roleManager.interface.parseLog(log);
          return parsed && parsed.name === "ActionProposed";
        } catch (e) {
          return false;
        }
      });
      
      const actionId = event ? roleManager.interface.parseLog(event).args[0] : null;
      expect(actionId).to.not.be.null;
      
      // Guardian cancels the action
      await expect(roleManager.connect(guardian).cancelRoleAction(actionId))
        .to.emit(roleManager, "ActionCancelled")
        .withArgs(actionId, guardian.address);
      
      // Advance time
      await time.increase(60 * 60 + 1);
      
      // Execution should fail for cancelled action
      await expect(
        roleManager.connect(opsAdmin).executeRoleAction(actionId)
      ).to.be.revertedWithCustomError(roleManager, "RMActionCancelled");
    });

    it("Should prevent duplicate approvals", async function () {
      const tx = await roleManager.connect(opsAdmin).proposeRoleAction(
        EMERGENCY_GUARDIAN_ROLE,
        guardian.address,
        true
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const parsed = roleManager.interface.parseLog(log);
          return parsed && parsed.name === "ActionProposed";
        } catch (e) {
          return false;
        }
      });
      
      const actionId = event ? roleManager.interface.parseLog(event).args[0] : null;
      expect(actionId).to.not.be.null;
      
      // Try to approve again as proposer
      await expect(
        roleManager.connect(opsAdmin).approveRoleAction(actionId)
      ).to.be.revertedWithCustomError(roleManager, "RMAlreadyApproved");
    });
  });

  describe("Emergency Functions", function () {
    beforeEach(async function () {
      // Setup roles
      await roleManager.grantRole(CORE_SYSTEM_ADMIN_ROLE, coreAdmin.address);
      await roleManager.connect(coreAdmin).grantRole(OPERATIONS_ADMIN_ROLE, opsAdmin.address);
      await roleManager.connect(opsAdmin).grantRole(EMERGENCY_GUARDIAN_ROLE, guardian.address);
    });

    it("Should allow guardian to pause contract", async function () {
      await expect(roleManager.connect(guardian).emergencyPause())
        .to.emit(roleManager, "EmergencyPaused")
        .withArgs(guardian.address);
      
      expect(await roleManager.paused()).to.equal(true);
    });

    it("Should prevent role purchases when paused", async function () {
      await roleManager.connect(guardian).emergencyPause();
      
      await expect(
        roleManager.connect(user1).purchaseRole(MARKET_MAKER_ROLE, { value: ethers.parseEther("100") })
      ).to.be.revertedWithCustomError(roleManager, "EnforcedPause");
    });

    it("Should allow operations admin to unpause", async function () {
      await roleManager.connect(guardian).emergencyPause();
      
      await expect(roleManager.connect(opsAdmin).unpause())
        .to.emit(roleManager, "EmergencyUnpaused")
        .withArgs(opsAdmin.address);
      
      expect(await roleManager.paused()).to.equal(false);
    });

    it("Should reject pause from unauthorized user", async function () {
      await expect(
        roleManager.connect(user1).emergencyPause()
      ).to.be.reverted;
    });
  });

  describe("Admin Functions", function () {
    beforeEach(async function () {
      await roleManager.grantRole(CORE_SYSTEM_ADMIN_ROLE, coreAdmin.address);
      await roleManager.connect(coreAdmin).grantRole(OPERATIONS_ADMIN_ROLE, opsAdmin.address);
    });

    it("Should allow core admin to update role metadata", async function () {
      await expect(
        roleManager.connect(coreAdmin).updateRoleMetadata(
          EMERGENCY_GUARDIAN_ROLE,
          "Updated Guardian",
          "Updated description",
          2, // new min approvals
          2 * 60 * 60, // 2 hours timelock
          10 // max members
        )
      ).to.emit(roleManager, "RoleMetadataUpdated");
      
      const meta = await roleManager.getRoleMetadata(EMERGENCY_GUARDIAN_ROLE);
      expect(meta.name).to.equal("Updated Guardian");
      expect(meta.minApprovals).to.equal(2);
    });

    it("Should allow operations admin to set role price", async function () {
      const newPrice = ethers.parseEther("200");
      await roleManager.connect(opsAdmin).setRolePrice(MARKET_MAKER_ROLE, newPrice);
      
      const meta = await roleManager.getRoleMetadata(MARKET_MAKER_ROLE);
      expect(meta.price).to.equal(newPrice);
    });

    it("Should reject price setting for non-premium roles", async function () {
      await expect(
        roleManager.connect(opsAdmin).setRolePrice(CORE_SYSTEM_ADMIN_ROLE, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(roleManager, "RMNotPremium");
    });

    it("Should allow operations admin to toggle role active status", async function () {
      await roleManager.connect(opsAdmin).setRoleActive(MARKET_MAKER_ROLE, false);
      
      const meta = await roleManager.getRoleMetadata(MARKET_MAKER_ROLE);
      expect(meta.isActive).to.equal(false);
      
      // Should reject purchase of inactive role
      await expect(
        roleManager.connect(user1).purchaseRole(MARKET_MAKER_ROLE, { value: ethers.parseEther("100") })
      ).to.be.revertedWithCustomError(roleManager, "RMNotActive");
    });

    it("Should allow operations admin to withdraw funds", async function () {
      // Setup operations admin
      await roleManager.grantRole(CORE_SYSTEM_ADMIN_ROLE, coreAdmin.address);
      await roleManager.connect(coreAdmin).grantRole(OPERATIONS_ADMIN_ROLE, opsAdmin.address);
      
      // User purchases role
      await roleManager.connect(user1).purchaseRole(MARKET_MAKER_ROLE, { value: ethers.parseEther("100") });
      
      const contractBalance = await ethers.provider.getBalance(await roleManager.getAddress());
      expect(contractBalance).to.equal(ethers.parseEther("100"));
      
      const opsAdminBalanceBefore = await ethers.provider.getBalance(opsAdmin.address);
      
      await roleManager.connect(opsAdmin).withdraw();
      
      const opsAdminBalanceAfter = await ethers.provider.getBalance(opsAdmin.address);
      expect(opsAdminBalanceAfter).to.be.gt(opsAdminBalanceBefore);
    });

    it("Should reject withdraw from default admin", async function () {
      // User purchases role
      await roleManager.connect(user1).purchaseRole(MARKET_MAKER_ROLE, { value: ethers.parseEther("100") });
      
      const contractBalance = await ethers.provider.getBalance(await roleManager.getAddress());
      expect(contractBalance).to.equal(ethers.parseEther("100"));
      
      // Default admin should not be able to withdraw
      await expect(
        roleManager.connect(owner).withdraw()
      ).to.be.reverted;
    });
  });

  describe("Access Control", function () {
    it("Should enforce role hierarchy", async function () {
      // Only default admin can grant core system admin
      await expect(
        roleManager.connect(user1).grantRole(CORE_SYSTEM_ADMIN_ROLE, user2.address)
      ).to.be.reverted;
      
      // Default admin can grant
      await roleManager.grantRole(CORE_SYSTEM_ADMIN_ROLE, coreAdmin.address);
      expect(await roleManager.hasRole(CORE_SYSTEM_ADMIN_ROLE, coreAdmin.address)).to.equal(true);
    });

    it("Should follow principle of least privilege", async function () {
      // Grant operations admin role
      await roleManager.grantRole(CORE_SYSTEM_ADMIN_ROLE, coreAdmin.address);
      await roleManager.connect(coreAdmin).grantRole(OPERATIONS_ADMIN_ROLE, opsAdmin.address);
      
      // Operations admin cannot grant core system admin
      await expect(
        roleManager.connect(opsAdmin).grantRole(CORE_SYSTEM_ADMIN_ROLE, user1.address)
      ).to.be.reverted;
      
      // But can grant roles under their admin
      await expect(
        roleManager.connect(opsAdmin).grantRole(EMERGENCY_GUARDIAN_ROLE, guardian.address)
      ).to.not.be.reverted;
    });
  });

  describe("View Functions", function () {
    it("Should return correct role metadata", async function () {
      const meta = await roleManager.getRoleMetadata(CLEARPATH_USER_ROLE);
      
      expect(meta.name).to.equal("ClearPath User");
      expect(meta.isPremium).to.equal(true);
      expect(meta.price).to.equal(ethers.parseEther("250"));
    });

    it("Should return purchased roles for user", async function () {
      await roleManager.connect(user1).purchaseRole(MARKET_MAKER_ROLE, { value: ethers.parseEther("100") });
      
      const roles = await roleManager.getUserPurchasedRoles(user1.address);
      expect(roles.length).to.equal(1);
      expect(roles[0]).to.equal(MARKET_MAKER_ROLE);
    });

    it("Should return ZK public key", async function () {
      await roleManager.connect(user1).purchaseRole(CLEARPATH_USER_ROLE, { value: ethers.parseEther("250") });
      const zkKey = "test_zk_key";
      await roleManager.connect(user1).registerZKKey(zkKey);
      
      expect(await roleManager.getZKPublicKey(user1.address)).to.equal(zkKey);
    });

    it("Should return pending action count", async function () {
      await roleManager.grantRole(CORE_SYSTEM_ADMIN_ROLE, coreAdmin.address);
      await roleManager.connect(coreAdmin).grantRole(OPERATIONS_ADMIN_ROLE, opsAdmin.address);
      
      await roleManager.connect(opsAdmin).proposeRoleAction(EMERGENCY_GUARDIAN_ROLE, user1.address, true);
      
      expect(await roleManager.getPendingActionCount()).to.equal(1);
    });
  });
});
