const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MarketCorrelationRegistry", function () {
  let registry;
  let owner;
  let addr1;
  let addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    
    const MarketCorrelationRegistry = await ethers.getContractFactory("MarketCorrelationRegistry");
    registry = await MarketCorrelationRegistry.deploy();
    await registry.initialize(owner.address);
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await registry.owner()).to.equal(owner.address);
    });

    it("Should initialize with zero groups", async function () {
      expect(await registry.groupCount()).to.equal(0);
    });
  });

  describe("Correlation Group Creation", function () {
    it("Should create a correlation group", async function () {
      const name = "2024 Presidential Election";
      const description = "Markets for all candidates in the 2024 US Presidential Election";
      const category = "politics";

      await expect(
        registry.createCorrelationGroup(name, description, category)
      ).to.emit(registry, "CorrelationGroupCreated");

      expect(await registry.groupCount()).to.equal(1);
    });

    it("Should reject empty name", async function () {
      await expect(
        registry.createCorrelationGroup("", "description", "politics")
      ).to.be.revertedWith("Name cannot be empty");
    });

    it("Should reject empty category", async function () {
      await expect(
        registry.createCorrelationGroup("Election", "description", "")
      ).to.be.revertedWith("Category cannot be empty");
    });

    it("Should store group details correctly", async function () {
      const name = "2024 Presidential Election";
      const description = "Markets for all candidates";
      const category = "politics";

      await registry.createCorrelationGroup(name, description, category);

      const group = await registry.correlationGroups(0);
      expect(group.name).to.equal(name);
      expect(group.description).to.equal(description);
      expect(group.creator).to.equal(owner.address);
      expect(group.active).to.equal(true);
      expect(await registry.groupCategory(0)).to.equal(category);
    });
  });

  describe("Adding Markets to Groups", function () {
    beforeEach(async function () {
      await registry.createCorrelationGroup(
        "2024 Presidential Election",
        "Markets for all candidates",
        "politics"
      );
    });

    it("Should add a market to a group", async function () {
      const groupId = 0;
      const marketId = 1;

      await expect(
        registry.addMarketToGroup(groupId, marketId)
      ).to.emit(registry, "MarketAddedToGroup")
        .withArgs(groupId, marketId, await ethers.provider.getBlock('latest').then(b => b.timestamp + 1));

      const markets = await registry.getGroupMarkets(groupId);
      expect(markets.length).to.equal(1);
      expect(markets[0]).to.equal(marketId);
    });

    it("Should reject adding market to non-existent group", async function () {
      await expect(
        registry.addMarketToGroup(999, 1)
      ).to.be.revertedWith("Group does not exist");
    });

    it("Should reject adding market already in a group", async function () {
      const groupId = 0;
      const marketId = 1;

      await registry.addMarketToGroup(groupId, marketId);

      await expect(
        registry.addMarketToGroup(groupId, marketId)
      ).to.be.revertedWith("Market already in a group");
    });

    it("Should add multiple markets to a group", async function () {
      const groupId = 0;
      const marketIds = [1, 2, 3, 4, 5];

      for (const marketId of marketIds) {
        await registry.addMarketToGroup(groupId, marketId);
      }

      const markets = await registry.getGroupMarkets(groupId);
      expect(markets.length).to.equal(5);
      for (let i = 0; i < marketIds.length; i++) {
        expect(markets[i]).to.equal(marketIds[i]);
      }
    });

    it("Should track market to group mapping", async function () {
      const groupId = 0;
      const marketId = 1;

      await registry.addMarketToGroup(groupId, marketId);

      expect(await registry.getMarketGroup(marketId)).to.equal(groupId);
      expect(await registry.isMarketInGroup(marketId)).to.equal(true);
    });

    it("Should reject adding market to inactive group", async function () {
      const groupId = 0;
      await registry.deactivateGroup(groupId);

      await expect(
        registry.addMarketToGroup(groupId, 1)
      ).to.be.revertedWith("Group is not active");
    });
  });

  describe("Removing Markets from Groups", function () {
    beforeEach(async function () {
      await registry.createCorrelationGroup(
        "2024 Presidential Election",
        "Markets for all candidates",
        "politics"
      );
      await registry.addMarketToGroup(0, 1);
      await registry.addMarketToGroup(0, 2);
      await registry.addMarketToGroup(0, 3);
    });

    it("Should remove a market from a group", async function () {
      const marketId = 2;
      const groupId = 0;

      await expect(
        registry.removeMarketFromGroup(marketId)
      ).to.emit(registry, "MarketRemovedFromGroup");

      const markets = await registry.getGroupMarkets(groupId);
      expect(markets.length).to.equal(2);
      expect(markets.includes(marketId)).to.equal(false);
    });

    it("Should reject removing market not in any group", async function () {
      await expect(
        registry.removeMarketFromGroup(999)
      ).to.be.revertedWith("Market not in any group");
    });

    it("Should update market mapping after removal", async function () {
      await registry.removeMarketFromGroup(1);

      expect(await registry.getMarketGroup(1)).to.equal(ethers.MaxUint256);
      expect(await registry.isMarketInGroup(1)).to.equal(false);
    });
  });

  describe("Group Activation/Deactivation", function () {
    beforeEach(async function () {
      await registry.createCorrelationGroup(
        "2024 Presidential Election",
        "Markets for all candidates",
        "politics"
      );
    });

    it("Should deactivate a group", async function () {
      await expect(
        registry.deactivateGroup(0)
      ).to.emit(registry, "CorrelationGroupDeactivated");

      const group = await registry.correlationGroups(0);
      expect(group.active).to.equal(false);
    });

    it("Should reactivate a group", async function () {
      await registry.deactivateGroup(0);
      
      await expect(
        registry.reactivateGroup(0)
      ).to.emit(registry, "CorrelationGroupReactivated");

      const group = await registry.correlationGroups(0);
      expect(group.active).to.equal(true);
    });

    it("Should only allow owner to deactivate", async function () {
      await expect(
        registry.connect(addr1).deactivateGroup(0)
      ).to.be.reverted;
    });

    it("Should reject deactivating already inactive group", async function () {
      await registry.deactivateGroup(0);
      
      await expect(
        registry.deactivateGroup(0)
      ).to.be.revertedWith("Group already inactive");
    });

    it("Should reject reactivating already active group", async function () {
      await expect(
        registry.reactivateGroup(0)
      ).to.be.revertedWith("Group already active");
    });
  });

  describe("Querying Groups", function () {
    beforeEach(async function () {
      // Create multiple groups in different categories
      await registry.createCorrelationGroup(
        "2024 Presidential Election",
        "Election markets",
        "politics"
      );
      await registry.createCorrelationGroup(
        "2025 Senate Race",
        "Senate markets",
        "politics"
      );
      await registry.createCorrelationGroup(
        "NFL Super Bowl 2025",
        "Super Bowl markets",
        "sports"
      );
    });

    it("Should get groups by category", async function () {
      const politicsGroups = await registry.getGroupsByCategory("politics");
      expect(politicsGroups.length).to.equal(2);

      const sportsGroups = await registry.getGroupsByCategory("sports");
      expect(sportsGroups.length).to.equal(1);
    });

    it("Should return empty array for category with no groups", async function () {
      const groups = await registry.getGroupsByCategory("tech");
      expect(groups.length).to.equal(0);
    });

    it("Should get market count for a group", async function () {
      await registry.addMarketToGroup(0, 1);
      await registry.addMarketToGroup(0, 2);
      await registry.addMarketToGroup(0, 3);

      expect(await registry.getGroupMarketCount(0)).to.equal(3);
    });
  });

  describe("Edge Cases", function () {
    it("Should return max uint for market not in group", async function () {
      expect(await registry.getMarketGroup(999)).to.equal(ethers.MaxUint256);
    });

    it("Should handle multiple groups across categories", async function () {
      const categories = ["politics", "sports", "finance", "tech", "crypto"];
      
      for (let i = 0; i < categories.length; i++) {
        await registry.createCorrelationGroup(
          `Group ${i}`,
          `Description ${i}`,
          categories[i]
        );
      }

      expect(await registry.groupCount()).to.equal(5);

      for (const category of categories) {
        const groups = await registry.getGroupsByCategory(category);
        expect(groups.length).to.be.greaterThan(0);
      }
    });
  });
});
