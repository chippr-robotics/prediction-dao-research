# Vault Smart Contracts Documentation

## Overview

The vault smart contracts provide secure, access-controlled management of treasury funds for DAOs and market collateral. They implement comprehensive security features including:

- **Access Control**: Role-based permissions with authorized spenders
- **Spending Limits**: Per-transaction and rate-limited spending controls
- **Emergency Controls**: Pause/unpause functionality with guardian oversight
- **Multi-Token Support**: Handle both ETH and ERC20 tokens
- **Transparent Accounting**: Complete event logging for all operations

## Contracts

### TreasuryVault

The `TreasuryVault` contract manages DAO treasury funds with sophisticated access control and spending limits.

#### Key Features

1. **Deposit Management**
   - Accepts ETH via `depositETH()` or `receive()` fallback
   - Accepts ERC20 tokens via `depositERC20()`
   - Emits `Deposit` events for all deposits

2. **Withdrawal Control**
   - Only authorized spenders or owner can withdraw
   - Enforces transaction limits (per-transaction caps)
   - Enforces rate limits (spending limits per time period)
   - Emits `Withdrawal` events with authorizer information

3. **Authorization Management**
   - Owner can authorize/revoke spenders
   - Owner is automatically authorized
   - Emits `SpenderAuthorized` and `SpenderRevoked` events

4. **Spending Limits**
   - Transaction limits: Maximum amount per single withdrawal
   - Rate limits: Maximum amount per time period (e.g., 100 ETH per day)
   - Independent limits for each token (ETH = address(0))
   - Automatic period reset after timeframe expires

5. **Emergency Controls**
   - Owner or Guardian can pause withdrawals
   - Only owner can unpause
   - Deposits remain enabled during pause
   - Guardian can be updated by owner

#### Usage Example

```solidity
// Deploy and initialize
TreasuryVault vault = new TreasuryVault();
vault.initialize(daoAddress);

// Deposit funds
vault.depositETH{value: 10 ether}();

// Authorize a spender
vault.authorizeSpender(governorAddress);

// Set spending limits
vault.setTransactionLimit(address(0), 5 ether); // Max 5 ETH per tx
vault.setRateLimit(address(0), 1 days, 20 ether); // Max 20 ETH per day

// Authorized spender withdraws
vault.withdrawETH(recipient, 3 ether);

// Emergency pause if needed
vault.pause();
```

#### Security Considerations

- **ReentrancyGuard**: Protects against reentrancy attacks on withdrawals
- **Ownable**: Clear ownership model with transfer capabilities
- **Spending Limits**: Prevent single large withdrawals or rapid fund drainage
- **Guardian Role**: Allows emergency pause without full admin control
- **Event Logging**: Complete audit trail of all operations

### MarketVault

The `MarketVault` contract manages collateral for prediction markets with per-market accounting and access control.

#### Key Features

1. **Market Management**
   - Factory creates markets with unique IDs
   - Each market has a designated manager
   - Markets can be closed by their manager
   - Emits `MarketCreated` and `MarketClosed` events

2. **Collateral Deposits**
   - Accepts ETH collateral per market via `depositETHCollateral()`
   - Accepts ERC20 collateral per market via `depositERC20Collateral()`
   - Tracks collateral separately for each market and token
   - Only active markets can receive deposits

3. **Collateral Withdrawals**
   - Only market manager can withdraw from their market
   - Cannot withdraw more than deposited collateral
   - Supports both ETH and ERC20 tokens
   - Emits `CollateralWithdrawn` events

4. **Access Control**
   - Factory can create new markets
   - Market managers control their market's funds
   - Owner can update managers and factory
   - Owner can pause all operations

5. **Emergency Controls**
   - Owner can pause deposits and withdrawals
   - Affects all markets simultaneously
   - Resumable by owner only

#### Usage Example

```solidity
// Deploy and initialize
MarketVault vault = new MarketVault();
vault.initialize(daoAddress, factoryAddress);

// Factory creates a market
vault.createMarket(1, managerAddress);

// Users deposit collateral
vault.depositETHCollateral{value: 5 ether}(1);

// Manager withdraws to settle market
vault.withdrawETHCollateral(1, winnerAddress, 5 ether);

// Close market when done
vault.closeMarket(1);
```

#### Security Considerations

- **Per-Market Isolation**: Collateral tracked separately prevents cross-market contamination
- **Manager-Only Withdrawals**: Only designated manager can move funds
- **Factory Control**: Only authorized factory can create markets
- **ReentrancyGuard**: Protects withdrawal operations
- **Active Market Check**: Prevents operations on closed markets

## Integration with Existing Contracts

### DAOFactory Integration

The DAOFactory should deploy TreasuryVault instances for each DAO:

```solidity
// In DAOFactory._deployDAOComponents()
address treasuryVaultImpl = address(new TreasuryVault());

// Clone and initialize for each DAO
address treasuryVaultClone = Clones.clone(treasuryVaultImpl);
TreasuryVault(treasuryVaultClone).initialize(futarchyGovernor);

// Authorize the governor to spend
TreasuryVault(treasuryVaultClone).authorizeSpender(futarchyGovernor);

// Set appropriate limits
TreasuryVault(treasuryVaultClone).setTransactionLimit(address(0), 100 ether);
TreasuryVault(treasuryVaultClone).setRateLimit(address(0), 1 days, 500 ether);
```

### FutarchyGovernor Integration

Update FutarchyGovernor to interact with TreasuryVault:

```solidity
// In executeProposal()
TreasuryVault(treasuryVault).withdrawETH(recipient, fundingAmount);
// or
TreasuryVault(treasuryVault).withdrawERC20(token, recipient, fundingAmount);
```

### ConditionalMarketFactory Integration

Markets should use MarketVault for collateral:

```solidity
// Deploy shared MarketVault
MarketVault marketVault = new MarketVault();
marketVault.initialize(owner, address(this));

// When creating a market
marketVault.createMarket(marketId, address(this));

// Accept collateral deposits
marketVault.depositETHCollateral{value: amount}(marketId);

// Settle market
marketVault.withdrawETHCollateral(marketId, winner, amount);
marketVault.closeMarket(marketId);
```

## Testing

Both contracts have comprehensive test suites with >95% coverage:

- **TreasuryVault**: 67 test cases covering all functionality
- **MarketVault**: 67 test cases covering all functionality

Run tests:
```bash
npx hardhat test test/TreasuryVault.test.js
npx hardhat test test/MarketVault.test.js
```

## Best Practices

1. **Set Reasonable Limits**: Configure transaction and rate limits based on DAO size and activity
2. **Use Multisig for Owner**: Treasury vault owner should be a multisig wallet
3. **Separate Guardian**: Guardian should be different from owner for emergency responses
4. **Monitor Events**: Watch for Deposit/Withdrawal events to track treasury activity
5. **Regular Reviews**: Periodically review authorized spenders and limits
6. **Test Before Production**: Always test limit configurations on testnet first

## Security Audit Checklist

Before production deployment:

- [ ] Verify all spending limits are appropriate
- [ ] Confirm owner and guardian addresses
- [ ] Test emergency pause functionality
- [ ] Verify all authorized spenders are correct
- [ ] Review event emissions for monitoring
- [ ] Confirm ReentrancyGuard protection
- [ ] Test with various token types
- [ ] Verify upgrade/clone patterns work correctly
- [ ] Run static analysis tools (Slither, Mythril)
- [ ] Consider external security audit

## Gas Optimization Notes

- Uses `SafeERC20` for safe token transfers
- Minimal storage reads in hot paths
- Events use indexed parameters for efficient filtering
- ReentrancyGuard only on external state-changing functions
- Efficient limit checking with early returns

## Future Enhancements

Potential improvements for future versions:

1. **Multi-Signature Withdrawals**: Require multiple approvals for large withdrawals
2. **Time-Locked Withdrawals**: Delay large withdrawals for review period
3. **Whitelisted Recipients**: Restrict withdrawals to approved addresses
4. **Budget Categories**: Track spending by category/purpose
5. **Scheduled Payments**: Automatic recurring payments
6. **Integration with Gnosis Safe**: Native Safe module support
7. **Flash Loan Protection**: Additional guards against flash loan attacks
8. **Oracle Integration**: Dynamic limits based on token prices
