import { expect } from "chai";
import hre from "hardhat";

describe("ETCSwapV3Integration", function () {
    let ethers;
    let integration;
    let factory;
    let swapRouter;
    let positionManager;
    let owner, user1, user2;
    let passToken, failToken, collateralToken;

    beforeEach(async function () {
        const connection = await hre.network.connect();
        ethers = connection.ethers;
        [owner, user1, user2] = await ethers.getSigners();

        // Deploy mock Uniswap V3 contracts
        const MockUniswapV3Factory = await ethers.getContractFactory("MockUniswapV3Factory");
        factory = await MockUniswapV3Factory.deploy();

        const MockSwapRouter = await ethers.getContractFactory("MockSwapRouter");
        swapRouter = await MockSwapRouter.deploy(await factory.getAddress());

        const MockNonfungiblePositionManager = await ethers.getContractFactory("MockNonfungiblePositionManager");
        positionManager = await MockNonfungiblePositionManager.deploy(await factory.getAddress());

        // Deploy ETCSwapV3Integration
        const ETCSwapV3Integration = await ethers.getContractFactory("ETCSwapV3Integration");
        integration = await ETCSwapV3Integration.deploy(
            await factory.getAddress(),
            await swapRouter.getAddress(),
            await positionManager.getAddress()
        );

        // Deploy mock tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        passToken = await MockERC20.deploy("PASS", "PASS", ethers.parseEther("1000000"));
        failToken = await MockERC20.deploy("FAIL", "FAIL", ethers.parseEther("1000000"));
        collateralToken = await MockERC20.deploy("USDC", "USDC", ethers.parseEther("1000000"));

        // Transfer tokens to users for testing
        await passToken.transfer(user1.address, ethers.parseEther("10000"));
        await failToken.transfer(user1.address, ethers.parseEther("10000"));
        await collateralToken.transfer(user1.address, ethers.parseEther("10000"));
        await collateralToken.transfer(user2.address, ethers.parseEther("10000"));
    });

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            expect(await integration.owner()).to.equal(owner.address);
        });

        it("Should set correct contract addresses", async function () {
            expect(await integration.factory()).to.equal(await factory.getAddress());
            expect(await integration.swapRouter()).to.equal(await swapRouter.getAddress());
            expect(await integration.positionManager()).to.equal(await positionManager.getAddress());
        });

        it("Should have correct default values", async function () {
            expect(await integration.defaultSlippageBps()).to.equal(50);
            expect(await integration.paused()).to.equal(false);
        });

        it("Should revert with invalid addresses", async function () {
            const ETCSwapV3Integration = await ethers.getContractFactory("ETCSwapV3Integration");
            
            await expect(
                ETCSwapV3Integration.deploy(ethers.ZeroAddress, await swapRouter.getAddress(), await positionManager.getAddress())
            ).to.be.revertedWithCustomError(integration, "InvalidAddress");
        });
    });

    describe("Pool Management", function () {
        it("Should create market pools", async function () {
            const marketId = 1;
            const fee = 3000; // 0.3%
            const initialSqrtPrice = 79228162514264337593543950336n; // Simplified initial price

            await expect(
                integration.createMarketPools(
                    marketId,
                    await passToken.getAddress(),
                    await failToken.getAddress(),
                    await collateralToken.getAddress(),
                    fee,
                    initialSqrtPrice
                )
            ).to.emit(integration, "PoolsCreated");

            const [passPool, failPool] = await integration.getMarketPools(marketId);
            expect(passPool).to.not.equal(ethers.ZeroAddress);
            expect(failPool).to.not.equal(ethers.ZeroAddress);
        });

        it("Should prevent creating duplicate pools", async function () {
            const marketId = 1;
            const fee = 3000;
            const initialSqrtPrice = 79228162514264337593543950336n;

            await integration.createMarketPools(
                marketId,
                await passToken.getAddress(),
                await failToken.getAddress(),
                await collateralToken.getAddress(),
                fee,
                initialSqrtPrice
            );

            await expect(
                integration.createMarketPools(
                    marketId,
                    await passToken.getAddress(),
                    await failToken.getAddress(),
                    await collateralToken.getAddress(),
                    fee,
                    initialSqrtPrice
                )
            ).to.be.revertedWithCustomError(integration, "PoolAlreadyExists");
        });

        it("Should only allow owner to create pools", async function () {
            const marketId = 1;
            const fee = 3000;
            const initialSqrtPrice = 79228162514264337593543950336n;

            await expect(
                integration.connect(user1).createMarketPools(
                    marketId,
                    await passToken.getAddress(),
                    await failToken.getAddress(),
                    await collateralToken.getAddress(),
                    fee,
                    initialSqrtPrice
                )
            ).to.be.revertedWithCustomError(integration, "OwnableUnauthorizedAccount");
        });

        it("Should reject invalid fee tiers", async function () {
            const marketId = 1;
            const invalidFee = 2500; // Not a standard fee
            const initialSqrtPrice = 79228162514264337593543950336n;

            await expect(
                integration.createMarketPools(
                    marketId,
                    await passToken.getAddress(),
                    await failToken.getAddress(),
                    await collateralToken.getAddress(),
                    invalidFee,
                    initialSqrtPrice
                )
            ).to.be.revertedWithCustomError(integration, "InvalidFee");
        });
    });

    describe("Quote Functions", function () {
        beforeEach(async function () {
            // Create pools for testing
            const marketId = 1;
            const fee = 3000;
            const initialSqrtPrice = 79228162514264337593543950336n;

            await integration.createMarketPools(
                marketId,
                await passToken.getAddress(),
                await failToken.getAddress(),
                await collateralToken.getAddress(),
                fee,
                initialSqrtPrice
            );
        });

        it("Should get quote for buying tokens", async function () {
            const marketId = 1;
            const collateralAmount = ethers.parseEther("100");

            const quote = await integration.quoteBuyTokens(marketId, true, collateralAmount);
            expect(quote).to.be.gt(0);
        });

        it("Should get quote for selling tokens", async function () {
            const marketId = 1;
            const tokenAmount = ethers.parseEther("100");

            const quote = await integration.quoteSellTokens(marketId, true, tokenAmount);
            expect(quote).to.be.gt(0);
        });

        it("Should revert quote for non-existent market", async function () {
            const marketId = 999;
            const amount = ethers.parseEther("100");

            await expect(
                integration.quoteBuyTokens(marketId, true, amount)
            ).to.be.revertedWithCustomError(integration, "PoolNotInitialized");
        });
    });

    describe("Admin Functions", function () {
        it("Should allow owner to set slippage", async function () {
            const newSlippage = 100; // 1%

            await expect(integration.setDefaultSlippage(newSlippage))
                .to.emit(integration, "SlippageUpdated")
                .withArgs(50, newSlippage);

            expect(await integration.defaultSlippageBps()).to.equal(newSlippage);
        });

        it("Should reject excessive slippage", async function () {
            const excessiveSlippage = 1001; // > 10%

            await expect(
                integration.setDefaultSlippage(excessiveSlippage)
            ).to.be.revertedWithCustomError(integration, "InvalidSlippage");
        });

        it("Should allow owner to toggle pause", async function () {
            expect(await integration.paused()).to.equal(false);

            await expect(integration.togglePause())
                .to.emit(integration, "EmergencyPauseToggled")
                .withArgs(true);

            expect(await integration.paused()).to.equal(true);

            await integration.togglePause();
            expect(await integration.paused()).to.equal(false);
        });

        it("Should prevent operations when paused", async function () {
            await integration.togglePause();

            const marketId = 1;
            const fee = 3000;
            const initialSqrtPrice = 79228162514264337593543950336n;

            await expect(
                integration.createMarketPools(
                    marketId,
                    await passToken.getAddress(),
                    await failToken.getAddress(),
                    await collateralToken.getAddress(),
                    fee,
                    initialSqrtPrice
                )
            ).to.be.revertedWithCustomError(integration, "ContractPaused");
        });
    });

    describe("Helper Functions", function () {
        it("Should calculate minimum output correctly", async function () {
            const amount = ethers.parseEther("100");
            const slippage = 50; // 0.5%

            const minOutput = await integration.calculateMinOutput(amount, slippage);
            const expected = (amount * 9950n) / 10000n; // 99.5% of input

            expect(minOutput).to.equal(expected);
        });

        it("Should revert with invalid slippage in calculateMinOutput", async function () {
            const amount = ethers.parseEther("100");
            const invalidSlippage = 10001;

            await expect(
                integration.calculateMinOutput(amount, invalidSlippage)
            ).to.be.revertedWithCustomError(integration, "InvalidSlippage");
        });
    });

    describe("Pool Price", function () {
        beforeEach(async function () {
            const marketId = 1;
            const fee = 3000;
            const initialSqrtPrice = 79228162514264337593543950336n;

            await integration.createMarketPools(
                marketId,
                await passToken.getAddress(),
                await failToken.getAddress(),
                await collateralToken.getAddress(),
                fee,
                initialSqrtPrice
            );
        });

        it("Should get pool price for PASS token", async function () {
            const marketId = 1;
            const [sqrtPrice, tick] = await integration.getPoolPrice(marketId, true);
            
            expect(sqrtPrice).to.be.gt(0);
            // tick might be 0 in our simplified mock
        });

        it("Should get pool price for FAIL token", async function () {
            const marketId = 1;
            const [sqrtPrice, tick] = await integration.getPoolPrice(marketId, false);
            
            expect(sqrtPrice).to.be.gt(0);
        });

        it("Should revert for non-existent market", async function () {
            const marketId = 999;

            await expect(
                integration.getPoolPrice(marketId, true)
            ).to.be.revertedWithCustomError(integration, "PoolNotInitialized");
        });
    });
});
