const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Batch Operations", function () {
  let marketFactory;
  let privacyCoordinator;
  let owner;
  let addr1;
  let addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    
    // Deploy ConditionalMarketFactory
    const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
    marketFactory = await ConditionalMarketFactory.deploy();
    await marketFactory.initialize(owner.address);
    
    // Deploy PrivacyCoordinator
    const PrivacyCoordinator = await ethers.getContractFactory("PrivacyCoordinator");
    privacyCoordinator = await PrivacyCoordinator.deploy();
    await privacyCoordinator.initialize(owner.address);
  });

  describe("Batch Market Creation", function () {
    it("Should create multiple markets in a single transaction", async function () {
      const params = [
        {
          proposalId: 1,
          collateralToken: ethers.ZeroAddress,
          liquidityAmount: ethers.parseEther("1000"),
          liquidityParameter: ethers.parseEther("100"),
          tradingPeriod: 7 * 24 * 60 * 60,
          betType: 1
        },
        {
          proposalId: 2,
          collateralToken: ethers.ZeroAddress,
          liquidityAmount: ethers.parseEther("2000"),
          liquidityParameter: ethers.parseEther("200"),
          tradingPeriod: 10 * 24 * 60 * 60,
          betType: 1
        },
        {
          proposalId: 3,
          collateralToken: ethers.ZeroAddress,
          liquidityAmount: ethers.parseEther("1500"),
          liquidityParameter: ethers.parseEther("150"),
          tradingPeriod: 14 * 24 * 60 * 60,
          betType: 1
        }
      ];

      const tx = await marketFactory.batchDeployMarkets(params);
      const receipt = await tx.wait();
      
      // Check BatchMarketsCreated event
      const batchEvent = receipt.logs.find(
        log => {
          try {
            const parsed = marketFactory.interface.parseLog(log);
            return parsed && parsed.name === "BatchMarketsCreated";
          } catch {
            return false;
          }
        }
      );
      expect(batchEvent).to.not.be.undefined;
      
      // Verify market count
      expect(await marketFactory.marketCount()).to.equal(3);
      
      // Verify individual markets
      for (let i = 0; i < params.length; i++) {
        const market = await marketFactory.getMarket(i);
        expect(market.proposalId).to.equal(params[i].proposalId);
        expect(market.liquidityParameter).to.equal(params[i].liquidityParameter);
      }
    });

    it("Should emit individual MarketCreated events for each market", async function () {
      const params = [
        {
          proposalId: 1,
          collateralToken: ethers.ZeroAddress,
          liquidityAmount: ethers.parseEther("1000"),
          liquidityParameter: ethers.parseEther("100"),
          tradingPeriod: 7 * 24 * 60 * 60,
          betType: 1
        },
        {
          proposalId: 2,
          collateralToken: ethers.ZeroAddress,
          liquidityAmount: ethers.parseEther("2000"),
          liquidityParameter: ethers.parseEther("200"),
          tradingPeriod: 10 * 24 * 60 * 60,
          betType: 1
        }
      ];

      const tx = await marketFactory.batchDeployMarkets(params);
      const receipt = await tx.wait();
      
      // Count MarketCreated events
      const createdEvents = receipt.logs.filter(log => {
        try {
          const parsed = marketFactory.interface.parseLog(log);
          return parsed && parsed.name === "MarketCreated";
        } catch {
          return false;
        }
      });
      
      expect(createdEvents.length).to.equal(params.length);
    });

    it("Should reject empty batch", async function () {
      await expect(
        marketFactory.batchDeployMarkets([])
      ).to.be.revertedWith("Empty batch");
    });

    it("Should reject batch that is too large", async function () {
      const params = [];
      const maxBatchSize = await marketFactory.MAX_BATCH_SIZE();
      
      for (let i = 0; i < Number(maxBatchSize) + 1; i++) {
        params.push({
          proposalId: i + 1,
          collateralToken: ethers.ZeroAddress,
          liquidityAmount: ethers.parseEther("1000"),
          liquidityParameter: ethers.parseEther("100"),
          tradingPeriod: 7 * 24 * 60 * 60,
          betType: 1
        });
      }

      await expect(
        marketFactory.batchDeployMarkets(params)
      ).to.be.revertedWith("Batch too large");
    });

    it("Should reject if market already exists for proposal", async function () {
      const params = [
        {
          proposalId: 1,
          collateralToken: ethers.ZeroAddress,
          liquidityAmount: ethers.parseEther("1000"),
          liquidityParameter: ethers.parseEther("100"),
          tradingPeriod: 7 * 24 * 60 * 60,
          betType: 1
        },
        {
          proposalId: 1, // Duplicate proposal ID
          collateralToken: ethers.ZeroAddress,
          liquidityAmount: ethers.parseEther("2000"),
          liquidityParameter: ethers.parseEther("200"),
          tradingPeriod: 10 * 24 * 60 * 60,
          betType: 1
        }
      ];

      await expect(
        marketFactory.batchDeployMarkets(params)
      ).to.be.revertedWith("Market already exists");
    });
  });

  describe("Batch Market Resolution", function () {
    beforeEach(async function () {
      // Create multiple markets
      const params = [
        {
          proposalId: 1,
          collateralToken: ethers.ZeroAddress,
          liquidityAmount: ethers.parseEther("1000"),
          liquidityParameter: ethers.parseEther("100"),
          tradingPeriod: 7 * 24 * 60 * 60,
          betType: 1
        },
        {
          proposalId: 2,
          collateralToken: ethers.ZeroAddress,
          liquidityAmount: ethers.parseEther("2000"),
          liquidityParameter: ethers.parseEther("200"),
          tradingPeriod: 7 * 24 * 60 * 60,
          betType: 1
        },
        {
          proposalId: 3,
          collateralToken: ethers.ZeroAddress,
          liquidityAmount: ethers.parseEther("1500"),
          liquidityParameter: ethers.parseEther("150"),
          tradingPeriod: 7 * 24 * 60 * 60,
          betType: 1
        }
      ];
      
      await marketFactory.batchDeployMarkets(params);
      
      // Fast forward time and end trading
      await time.increase(8 * 24 * 60 * 60); // 8 days
      
      for (let i = 0; i < 3; i++) {
        await marketFactory.endTrading(i);
      }
    });

    it("Should resolve multiple markets in a single transaction", async function () {
      const resolutionParams = [
        {
          marketId: 0,
          passValue: ethers.parseEther("100"),
          failValue: ethers.parseEther("80")
        },
        {
          marketId: 1,
          passValue: ethers.parseEther("120"),
          failValue: ethers.parseEther("110")
        },
        {
          marketId: 2,
          passValue: ethers.parseEther("90"),
          failValue: ethers.parseEther("95")
        }
      ];

      const tx = await marketFactory.batchResolveMarkets(resolutionParams);
      const receipt = await tx.wait();
      
      // Check BatchMarketsResolved event
      const batchEvent = receipt.logs.find(log => {
        try {
          const parsed = marketFactory.interface.parseLog(log);
          return parsed && parsed.name === "BatchMarketsResolved";
        } catch {
          return false;
        }
      });
      expect(batchEvent).to.not.be.undefined;
      
      // Verify markets are resolved
      for (let i = 0; i < resolutionParams.length; i++) {
        const market = await marketFactory.getMarket(i);
        expect(market.resolved).to.be.true;
        expect(market.passValue).to.equal(resolutionParams[i].passValue);
        expect(market.failValue).to.equal(resolutionParams[i].failValue);
      }
    });

    it("Should return success status for each resolution", async function () {
      const resolutionParams = [
        {
          marketId: 0,
          passValue: ethers.parseEther("100"),
          failValue: ethers.parseEther("80")
        },
        {
          marketId: 1,
          passValue: ethers.parseEther("120"),
          failValue: ethers.parseEther("110")
        }
      ];

      const tx = await marketFactory.batchResolveMarkets(resolutionParams);
      await tx.wait();
      
      // Verify all markets resolved successfully
      for (let i = 0; i < resolutionParams.length; i++) {
        const market = await marketFactory.getMarket(i);
        expect(market.resolved).to.be.true;
      }
    });

    it("Should handle partial failures gracefully", async function () {
      const resolutionParams = [
        {
          marketId: 0,
          passValue: ethers.parseEther("100"),
          failValue: ethers.parseEther("80")
        },
        {
          marketId: 999, // Invalid market ID
          passValue: ethers.parseEther("120"),
          failValue: ethers.parseEther("110")
        },
        {
          marketId: 2,
          passValue: ethers.parseEther("90"),
          failValue: ethers.parseEther("95")
        }
      ];

      // Should not revert, but some markets may not resolve
      await marketFactory.batchResolveMarkets(resolutionParams);
      
      // Verify valid markets are resolved
      const market0 = await marketFactory.getMarket(0);
      expect(market0.resolved).to.be.true;
      
      const market2 = await marketFactory.getMarket(2);
      expect(market2.resolved).to.be.true;
    });

    it("Should emit MarketResolved events with approval status", async function () {
      const resolutionParams = [
        {
          marketId: 0,
          passValue: ethers.parseEther("100"),
          failValue: ethers.parseEther("80")
        }
      ];

      const tx = await marketFactory.batchResolveMarkets(resolutionParams);
      const receipt = await tx.wait();
      
      const resolvedEvent = receipt.logs.find(log => {
        try {
          const parsed = marketFactory.interface.parseLog(log);
          return parsed && parsed.name === "MarketResolved";
        } catch {
          return false;
        }
      });
      
      expect(resolvedEvent).to.not.be.undefined;
    });
  });

  describe("Batch Position Submission", function () {
    beforeEach(async function () {
      // Register public key
      const publicKey = ethers.keccak256(ethers.toUtf8Bytes("test-public-key"));
      await privacyCoordinator.connect(addr1).registerPublicKey(publicKey);
    });

    it("Should submit multiple positions in a single transaction", async function () {
      const commitments = [
        ethers.keccak256(ethers.toUtf8Bytes("commitment1")),
        ethers.keccak256(ethers.toUtf8Bytes("commitment2")),
        ethers.keccak256(ethers.toUtf8Bytes("commitment3"))
      ];
      
      const zkProofs = [
        ethers.toUtf8Bytes("proof1"),
        ethers.toUtf8Bytes("proof2"),
        ethers.toUtf8Bytes("proof3")
      ];
      
      const marketIds = [1, 2, 3];

      const tx = await privacyCoordinator.connect(addr1).batchSubmitPositions(
        commitments,
        zkProofs,
        marketIds
      );
      const receipt = await tx.wait();
      
      // Verify position count
      expect(await privacyCoordinator.positionCount()).to.equal(3);
      
      // Verify user position count
      expect(await privacyCoordinator.getUserPositionCount(addr1.address)).to.equal(3);
    });

    it("Should emit EncryptedPositionSubmitted for each position", async function () {
      const commitments = [
        ethers.keccak256(ethers.toUtf8Bytes("commitment1")),
        ethers.keccak256(ethers.toUtf8Bytes("commitment2"))
      ];
      
      const zkProofs = [
        ethers.toUtf8Bytes("proof1"),
        ethers.toUtf8Bytes("proof2")
      ];
      
      const marketIds = [1, 2];

      const tx = await privacyCoordinator.connect(addr1).batchSubmitPositions(
        commitments,
        zkProofs,
        marketIds
      );
      const receipt = await tx.wait();
      
      // Count EncryptedPositionSubmitted events
      const events = receipt.logs.filter(log => {
        try {
          const parsed = privacyCoordinator.interface.parseLog(log);
          return parsed && parsed.name === "EncryptedPositionSubmitted";
        } catch {
          return false;
        }
      });
      
      expect(events.length).to.equal(commitments.length);
    });

    it("Should reject empty batch", async function () {
      await expect(
        privacyCoordinator.connect(addr1).batchSubmitPositions([], [], [])
      ).to.be.revertedWith("Empty batch");
    });

    it("Should reject batch that is too large", async function () {
      const maxBatchSize = await privacyCoordinator.MAX_BATCH_SIZE();
      const commitments = [];
      const zkProofs = [];
      const marketIds = [];
      
      for (let i = 0; i < Number(maxBatchSize) + 1; i++) {
        commitments.push(ethers.keccak256(ethers.toUtf8Bytes(`commitment${i}`)));
        zkProofs.push(ethers.toUtf8Bytes(`proof${i}`));
        marketIds.push(i + 1);
      }

      await expect(
        privacyCoordinator.connect(addr1).batchSubmitPositions(
          commitments,
          zkProofs,
          marketIds
        )
      ).to.be.revertedWith("Batch too large");
    });

    it("Should reject if array lengths mismatch", async function () {
      const commitments = [
        ethers.keccak256(ethers.toUtf8Bytes("commitment1")),
        ethers.keccak256(ethers.toUtf8Bytes("commitment2"))
      ];
      
      const zkProofs = [
        ethers.toUtf8Bytes("proof1")
      ];
      
      const marketIds = [1, 2];

      await expect(
        privacyCoordinator.connect(addr1).batchSubmitPositions(
          commitments,
          zkProofs,
          marketIds
        )
      ).to.be.revertedWith("Array length mismatch");
    });
  });

  describe("Batch Position Processing", function () {
    beforeEach(async function () {
      // Register public keys
      const publicKey1 = ethers.keccak256(ethers.toUtf8Bytes("test-public-key-1"));
      const publicKey2 = ethers.keccak256(ethers.toUtf8Bytes("test-public-key-2"));
      await privacyCoordinator.connect(addr1).registerPublicKey(publicKey1);
      await privacyCoordinator.connect(addr2).registerPublicKey(publicKey2);
      
      // Submit positions
      const commitments = [
        ethers.keccak256(ethers.toUtf8Bytes("commitment1")),
        ethers.keccak256(ethers.toUtf8Bytes("commitment2")),
        ethers.keccak256(ethers.toUtf8Bytes("commitment3"))
      ];
      
      const zkProofs = [
        ethers.toUtf8Bytes("proof1"),
        ethers.toUtf8Bytes("proof2"),
        ethers.toUtf8Bytes("proof3")
      ];
      
      const marketIds = [1, 2, 3];
      
      await privacyCoordinator.connect(addr1).batchSubmitPositions(
        commitments,
        zkProofs,
        marketIds
      );
    });

    it("Should process multiple positions in a single transaction", async function () {
      const positionIds = [0, 1, 2];
      
      await privacyCoordinator.batchProcessPositions(positionIds);
      
      // Verify positions are processed
      for (let i = 0; i < positionIds.length; i++) {
        const position = await privacyCoordinator.getPosition(positionIds[i]);
        expect(position.processed).to.be.true;
      }
    });

    it("Should emit BatchPositionsProcessed event", async function () {
      const positionIds = [0, 1, 2];
      
      await expect(
        privacyCoordinator.batchProcessPositions(positionIds)
      ).to.emit(privacyCoordinator, "BatchPositionsProcessed");
    });

    it("Should handle invalid position IDs gracefully", async function () {
      const positionIds = [0, 999, 2]; // 999 is invalid
      
      // Should not revert
      await privacyCoordinator.batchProcessPositions(positionIds);
      
      // Verify valid positions are processed
      const position0 = await privacyCoordinator.getPosition(0);
      expect(position0.processed).to.be.true;
      
      const position2 = await privacyCoordinator.getPosition(2);
      expect(position2.processed).to.be.true;
    });

    it("Should not process already processed positions twice", async function () {
      const positionIds = [0, 1];
      
      // Process first time
      await privacyCoordinator.batchProcessPositions(positionIds);
      
      // Process second time (should be idempotent)
      await privacyCoordinator.batchProcessPositions(positionIds);
      
      // Verify positions remain processed
      for (let i = 0; i < positionIds.length; i++) {
        const position = await privacyCoordinator.getPosition(positionIds[i]);
        expect(position.processed).to.be.true;
      }
    });
  });

  describe("Market Query Functions", function () {
    beforeEach(async function () {
      // Create 10 markets
      const params = [];
      for (let i = 0; i < 10; i++) {
        params.push({
          proposalId: i + 1,
          collateralToken: ethers.ZeroAddress,
          liquidityAmount: ethers.parseEther("1000"),
          liquidityParameter: ethers.parseEther("100"),
          tradingPeriod: 7 * 24 * 60 * 60,
          betType: 1
        });
      }
      await marketFactory.batchDeployMarkets(params);
    });

    it("Should query active markets with pagination", async function () {
      const [marketIds, hasMore] = await marketFactory.getActiveMarkets(0, 5);
      
      expect(marketIds.length).to.equal(5);
      expect(hasMore).to.be.true;
    });

    it("Should handle pagination correctly", async function () {
      // Get first page
      const [page1, hasMore1] = await marketFactory.getActiveMarkets(0, 3);
      expect(page1.length).to.equal(3);
      expect(hasMore1).to.be.true;
      
      // Get second page
      const [page2, hasMore2] = await marketFactory.getActiveMarkets(3, 3);
      expect(page2.length).to.equal(3);
      expect(hasMore2).to.be.true;
      
      // Get third page
      const [page3, hasMore3] = await marketFactory.getActiveMarkets(6, 3);
      expect(page3.length).to.equal(3);
      expect(hasMore3).to.be.true;
      
      // Get fourth page (partial)
      const [page4, hasMore4] = await marketFactory.getActiveMarkets(9, 3);
      expect(page4.length).to.equal(1);
      expect(hasMore4).to.be.false;
    });

    it("Should return empty array when offset exceeds total", async function () {
      const [marketIds, hasMore] = await marketFactory.getActiveMarkets(100, 5);
      
      expect(marketIds.length).to.equal(0);
      expect(hasMore).to.be.false;
    });

    it("Should query markets by status", async function () {
      // All markets should be active initially
      const count = await marketFactory.getMarketCountByStatus(0); // Active = 0
      expect(count).to.equal(10);
    });
  });

  describe("User Position Query Functions", function () {
    beforeEach(async function () {
      // Register public key and submit positions
      const publicKey = ethers.keccak256(ethers.toUtf8Bytes("test-public-key"));
      await privacyCoordinator.connect(addr1).registerPublicKey(publicKey);
      
      const commitments = [];
      const zkProofs = [];
      const marketIds = [];
      
      for (let i = 0; i < 15; i++) {
        commitments.push(ethers.keccak256(ethers.toUtf8Bytes(`commitment${i}`)));
        zkProofs.push(ethers.toUtf8Bytes(`proof${i}`));
        marketIds.push(i + 1);
      }
      
      await privacyCoordinator.connect(addr1).batchSubmitPositions(
        commitments,
        zkProofs,
        marketIds
      );
    });

    it("Should query user positions with pagination", async function () {
      const [positionIds, hasMore] = await privacyCoordinator.getUserPositions(
        addr1.address,
        0,
        10
      );
      
      expect(positionIds.length).to.equal(10);
      expect(hasMore).to.be.true;
    });

    it("Should get correct user position count", async function () {
      const count = await privacyCoordinator.getUserPositionCount(addr1.address);
      expect(count).to.equal(15);
    });

    it("Should query market positions", async function () {
      const marketId = 1;
      const [positionIds, hasMore] = await privacyCoordinator.getMarketPositions(
        marketId,
        0,
        10
      );
      
      expect(positionIds.length).to.be.greaterThan(0);
    });

    it("Should get correct market position count", async function () {
      const marketId = 1;
      const count = await privacyCoordinator.getMarketPositionCount(marketId);
      expect(count).to.be.greaterThan(0);
    });
  });

  describe("Gas Optimization Validation", function () {
    it("Batch market creation should be more efficient than individual", async function () {
      const params = [];
      for (let i = 0; i < 5; i++) {
        params.push({
          proposalId: i + 1,
          collateralToken: ethers.ZeroAddress,
          liquidityAmount: ethers.parseEther("1000"),
          liquidityParameter: ethers.parseEther("100"),
          tradingPeriod: 7 * 24 * 60 * 60,
          betType: 1
        });
      }
      
      // Batch deployment
      const batchTx = await marketFactory.batchDeployMarkets(params);
      const batchReceipt = await batchTx.wait();
      const batchGasUsed = batchReceipt.gasUsed;
      
      // Deploy new factory for individual test
      const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
      const marketFactory2 = await ConditionalMarketFactory.deploy();
      await marketFactory2.initialize(owner.address);
      
      // Individual deployments
      let totalIndividualGas = 0n;
      for (let i = 0; i < 5; i++) {
        const tx = await marketFactory2.deployMarketPair(
          i + 10,
          ethers.ZeroAddress,
          ethers.parseEther("1000"),
          ethers.parseEther("100"),
          7 * 24 * 60 * 60,
          1 // BetType.PassFail
        );
        const receipt = await tx.wait();
        totalIndividualGas += receipt.gasUsed;
      }
      
      // Batch should be more efficient
      expect(batchGasUsed).to.be.lessThan(totalIndividualGas);
      
      // Calculate savings percentage - convert to Number to avoid BigInt division truncation
      const savings = Number(totalIndividualGas - batchGasUsed) * 100 / Number(totalIndividualGas);
      console.log(`Gas savings from batch market creation: ${savings.toFixed(2)}%`);
    });

    it("Batch position submission should be more efficient than individual", async function () {
      const publicKey = ethers.keccak256(ethers.toUtf8Bytes("test-public-key"));
      await privacyCoordinator.connect(addr1).registerPublicKey(publicKey);
      
      const commitments = [];
      const zkProofs = [];
      const marketIds = [];
      
      for (let i = 0; i < 10; i++) {
        commitments.push(ethers.keccak256(ethers.toUtf8Bytes(`commitment${i}`)));
        zkProofs.push(ethers.toUtf8Bytes(`proof${i}`));
        marketIds.push(i + 1);
      }
      
      // Batch submission
      const batchTx = await privacyCoordinator.connect(addr1).batchSubmitPositions(
        commitments,
        zkProofs,
        marketIds
      );
      const batchReceipt = await batchTx.wait();
      const batchGasUsed = batchReceipt.gasUsed;
      
      // Deploy new coordinator for individual test
      const PrivacyCoordinator = await ethers.getContractFactory("PrivacyCoordinator");
      const privacyCoordinator2 = await PrivacyCoordinator.deploy();
      await privacyCoordinator2.initialize(owner.address);
      await privacyCoordinator2.connect(addr2).registerPublicKey(publicKey);
      
      // Individual submissions
      let totalIndividualGas = 0n;
      for (let i = 0; i < 10; i++) {
        const tx = await privacyCoordinator2.connect(addr2).submitEncryptedPosition(
          ethers.keccak256(ethers.toUtf8Bytes(`commitment${i}`)),
          ethers.toUtf8Bytes(`proof${i}`),
          i + 1
        );
        const receipt = await tx.wait();
        totalIndividualGas += receipt.gasUsed;
      }
      
      // Batch should be more efficient
      expect(batchGasUsed).to.be.lessThan(totalIndividualGas);
      
      // Calculate savings percentage - convert to Number to avoid BigInt division truncation
      const savings = Number(totalIndividualGas - batchGasUsed) * 100 / Number(totalIndividualGas);
      console.log(`Gas savings from batch position submission: ${savings.toFixed(2)}%`);
    });
  });
});
