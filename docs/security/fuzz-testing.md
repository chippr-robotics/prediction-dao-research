# Fuzz Testing with Medusa

Medusa is a powerful fuzzing framework that tests smart contract invariants and properties by generating random inputs to discover edge cases and unexpected behaviors.

## What Fuzz Testing Tests For

Medusa validates contracts through property-based testing:

### Invariant Testing

- **State Invariants**: Properties that must always hold true
- **Balance Consistency**: Token balances remain consistent
- **Access Control**: Permissions are never violated
- **Numerical Bounds**: Values stay within expected ranges
- **Relationship Preservation**: Related values maintain their relationships

### Edge Case Discovery

- **Boundary Values**: Tests with extreme values (0, max uint, etc.)
- **Unexpected Inputs**: Random combinations that might be overlooked
- **State Transitions**: Complex sequences of operations
- **Race Conditions**: Concurrent operation interactions

### Property Violations

- **Assertion Failures**: require/assert statements that can be broken
- **Panic Conditions**: Solidity panics (overflow, divide by zero, etc.)
- **Optimization Issues**: Patterns that could be gas-optimized
- **Custom Properties**: User-defined invariants

## How Fuzzing Works

Medusa uses intelligent fuzzing techniques:

1. **Random Input Generation**: Creates random transaction sequences
2. **Corpus-Based Fuzzing**: Learns from successful test cases
3. **Coverage Guidance**: Prioritizes inputs that increase code coverage
4. **Mutation Strategies**: Modifies inputs to find new behaviors
5. **Property Checking**: Validates invariants after each transaction

### Example

```solidity
// Invariant: Escrow balance always covers active wager stakes
function property_escrow_covers_active_stakes() public view returns (bool) {
    uint256 totalLocked = 0;
    uint256 count = registry.nextWagerId();
    for (uint256 i = 1; i < count; i++) {
        IWagerRegistry.Wager memory w = registry.getWager(i);
        if (w.status == IWagerRegistry.Status.Open) {
            totalLocked += w.creatorStake;
        } else if (w.status == IWagerRegistry.Status.Active && !w.paid) {
            totalLocked += uint256(w.creatorStake) + uint256(w.opponentStake);
        }
    }
    return token.balanceOf(address(registry)) >= totalLocked;
}
```

Medusa will:
- Generate random transaction sequences
- Execute them against the contract
- Check if the property still holds
- Report any sequence that violates it

## Installation

### Prerequisites

```bash
# Go 1.21 or higher required
go version
```

### Install Medusa

```bash
go install github.com/crytic/medusa@latest

# Add to PATH if needed
export PATH=$PATH:$HOME/go/bin
```

### Install Dependencies

```bash
# crytic-compile for Solidity compilation
pip install crytic-compile
```

### Verify Installation

```bash
medusa --version
```

## Configuration

Medusa is configured via `medusa.json`:

```json
{
  "fuzzing": {
    "workers": 10,
    "workerResetLimit": 50,
    "timeout": 0,
    "testLimit": 0,
    "callSequenceLength": 100,
    "corpusDirectory": "medusa-corpus",
    "coverageEnabled": true,
    "targetContracts": [
      "WagerRegistryFuzzTest",
      "MembershipManagerFuzzTest",
      "KeyRegistryFuzzTest"
    ],
    "testing": {
      "stopOnFailedTest": true,
      "assertionTesting": {
        "enabled": true,
        "testViewMethods": false
      },
      "propertyTesting": {
        "enabled": true,
        "testPrefixes": ["property_"]
      },
      "optimizationTesting": {
        "enabled": true,
        "testPrefixes": ["optimize_"]
      }
    }
  }
}
```

### Key Configuration Options

- **workers**: Number of parallel fuzzing workers (default: 10)
- **callSequenceLength**: Maximum transaction sequence length (default: 100)
- **corpusDirectory**: Where to save interesting test cases
- **coverageEnabled**: Track and optimize for code coverage
- **targetContracts**: Contracts to fuzz test

## Writing Fuzz Tests

### Test Contract Structure

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../wagers/WagerRegistry.sol";
import "../access/MembershipManager.sol";
import "../mocks/MockERC20.sol";

contract WagerRegistryFuzzTest {
    WagerRegistry public registry;
    MembershipManager public membership;
    MockERC20 public token;

    constructor() {
        // Deploy full stack: token, membership, registry
        token = new MockERC20("FuzzCoin", "FUZZ", 1e30);
        membership = new MembershipManager(address(this), address(token), address(0x40000));
        address[] memory tokens = new address[](1);
        tokens[0] = address(token);
        registry = new WagerRegistry(address(this), address(membership), address(0), tokens);
        membership.setAuthorizedCaller(address(registry), true);
        // ... tier setup, membership purchase, approvals
    }

    // Property test: must start with "property_"
    function property_wager_count_never_decreases() public returns (bool) {
        uint256 current = registry.nextWagerId();
        return current >= _previousWagerCount;
    }

    // Property test: escrow solvency
    function property_escrow_covers_active_stakes() public view returns (bool) {
        // ... iterate wagers, sum locked stakes, compare to balance
        return token.balanceOf(address(registry)) >= totalLocked;
    }
}
```

### Property Functions

Property functions must:
- Start with `property_` prefix
- Return `bool` (true = pass, false = fail)
- Be `public` or `external`
- Can be `view` or `pure` for state checking
- Can accept parameters for input fuzzing

### Test Types

#### 1. Invariant Properties

Test conditions that must always hold:

```solidity
function property_total_weight_bounded() public view returns (bool) {
    return registry.totalActiveWeight() <= 10000; // Max 100%
}
```

#### 2. Relationship Properties

Test relationships between values:

```solidity
function property_balance_consistency() public view returns (bool) {
    return address(this).balance + registry.totalLocked() == INITIAL_BALANCE;
}
```

#### 3. State Transition Properties

Test valid state transitions:

```solidity
function property_status_progression() public view returns (bool) {
    // Once executed, status cannot revert
    if (proposal.status == ProposalStatus.Executed) {
        return proposal.status == ProposalStatus.Executed;
    }
    return true;
}
```

## Running Medusa

### Basic Fuzzing

```bash
medusa fuzz
```

### With Timeout

```bash
medusa fuzz --timeout 300
```

### Specific Test

```bash
medusa fuzz --target-contracts WagerRegistryFuzzTest
```

### With Coverage

```bash
medusa fuzz --coverage-enabled
```

## CI/CD Integration

Medusa runs automatically in the GitHub Actions workflow:

**Job:** `medusa-fuzzing`

```yaml
- name: Install Medusa
  run: |
    go install github.com/crytic/medusa@latest
    echo "$HOME/go/bin" >> $GITHUB_PATH

- name: Run Medusa fuzzing
  run: |
    medusa fuzz --timeout 300 || true
```

## Output and Results

### Console Output

```
[Medusa] Starting fuzzing campaign
[Medusa] Workers: 10, Timeout: 300s
[Medusa] Target contracts: WagerRegistryFuzzTest, MembershipManagerFuzzTest, KeyRegistryFuzzTest

[Worker 1] Fuzzing WagerRegistryFuzzTest
[Worker 1] Corpus size: 42 | Coverage: 87% | Executions: 1,524

✓ property_wager_count_never_decreases: PASSED
✓ property_escrow_covers_active_stakes: PASSED
✓ property_winner_is_participant: PASSED

[Medusa] Fuzzing completed
[Medusa] Total tests: 26 | Passed: 26 | Failed: 0
[Medusa] Coverage: 87% | Time: 178s
```

### Failure Output

When a property fails:

```
✗ property_escrow_covers_active_stakes: FAILED

Failing sequence:
1. constructor()
2. createWager(0x20000, 0x0, 0xToken, 1000000, 1000000, ...)
3. acceptWager(1)
4. claimPayout(1)

Property returned false at:
  File: WagerRegistryFuzzTest.sol
  Function: property_escrow_covers_active_stakes
  
Transaction trace saved to: medusa-corpus/failed_001.json
```

### Corpus Directory

Medusa saves interesting test cases:

```
medusa-corpus/
├── coverage/           # High-coverage sequences
├── failed/            # Property-violating sequences
└── optimization/      # Gas optimization opportunities
```

## Interpreting Results

### Passed Properties

All tested property functions returned `true`:
- Invariants hold under random inputs
- No edge cases found that violate properties
- Contract behaves correctly under fuzzing

### Failed Properties

A property function returned `false`:
- Review the failing transaction sequence
- Understand why the property was violated
- Fix the contract or adjust the property
- Re-run fuzzing to verify the fix

### Coverage Metrics

```
Coverage: 87%
- Branches: 234/267 covered
- Instructions: 1,524/1,689 covered
```

Higher coverage means more thorough testing.

## Fuzz Test Contracts

The fuzz test harnesses live in `contracts/test/` and target the active FairWins contracts:

### WagerRegistryFuzzTest

Tests invariants for the peer-to-peer wager escrow system:

- **Wager count monotonicity** -- `nextWagerId` never decreases
- **Escrow solvency** -- token balance always covers locked stakes
- **Winner integrity** -- resolved winner is always creator or opponent
- **No double-claim** -- the `paid` flag is irreversible
- **Forward-only state** -- status transitions never go backward
- **Payout correctness** -- payout equals `creatorStake + opponentStake`
- **Freeze enforcement** -- frozen accounts cannot mutate state
- **Pause enforcement** -- paused contract blocks creation
- **Refund completeness** -- refunded wagers preserve stake values
- **ID base** -- `nextWagerId` is always >= 1

### MembershipManagerFuzzTest

Tests invariants for the tiered membership system:

- **Tier ID bounds** -- tier values are always in [0..4]
- **Expiry correctness** -- active memberships have future expiry
- **Upgrade monotonicity** -- downgrade attempts always revert
- **Limit consistency** -- tier limits match configured values
- **Fee solvency** -- accrued fees never exceed token balance
- **Access control** -- non-admins cannot configure or withdraw
- **Price ordering** -- tier prices are monotonically increasing
- **Grant correctness** -- admin grants produce active memberships
- **Limit ordering** -- higher tiers have >= limits

### KeyRegistryFuzzTest

Tests invariants for the encryption key registry:

- **Key length bounds** -- stored keys satisfy `MIN_KEY_LENGTH..MAX_KEY_LENGTH`
- **Overwrite support** -- re-registering replaces the previous key
- **Empty for unregistered** -- `getPublicKey` returns empty bytes for unknown addresses
- **hasKey consistency** -- `hasKey` and `getPublicKey` agree
- **Short key rejection** -- keys below `MIN_KEY_LENGTH` are rejected
- **Long key rejection** -- keys above `MAX_KEY_LENGTH` are rejected

## Best Practices

When writing fuzz tests:

1. **Test critical invariants**: Focus on properties that must never be violated
2. **Keep properties simple**: Complex logic makes debugging harder
3. **Use meaningful names**: Clearly describe what each property tests
4. **Return early for invalid inputs**: Handle edge cases gracefully
5. **Cover multiple scenarios**: Test different contract states
6. **Document assumptions**: Explain why properties should hold
7. **Run regularly**: Integrate into CI/CD for continuous testing

## Advanced Usage

### Custom Assertions

```solidity
function property_complex_invariant() public returns (bool) {
    uint256 before = registry.totalSupply();
    
    // Perform operations
    registry.mint(address(this), 100);
    
    uint256 after = registry.totalSupply();
    
    // Check invariant maintained
    return after == before + 100;
}
```

### State Exploration

```solidity
function property_state_transition() public returns (bool) {
    ProposalStatus status = registry.getStatus(0);
    
    // Try to advance state
    try registry.advanceProposal(0) {
        // Verify valid transition
        ProposalStatus newStatus = registry.getStatus(0);
        return isValidTransition(status, newStatus);
    } catch {
        // Revert is acceptable
        return true;
    }
}
```

### Optimization Testing

```solidity
function optimize_batch_operation() public returns (bool) {
    // Test gas efficiency
    uint256 gasBefore = gasleft();
    
    registry.batchOperation([1, 2, 3, 4, 5]);
    
    uint256 gasUsed = gasBefore - gasleft();
    
    // Should use less than individual operations
    return gasUsed < EXPECTED_GAS_LIMIT;
}
```

## Troubleshooting

### No Properties Found

**Check:**
- Functions start with `property_` prefix
- Functions are `public` or `external`
- Functions return `bool`
- Target contracts are listed in config

### Slow Fuzzing

**Solutions:**
- Reduce `callSequenceLength`
- Decrease number of `workers`
- Use shorter `timeout`
- Simplify property functions

### High Memory Usage

**Solutions:**
- Reduce `workerResetLimit`
- Decrease `workers`
- Clear corpus directory
- Simplify test contracts

### False Positives

**Solutions:**
- Review property logic
- Add input validation
- Handle edge cases in properties
- Document expected behavior

## Comparison with Unit Tests

| Aspect | Fuzz Testing | Unit Testing |
|--------|--------------|--------------|
| Input | Random | Predetermined |
| Coverage | Broader | Targeted |
| Edge Cases | Discovers | Must specify |
| Speed | Slower | Faster |
| Determinism | Non-deterministic | Deterministic |
| Debugging | Harder | Easier |

**Use both:**
- Unit tests for known scenarios
- Fuzz tests for unknown edge cases

## Related Documentation

- [Medusa Documentation](https://github.com/crytic/medusa)
- [Property-Based Testing](https://hypothesis.works/articles/what-is-property-based-testing/)
- [Unit Testing](unit-testing.md)
- [Static Analysis](static-analysis.md)
- [CI Configuration](ci-configuration.md)
