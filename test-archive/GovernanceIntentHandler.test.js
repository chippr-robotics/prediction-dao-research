const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BetType } = require("./constants/BetType");

describe("GovernanceIntentHandler - EIP-712 Signature Flows", function () {
    let intentHandler;
    let marketFactory;
    let ctf1155;
    let collateralToken;
    let owner, participant, executor;
    let conditionId;
    let marketId;
    let passPositionId, failPositionId;

    // EIP-712 domain and types
    let domain;
    const tradeIntentTypes = {
        TradeIntent: [
            { name: "participant", type: "address" },
            { name: "marketId", type: "uint256" },
            { name: "buyPass", type: "bool" },
            { name: "amount", type: "uint256" },
            { name: "isBuy", type: "bool" },
            { name: "minAmountOut", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" }
        ]
    };

    const splitIntentTypes = {
        SplitIntent: [
            { name: "participant", type: "address" },
            { name: "marketId", type: "uint256" },
            { name: "amount", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" }
        ]
    };

    const mergeIntentTypes = {
        MergeIntent: [
            { name: "participant", type: "address" },
            { name: "marketId", type: "uint256" },
            { name: "amount", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" }
        ]
    };

    beforeEach(async function () {
        [owner, participant, executor] = await ethers.getSigners();

        // Deploy CTF1155
        const CTF1155 = await ethers.getContractFactory("CTF1155");
        ctf1155 = await CTF1155.deploy();
        await ctf1155.waitForDeployment();

        // Deploy ConditionalMarketFactory
        const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
        marketFactory = await ConditionalMarketFactory.deploy();
        await marketFactory.initialize(owner.address);
        await marketFactory.setCTF1155(await ctf1155.getAddress());

        // Deploy mock ERC20 collateral token
        const MockERC20 = await ethers.getContractFactory("ConditionalToken");
        collateralToken = await MockERC20.deploy("Collateral", "COL");
        await collateralToken.waitForDeployment();

        // Mint collateral to participant
        await collateralToken.mint(participant.address, ethers.parseEther("10000"));

        // Deploy GovernanceIntentHandler
        const GovernanceIntentHandler = await ethers.getContractFactory("GovernanceIntentHandler");
        intentHandler = await GovernanceIntentHandler.deploy(
            await marketFactory.getAddress(),
            await ctf1155.getAddress()
        );
        await intentHandler.waitForDeployment();

        // Create a market
        const proposalId = 1;
        const liquidityAmount = ethers.parseEther("1000");
        const liquidityParameter = ethers.parseEther("100");
        const tradingPeriod = 7 * 24 * 60 * 60;

        await marketFactory.deployMarketPair(
            proposalId,
            await collateralToken.getAddress(),
            liquidityAmount,
            liquidityParameter,
            tradingPeriod,
            BetType.PassFail
        );

        marketId = 0;
        const market = await marketFactory.getMarket(marketId);
        conditionId = market.conditionId;
        passPositionId = market.passPositionId;
        failPositionId = market.failPositionId;

        // Setup EIP-712 domain
        domain = {
            name: "GovernanceIntentHandler",
            version: "1",
            chainId: (await ethers.provider.getNetwork()).chainId,
            verifyingContract: await intentHandler.getAddress()
        };

        // Approve intent handler to spend tokens
        await collateralToken.connect(participant).approve(await intentHandler.getAddress(), ethers.MaxUint256);
        await ctf1155.connect(participant).setApprovalForAll(await intentHandler.getAddress(), true);
    });

    describe("Deployment", function () {
        it("Should deploy with correct references", async function () {
            expect(await intentHandler.marketFactory()).to.equal(await marketFactory.getAddress());
            expect(await intentHandler.ctf1155()).to.equal(await ctf1155.getAddress());
        });

        it("Should have correct domain separator", async function () {
            const domainSeparator = await intentHandler.domainSeparator();
            expect(domainSeparator).to.not.equal(ethers.ZeroHash);
        });
    });

    describe("Split Intent", function () {
        it("Should execute split intent with valid signature", async function () {
            const intent = {
                participant: participant.address,
                marketId: marketId,
                amount: ethers.parseEther("100"),
                nonce: 1,
                deadline: (await ethers.provider.getBlock('latest')).timestamp + 3600
            };

            const signature = await participant.signTypedData(domain, splitIntentTypes, intent);

            const initialCollateral = await collateralToken.balanceOf(participant.address);
            
            await intentHandler.connect(executor).executeSplitIntent(intent, signature);

            // Verify participant received both position tokens
            expect(await ctf1155.balanceOf(participant.address, passPositionId)).to.equal(intent.amount);
            expect(await ctf1155.balanceOf(participant.address, failPositionId)).to.equal(intent.amount);
            
            // Verify collateral was deducted
            expect(await collateralToken.balanceOf(participant.address)).to.equal(initialCollateral - intent.amount);
        });

        it("Should reject expired split intent", async function () {
            const intent = {
                participant: participant.address,
                marketId: marketId,
                amount: ethers.parseEther("100"),
                nonce: 2,
                deadline: (await ethers.provider.getBlock('latest')).timestamp - 1 // Expired
            };

            const signature = await participant.signTypedData(domain, splitIntentTypes, intent);

            await expect(
                intentHandler.connect(executor).executeSplitIntent(intent, signature)
            ).to.be.revertedWithCustomError(intentHandler, "ExpiredIntent");
        });

        it("Should reject invalid signature", async function () {
            const intent = {
                participant: participant.address,
                marketId: marketId,
                amount: ethers.parseEther("100"),
                nonce: 3,
                deadline: (await ethers.provider.getBlock('latest')).timestamp + 3600
            };

            // Sign with wrong signer
            const signature = await executor.signTypedData(domain, splitIntentTypes, intent);

            await expect(
                intentHandler.connect(executor).executeSplitIntent(intent, signature)
            ).to.be.revertedWithCustomError(intentHandler, "InvalidSignature");
        });

        it("Should reject reused nonce", async function () {
            const intent = {
                participant: participant.address,
                marketId: marketId,
                amount: ethers.parseEther("100"),
                nonce: 4,
                deadline: (await ethers.provider.getBlock('latest')).timestamp + 3600
            };

            const signature = await participant.signTypedData(domain, splitIntentTypes, intent);

            // First execution should succeed
            await intentHandler.connect(executor).executeSplitIntent(intent, signature);

            // Second execution should fail
            await expect(
                intentHandler.connect(executor).executeSplitIntent(intent, signature)
            ).to.be.revertedWithCustomError(intentHandler, "NonceAlreadyUsed");
        });

        it("Should reject zero amount", async function () {
            const intent = {
                participant: participant.address,
                marketId: marketId,
                amount: 0,
                nonce: 5,
                deadline: (await ethers.provider.getBlock('latest')).timestamp + 3600
            };

            const signature = await participant.signTypedData(domain, splitIntentTypes, intent);

            await expect(
                intentHandler.connect(executor).executeSplitIntent(intent, signature)
            ).to.be.revertedWithCustomError(intentHandler, "ZeroAmount");
        });
    });

    describe("Merge Intent", function () {
        beforeEach(async function () {
            // First split to get position tokens
            const splitIntent = {
                participant: participant.address,
                marketId: marketId,
                amount: ethers.parseEther("200"),
                nonce: 100,
                deadline: (await ethers.provider.getBlock('latest')).timestamp + 3600
            };

            const signature = await participant.signTypedData(domain, splitIntentTypes, splitIntent);
            await intentHandler.connect(executor).executeSplitIntent(splitIntent, signature);
        });

        it("Should execute merge intent with valid signature", async function () {
            const intent = {
                participant: participant.address,
                marketId: marketId,
                amount: ethers.parseEther("100"),
                nonce: 101,
                deadline: (await ethers.provider.getBlock('latest')).timestamp + 3600
            };

            const signature = await participant.signTypedData(domain, mergeIntentTypes, intent);

            const initialCollateral = await collateralToken.balanceOf(participant.address);
            const initialPass = await ctf1155.balanceOf(participant.address, passPositionId);
            const initialFail = await ctf1155.balanceOf(participant.address, failPositionId);

            await intentHandler.connect(executor).executeMergeIntent(intent, signature);

            // Verify position tokens were burned
            expect(await ctf1155.balanceOf(participant.address, passPositionId)).to.equal(initialPass - intent.amount);
            expect(await ctf1155.balanceOf(participant.address, failPositionId)).to.equal(initialFail - intent.amount);
            
            // Verify collateral was returned
            expect(await collateralToken.balanceOf(participant.address)).to.equal(initialCollateral + intent.amount);
        });

        it("Should reject merge intent with invalid signature", async function () {
            const intent = {
                participant: participant.address,
                marketId: marketId,
                amount: ethers.parseEther("100"),
                nonce: 102,
                deadline: (await ethers.provider.getBlock('latest')).timestamp + 3600
            };

            // Sign with wrong signer
            const signature = await executor.signTypedData(domain, mergeIntentTypes, intent);

            await expect(
                intentHandler.connect(executor).executeMergeIntent(intent, signature)
            ).to.be.revertedWithCustomError(intentHandler, "InvalidSignature");
        });
    });

    describe("Nonce Invalidation", function () {
        it("Should invalidate a nonce", async function () {
            const nonce = 999;
            
            expect(await intentHandler.isNonceUsed(participant.address, nonce)).to.be.false;
            
            await intentHandler.connect(participant).invalidateNonce(nonce);
            
            expect(await intentHandler.isNonceUsed(participant.address, nonce)).to.be.true;
        });

        it("Should batch invalidate nonces", async function () {
            const nonces = [1001, 1002, 1003, 1004, 1005];
            
            await intentHandler.connect(participant).batchInvalidateNonces(nonces);
            
            for (const nonce of nonces) {
                expect(await intentHandler.isNonceUsed(participant.address, nonce)).to.be.true;
            }
        });

        it("Should reject intent after nonce invalidation", async function () {
            const nonce = 2000;
            
            // Invalidate nonce first
            await intentHandler.connect(participant).invalidateNonce(nonce);
            
            // Try to use invalidated nonce
            const intent = {
                participant: participant.address,
                marketId: marketId,
                amount: ethers.parseEther("100"),
                nonce: nonce,
                deadline: (await ethers.provider.getBlock('latest')).timestamp + 3600
            };

            const signature = await participant.signTypedData(domain, splitIntentTypes, intent);

            await expect(
                intentHandler.connect(executor).executeSplitIntent(intent, signature)
            ).to.be.revertedWithCustomError(intentHandler, "NonceAlreadyUsed");
        });
    });

    describe("Admin Functions", function () {
        it("Should set trusted executor", async function () {
            expect(await intentHandler.trustedExecutors(executor.address)).to.be.false;
            
            await intentHandler.connect(owner).setTrustedExecutor(executor.address, true);
            
            expect(await intentHandler.trustedExecutors(executor.address)).to.be.true;
        });

        it("Should update market factory", async function () {
            const newFactory = participant.address; // Just for test
            
            await intentHandler.connect(owner).setMarketFactory(newFactory);
            
            expect(await intentHandler.marketFactory()).to.equal(newFactory);
        });

        it("Should reject admin functions from non-owner", async function () {
            await expect(
                intentHandler.connect(participant).setTrustedExecutor(executor.address, true)
            ).to.be.reverted;
        });
    });

    describe("Hash Functions", function () {
        it("Should correctly hash trade intent", async function () {
            const intent = {
                participant: participant.address,
                marketId: marketId,
                buyPass: true,
                amount: ethers.parseEther("100"),
                isBuy: true,
                minAmountOut: ethers.parseEther("90"),
                nonce: 1,
                deadline: (await ethers.provider.getBlock('latest')).timestamp + 3600
            };

            const hash = await intentHandler.hashTradeIntent(intent);
            expect(hash).to.not.equal(ethers.ZeroHash);
        });

        it("Should correctly hash split intent", async function () {
            const intent = {
                participant: participant.address,
                marketId: marketId,
                amount: ethers.parseEther("100"),
                nonce: 1,
                deadline: (await ethers.provider.getBlock('latest')).timestamp + 3600
            };

            const hash = await intentHandler.hashSplitIntent(intent);
            expect(hash).to.not.equal(ethers.ZeroHash);
        });

        it("Should correctly hash merge intent", async function () {
            const intent = {
                participant: participant.address,
                marketId: marketId,
                amount: ethers.parseEther("100"),
                nonce: 1,
                deadline: (await ethers.provider.getBlock('latest')).timestamp + 3600
            };

            const hash = await intentHandler.hashMergeIntent(intent);
            expect(hash).to.not.equal(ethers.ZeroHash);
        });

        it("Should correctly hash redeem intent", async function () {
            const intent = {
                participant: participant.address,
                marketId: marketId,
                indexSets: [1, 2],
                nonce: 1,
                deadline: (await ethers.provider.getBlock('latest')).timestamp + 3600
            };

            const hash = await intentHandler.hashRedeemIntent(intent);
            expect(hash).to.not.equal(ethers.ZeroHash);
        });
    });

    describe("Gas Efficiency", function () {
        it("Should efficiently execute split intent", async function () {
            const intent = {
                participant: participant.address,
                marketId: marketId,
                amount: ethers.parseEther("100"),
                nonce: 9999,
                deadline: (await ethers.provider.getBlock('latest')).timestamp + 3600
            };

            const signature = await participant.signTypedData(domain, splitIntentTypes, intent);

            const tx = await intentHandler.connect(executor).executeSplitIntent(intent, signature);
            const receipt = await tx.wait();

            console.log("      Gas used for split intent execution:", receipt.gasUsed.toString());
            
            // Should be under 300k gas
            expect(receipt.gasUsed < 300000n).to.be.true;
        });
    });

    describe("Signature Security", function () {
        it("Should prevent signature replay across different nonces", async function () {
            const intent1 = {
                participant: participant.address,
                marketId: marketId,
                amount: ethers.parseEther("50"),
                nonce: 3001,
                deadline: (await ethers.provider.getBlock('latest')).timestamp + 3600
            };

            const intent2 = {
                ...intent1,
                nonce: 3002
            };

            const signature1 = await participant.signTypedData(domain, splitIntentTypes, intent1);

            // Execute first intent
            await intentHandler.connect(executor).executeSplitIntent(intent1, signature1);

            // Try to use same signature with different nonce (should fail)
            await expect(
                intentHandler.connect(executor).executeSplitIntent(intent2, signature1)
            ).to.be.revertedWithCustomError(intentHandler, "InvalidSignature");
        });

        it("Should prevent signature replay across different amounts", async function () {
            const intent1 = {
                participant: participant.address,
                marketId: marketId,
                amount: ethers.parseEther("50"),
                nonce: 4001,
                deadline: (await ethers.provider.getBlock('latest')).timestamp + 3600
            };

            const intent2 = {
                ...intent1,
                amount: ethers.parseEther("100")
            };

            const signature1 = await participant.signTypedData(domain, splitIntentTypes, intent1);

            // Try to modify amount with original signature (should fail)
            await expect(
                intentHandler.connect(executor).executeSplitIntent(intent2, signature1)
            ).to.be.revertedWithCustomError(intentHandler, "InvalidSignature");
        });
    });
});
