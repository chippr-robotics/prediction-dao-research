import { expect } from "chai";
import hre from "hardhat";
import { BetType } from "../../constants/BetType.js";

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

let loadFixture;

describe("Integration: ETCSwap V3 Trading", function () {
    let ethers;

    async function deployETCSwapFixture() {
        const connection = await hre.network.connect();
        ethers = connection.ethers;
        loadFixture = connection.networkHelpers.loadFixture;
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

        // Deploy CTF1155 (required for ConditionalMarketFactory)
        const CTF1155 = await ethers.getContractFactory("CTF1155");
        const ctf1155 = await CTF1155.deploy();
        await ctf1155.waitForDeployment();

        // Deploy ConditionalMarketFactory
        const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
        const marketFactory = await ConditionalMarketFactory.deploy();
        await marketFactory.initialize(owner.address);
        
        // Set CTF1155 in market factory (required for market creation)
        await marketFactory.setCTF1155(await ctf1155.getAddress());

        // Deploy mock collateral token (USDC)
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const collateralToken = await MockERC20.deploy("USDC", "USDC", ethers.parseUnits("1000000", 6));

        // Fund accounts with collateral
        await collateralToken.transfer(liquidityProvider.address, ethers.parseUnits("100000", 6));
        await collateralToken.transfer(trader1.address, ethers.parseUnits("10000", 6));
        await collateralToken.transfer(trader2.address, ethers.parseUnits("10000", 6));

        return {
            contracts: { marketFactory, etcSwapIntegration, factory, swapRouter, positionManager, collateralToken, ctf1155 },
            accounts: { owner, liquidityProvider, trader1, trader2 }
        };
    }

    describe("Complete Trading Flow", function () {
        it.skip("Should execute full ETCSwap trading lifecycle (PENDING: needs ERC1155-to-ERC20 wrapper)", async function () {
            const { contracts, accounts } = await loadFixture(deployETCSwapFixture);
            const { marketFactory, etcSwapIntegration, collateralToken, ctf1155 } = contracts;
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
            const passPositionId = market.passPositionId;
            const failPositionId = market.failPositionId;
            console.log(`  ✓ Market ${marketId} created`);
            console.log(`  ✓ PASS position ID: ${passPositionId}`);
            console.log(`  ✓ FAIL position ID: ${failPositionId}`);

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
            
            // Split collateral into position tokens via CTF1155
            const splitAmount = ethers.parseUnits("5000", 6);
            await collateralToken.connect(liquidityProvider).approve(
                await ctf1155.getAddress(),
                splitAmount
            );
            
            // Split collateral into both PASS and FAIL positions
            await ctf1155.connect(liquidityProvider).splitPosition(
                await collateralToken.getAddress(),
                ethers.ZeroHash, // Parent collection ID (empty for base collateral)
                market.conditionId,
                [1, 2], // Binary outcomes
                splitAmount
            );
            
            console.log(`  ✓ Split ${ethers.formatUnits(splitAmount, 6)} collateral into positions`);
            
            // Verify positions received
            const passBalance = await ctf1155.balanceOf(liquidityProvider.address, passPositionId);
            const failBalance = await ctf1155.balanceOf(liquidityProvider.address, failPositionId);
            console.log(`  ✓ Received ${ethers.formatUnits(passBalance, 6)} PASS position tokens`);
            console.log(`  ✓ Received ${ethers.formatUnits(failBalance, 6)} FAIL position tokens`);

            // Approve CTF1155 for position manager (ERC1155 approval)
            await ctf1155.connect(liquidityProvider).setApprovalForAll(
                await etcSwapIntegration.getAddress(),
                true
            );
            await collateralToken.connect(liquidityProvider).approve(
                await etcSwapIntegration.getAddress(),
                liquidityAmount
            );

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
            // For CTF1155, position tokens are ERC1155, but pools need ERC20-like interface
            // In a real implementation, position tokens would be wrapped or handled differently
            // For now, we skip pool funding since mock pools don't actually need tokens
            console.log("  ✓ PASS pool configured");
            console.log("  ✓ FAIL pool configured");
            console.log("  ⚠ Note: CTF1155 uses ERC1155 tokens, pool integration needs adapter");

            // Step 6: Execute buy trade
            console.log("\nStep 6: Execute buy trade");
            const buyAmount = ethers.parseUnits("100", 6);
            
            // Approve market factory to spend collateral
            await collateralToken.connect(trader1).approve(
                await marketFactory.getAddress(),
                buyAmount
            );

            const balanceBefore = await ctf1155.balanceOf(trader1.address, passPositionId);
            console.log(`  Trader balance before: ${ethers.formatUnits(balanceBefore, 6)} PASS`);

            // Buy PASS tokens (will use CTF1155 split/merge internally)
            const buyTx = await marketFactory.connect(trader1).buyTokens(
                marketId,
                true, // buy PASS
                buyAmount
            );
            await buyTx.wait();

            const balanceAfter = await ctf1155.balanceOf(trader1.address, passPositionId);
            const tokensPurchased = balanceAfter - balanceBefore;
            console.log(`  ✓ Purchased ${ethers.formatUnits(tokensPurchased, 6)} PASS tokens`);
            console.log(`  ✓ Cost: ${ethers.formatUnits(buyAmount, 6)} USDC`);

            expect(tokensPurchased).to.be.gt(0);

            // Step 7: Execute sell trade
            console.log("\nStep 7: Execute sell trade");
            const sellAmount = tokensPurchased / 2n; // Sell half

            // Approve CTF1155 for market factory (ERC1155 approval)
            await ctf1155.connect(trader1).setApprovalForAll(
                await marketFactory.getAddress(),
                true
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
            const { marketFactory, collateralToken, ctf1155 } = contracts;
            const { owner, trader1 } = accounts;

            // Create market without enabling ETCSwap (use collateral token, not ETH)
            const proposalId = 1;
            const tradingPeriod = 14 * 24 * 3600;

            await marketFactory.deployMarketPair(
                proposalId,
                await collateralToken.getAddress(), // ERC20 collateral required for CTF
                ethers.parseUnits("1000", 6),
                1000,
                tradingPeriod,
                BetType.YesNo
            );

            const marketId = 0;
            const market = await marketFactory.getMarket(marketId);
            const passPositionId = market.passPositionId;

            // Buy tokens using fallback LMSR (with ERC20 collateral)
            const buyAmount = ethers.parseUnits("100", 6);
            
            // Approve collateral
            await collateralToken.connect(trader1).approve(
                await marketFactory.getAddress(),
                buyAmount
            );
            
            const balanceBefore = await ctf1155.balanceOf(trader1.address, passPositionId);

            await marketFactory.connect(trader1).buyTokens(marketId, true, buyAmount);

            const balanceAfter = await ctf1155.balanceOf(trader1.address, passPositionId);
            const tokensPurchased = balanceAfter - balanceBefore;

            expect(tokensPurchased).to.be.gt(0);
            console.log(`  ✓ Fallback LMSR: Purchased ${ethers.formatUnits(tokensPurchased, 6)} PASS tokens`);
        });
    });
});
