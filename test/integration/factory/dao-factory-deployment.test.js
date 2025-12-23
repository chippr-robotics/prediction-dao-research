const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * Integration tests for DAO Factory Deployment and Configuration
 * Tests the complete lifecycle of deploying and configuring DAOs via factory
 */
describe("Integration: DAO Factory Deployment", function () {
  // Increase timeout for integration tests
  this.timeout(120000);

  /**
   * Deploy a fresh DAOFactory for testing
   */
  async function deployDAOFactoryFixture() {
    const [
      owner,
      platformAdmin,
      daoCreator,
      daoAdmin1,
      daoAdmin2,
      participant1,
      participant2,
      proposer,
      oracle,
      nonAuthorized
    ] = await ethers.getSigners();

    // Deploy DAOFactory
    const DAOFactory = await ethers.getContractFactory("DAOFactory");
    const daoFactory = await DAOFactory.deploy();
    await daoFactory.waitForDeployment();

    // Setup additional platform roles
    const PLATFORM_ADMIN_ROLE = await daoFactory.PLATFORM_ADMIN_ROLE();
    const DAO_CREATOR_ROLE = await daoFactory.DAO_CREATOR_ROLE();

    await daoFactory.grantRole(PLATFORM_ADMIN_ROLE, platformAdmin.address);
    await daoFactory.grantRole(DAO_CREATOR_ROLE, daoCreator.address);

    // Deploy mock governance token for testing
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const governanceToken = await MockERC20.deploy(
      "Governance Token",
      "GOV",
      ethers.parseEther("1000000")
    );
    await governanceToken.waitForDeployment();

    // Distribute tokens
    await governanceToken.transfer(participant1.address, ethers.parseEther("10000"));
    await governanceToken.transfer(participant2.address, ethers.parseEther("10000"));

    return {
      daoFactory,
      governanceToken,
      accounts: {
        owner,
        platformAdmin,
        daoCreator,
        daoAdmin1,
        daoAdmin2,
        participant1,
        participant2,
        proposer,
        oracle,
        nonAuthorized
      },
      roles: {
        PLATFORM_ADMIN_ROLE,
        DAO_CREATOR_ROLE,
        DAO_ADMIN_ROLE: await daoFactory.DAO_ADMIN_ROLE(),
        DAO_PARTICIPANT_ROLE: await daoFactory.DAO_PARTICIPANT_ROLE(),
        DAO_PROPOSER_ROLE: await daoFactory.DAO_PROPOSER_ROLE(),
        DAO_ORACLE_ROLE: await daoFactory.DAO_ORACLE_ROLE()
      }
    };
  }

  describe("Complete DAO Deployment", function () {
    it("Should deploy a complete DAO with all components", async function () {
      const { daoFactory, accounts } = await loadFixture(deployDAOFactoryFixture);
      const { daoCreator, daoAdmin1 } = accounts;

      console.log("  → Creating DAO...");
      
      // Create DAO
      const tx = await daoFactory.connect(daoCreator).createDAO(
        "Test DAO",
        "Integration test DAO for complete deployment",
        daoCreator.address, // treasury vault
        [daoAdmin1.address]
      );

      const receipt = await tx.wait();
      console.log("  ✓ DAO created successfully");

      // Verify DAO was created
      expect(await daoFactory.daoCount()).to.equal(1);

      // Get DAO details
      const dao = await daoFactory.getDAO(0);
      
      // Verify basic details
      expect(dao.name).to.equal("Test DAO");
      expect(dao.description).to.equal("Integration test DAO for complete deployment");
      expect(dao.treasuryVault).to.equal(daoCreator.address);
      expect(dao.creator).to.equal(daoCreator.address);
      expect(dao.active).to.equal(true);

      console.log("  ✓ DAO basic details verified");

      // Verify all components were deployed
      expect(dao.futarchyGovernor).to.not.equal(ethers.ZeroAddress);
      expect(dao.welfareRegistry).to.not.equal(ethers.ZeroAddress);
      expect(dao.proposalRegistry).to.not.equal(ethers.ZeroAddress);
      expect(dao.marketFactory).to.not.equal(ethers.ZeroAddress);
      expect(dao.privacyCoordinator).to.not.equal(ethers.ZeroAddress);
      expect(dao.oracleResolver).to.not.equal(ethers.ZeroAddress);
      expect(dao.ragequitModule).to.not.equal(ethers.ZeroAddress);

      console.log("  ✓ All 7 core components deployed");
      console.log(`    - FutarchyGovernor: ${dao.futarchyGovernor}`);
      console.log(`    - WelfareRegistry: ${dao.welfareRegistry}`);
      console.log(`    - ProposalRegistry: ${dao.proposalRegistry}`);
      console.log(`    - MarketFactory: ${dao.marketFactory}`);
      console.log(`    - PrivacyCoordinator: ${dao.privacyCoordinator}`);
      console.log(`    - OracleResolver: ${dao.oracleResolver}`);
      console.log(`    - RagequitModule: ${dao.ragequitModule}`);
    });

    it("Should verify component ownership is transferred to governor", async function () {
      const { daoFactory, accounts } = await loadFixture(deployDAOFactoryFixture);
      const { daoCreator } = accounts;

      // Create DAO
      await daoFactory.connect(daoCreator).createDAO(
        "Ownership Test DAO",
        "Testing component ownership transfer",
        daoCreator.address,
        []
      );

      const dao = await daoFactory.getDAO(0);
      
      console.log("  → Verifying component ownership...");

      // Get component contracts
      const WelfareMetricRegistry = await ethers.getContractFactory("WelfareMetricRegistry");
      const welfareRegistry = WelfareMetricRegistry.attach(dao.welfareRegistry);

      const ProposalRegistry = await ethers.getContractFactory("ProposalRegistry");
      const proposalRegistry = ProposalRegistry.attach(dao.proposalRegistry);

      const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
      const marketFactory = ConditionalMarketFactory.attach(dao.marketFactory);

      const OracleResolver = await ethers.getContractFactory("OracleResolver");
      const oracleResolver = OracleResolver.attach(dao.oracleResolver);

      const RagequitModule = await ethers.getContractFactory("RagequitModule");
      const ragequitModule = RagequitModule.attach(dao.ragequitModule);

      // Verify ownership was transferred to FutarchyGovernor
      expect(await welfareRegistry.owner()).to.equal(dao.futarchyGovernor);
      expect(await proposalRegistry.owner()).to.equal(dao.futarchyGovernor);
      expect(await marketFactory.owner()).to.equal(dao.futarchyGovernor);
      expect(await oracleResolver.owner()).to.equal(dao.futarchyGovernor);
      expect(await ragequitModule.owner()).to.equal(dao.futarchyGovernor);

      console.log("  ✓ All components owned by FutarchyGovernor");
    });

    it("Should verify FutarchyGovernor is properly initialized with component references", async function () {
      const { daoFactory, accounts } = await loadFixture(deployDAOFactoryFixture);
      const { daoCreator } = accounts;

      // Create DAO
      await daoFactory.connect(daoCreator).createDAO(
        "Init Test DAO",
        "Testing component initialization",
        daoCreator.address,
        []
      );

      const dao = await daoFactory.getDAO(0);

      console.log("  → Verifying FutarchyGovernor initialization...");

      // Get FutarchyGovernor contract
      const FutarchyGovernor = await ethers.getContractFactory("FutarchyGovernor");
      const governor = FutarchyGovernor.attach(dao.futarchyGovernor);

      // Verify component references
      expect(await governor.welfareRegistry()).to.equal(dao.welfareRegistry);
      expect(await governor.proposalRegistry()).to.equal(dao.proposalRegistry);
      expect(await governor.marketFactory()).to.equal(dao.marketFactory);
      expect(await governor.privacyCoordinator()).to.equal(dao.privacyCoordinator);
      expect(await governor.oracleResolver()).to.equal(dao.oracleResolver);
      expect(await governor.ragequitModule()).to.equal(dao.ragequitModule);
      expect(await governor.treasuryVault()).to.equal(daoCreator.address);

      console.log("  ✓ FutarchyGovernor properly configured with all components");
    });
  });

  describe("DAO Configuration and Access Control", function () {
    it("Should setup correct roles for DAO creator", async function () {
      const { daoFactory, accounts, roles } = await loadFixture(deployDAOFactoryFixture);
      const { daoCreator } = accounts;

      // Create DAO
      await daoFactory.connect(daoCreator).createDAO(
        "Role Test DAO",
        "Testing role setup",
        daoCreator.address,
        []
      );

      console.log("  → Verifying creator roles...");

      // Verify creator has all necessary roles
      expect(await daoFactory.hasDAORole(0, daoCreator.address, roles.DAO_ADMIN_ROLE))
        .to.equal(true, "Creator should have DAO_ADMIN_ROLE");
      expect(await daoFactory.hasDAORole(0, daoCreator.address, roles.DAO_PARTICIPANT_ROLE))
        .to.equal(true, "Creator should have DAO_PARTICIPANT_ROLE");
      expect(await daoFactory.hasDAORole(0, daoCreator.address, roles.DAO_PROPOSER_ROLE))
        .to.equal(true, "Creator should have DAO_PROPOSER_ROLE");

      console.log("  ✓ Creator has admin, participant, and proposer roles");
    });

    it("Should setup correct roles for specified admins", async function () {
      const { daoFactory, accounts, roles } = await loadFixture(deployDAOFactoryFixture);
      const { daoCreator, daoAdmin1, daoAdmin2 } = accounts;

      // Create DAO with multiple admins
      await daoFactory.connect(daoCreator).createDAO(
        "Multi-Admin DAO",
        "Testing multiple admin setup",
        daoCreator.address,
        [daoAdmin1.address, daoAdmin2.address]
      );

      console.log("  → Verifying admin roles...");

      // Verify admin1 has correct roles
      expect(await daoFactory.hasDAORole(0, daoAdmin1.address, roles.DAO_ADMIN_ROLE))
        .to.equal(true);
      expect(await daoFactory.hasDAORole(0, daoAdmin1.address, roles.DAO_PARTICIPANT_ROLE))
        .to.equal(true);

      // Verify admin2 has correct roles
      expect(await daoFactory.hasDAORole(0, daoAdmin2.address, roles.DAO_ADMIN_ROLE))
        .to.equal(true);
      expect(await daoFactory.hasDAORole(0, daoAdmin2.address, roles.DAO_PARTICIPANT_ROLE))
        .to.equal(true);

      console.log("  ✓ All specified admins have correct roles");
    });

    it("Should allow DAO admin to grant and revoke roles", async function () {
      const { daoFactory, accounts, roles } = await loadFixture(deployDAOFactoryFixture);
      const { daoCreator, participant1, proposer } = accounts;

      // Create DAO
      await daoFactory.connect(daoCreator).createDAO(
        "Dynamic Roles DAO",
        "Testing dynamic role management",
        daoCreator.address,
        []
      );

      console.log("  → Testing role management by DAO admin...");

      // Grant participant role
      await daoFactory.connect(daoCreator).grantDAORole(
        0,
        participant1.address,
        roles.DAO_PARTICIPANT_ROLE
      );

      expect(await daoFactory.hasDAORole(0, participant1.address, roles.DAO_PARTICIPANT_ROLE))
        .to.equal(true);

      console.log("  ✓ DAO admin granted participant role");

      // Grant proposer role
      await daoFactory.connect(daoCreator).grantDAORole(
        0,
        proposer.address,
        roles.DAO_PROPOSER_ROLE
      );

      expect(await daoFactory.hasDAORole(0, proposer.address, roles.DAO_PROPOSER_ROLE))
        .to.equal(true);

      console.log("  ✓ DAO admin granted proposer role");

      // Revoke participant role
      await daoFactory.connect(daoCreator).revokeDAORole(
        0,
        participant1.address,
        roles.DAO_PARTICIPANT_ROLE
      );

      expect(await daoFactory.hasDAORole(0, participant1.address, roles.DAO_PARTICIPANT_ROLE))
        .to.equal(false);

      console.log("  ✓ DAO admin revoked participant role");
    });

    it("Should prevent unauthorized users from granting roles", async function () {
      const { daoFactory, accounts, roles } = await loadFixture(deployDAOFactoryFixture);
      const { daoCreator, participant1, nonAuthorized } = accounts;

      // Create DAO
      await daoFactory.connect(daoCreator).createDAO(
        "Security Test DAO",
        "Testing access control security",
        daoCreator.address,
        []
      );

      console.log("  → Testing unauthorized access prevention...");

      // Attempt to grant role as non-authorized user
      await expect(
        daoFactory.connect(nonAuthorized).grantDAORole(
          0,
          participant1.address,
          roles.DAO_PARTICIPANT_ROLE
        )
      ).to.be.revertedWith("Not authorized");

      console.log("  ✓ Unauthorized access properly blocked");
    });

    it("Should allow platform admin to override DAO-level permissions", async function () {
      const { daoFactory, accounts, roles } = await loadFixture(deployDAOFactoryFixture);
      const { daoCreator, platformAdmin, participant1 } = accounts;

      // Create DAO
      await daoFactory.connect(daoCreator).createDAO(
        "Platform Override DAO",
        "Testing platform admin override",
        daoCreator.address,
        []
      );

      console.log("  → Testing platform admin override...");

      // Platform admin grants role (should work)
      await daoFactory.connect(platformAdmin).grantDAORole(
        0,
        participant1.address,
        roles.DAO_PARTICIPANT_ROLE
      );

      expect(await daoFactory.hasDAORole(0, participant1.address, roles.DAO_PARTICIPANT_ROLE))
        .to.equal(true);

      console.log("  ✓ Platform admin successfully granted role");

      // Platform admin revokes role (should work)
      await daoFactory.connect(platformAdmin).revokeDAORole(
        0,
        participant1.address,
        roles.DAO_PARTICIPANT_ROLE
      );

      expect(await daoFactory.hasDAORole(0, participant1.address, roles.DAO_PARTICIPANT_ROLE))
        .to.equal(false);

      console.log("  ✓ Platform admin successfully revoked role");
    });
  });

  describe("Multi-DAO Scenarios", function () {
    it("Should deploy multiple independent DAOs", async function () {
      const { daoFactory, accounts } = await loadFixture(deployDAOFactoryFixture);
      const { daoCreator } = accounts;

      console.log("  → Deploying multiple DAOs...");

      // Create first DAO
      await daoFactory.connect(daoCreator).createDAO(
        "DAO One",
        "First test DAO",
        daoCreator.address,
        []
      );

      // Create second DAO
      await daoFactory.connect(daoCreator).createDAO(
        "DAO Two",
        "Second test DAO",
        daoCreator.address,
        []
      );

      // Create third DAO
      await daoFactory.connect(daoCreator).createDAO(
        "DAO Three",
        "Third test DAO",
        daoCreator.address,
        []
      );

      expect(await daoFactory.daoCount()).to.equal(3);

      console.log("  ✓ Three DAOs deployed successfully");

      // Verify each DAO is independent
      const dao1 = await daoFactory.getDAO(0);
      const dao2 = await daoFactory.getDAO(1);
      const dao3 = await daoFactory.getDAO(2);

      // All should have different component addresses
      expect(dao1.futarchyGovernor).to.not.equal(dao2.futarchyGovernor);
      expect(dao2.futarchyGovernor).to.not.equal(dao3.futarchyGovernor);
      expect(dao1.welfareRegistry).to.not.equal(dao2.welfareRegistry);
      expect(dao2.welfareRegistry).to.not.equal(dao3.welfareRegistry);

      console.log("  ✓ All DAOs have independent component addresses");
    });

    it("Should maintain role isolation between DAOs", async function () {
      const { daoFactory, accounts, roles } = await loadFixture(deployDAOFactoryFixture);
      const { daoCreator, daoAdmin1, participant1 } = accounts;

      console.log("  → Testing role isolation between DAOs...");

      // Create DAO 1
      await daoFactory.connect(daoCreator).createDAO(
        "Isolated DAO 1",
        "First isolated DAO",
        daoCreator.address,
        [daoAdmin1.address]
      );

      // Create DAO 2
      await daoFactory.connect(daoCreator).createDAO(
        "Isolated DAO 2",
        "Second isolated DAO",
        daoCreator.address,
        []
      );

      // Grant role to participant1 in DAO 1 only
      await daoFactory.connect(daoCreator).grantDAORole(
        0,
        participant1.address,
        roles.DAO_PARTICIPANT_ROLE
      );

      // Verify participant1 has role in DAO 1
      expect(await daoFactory.hasDAORole(0, participant1.address, roles.DAO_PARTICIPANT_ROLE))
        .to.equal(true);

      // Verify participant1 does NOT have role in DAO 2
      expect(await daoFactory.hasDAORole(1, participant1.address, roles.DAO_PARTICIPANT_ROLE))
        .to.equal(false);

      console.log("  ✓ Roles properly isolated between DAOs");

      // Verify daoAdmin1 has role in DAO 1 but not DAO 2
      expect(await daoFactory.hasDAORole(0, daoAdmin1.address, roles.DAO_ADMIN_ROLE))
        .to.equal(true);
      expect(await daoFactory.hasDAORole(1, daoAdmin1.address, roles.DAO_ADMIN_ROLE))
        .to.equal(false);

      console.log("  ✓ Admin roles properly isolated between DAOs");
    });

    it("Should track user associations across multiple DAOs", async function () {
      const { daoFactory, accounts, roles } = await loadFixture(deployDAOFactoryFixture);
      const { daoCreator, participant1 } = accounts;

      console.log("  → Testing user DAO associations...");

      // Create three DAOs
      await daoFactory.connect(daoCreator).createDAO("DAO A", "Test", daoCreator.address, []);
      await daoFactory.connect(daoCreator).createDAO("DAO B", "Test", daoCreator.address, []);
      await daoFactory.connect(daoCreator).createDAO("DAO C", "Test", daoCreator.address, []);

      // Grant participant1 roles in DAOs 0 and 2
      await daoFactory.connect(daoCreator).grantDAORole(
        0,
        participant1.address,
        roles.DAO_PARTICIPANT_ROLE
      );
      await daoFactory.connect(daoCreator).grantDAORole(
        2,
        participant1.address,
        roles.DAO_PARTICIPANT_ROLE
      );

      // Get participant1's DAOs
      const userDAOs = await daoFactory.getUserDAOs(participant1.address);

      expect(userDAOs.length).to.equal(2);
      expect(userDAOs[0]).to.equal(0n);
      expect(userDAOs[1]).to.equal(2n);

      console.log("  ✓ User correctly associated with DAOs 0 and 2");

      // Creator should be in all three DAOs
      const creatorDAOs = await daoFactory.getUserDAOs(daoCreator.address);
      expect(creatorDAOs.length).to.equal(3);

      console.log("  ✓ Creator correctly associated with all DAOs");
    });

    it("Should support pagination when retrieving all DAOs", async function () {
      const { daoFactory, accounts } = await loadFixture(deployDAOFactoryFixture);
      const { daoCreator } = accounts;

      console.log("  → Testing DAO pagination...");

      // Create 5 DAOs
      for (let i = 0; i < 5; i++) {
        await daoFactory.connect(daoCreator).createDAO(
          `DAO ${i}`,
          `Test DAO number ${i}`,
          daoCreator.address,
          []
        );
      }

      // Get first page (2 DAOs)
      const page1 = await daoFactory.getAllDAOs(0, 2);
      expect(page1.length).to.equal(2);
      expect(page1[0].name).to.equal("DAO 0");
      expect(page1[1].name).to.equal("DAO 1");

      console.log("  ✓ Page 1 retrieved correctly");

      // Get second page (2 DAOs)
      const page2 = await daoFactory.getAllDAOs(2, 2);
      expect(page2.length).to.equal(2);
      expect(page2[0].name).to.equal("DAO 2");
      expect(page2[1].name).to.equal("DAO 3");

      console.log("  ✓ Page 2 retrieved correctly");

      // Get last page (1 DAO)
      const page3 = await daoFactory.getAllDAOs(4, 2);
      expect(page3.length).to.equal(1);
      expect(page3[0].name).to.equal("DAO 4");

      console.log("  ✓ Page 3 retrieved correctly");
    });
  });

  describe("DAO Status Management", function () {
    it("Should allow platform admin to deactivate DAO", async function () {
      const { daoFactory, accounts } = await loadFixture(deployDAOFactoryFixture);
      const { daoCreator, platformAdmin } = accounts;

      // Create DAO
      await daoFactory.connect(daoCreator).createDAO(
        "Status Test DAO",
        "Testing status management",
        daoCreator.address,
        []
      );

      console.log("  → Testing DAO status management...");

      // Verify initial active status
      let dao = await daoFactory.getDAO(0);
      expect(dao.active).to.equal(true);

      // Platform admin deactivates DAO
      await daoFactory.connect(platformAdmin).setDAOStatus(0, false);

      dao = await daoFactory.getDAO(0);
      expect(dao.active).to.equal(false);

      console.log("  ✓ DAO deactivated successfully");

      // Platform admin reactivates DAO
      await daoFactory.connect(platformAdmin).setDAOStatus(0, true);

      dao = await daoFactory.getDAO(0);
      expect(dao.active).to.equal(true);

      console.log("  ✓ DAO reactivated successfully");
    });

    it("Should prevent non-platform-admin from changing DAO status", async function () {
      const { daoFactory, accounts } = await loadFixture(deployDAOFactoryFixture);
      const { daoCreator, nonAuthorized } = accounts;

      // Create DAO
      await daoFactory.connect(daoCreator).createDAO(
        "Protected Status DAO",
        "Testing status protection",
        daoCreator.address,
        []
      );

      console.log("  → Testing status change authorization...");

      // Even DAO creator cannot change status
      await expect(
        daoFactory.connect(daoCreator).setDAOStatus(0, false)
      ).to.be.reverted;

      // Non-authorized user cannot change status
      await expect(
        daoFactory.connect(nonAuthorized).setDAOStatus(0, false)
      ).to.be.reverted;

      console.log("  ✓ Status changes properly restricted to platform admin");
    });
  });

  describe("Complete Integration Flow", function () {
    it("Should support full DAO lifecycle: create, configure, use, manage", async function () {
      const { daoFactory, accounts, roles } = await loadFixture(deployDAOFactoryFixture);
      const { daoCreator, daoAdmin1, participant1, proposer, oracle } = accounts;

      console.log("\n  === Full DAO Lifecycle Test ===");

      // Step 1: Create DAO
      console.log("  → Step 1: Creating DAO...");
      await daoFactory.connect(daoCreator).createDAO(
        "Complete Lifecycle DAO",
        "Testing full DAO lifecycle from creation to operation",
        daoCreator.address,
        [daoAdmin1.address]
      );
      console.log("  ✓ DAO created");

      // Step 2: Verify deployment
      console.log("  → Step 2: Verifying deployment...");
      const dao = await daoFactory.getDAO(0);
      expect(dao.active).to.equal(true);
      expect(dao.futarchyGovernor).to.not.equal(ethers.ZeroAddress);
      console.log("  ✓ Deployment verified");

      // Step 3: Configure roles
      console.log("  → Step 3: Configuring roles...");
      await daoFactory.connect(daoCreator).grantDAORole(0, participant1.address, roles.DAO_PARTICIPANT_ROLE);
      await daoFactory.connect(daoCreator).grantDAORole(0, proposer.address, roles.DAO_PROPOSER_ROLE);
      await daoFactory.connect(daoAdmin1).grantDAORole(0, oracle.address, roles.DAO_ORACLE_ROLE);
      console.log("  ✓ Roles configured");

      // Step 4: Verify role configuration
      console.log("  → Step 4: Verifying access control...");
      expect(await daoFactory.hasDAORole(0, participant1.address, roles.DAO_PARTICIPANT_ROLE)).to.equal(true);
      expect(await daoFactory.hasDAORole(0, proposer.address, roles.DAO_PROPOSER_ROLE)).to.equal(true);
      expect(await daoFactory.hasDAORole(0, oracle.address, roles.DAO_ORACLE_ROLE)).to.equal(true);
      console.log("  ✓ Access control verified");

      // Step 5: Verify user associations
      console.log("  → Step 5: Verifying user associations...");
      const creatorDAOs = await daoFactory.getUserDAOs(daoCreator.address);
      const participant1DAOs = await daoFactory.getUserDAOs(participant1.address);
      expect(creatorDAOs.length).to.be.greaterThan(0);
      expect(participant1DAOs.length).to.be.greaterThan(0);
      console.log("  ✓ User associations verified");

      // Step 6: Test role revocation
      console.log("  → Step 6: Testing role management...");
      await daoFactory.connect(daoCreator).revokeDAORole(0, participant1.address, roles.DAO_PARTICIPANT_ROLE);
      expect(await daoFactory.hasDAORole(0, participant1.address, roles.DAO_PARTICIPANT_ROLE)).to.equal(false);
      console.log("  ✓ Role management working");

      console.log("\n  === Full Lifecycle Test Complete ===\n");
    });
  });
});
