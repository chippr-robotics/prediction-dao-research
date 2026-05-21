# ETCSwap v3 Integration

This directory contains the production-ready integration of ETCSwap v3 (Uniswap v3 fork) for prediction market trading on Ethereum Classic.

## Overview

The ETCSwap v3 integration provides decentralized trading infrastructure for conditional tokens (PASS/FAIL) through concentrated liquidity pools. This enables:

- **Capital Efficient Trading**: 3-5x better capital efficiency compared to LMSR
- **Community Liquidity**: Permissionless liquidity provision
- **Multiple Fee Tiers**: 0.05%, 0.3%, and 1% fee options
- **Slippage Protection**: Built-in minimum output guarantees
- **Production Ready**: Comprehensive error handling, events, and safety mechanisms

## Architecture

### Core Components

1. **ETCSwapV3Integration** (`contracts/ETCSwapV3Integration.sol`)
   - Main integration contract
   - Handles pool creation, liquidity management, and trading
   - Owner-only admin functions
   - Emergency pause mechanism

2. **ConditionalMarketFactory** (`contracts/ConditionalMarketFactory.sol`)
   - Updated to support ETCSwap trading
   - Falls back to LMSR when ETCSwap is disabled
   - Maintains backward compatibility

3. **Uniswap V3 Interfaces** (`contracts/interfaces/uniswap-v3/`)
   - IUniswapV3Factory
   - IUniswapV3Pool
   - ISwapRouter
   - INonfungiblePositionManager

4. **Mock Contracts** (`contracts/mocks/uniswap-v3/`)
   - Full testing infrastructure
   - Simulates V3 behavior without complexity
   - Used for comprehensive test coverage

## Usage

### Deployment

```javascript
// Deploy ETCSwap v3 infrastructure (or use existing deployment)
const factory = await ethers.getContractAt("IUniswapV3Factory", FACTORY_ADDRESS);
const swapRouter = await ethers.getContractAt("ISwapRouter", ROUTER_ADDRESS);
const positionManager = await ethers.getContractAt("INonfungiblePositionManager", POSITION_MANAGER_ADDRESS);

// Deploy ETCSwapV3Integration
const ETCSwapV3Integration = await ethers.getContractFactory("ETCSwapV3Integration");
const integration = await ETCSwapV3Integration.deploy(
    factory.address,
    swapRouter.address,
    positionManager.address
);

// Configure market factory
const marketFactory = await ethers.getContractAt("ConditionalMarketFactory", MARKET_FACTORY_ADDRESS);
await marketFactory.setETCSwapIntegration(integration.address, true);
```

### Creating Markets with ETCSwap Pools

```javascript
// 1. Create prediction market
const marketTx = await marketFactory.deployMarketPair(
    proposalId,
    collateralToken.address,
    liquidityAmount,
    liquidityParameter,
    tradingPeriod
);
const receipt = await marketTx.wait();
const marketId = getMarketIdFromReceipt(receipt);

// 2. Create ETCSwap pools
const fee = 3000; // 0.3%
const initialSqrtPrice = "79228162514264337593543950336"; // sqrt(0.5) in Q64.96
await marketFactory.createETCSwapPools(marketId, initialSqrtPrice, fee);

// 3. Add liquidity (optional - market creator or community)
await integration.addLiquidity(
    marketId,
    passToken.address,
    failToken.address,
    collateralToken.address,
    passAmount,
    failAmount,
    collateralAmountPass,
    collateralAmountFail,
    tickLower,
    tickUpper,
    deadline
);
```

### Trading

```javascript
// Buy PASS tokens
const buyAmount = ethers.parseUnits("100", 6); // 100 USDC
await collateralToken.approve(marketFactory.address, buyAmount);
await marketFactory.buyTokens(marketId, true, buyAmount);

// Sell PASS tokens
const sellAmount = ethers.parseUnits("50", 6); // 50 PASS tokens
await passToken.approve(marketFactory.address, sellAmount);
await marketFactory.sellTokens(marketId, true, sellAmount);
```

### Quote Functions

```javascript
// Get estimated output for buying
const collateralAmount = ethers.parseUnits("100", 6);
const estimatedTokens = await integration.quoteBuyTokens(marketId, true, collateralAmount);

// Get estimated output for selling
const tokenAmount = ethers.parseUnits("100", 6);
const estimatedCollateral = await integration.quoteSellTokens(marketId, true, tokenAmount);

// Calculate minimum output with slippage
const slippage = 50; // 0.5%
const minOutput = await integration.calculateMinOutput(estimatedTokens, slippage);
```

### Admin Functions

```javascript
// Update default slippage tolerance
await integration.setDefaultSlippage(100); // 1%

// Emergency pause
await integration.togglePause();

// Collect fees from liquidity positions
await integration.collectFees(marketId, recipient.address);

// Get pool information
const [passPool, failPool] = await integration.getMarketPools(marketId);
const [sqrtPrice, tick] = await integration.getPoolPrice(marketId, true);
```

## Configuration

### Fee Tiers

- **LOW_FEE (500)**: 0.05% - For stable/obvious outcome markets
- **DEFAULT_FEE (3000)**: 0.3% - Standard uncertainty markets
- **HIGH_FEE (10000)**: 1% - High volatility/speculation markets

### Slippage Protection

- Default: 0.5% (50 basis points)
- Maximum: 10% (1000 basis points)
- Configurable per trade or contract-wide

### Price Format

Initial pool prices use Uniswap V3's Q64.96 fixed-point format:
- `sqrtPriceX96 = sqrt(price) * 2^96`
- Example: `79228162514264337593543950336` = sqrt(0.5)

## Testing

### Run Unit Tests

```bash
npm test test/ETCSwapV3Integration.test.js
```

### Run Integration Tests

```bash
npm test test/integration/etcswap/etcswap-trading.test.js
```

### Run All Tests

```bash
npm test
```

## Security Features

1. **ReentrancyGuard**: Protection against reentrancy attacks
2. **Ownable**: Admin functions restricted to owner
3. **Emergency Pause**: Circuit breaker for critical issues
4. **Slippage Protection**: Minimum output guarantees on all trades
5. **Input Validation**: Comprehensive parameter checking
6. **SafeERC20**: Safe token transfer operations
7. **Custom Errors**: Gas-efficient error handling

## Events

All major operations emit events for off-chain tracking:

- `PoolsCreated`: Pool creation
- `LiquidityAdded/Removed`: Liquidity management
- `TokensSwapped`: Trade execution
- `SlippageUpdated`: Configuration changes
- `EmergencyPauseToggled`: Security actions
- `FeesCollected`: Fee collection

## Gas Optimization

- Use of custom errors instead of require strings
- Efficient storage layout
- Batch operations where possible
- Unchecked arithmetic in loops (where safe)

## Compatibility

- **Solidity**: ^0.8.24
- **ETCSwap v3**: Based on Uniswap v3
- **OpenZeppelin**: v5.4.0
- **Hardhat**: ^2.22.0
- **Ethers.js**: ^6.16.0

## Production Deployment Checklist

- [ ] Verify ETCSwap v3 contracts are deployed on target network
- [ ] Deploy ETCSwapV3Integration with correct addresses
- [ ] Verify contract on block explorer
- [ ] Set up monitoring for events
- [ ] Configure initial slippage tolerance
- [ ] Test with small amounts first
- [ ] Document pool addresses
- [ ] Set up alerting for emergency pause
- [ ] Conduct security audit
- [ ] Prepare incident response plan

## Known Limitations

1. **ERC20 Collateral Only**: ETCSwap integration requires ERC20 collateral tokens (not native ETH)
2. **Gas Costs**: V3 swaps are more expensive than LMSR (~150-300k gas vs ~100k gas)
3. **Liquidity Requirements**: Pools need sufficient liquidity for efficient trading
4. **Price Impact**: Large trades may experience significant price impact in thin pools

## Fallback Mode

When ETCSwap is disabled or not configured, the contract automatically falls back to simplified LMSR mode for backward compatibility. This allows:

- Testing without V3 infrastructure
- Emergency trading if V3 has issues
- Gradual migration from LMSR to V3

## References

- [ETCSwap v3 SDK](https://github.com/etcswap/v3-sdk)
- [Uniswap V3 Documentation](https://docs.uniswap.org/contracts/v3/overview)
- [Uniswap V3 Whitepaper](https://uniswap.org/whitepaper-v3.pdf)
- [Architecture Documentation](../../docs/research/etcswap-v3-integration-analysis.md)

## Support

For issues, questions, or contributions:

1. Check existing tests for usage examples
2. Review architecture documentation
3. Open an issue on GitHub
4. Refer to ETCSwap v3 documentation

## License

Apache-2.0
