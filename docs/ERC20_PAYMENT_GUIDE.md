# ERC20 Payment Support for Friend Markets

## Overview

Friend group markets now support ERC20 token payments for membership fees, market creation fees, and market liquidity contributions. This enables users to transact in stablecoins (USDC, USDT) and other ERC20 tokens, providing price stability and broader accessibility.

## Key Features

### 1. Multi-Token Support
- **Native ETC**: Original payment method (address(0))
- **USDC**: USD Coin stablecoin support
- **USDT**: Tether USD stablecoin support
- **WETC**: Wrapped ETC support
- **Custom tokens**: Any ERC20 token approved by managers

### 2. Use Cases

#### Membership Payments (via TieredRoleManager)
Users can purchase FRIEND_MARKET_ROLE memberships using any accepted ERC20 token:

```solidity
// Purchase Bronze tier membership for 1 month using USDC
// Price: $50 USDC
tieredRoleManager.purchaseRoleWithTierAndDuration(
    FRIEND_MARKET_ROLE,
    MembershipTier.BRONZE,
    MembershipDuration.ONE_MONTH
    // Payment handled by MembershipPaymentManager
);
```

#### Market Creation (for non-members)
Non-members can pay market creation fees in ERC20 tokens:

```solidity
// Create market with USDC payment
friendMarketFactory.createOneVsOneMarket(
    opponent,
    "Lakers vs Warriors",
    1 days,
    arbitrator,
    0,                    // No pegging
    USDC_ADDRESS,         // Payment token
    100_000000            // $100 USDC (6 decimals)
);
```

#### Market Liquidity Contributions
Add liquidity to markets in any accepted token:

```solidity
// Contribute $500 USDT to market liquidity
friendMarketFactory.createSmallGroupMarket(
    "Office Pool 2024",
    [alice, bob, carol],
    10,
    90 days,
    address(0),
    publicMarketId,
    USDT_ADDRESS,         // Liquidity token
    500_000000            // $500 USDT (6 decimals)
);
```

## Architecture

### Contract Integration

```
┌─────────────────────────────────────┐
│   FriendGroupMarketFactory          │
│   - Manages accepted tokens         │
│   - Handles market creation         │
│   - Processes ERC20 transfers       │
└──────────────┬──────────────────────┘
               │
               │ uses
               ↓
┌─────────────────────────────────────┐
│   MembershipPaymentManager          │
│   - Multi-token payment processing  │
│   - Price management per token      │
│   - Payment routing to treasury     │
└──────────────┬──────────────────────┘
               │
               │ integrates with
               ↓
┌─────────────────────────────────────┐
│   TieredRoleManager                 │
│   - FRIEND_MARKET_ROLE management   │
│   - Tier-based allocations          │
│   - Membership duration tracking    │
└─────────────────────────────────────┘
```

### Payment Flow

**For Members (Gas-Only):**
1. User purchases membership with USDC/USDT → TieredRoleManager
2. MembershipPaymentManager processes ERC20 payment
3. User creates markets paying only gas fees
4. Optional: Add liquidity in any accepted token

**For Non-Members:**
1. User approves FriendGroupMarketFactory to spend ERC20 tokens
2. User calls create market function with token address and amount
3. Contract transfers ERC20 tokens from user
4. Market created with ERC20 liquidity

## Configuration Management

### Adding Payment Tokens (Manager/Owner)

```solidity
// Add USDC as accepted payment token
friendMarketFactory.addAcceptedPaymentToken(
    0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48,  // USDC address
    true                                          // Active
);

// Add USDT
friendMarketFactory.addAcceptedPaymentToken(
    0xdAC17F958D2ee523a2206206994597C13D831ec7,  // USDT address
    true                                          // Active
);
```

### Setting Token Prices (via MembershipPaymentManager)

```solidity
// Set FRIEND_MARKET_ROLE prices in multiple tokens
address[] memory tokens = [USDC_ADDRESS, USDT_ADDRESS, WETC_ADDRESS];
uint256[] memory prices = [
    50_000000,    // $50 USDC (6 decimals)
    50_000000,    // $50 USDT (6 decimals)
    1_000000000000000000  // 1 WETC (18 decimals)
];

paymentManager.setRolePrices(
    FRIEND_MARKET_ROLE,
    tokens,
    prices
);
```

### Removing Payment Tokens

```solidity
// Deactivate a payment token
friendMarketFactory.removeAcceptedPaymentToken(TOKEN_ADDRESS);

// Or set to inactive
friendMarketFactory.addAcceptedPaymentToken(TOKEN_ADDRESS, false);
```

## Price Display in USD

### Frontend Integration with ETCSwap Oracle

```javascript
// Get token price in USD from ETCSwap
async function getTokenPriceUSD(tokenAddress, amount) {
  const etcSwap = await ethers.getContractAt("ETCSwapV3Integration", ETCSWAP_ADDRESS);
  
  // Get exchange rate from ETCSwap pool
  const quote = await etcSwap.getQuote(
    tokenAddress,
    USD_REFERENCE_TOKEN,  // USDC or other USD stablecoin
    amount
  );
  
  return quote.amountOut;
}

// Display membership price in USD
async function displayMembershipPrice(tier) {
  const prices = await tieredRoleManager.getTierMetadata(FRIEND_MARKET_ROLE, tier);
  const etcPrice = prices.price;
  
  // Convert to USD
  const usdPrice = await getTokenPriceUSD(ADDRESS_ZERO, etcPrice);
  
  // Display: "$50.00 USD"
  return `$${(usdPrice / 1e6).toFixed(2)} USD`;
}

// Display gas cost in USD
async function displayGasCostUSD(gasUsed) {
  const gasPrice = await provider.getGasPrice();
  const gasCostETC = gasUsed.mul(gasPrice);
  
  // Convert to USD
  const usdCost = await getTokenPriceUSD(ADDRESS_ZERO, gasCostETC);
  
  // Display: "~$2.50 USD gas"
  return `~$${(usdCost / 1e6).toFixed(2)} USD gas`;
}
```

### Showing Prices to Users

**Best Practices:**
- **Always show USD prices first**: `$50 USD` not `0.05 ETC`
- **Show token equivalents**: `$50 USD (50 USDC or 50 USDT)`
- **Display gas in USD**: `Transaction cost: ~$2.50 USD gas`
- **Update prices dynamically**: Fetch live rates from ETCSwap
- **Warn about volatility**: If using ETC, show USD equivalent may change

**Example UI:**

```
┌────────────────────────────────────────┐
│  Create Friend Market                  │
├────────────────────────────────────────┤
│  Membership: Bronze Tier               │
│  Price: $50.00 USD/month              │
│                                        │
│  Pay with:                             │
│  ○ USDC  (50.00 USDC)                 │
│  ○ USDT  (50.00 USDT)                 │
│  ○ ETC   (~0.05 ETC)  ⚠️ Price varies │
│                                        │
│  Market Creation: FREE for members     │
│  Gas Cost: ~$2.50 USD                  │
│                                        │
│  [Purchase Membership & Create Market] │
└────────────────────────────────────────┘
```

## Security Considerations

### Token Approval
Users must approve the contract to spend their ERC20 tokens:

```javascript
// User approves USDC spending
const usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS);
await usdc.approve(friendMarketFactory.address, amount);

// Then create market
await friendMarketFactory.createOneVsOneMarket(...);
```

### SafeERC20
The contract uses OpenZeppelin's SafeERC20 library for secure transfers:
- Handles tokens with/without return values
- Reverts on failed transfers
- Protects against reentrancy

### Accepted Token List
- Only manager or owner can add tokens
- Prevents malicious token additions
- Native ETC (address(0)) always accepted
- Cannot remove native ETC support

## Testing Checklist

### Unit Tests Needed
- [ ] Add USDC as payment token
- [ ] Add USDT as payment token
- [ ] Remove payment token
- [ ] Purchase membership with USDC
- [ ] Purchase membership with USDT
- [ ] Create market with USDC liquidity
- [ ] Create market with USDT liquidity
- [ ] Mixed ETC/ERC20 markets
- [ ] Token approval requirements
- [ ] Insufficient token balance handling
- [ ] Invalid token rejection
- [ ] Manager-only token management

### Integration Tests Needed
- [ ] Complete membership purchase flow with stablecoins
- [ ] Market creation with ERC20 from start to finish
- [ ] Multi-token liquidity contributions
- [ ] USD price display from ETCSwap
- [ ] Gas cost calculation in USD
- [ ] Token whitelist management by managers

## Migration Guide

### For Existing Markets
Existing markets created with native ETC continue to work:
- No changes required
- Can still add ETC liquidity
- Fully backwards compatible

### Adding Stablecoin Support
1. Deploy/identify USDC and USDT contracts on ETC Classic
2. Add tokens to FriendGroupMarketFactory:
   ```solidity
   addAcceptedPaymentToken(USDC_ADDRESS, true);
   addAcceptedPaymentToken(USDT_ADDRESS, true);
   ```
3. Configure prices in MembershipPaymentManager:
   ```solidity
   setRolePrice(FRIEND_MARKET_ROLE, USDC_ADDRESS, 50_000000);
   setRolePrice(FRIEND_MARKET_ROLE, USDT_ADDRESS, 50_000000);
   ```
4. Update frontend to display USD prices
5. Test thoroughly on testnet

## FAQ

**Q: Can I use any ERC20 token?**
A: No, only tokens approved by FairWins managers. This prevents malicious token use.

**Q: What happens if I send the wrong token?**
A: The transaction will revert with "Payment token not accepted" error.

**Q: How are prices set?**
A: Managers set prices in USD terms for stablecoins (e.g., 50 USDC = $50 USD). ETC prices are converted to USD via ETCSwap oracle.

**Q: Can I mix ETC and stablecoins?**
A: Yes, you can pay membership in USDC and add market liquidity in USDT or ETC.

**Q: What about gas fees?**
A: Gas fees are always paid in native ETC, but displayed in USD equivalent to users.

**Q: Are there different fees for different tokens?**
A: No, USD-equivalent pricing ensures fair pricing regardless of token choice.

**Q: How do I know which tokens are accepted?**
A: Call `getAcceptedTokens()` to see the list, or check the frontend UI.

**Q: What if a stablecoin loses its peg?**
A: Managers can remove tokens from the accepted list. Users should monitor stablecoin health.

## Benefits Summary

✅ **Price Stability**: Pay in USD-pegged stablecoins, no ETC volatility exposure
✅ **Accessibility**: Users without ETC can participate using USDC/USDT
✅ **Professional UX**: All prices shown in familiar USD terms
✅ **Treasury Management**: Platform receives stable assets for operations
✅ **International**: No currency conversion needed, USD is universal
✅ **Future-Proof**: Easy to add new tokens as ecosystem grows
✅ **Compliance**: Easier reporting and accounting in USD terms

## Support

For questions or issues with ERC20 payments:
- Check accepted tokens: `friendMarketFactory.getAcceptedTokens()`
- Verify token approval: `token.allowance(yourAddress, factoryAddress)`
- Review transaction logs for payment events
- Contact FairWins support with transaction hash

## References

- [OpenZeppelin SafeERC20](https://docs.openzeppelin.com/contracts/4.x/api/token/erc20#SafeERC20)
- [MembershipPaymentManager Contract](../contracts/MembershipPaymentManager.sol)
- [FriendGroupMarketFactory Contract](../contracts/FriendGroupMarketFactory.sol)
- [TieredRoleManager Contract](../contracts/TieredRoleManager.sol)
- [ETCSwap Integration](../contracts/ETCSwapV3Integration.sol)
