# Treasury Security

The TreasuryVault contract provides secure custody of DAO funds with multiple layers of protection against unauthorized withdrawals.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     TreasuryVault                            │
├─────────────────────────────────────────────────────────────┤
│  Owner (Multi-sig recommended)                               │
│    ├── Transfer ownership                                    │
│    ├── Set spending limits                                   │
│    ├── Authorize/revoke spenders                            │
│    ├── Update guardian                                       │
│    └── Unpause vault                                         │
├─────────────────────────────────────────────────────────────┤
│  Guardian                                                    │
│    └── Emergency pause (blocks all withdrawals)              │
├─────────────────────────────────────────────────────────────┤
│  Authorized Spenders                                         │
│    └── Withdraw within configured limits                     │
└─────────────────────────────────────────────────────────────┘
```

## Security Layers

### 1. Transaction Limits

Per-transaction maximum withdrawal amounts prevent large single withdrawals.

```solidity
// Set max 10 ETC per transaction
treasury.setTransactionLimit(address(0), 10 ether);

// Set max 1000 FWN per transaction
treasury.setTransactionLimit(fairWinsToken, 1000 ether);
```

### 2. Rate Limits

Time-based spending caps prevent rapid draining of funds.

```solidity
// Max 50 ETC per 24 hours
treasury.setRateLimit(address(0), 86400, 50 ether);

// Max 5000 FWN per 24 hours
treasury.setRateLimit(fairWinsToken, 86400, 5000 ether);
```

### 3. Authorized Spenders

Only explicitly authorized addresses can initiate withdrawals.

```solidity
// Authorize an operator
treasury.authorizeSpender(operatorAddress);

// Revoke access
treasury.revokeSpender(operatorAddress);
```

### 4. Emergency Pause

Guardian or owner can instantly halt all withdrawals.

```solidity
// Pause vault (guardian or owner)
treasury.pause();

// Unpause (owner only)
treasury.unpause();
```

### 5. Nullifier Integration

Blocks withdrawals to addresses flagged as malicious.

```solidity
// Configure nullifier registry
treasury.setNullifierRegistry(nullifierRegistryAddress);
treasury.setNullificationEnforcement(true);
```

## Multi-Signature Security

### Why Multi-Sig?

While the TreasuryVault has spending limits, a single compromised key with owner access could:
- Remove all spending limits
- Authorize malicious spenders
- Transfer ownership

**Solution**: Transfer ownership to a multi-sig wallet (like Safe) requiring multiple signatures for owner actions.

### Recommended Setup

```
Production Multi-Sig Configuration:
┌─────────────────────────────────────────┐
│  Safe Multi-Sig (3-of-5 signatures)     │
│    ├── CEO/Founder                      │
│    ├── CTO                              │
│    ├── CFO                              │
│    ├── Legal/Compliance                 │
│    └── External Advisor                 │
└─────────────────────────────────────────┘
            │
            │ Owns
            ▼
┌─────────────────────────────────────────┐
│  TreasuryVault                          │
│    ├── ETH Tx Limit: 10 ETC             │
│    ├── ETH Daily Limit: 50 ETC          │
│    ├── FWN Tx Limit: 1000 FWN           │
│    └── FWN Daily Limit: 5000 FWN        │
└─────────────────────────────────────────┘
            │
            │ Authorized Spenders
            ▼
┌─────────────────────────────────────────┐
│  Operations Team                         │
│    ├── Operator 1 (day-to-day ops)      │
│    └── Operator 2 (backup)              │
└─────────────────────────────────────────┘
```

### Setting Up Multi-Sig

1. **Deploy Safe Multi-Sig**
   - Use app.safe.global to deploy a Safe wallet
   - Configure required signers (e.g., 3-of-5)
   - Add all designated signers

2. **Transfer Ownership**
   ```javascript
   // From current owner account
   await treasury.transferOwnership(safeAddress);
   ```

3. **Configure Limits via Safe**
   - All owner functions now require multi-sig approval
   - Submit transactions through Safe UI
   - Collect required signatures
   - Execute after threshold met

## Contract Address

```
TreasuryVault: 0x93F7ee39C02d99289E3c29696f1F3a70656d0772 (Mordor)
```

## Configuration Scripts

### Set Spending Limits

```bash
npx hardhat run scripts/admin/configure-treasury-limits.js --network mordor
```

### Current Configuration

The script configures:
- ETH: 10 ETC per transaction, 50 ETC per day
- FWN: 1000 FWN per transaction, 5000 FWN per day

Adjust `CONFIG` object in the script for different limits.

## Admin Panel

The Treasury tab in the Admin Panel displays:
- ETH and FairWins token balances
- Current spending limits
- Rate limit status and remaining allowance
- Authorization status

## Best Practices

1. **Use Multi-Sig for Ownership**
   - Transfer to Safe before going to mainnet
   - Require 3-of-5 or 2-of-3 signatures minimum

2. **Set Conservative Limits**
   - Start with low limits
   - Increase gradually based on operational needs

3. **Separate Roles**
   - Owner (multi-sig): Configuration changes
   - Guardian: Emergency pause only
   - Operators: Day-to-day withdrawals within limits

4. **Regular Audits**
   - Review authorized spender list monthly
   - Check spending patterns for anomalies
   - Verify limits are appropriate

5. **Emergency Procedures**
   - Document guardian contact information
   - Test pause/unpause procedures
   - Have backup signers for multi-sig

## Events for Monitoring

```solidity
event Withdrawal(address indexed token, address indexed to, uint256 amount, address indexed authorizedBy);
event SpenderAuthorized(address indexed spender);
event SpenderRevoked(address indexed spender);
event TransactionLimitUpdated(address indexed token, uint256 limit);
event RateLimitUpdated(address indexed token, uint256 period, uint256 limit);
event EmergencyPause(address indexed by);
event WithdrawalBlockedByNullification(address indexed recipient, address indexed token, uint256 amount);
```

Set up event monitoring to track all treasury activity.
