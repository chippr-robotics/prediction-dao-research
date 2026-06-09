# Ragequit Protection

Minority exit mechanism that protects dissenting token holders from governance decisions they oppose.

## Overview

The RagequitModule implements a Moloch-style ragequit mechanism, allowing token holders who disagree with a proposal to exit the DAO with their proportional share of the treasury. This provides a critical safety valve for minority protection and helps prevent governance capture.

## Core Concepts

### What is Ragequit?

Ragequit is a voluntary exit mechanism that allows token holders to:
1. **Burn their governance tokens**
2. **Withdraw proportional treasury share**
3. **Exit before contentious proposals execute**

This ensures that dissenting minorities aren't forced to remain in a DAO whose direction they oppose.

### Why Ragequit Matters

**Minority Protection**: Prevents 51% attacks by allowing minorities to exit with their fair share

**Treasury Safety**: Encourages consensus-building since aggressive proposals may trigger mass exits

**Voluntary Association**: Maintains the principle that DAO participation is voluntary, not coercive

## Functional Flows

### 1. Opening a Ragequit Window

When a controversial proposal passes the prediction market phase:

```
┌─────────────┐
│  Proposal   │
│   Passes    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Owner     │  Opens ragequit window
│   Calls     ├──► openRagequitWindow(proposalId, snapshotTime, executionTime)
└─────────────┘
       │
       ▼
┌─────────────┐
│   Window    │  Time-bounded period for ragequit
│   Created   │  Duration: snapshotTime → executionTime
└─────────────┘
```

**Parameters**:
- `proposalId`: The proposal users can ragequit from
- `snapshotTime`: When token balances are recorded
- `executionTime`: Deadline for ragequitting (window closes)

**Requirements**:
- Only owner (FutarchyGovernor) can open windows
- Each proposal can only have one window
- Execution time must be after snapshot time

### 2. Setting Eligibility

After opening the window, specific users are marked as eligible:

```
┌─────────────┐
│   Owner     │  Marks dissenting voters as eligible
│   Calls     ├──► setEligible(proposalId, userAddress)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    User     │  Can now execute ragequit
│  Eligible   │  for this proposal
└─────────────┘
```

**Eligibility Criteria** (typically):
- Voted against the proposal in prediction markets
- Held tokens at snapshot time
- Demonstrated opposition through governance participation

### 3. Executing Ragequit

Eligible users can burn tokens and withdraw treasury share:

```
┌─────────────┐
│    User     │  1. Approves tokens
│  Prepares   ├──► governanceToken.approve(ragequitModule, tokenAmount)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    User     │  2. Executes ragequit
│   Calls     ├──► ragequit(proposalId, tokenAmount)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Contract   │  3. Validates request
│  Validates  │     - User is eligible
│             │     - Window is open
│             │     - User hasn't ragequit before
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Calculate  │  4. Compute treasury share
│   Share     │     share = (treasuryBalance * tokenAmount) / totalSupply
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Burn      │  5. Transfer tokens to module
│   Tokens    │     (effectively burns them)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Transfer   │  6. Send proportional treasury share
│    ETH      ├──► User receives ETH
└─────────────┘
```

**Process Steps**:
1. User approves governance tokens for transfer
2. User calls `ragequit(proposalId, tokenAmount)`
3. Contract validates eligibility and window status
4. Contract calculates proportional treasury share
5. Tokens transferred from user to module (burned)
6. ETH transferred from module to user

### 4. Proportional Share Calculation

The core fairness mechanism:

```
treasuryShare = (treasuryBalance × tokenAmount) / totalSupply
```

**Example**:
- Treasury Balance: 1,000 ETH
- Total Token Supply: 100,000 GOV
- User Burns: 1,000 GOV
- User Receives: (1,000 ETH × 1,000 GOV) / 100,000 GOV = **10 ETH**

**Properties**:
- **Proportional**: Exact ratio of tokens to treasury
- **Fair**: Same rate for all participants
- **Precise**: Uses integer division (rounds down)
- **Dynamic**: Based on current treasury state

## State Management

### Window Lifecycle

```
┌──────────┐    openRagequitWindow()    ┌──────────┐
│  Closed  ├───────────────────────────►│   Open   │
└──────────┘                             └────┬─────┘
                                              │
                    ┌─────────────────────────┤
                    │                         │
            Proposal Executes         Time Expires
                    │                         │
                    ▼                         ▼
              ┌──────────┐              ┌──────────┐
              │  Closed  │              │  Closed  │
              │(Executed)│              │(Expired) │
              └──────────┘              └──────────┘
```

### User States

```
┌─────────────┐   setEligible()   ┌─────────────┐   ragequit()   ┌─────────────┐
│ Ineligible  ├──────────────────►│  Eligible   ├───────────────►│ Ragequit    │
└─────────────┘                    └─────────────┘                └─────────────┘
```

**State Transitions**:
- **Ineligible → Eligible**: Owner marks user as eligible
- **Eligible → Ragequit**: User executes ragequit
- **Ragequit**: Terminal state (cannot ragequit again for same proposal)

## Protection Mechanisms

### Access Control

1. **Eligibility Check**
   - Only marked users can ragequit
   - Prevents unauthorized exits
   - Ensures fairness (only dissenters)

2. **One-Time Only**
   - Users can only ragequit once per proposal
   - Prevents double-spending of share
   - Tracked via `hasRagequit` mapping

3. **Window Enforcement**
   - Time-bounded execution period
   - Prevents late exits after proposal execution
   - Maintains treasury integrity

### Economic Safety

1. **Reentrancy Guard**
   - Prevents reentrancy attacks during ETH transfer
   - Uses OpenZeppelin's ReentrancyGuard
   - Critical for treasury safety

2. **Balance Validation**
   - Requires non-zero token amount
   - Requires non-zero treasury share
   - Prevents wasteful transactions

3. **Window Closure**
   - Automatically closes when proposal executes
   - Prevents exits after decision implemented
   - Maintains governance legitimacy

## Integration Testing

Our comprehensive test suite validates all ragequit flows:

### Test Coverage

#### 1. Token Holder Exit Flow
```javascript
// Complete end-to-end exit workflow
✓ Submit and activate proposal
✓ Open ragequit window
✓ Mark user as eligible
✓ Fund treasury and module
✓ Execute ragequit
✓ Verify state changes
✓ Confirm ETH transfer
```

**Validates**:
- Proposal activation and state transitions
- Window opening and parameters
- Eligibility marking
- Token burning mechanics
- Proportional ETH transfer
- Event emission
- State persistence

#### 2. Proportional Share Calculation
```javascript
// Mathematical correctness of share calculation
treasuryShare = (treasuryBalance × tokenAmount) / totalSupply

✓ Calculate share with known values
✓ Verify integer division behavior
✓ Test with various treasury balances
✓ Test with different token amounts
```

**Validates**:
- Calculation accuracy
- BigInt precision handling
- Edge cases (zero treasury, large amounts)
- Consistency across multiple exits

#### 3. Treasury Withdrawal
```javascript
// ETH transfer and balance verification
✓ Initial balance recorded
✓ ETH transferred from module
✓ Final balance verified (accounting for gas)
✓ Treasury balance decreases correctly
```

**Validates**:
- ETH transfer success
- Balance changes
- Gas cost accounting
- Module funding requirements

#### 4. Multiple Token Holders
```javascript
// Concurrent exits by multiple users
✓ Mark multiple users eligible
✓ First user ragequits successfully
✓ Second user ragequits successfully
✓ Both receive correct proportional shares
✓ Total treasury decreased appropriately
```

**Validates**:
- Independent eligibility tracking
- Separate share calculations
- No interference between users
- Treasury depletion tracking

#### 5. Access Control Tests
```javascript
// Permission and eligibility validation
✓ Ineligible user cannot ragequit
✓ Eligible user can ragequit
✓ User cannot ragequit twice
✓ Window closure prevents ragequit
✓ Proposal execution closes window
```

**Validates**:
- Eligibility enforcement
- One-time ragequit limit
- Time-based access control
- State transition guards

#### 6. Edge Cases
```javascript
// Boundary conditions and error handling
✓ Zero treasury balance (returns zero share)
✓ Zero token amount (reverts)
✓ Window not opened (reverts)
✓ Proposal already executed (reverts)
✓ Window expired (reverts)
✓ Double ragequit attempt (reverts)
```

**Validates**:
- Error handling
- Edge condition safety
- Revert conditions
- State consistency

### Test Execution

All integration tests use the complete system fixture:

```javascript
const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);

// Contracts include:
// - proposalRegistry: For proposal submission
// - ragequitModule: Core ragequit functionality
// - governanceToken: ERC20 governance tokens
// - treasuryVault: Treasury simulation

// Accounts include:
// - owner: System administrator
// - proposer1: Submits proposals
// - trader1, trader2: Participate in ragequit
```

### Integration Points Tested

1. **Proposal Registry Integration**
   - Proposal activation before ragequit
   - State consistency across contracts
   - Event sequencing

2. **Governance Token Integration**
   - Token approval flow
   - Transfer mechanics
   - Balance tracking

3. **Treasury Integration**
   - Balance queries
   - ETH transfers
   - Module funding

4. **Time Management**
   - Hardhat Network Helpers for time travel
   - Window expiration testing
   - Review period handling

## Security Considerations

### Audited Patterns

1. **Moloch-Style Ragequit**: Battle-tested mechanism from Moloch DAO
2. **OpenZeppelin Contracts**: ReentrancyGuard, Ownable
3. **Integer Division**: Rounds down, preventing over-withdrawal

### Known Limitations

1. **Simplified Treasury**: Production version should aggregate multiple assets
2. **ETH Only**: Current implementation only handles ETH, not ERC20s
3. **No Governance**: Token holders don't govern ragequit parameters

### Attack Vectors Mitigated

1. **Reentrancy**: ReentrancyGuard prevents recursive calls
2. **Double Ragequit**: State tracking prevents duplicate withdrawals
3. **Unauthorized Access**: Eligibility and window checks enforce access control
4. **Timing Manipulation**: Window boundaries and proposal execution checks
5. **Front-Running**: Eligibility must be set before window opens

## Usage Example

### For Token Holders

```javascript
// 1. Check if you're eligible
const isEligible = await ragequitModule.isEligible(proposalId, myAddress);

// 2. Calculate expected share
const myTokens = await governanceToken.balanceOf(myAddress);
const expectedShare = await ragequitModule.calculateTreasuryShare(myAddress, myTokens);

// 3. Approve tokens
await governanceToken.approve(ragequitModuleAddress, myTokens);

// 4. Execute ragequit
await ragequitModule.ragequit(proposalId, myTokens);

// 5. Verify receipt
const hasRagequit = await ragequitModule.hasRagequit(myAddress, proposalId);
```

### For DAO Owners

```javascript
// 1. Open window after proposal passes
await ragequitModule.openRagequitWindow(
  proposalId,
  snapshotTime,
  executionTime
);

// 2. Mark dissenting voters as eligible
for (const dissenter of dissentingVoters) {
  await ragequitModule.setEligible(proposalId, dissenter);
}

// 3. Mark proposal as executed when ready
await ragequitModule.markProposalExecuted(proposalId);
```

## Constants

- **RAGEQUIT_WINDOW**: 7 days (standard window duration)
- Actual window duration determined by `executionTime - snapshotTime`
- Recommended: Give users sufficient time (at least 3-7 days)

## Events

### RagequitWindowOpened
```solidity
event RagequitWindowOpened(
  uint256 indexed proposalId,
  uint256 snapshotTime,
  uint256 executionTime
);
```

### RagequitExecuted
```solidity
event RagequitExecuted(
  address indexed user,
  uint256 indexed proposalId,
  uint256 tokenAmount,
  uint256 treasuryShare
);
```

## Future Enhancements

1. **Multi-Asset Treasury**: Support ERC20 tokens in addition to ETH
2. **Partial Ragequit**: Allow users to exit with only portion of tokens
3. **Delayed Execution**: Add timelock for large ragequits
4. **Governance Integration**: Allow DAO to vote on ragequit parameters
5. **Automated Eligibility**: Calculate eligibility from on-chain voting data

## References

- [Moloch DAO Ragequit Documentation](https://github.com/MolochVentures/moloch)
- [RagequitModule Contract](../../contracts/RagequitModule.sol)
- [Integration Tests](../../test/integration/ragequit/ragequit-protection.test.js)
- [Unit Tests](../../test/RagequitModule.test.js)
