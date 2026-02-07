import { expect } from "chai";
import hre from "hardhat";

describe("MetadataRegistry", function () {
  let ethers;
  let metadataRegistry;
  let owner;
  let authorizedUpdater;
  let unauthorizedUser;

  beforeEach(async function () {
    const connection = await hre.network.connect();
    ethers = connection.ethers;
    [owner, authorizedUpdater, unauthorizedUser] = await ethers.getSigners();

    const MetadataRegistry = await ethers.getContractFactory("MetadataRegistry");
    metadataRegistry = await MetadataRegistry.deploy();
    await metadataRegistry.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the owner as an authorized updater", async function () {
      expect(await metadataRegistry.authorizedUpdaters(owner.address)).to.be.true;
    });

    it("Should set initial schema version to 1", async function () {
      expect(await metadataRegistry.currentSchemaVersion()).to.equal(1);
    });
  });

  describe("Authorization", function () {
    it("Should allow owner to authorize updaters", async function () {
      await metadataRegistry.setAuthorizedUpdater(authorizedUpdater.address, true);
      expect(await metadataRegistry.authorizedUpdaters(authorizedUpdater.address)).to.be.true;
    });

    it("Should allow owner to deauthorize updaters", async function () {
      await metadataRegistry.setAuthorizedUpdater(authorizedUpdater.address, true);
      await metadataRegistry.setAuthorizedUpdater(authorizedUpdater.address, false);
      expect(await metadataRegistry.authorizedUpdaters(authorizedUpdater.address)).to.be.false;
    });

    it("Should emit UpdaterAuthorizationChanged event", async function () {
      await expect(metadataRegistry.setAuthorizedUpdater(authorizedUpdater.address, true))
        .to.emit(metadataRegistry, "UpdaterAuthorizationChanged")
        .withArgs(authorizedUpdater.address, true);
    });

    it("Should not allow non-owner to authorize updaters", async function () {
      await expect(
        metadataRegistry.connect(unauthorizedUser).setAuthorizedUpdater(authorizedUpdater.address, true)
      ).to.be.revertedWithCustomError(metadataRegistry, "OwnableUnauthorizedAccount");
    });

    it("Should allow batch authorization", async function () {
      const addresses = [authorizedUpdater.address, unauthorizedUser.address];
      await metadataRegistry.batchSetAuthorizedUpdaters(addresses, true);
      
      expect(await metadataRegistry.authorizedUpdaters(authorizedUpdater.address)).to.be.true;
      expect(await metadataRegistry.authorizedUpdaters(unauthorizedUser.address)).to.be.true;
    });

    it("Should reject zero address authorization", async function () {
      await expect(
        metadataRegistry.setAuthorizedUpdater(ethers.ZeroAddress, true)
      ).to.be.revertedWith("Invalid updater address");
    });
  });

  describe("Setting Metadata", function () {
    const marketId = "123";
    const ipfsCid = "QmXXX123";

    it("Should allow authorized updater to set metadata", async function () {
      await metadataRegistry.setAuthorizedUpdater(authorizedUpdater.address, true);
      
      await expect(
        metadataRegistry.connect(authorizedUpdater).setMetadata("market", marketId, ipfsCid)
      ).to.emit(metadataRegistry, "MetadataSet")
        .withArgs("market", marketId, ipfsCid, 1, authorizedUpdater.address);
    });

    it("Should allow owner to set metadata", async function () {
      await expect(
        metadataRegistry.setMetadata("market", marketId, ipfsCid)
      ).to.emit(metadataRegistry, "MetadataSet");
    });

    it("Should not allow unauthorized user to set metadata", async function () {
      await expect(
        metadataRegistry.connect(unauthorizedUser).setMetadata("market", marketId, ipfsCid)
      ).to.be.revertedWith("Not authorized to update metadata");
    });

    it("Should track resource keys", async function () {
      await metadataRegistry.setMetadata("market", marketId, ipfsCid);
      
      expect(await metadataRegistry.isRegistered("market:123")).to.be.true;
      expect(await metadataRegistry.getResourceCount()).to.equal(1);
      expect(await metadataRegistry.getResourceKeyAt(0)).to.equal("market:123");
    });

    it("Should set metadata using numeric ID", async function () {
      await metadataRegistry.setMetadataById("market", 123, ipfsCid);
      
      const cid = await metadataRegistry.getMetadataById("market", 123);
      expect(cid).to.equal(ipfsCid);
    });
  });

  describe("Getting Metadata", function () {
    const marketId = "123";
    const ipfsCid = "QmXXX123";

    beforeEach(async function () {
      await metadataRegistry.setMetadata("market", marketId, ipfsCid);
    });

    it("Should retrieve metadata CID", async function () {
      const cid = await metadataRegistry.getMetadata("market", marketId);
      expect(cid).to.equal(ipfsCid);
    });

    it("Should retrieve metadata entry with details", async function () {
      const entry = await metadataRegistry.getMetadataEntry("market", marketId);
      
      expect(entry.cid).to.equal(ipfsCid);
      expect(entry.updatedBy).to.equal(owner.address);
      expect(entry.version).to.equal(1);
    });

    it("Should revert when getting non-existent metadata", async function () {
      await expect(
        metadataRegistry.getMetadata("market", "999")
      ).to.be.revertedWith("Metadata not found");
    });

    it("Should check if metadata exists", async function () {
      expect(await metadataRegistry.hasMetadata("market", marketId)).to.be.true;
      expect(await metadataRegistry.hasMetadata("market", "999")).to.be.false;
    });

    it("Should retrieve metadata using numeric ID", async function () {
      await metadataRegistry.setMetadataById("proposal", 456, "QmYYY456");
      
      const cid = await metadataRegistry.getMetadataById("proposal", 456);
      expect(cid).to.equal("QmYYY456");
    });
  });

  describe("Updating Metadata", function () {
    const marketId = "123";
    const oldCid = "QmOLD123";
    const newCid = "QmNEW123";

    beforeEach(async function () {
      await metadataRegistry.setMetadata("market", marketId, oldCid);
    });

    it("Should update existing metadata", async function () {
      await expect(
        metadataRegistry.setMetadata("market", marketId, newCid)
      ).to.emit(metadataRegistry, "MetadataUpdated")
        .withArgs("market", marketId, oldCid, newCid, 1);
    });

    it("Should update timestamp on metadata change", async function () {
      const oldEntry = await metadataRegistry.getMetadataEntry("market", marketId);
      
      // Wait a bit to ensure timestamp changes
      await ethers.provider.send("evm_increaseTime", [1]);
      await ethers.provider.send("evm_mine");
      
      await metadataRegistry.setMetadata("market", marketId, newCid);
      const newEntry = await metadataRegistry.getMetadataEntry("market", marketId);
      
      expect(newEntry.updatedAt).to.be.greaterThan(oldEntry.updatedAt);
    });

    it("Should not increase resource count on update", async function () {
      const countBefore = await metadataRegistry.getResourceCount();
      await metadataRegistry.setMetadata("market", marketId, newCid);
      const countAfter = await metadataRegistry.getResourceCount();
      
      expect(countAfter).to.equal(countBefore);
    });
  });

  describe("Batch Operations", function () {
    it("Should batch get metadata", async function () {
      await metadataRegistry.setMetadata("market", "1", "QmAAA");
      await metadataRegistry.setMetadata("market", "2", "QmBBB");
      await metadataRegistry.setMetadata("market", "3", "QmCCC");
      
      const cids = await metadataRegistry.batchGetMetadata("market", ["1", "2", "3"]);
      
      expect(cids[0]).to.equal("QmAAA");
      expect(cids[1]).to.equal("QmBBB");
      expect(cids[2]).to.equal("QmCCC");
    });

    it("Should return empty string for non-existent items in batch", async function () {
      await metadataRegistry.setMetadata("market", "1", "QmAAA");
      
      const cids = await metadataRegistry.batchGetMetadata("market", ["1", "999"]);
      
      expect(cids[0]).to.equal("QmAAA");
      expect(cids[1]).to.equal("");
    });

    it("Should batch get metadata by numeric IDs", async function () {
      await metadataRegistry.setMetadataById("market", 1, "QmAAA");
      await metadataRegistry.setMetadataById("market", 2, "QmBBB");
      
      const cids = await metadataRegistry.batchGetMetadataById("market", [1, 2]);
      
      expect(cids[0]).to.equal("QmAAA");
      expect(cids[1]).to.equal("QmBBB");
    });
  });

  describe("Schema Version", function () {
    it("Should update schema version", async function () {
      await expect(metadataRegistry.updateSchemaVersion(2))
        .to.emit(metadataRegistry, "SchemaVersionUpdated")
        .withArgs(1, 2);
      
      expect(await metadataRegistry.currentSchemaVersion()).to.equal(2);
    });

    it("Should not allow decreasing schema version", async function () {
      await metadataRegistry.updateSchemaVersion(2);
      
      await expect(
        metadataRegistry.updateSchemaVersion(1)
      ).to.be.revertedWith("Version must increase");
    });

    it("Should not allow non-owner to update schema version", async function () {
      await expect(
        metadataRegistry.connect(unauthorizedUser).updateSchemaVersion(2)
      ).to.be.revertedWithCustomError(metadataRegistry, "OwnableUnauthorizedAccount");
    });

    it("Should track schema version in metadata entries", async function () {
      await metadataRegistry.setMetadata("market", "1", "QmAAA");
      await metadataRegistry.updateSchemaVersion(2);
      await metadataRegistry.setMetadata("market", "2", "QmBBB");
      
      const entry1 = await metadataRegistry.getMetadataEntry("market", "1");
      const entry2 = await metadataRegistry.getMetadataEntry("market", "2");
      
      expect(entry1.version).to.equal(1);
      expect(entry2.version).to.equal(2);
    });
  });

  describe("Multiple Resource Types", function () {
    it("Should store different resource types separately", async function () {
      await metadataRegistry.setMetadata("market", "1", "QmMarket1");
      await metadataRegistry.setMetadata("proposal", "1", "QmProposal1");
      await metadataRegistry.setMetadata("token", "0xabc", "QmToken1");
      
      expect(await metadataRegistry.getMetadata("market", "1")).to.equal("QmMarket1");
      expect(await metadataRegistry.getMetadata("proposal", "1")).to.equal("QmProposal1");
      expect(await metadataRegistry.getMetadata("token", "0xabc")).to.equal("QmToken1");
    });

    it("Should track resource count across types", async function () {
      await metadataRegistry.setMetadata("market", "1", "QmMarket1");
      await metadataRegistry.setMetadata("proposal", "1", "QmProposal1");
      await metadataRegistry.setMetadata("dao", "0xdao", "QmDAO1");
      
      expect(await metadataRegistry.getResourceCount()).to.equal(3);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle empty string CID", async function () {
      await metadataRegistry.setMetadata("market", "1", "");
      expect(await metadataRegistry.getMetadata("market", "1")).to.equal("");
    });

    it("Should handle very long CIDs", async function () {
      const longCid = "Qm" + "a".repeat(100);
      await metadataRegistry.setMetadata("market", "1", longCid);
      expect(await metadataRegistry.getMetadata("market", "1")).to.equal(longCid);
    });

    it("Should handle special characters in resource ID", async function () {
      const specialId = "test-id_123.xyz";
      await metadataRegistry.setMetadata("market", specialId, "QmXXX");
      expect(await metadataRegistry.getMetadata("market", specialId)).to.equal("QmXXX");
    });

    it("Should revert on out of bounds index", async function () {
      await expect(
        metadataRegistry.getResourceKeyAt(999)
      ).to.be.revertedWith("Index out of bounds");
    });
  });
});
