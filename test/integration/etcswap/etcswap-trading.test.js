const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { BetType } = require("../../constants/BetType");

/**
 * Integration tests for ETCSwap v3 trading through ConditionalMarketFactory
 * 
 * Tests the complete flow:
 * 1. Deploy market with conditional tokens
 * 2. Set up ETCSwap v3 integration
 * 3. Create pools
 * 4. Add liquidity
 * 5. Execute trades (buy/sell)
 * 6. Verify correct behavior
 */

describe("Integration: ETCSwap V3 Trading", function () {
    async function deployETCSwapFixture() {
        const [owner, liquidityProvider, trader1, trader2] = await ethers.getSigners();

        // Deploy mock Uniswap V3 infrastructure
        const MockUniswapV3Factory = await ethers.getContractFactory("MockUniswapV3Factory");
        const factory = await MockUniswapV3Factory.deploy();

        const MockSwapRouter = await ethers.getContractFactory("MockSwapRouter");
        const swapRouter = await MockSwapRouter.deploy(await factory.getAddress());

        const MockNonfungiblePositionManager = await ethers.getContractFactory("MockNonfungiblePositionManager");
        const positionManager = await MockNonfungiblePositionManager.deploy(await factory.getAddress());

        // Deploy ETCSwapV3Integration
        const ETCSwapV3Integration = await ethers.getContractFactory("ETCSwapV3Integration");
        const etcSwapIntegration = await ETCSwapV3Integration.deploy(
            await factory.getAddress(),
            await swapRouter.getAddress(),
            await positionManager.getAddress()
        );

        // Deploy ConditionalMarketFactory
        const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
        const marketFactory = await ConditionalMarketFactory.deploy();
        await marketFactory.initialize(owner.address);

        // Deploy mock collateral token (USDC)
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const collateralToken = await MockERC20.deploy("USDC", "USDC", ethers.parseUnits("1000000", 6));

        // Fund accounts with collateral
        await collateralToken.transfer(liquidityProvider.address, ethers.parseUnits("100000", 6));
        await collateralToken.transfer(trader1.address, ethers.parseUnits("10000", 6));
        await collateralToken.transfer(trader2.address, ethers.parseUnits("10000", 6));

        return {
            contracts: { marketFactory, etcSwapIntegration, factory, swapRouter, positionManager, collateralToken },
            accounts: { owner, liquidityProvider, trader1, trader2 }
        };
    }

    describe("Complete Trading Flow", function () {
        it("Should execute full ETCSwap trading lifecycle", async function () {
            const { contracts, accounts } = await loadFixture(deployETCSwapFixture);
            const { marketFactory, etcSwapIntegration, collateralToken } = contracts;
            const { owner, liquidityProvider, trader1 } = accounts;

            console.log("\n=== ETCSwap V3 Integration Test ===\n");

            // Step 1: Configure ETCSwap integration in market factory
            console.log("Step 1: Configure ETCSwap integration");
            
            // Transfer ownership of integration to market factory so it can create pools
            await etcSwapIntegration.transferOwnership(await marketFactory.getAddress());
            
            await marketFactory.setETCSwapIntegration(
                await etcSwapIntegration.getAddress(),
                true // Enable ETCSwap
            );
            expect(await marketFactory.useETCSwap()).to.equal(true);
            console.log("  ✓ ETCSwap integration configured");

            // Step 2: Create a prediction market
            console.log("\nStep 2: Create prediction market");
            const proposalId = 1;
            const liquidityAmount = ethers.parseUnits("1000", 6);
            const tradingPeriod = 14 * 24 * 3600; // 14 days

            const createTx = await marketFactory.deployMarketPair(
                proposalId,
                await collateralToken.getAddress(),
                liquidityAmount,
                1000,
                tradingPeriod,
          BetType.YesNo
            );
            await createTx.wait();

            const marketId = 0; // First market
            const market = await marketFactory.getMarket(marketId);
            console.log(`  ✓ Market ${marketId} created`);
            console.log(`  ✓ PASS token: ${market.passToken}`);
            console.log(`  ✓ FAIL token: ${market.failToken}`);

            // Step 3: Create ETCSwap pools for the market
            console.log("\nStep 3: Create ETCSwap pools");
            const fee = 3000; // 0.3%
            const initialSqrtPrice = "79228162514264337593543950336"; // sqrt(0.5) in Q64.96

            await marketFactory.createETCSwapPools(marketId, initialSqrtPrice, fee);
            const [passPool, failPool] = await etcSwapIntegration.getMarketPools(marketId);
            console.log(`  ✓ PASS pool created: ${passPool}`);
            console.log(`  ✓ FAIL pool created: ${failPool}`);

            // Step 4: Add liquidity to pools
            console.log("\nStep 4: Add liquidity to pools");
            
            // Get conditional tokens
            const ConditionalToken = await ethers.getContractFactory("ConditionalToken");
            const passToken = ConditionalToken.attach(market.passToken);
            const failToken = ConditionalToken.attach(market.failToken);

            // Mint initial tokens for liquidity provision (simplified for testing)
            const passAmount = ethers.parseUnits("1000", 6);
            const failAmount = ethers.parseUnits("1000", 6);
            await passToken.mint(liquidityProvider.address, passAmount);
            await failToken.mint(liquidityProvider.address, failAmount);
            console.log(`  ✓ Minted ${ethers.formatUnits(passAmount, 6)} PASS tokens`);
            console.log(`  ✓ Minted ${ethers.formatUnits(failAmount, 6)} FAIL tokens`);

            // Approve tokens for position manager
            await passToken.connect(liquidityProvider).approve(
                await etcSwapIntegration.getAddress(),
                passAmount
            );
            await failToken.connect(liquidityProvider).approve(
                await etcSwapIntegration.getAddress(),
                failAmount
            );
            await collateralToken.connect(liquidityProvider).approve(
                await etcSwapIntegration.getAddress(),
                liquidityAmount
            );

            // Add liquidity (simplified - in real scenario would use proper tick ranges)
            const tickLower = -887220; // Full range
            const tickUpper = 887220;
            const deadline = Math.floor(Date.now() / 1000) + 3600;

            // Note: In production, the market factory would have a method to add liquidity through integration
            // For testing, we'll skip the liquidity add step since we fund the pools directly
            console.log("  ✓ Skipping liquidity add (will fund pools directly)");

            // Step 5: Fund pools with tokens for swapping (mock requirement)
            console.log("\nStep 5: Fund pools for swapping");
            const MockUniswapV3Pool = await ethers.getContractFactory("MockUniswapV3Pool");
            const passPoolContract = MockUniswapV3Pool.attach(passPool);
            const failPoolContract = MockUniswapV3Pool.attach(failPool);

            // Set liquidity in mock pools
            await passPoolContract.setLiquidity(ethers.parseUnits("10000", 6));
            await failPoolContract.setLiquidity(ethers.parseUnits("10000", 6));

            // Fund pools with tokens in correct order (token0, token1)
            // Pools sort tokens by address, so we need to check the order
            const passPoolToken0 = await passPoolContract.token0();
            const passPoolToken1 = await passPoolContract.token1();
            const passTokenAddr = await passToken.getAddress();
            const collateralTokenAddr = await collateralToken.getAddress();
            
            await passToken.mint(owner.address, ethers.parseUnits("5000", 6));
            await collateralToken.transfer(owner.address, ethers.parseUnits("5000", 6));
            
            await passToken.connect(owner).approve(passPool, ethers.parseUnits("5000", 6));
            await collateralToken.connect(owner).approve(passPool, ethers.parseUnits("5000", 6));
            
            // Fund in correct token0/token1 order
            const passAmount0 = passPoolToken0.toLowerCase() === passTokenAddr.toLowerCase()
                ? ethers.parseUnits("2500", 6) // PASS is token0
                : ethers.parseUnits("2500", 6); // collateral is token0
            const passAmount1 = passPoolToken1.toLowerCase() === passTokenAddr.toLowerCase()
                ? ethers.parseUnits("2500", 6) // PASS is token1
                : ethers.parseUnits("2500", 6); // collateral is token1
            
            await passPoolContract.connect(owner).fundPool(passAmount0, passAmount1);
            console.log(`  ✓ PASS pool funded (token0: ${passPoolToken0}, token1: ${passPoolToken1})`);

            const failPoolToken0 = await failPoolContract.token0();
            const failPoolToken1 = await failPoolContract.token1();
            const failTokenAddr = await failToken.getAddress();
            
            await failToken.mint(owner.address, ethers.parseUnits("5000", 6));
            await collateralToken.connect(owner).approve(failPool, ethers.parseUnits("5000", 6));
            await failToken.connect(owner).approve(failPool, ethers.parseUnits("5000", 6));
            
            // Fund in correct token0/token1 order
            const failAmount0 = failPoolToken0.toLowerCase() === failTokenAddr.toLowerCase()
                ? ethers.parseUnits("2500", 6) // FAIL is token0
                : ethers.parseUnits("2500", 6); // collateral is token0
            const failAmount1 = failPoolToken1.toLowerCase() === failTokenAddr.toLowerCase()
                ? ethers.parseUnits("2500", 6) // FAIL is token1
                : ethers.parseUnits("2500", 6); // collateral is token1
            
            await failPoolContract.connect(owner).fundPool(failAmount0, failAmount1);
            console.log(`  ✓ FAIL pool funded (token0: ${failPoolToken0}, token1: ${failPoolToken1})`);

            // Step 6: Execute buy trade
            console.log("\nStep 6: Execute buy trade");
            const buyAmount = ethers.parseUnits("100", 6);
            
            // Approve market factory to spend collateral
            await collateralToken.connect(trader1).approve(
                await marketFactory.getAddress(),
                buyAmount
            );

            const balanceBefore = await passToken.balanceOf(trader1.address);
            console.log(`  Trader balance before: ${ethers.formatUnits(balanceBefore, 6)} PASS`);

            // Buy PASS tokens
            const buyTx = await marketFactory.connect(trader1).buyTokens(
                marketId,
                true, // buy PASS
                buyAmount
            );
            await buyTx.wait();

            const balanceAfter = await passToken.balanceOf(trader1.address);
            const tokensPurchased = balanceAfter - balanceBefore;
            console.log(`  ✓ Purchased ${ethers.formatUnits(tokensPurchased, 6)} PASS tokens`);
            console.log(`  ✓ Cost: ${ethers.formatUnits(buyAmount, 6)} USDC`);

            expect(tokensPurchased).to.be.gt(0);

            // Step 7: Execute sell trade
            console.log("\nStep 7: Execute sell trade");
            const sellAmount = tokensPurchased / 2n; // Sell half

            // Approve market factory to spend PASS tokens
            await passToken.connect(trader1).approve(
                await marketFactory.getAddress(),
                sellAmount
            );

            const collateralBefore = await collateralToken.balanceOf(trader1.address);

            const sellTx = await marketFactory.connect(trader1).sellTokens(
                marketId,
                true, // sell PASS
                sellAmount
            );
            await sellTx.wait();

            const collateralAfter = await collateralToken.balanceOf(trader1.address);
            const collateralReceived = collateralAfter - collateralBefore;
            console.log(`  ✓ Sold ${ethers.formatUnits(sellAmount, 6)} PASS tokens`);
            console.log(`  ✓ Received: ${ethers.formatUnits(collateralReceived, 6)} USDC`);

            expect(collateralReceived).to.be.gt(0);

            console.log("\n=== ETCSwap V3 Integration Test Complete ===\n");
        });

        it("Should handle fallback LMSR mode when ETCSwap is disabled", async function () {
            const { contracts, accounts } = await loadFixture(deployETCSwapFixture);
            const { marketFactory, collateralToken } = contracts;
            const { owner, trader1 } = accounts;

            // Create market without enabling ETCSwap
            const proposalId = 1;
            const tradingPeriod = 14 * 24 * 3600;

            await marketFactory.deployMarketPair(
                proposalId,
                ethers.ZeroAddress, // ETH as collateral for fallback
                ethers.parseEther("1"),
                1000,
                tradingPeriod,
          BetType.YesNo
            );

            const marketId = 0;
            const market = await marketFactory.getMarket(marketId);

            // Buy tokens using fallback LMSR (with ETH)
            const buyAmount = ethers.parseEther("0.1");
            
            const ConditionalToken = await ethers.getContractFactory("ConditionalToken");
            const passToken = ConditionalToken.attach(market.passToken);
            
            const balanceBefore = await passToken.balanceOf(trader1.address);

            await marketFactory.connect(trader1).buyTokens(marketId, true, buyAmount, {
                value: buyAmount
            });

            const balanceAfter = await passToken.balanceOf(trader1.address);
            const tokensPurchased = balanceAfter - balanceBefore;

            expect(tokensPurchased).to.be.gt(0);
            console.log(`  ✓ Fallback LMSR: Purchased ${ethers.formatEther(tokensPurchased)} PASS tokens`);
        });
    });
});
