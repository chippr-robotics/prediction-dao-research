import { expect } from "chai";
import hre from "hardhat";

describe("RoleManager - Integration Tests", function () {
  let ethers;
  let roleManager;
  let owner, coreAdmin1, coreAdmin2, coreAdmin3;
  let opsAdmin1;
  let guardian1;
  let user1, user2;

  // Role constants
  let DEFAULT_ADMIN_ROLE;
  let CORE_SYSTEM_ADMIN_ROLE;
  let OPERATIONS_ADMIN_ROLE;
  let EMERGENCY_GUARDIAN_ROLE;
  let MARKET_MAKER_ROLE;
  let CLEARPATH_USER_ROLE;
  let TOKENMINT_ROLE;

  beforeEach(async function () {
    const connection = await hre.network.connect();
    ethers = connection.ethers;
    [owner, coreAdmin1, coreAdmin2, coreAdmin3, opsAdmin1,
     guardian1, user1, user2] = await ethers.getSigners();
    
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
  });

  describe("Complete User Journey", function () {
    it("Should handle purchase to access flow", async function () {
      // Purchase ClearPath role
      const price = ethers.parseEther("250");
      await roleManager.connect(user1).purchaseRole(CLEARPATH_USER_ROLE, { value: price });
      
      expect(await roleManager.hasRole(CLEARPATH_USER_ROLE, user1.address)).to.equal(true);
      
      // Register ZK key
      const zkKey = "zkp_public_key_abc123";
      await roleManager.connect(user1).registerZKKey(zkKey);
      
      expect(await roleManager.getZKPublicKey(user1.address)).to.equal(zkKey);
    });
  });

  describe("Emergency Response", function () {
    beforeEach(async function () {
      await roleManager.grantRole(CORE_SYSTEM_ADMIN_ROLE, coreAdmin1.address);
      await roleManager.connect(coreAdmin1).grantRole(OPERATIONS_ADMIN_ROLE, opsAdmin1.address);
      await roleManager.connect(opsAdmin1).grantRole(EMERGENCY_GUARDIAN_ROLE, guardian1.address);
    });

    it("Should handle emergency pause", async function () {
      await roleManager.connect(guardian1).emergencyPause();
      expect(await roleManager.paused()).to.equal(true);
      
      await roleManager.connect(opsAdmin1).unpause();
      expect(await roleManager.paused()).to.equal(false);
    });
  });
});
