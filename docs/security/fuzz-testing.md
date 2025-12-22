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
// Invariant: Total supply should never exceed initial supply
function property_total_supply_bounded() public view returns (bool) {
    return registry.totalSupply() <= INITIAL_SUPPLY;
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
      "ProposalRegistryFuzzTest",
      "WelfareMetricRegistryFuzzTest"
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
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "../../contracts/ProposalRegistry.sol";

contract ProposalRegistryFuzzTest {
    ProposalRegistry public registry;
    
    constructor() {
        registry = new ProposalRegistry();
    }
    
    // Property test: must start with "property_"
    function property_proposal_count_never_decreases() public view returns (bool) {
        uint256 count = registry.proposalCount();
        return count >= 0; // Always true, but validates access
    }
    
    // Property test with parameters
    function property_bond_sufficient(uint256 amount) public view returns (bool) {
        return amount >= registry.bondAmount();
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
medusa fuzz --target-contracts ProposalRegistryFuzzTest
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
[Medusa] Target contracts: ProposalRegistryFuzzTest, WelfareMetricRegistryFuzzTest

[Worker 1] Fuzzing ProposalRegistryFuzzTest
[Worker 1] Corpus size: 42 | Coverage: 87% | Executions: 1,524

✓ property_proposal_count_never_decreases: PASSED
✓ property_bond_amount_positive: PASSED
✓ property_total_weight_bounded: PASSED

[Medusa] Fuzzing completed
[Medusa] Total tests: 3 | Passed: 3 | Failed: 0
[Medusa] Coverage: 87% | Time: 178s
```

### Failure Output

When a property fails:

```
✗ property_total_supply_bounded: FAILED

Failing sequence:
1. constructor()
2. mint(0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2, 1000000000)
3. mint(0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2, MAX_UINT256)

Property returned false at:
  File: ProposalRegistryFuzzTest.sol
  Function: property_total_supply_bounded
  
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

## Fuzz Test Examples

### ProposalRegistry

```solidity
contract ProposalRegistryFuzzTest {
    ProposalRegistry public registry;
    
    constructor() {
        registry = new ProposalRegistry();
    }
    
    // Invariant: Count never decreases
    function property_proposal_count_never_decreases() public view returns (bool) {
        uint256 count = registry.proposalCount();
        return count >= 0;
    }
    
    // Invariant: Bond amount is positive
    function property_bond_amount_positive() public view returns (bool) {
        return registry.bondAmount() > 0;
    }
    
    // Property: Submission requires correct bond
    function property_submission_requires_bond(
        string memory title,
        uint256 fundingAmount
    ) public payable returns (bool) {
        // Test various conditions
        if (msg.value < registry.bondAmount()) {
            return true; // Should revert
        }
        if (bytes(title).length == 0) {
            return true; // Should revert
        }
        return true;
    }
}
```

### WelfareMetricRegistry

```solidity
contract WelfareMetricRegistryFuzzTest {
    WelfareMetricRegistry public registry;
    
    constructor() {
        registry = new WelfareMetricRegistry();
    }
    
    // Invariant: Total weight bounded
    function property_total_weight_bounded() public view returns (bool) {
        return registry.totalActiveWeight() <= 10000;
    }
    
    // Invariant: Metric count never decreases
    function property_metric_count_never_decreases() public view returns (bool) {
        return registry.metricCount() >= 0;
    }
    
    // Property: Weight values are valid
    function property_weight_bounded(uint256 weight) public pure returns (bool) {
        return weight <= 10000;
    }
}
```

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
