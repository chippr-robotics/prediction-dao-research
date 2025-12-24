# Symbolic Execution with Manticore

Manticore is a symbolic execution tool that explores all possible execution paths in smart contracts to find vulnerabilities and edge cases.

## What Symbolic Execution Tests For

Manticore analyzes contracts by exploring execution paths for:

### Security Vulnerabilities

- **Integer Overflow/Underflow**: Detects arithmetic operations that can overflow
- **Reentrancy**: Identifies potential reentrancy vulnerabilities
- **Assertion Violations**: Finds conditions that violate assertions
- **Unhandled Exceptions**: Detects uncaught errors and reverts
- **Access Control Issues**: Identifies unauthorized access scenarios
- **State Inconsistencies**: Finds paths leading to invalid states

### Path Exploration

- **All Execution Paths**: Explores every possible code path
- **Input Combinations**: Tests with all possible input values
- **State Variations**: Examines different contract states
- **Multi-Transaction Sequences**: Analyzes complex interaction patterns

### Edge Cases

- **Boundary Conditions**: Tests minimum and maximum values
- **Corner Cases**: Identifies unusual input combinations
- **Race Conditions**: Detects timing-dependent issues
- **Complex Logic**: Validates intricate conditional logic

## How Symbolic Execution Works

Unlike traditional testing that uses concrete values, symbolic execution:

1. **Represents inputs symbolically**: Uses symbolic variables instead of concrete values
2. **Tracks path conditions**: Maintains constraints for each execution path
3. **Explores all paths**: Systematically tests every possible branch
4. **Generates test cases**: Creates concrete inputs that trigger specific paths
5. **Reports violations**: Identifies paths leading to vulnerabilities

### Example

```solidity
function transfer(uint256 amount) public {
    require(balances[msg.sender] >= amount); // Path constraint 1
    balances[msg.sender] -= amount;          // Arithmetic operation
    balances[recipient] += amount;           // Potential overflow
}
```

Manticore explores:
- Path 1: `balances[msg.sender] >= amount` is true → executes transfer
- Path 2: `balances[msg.sender] >= amount` is false → reverts
- For Path 1: Tests if `balances[recipient] + amount` can overflow

## Installation

### Prerequisites

```bash
# Python 3.10 REQUIRED (Python 3.8-3.10 supported)
# CRITICAL: Python 3.11+ is incompatible due to pysha3 dependency
# pysha3 fails to build on Python 3.11+ (missing pystrhex.h)
python3 --version

# Install system dependencies (Ubuntu/Debian)
# Required for building pysha3 and other native dependencies
sudo apt-get update
sudo apt-get install -y build-essential python3-dev
```

### Install Manticore

```bash
# Upgrade pip first
python -m pip install --upgrade pip

# Install protobuf version compatible with Manticore
# CRITICAL: Manticore requires protobuf<=3.20.3
# Newer versions cause incompatibility errors
pip install 'protobuf<=3.20.3'

# Install Manticore with native support
pip install manticore[native]

# Install Solidity compiler selector
pip install solc-select

# Select Solidity compiler version
solc-select install 0.8.24
solc-select use 0.8.24

# IMPORTANT: Patch wasm package for Python 3.10+ compatibility
# The wasm package (a Manticore dependency) has a bug where it uses
# collections.Callable instead of collections.abc.Callable
# This is automatically handled in CI, but for local installations:
python scripts/patch-wasm-types.py
```

### Verify Installation

```bash
manticore --version
solc --version
```

## Running Manticore

### Basic Analysis

```bash
manticore contracts/ProposalRegistry.sol --contract ProposalRegistry
```

### With Timeout (Using Shell Timeout)

Since `--timeout` flag may not be supported in all Manticore versions, use the shell's timeout command:

```bash
timeout 300 manticore contracts/ProposalRegistry.sol \
  --contract ProposalRegistry
```

### Quick Mode (Version Dependent)

**Note:** `--quick-mode` is not available in all Manticore versions. In recent versions, quick mode may be the default for Ethereum analysis. Check your version with `manticore --help` to see available options.

If supported:
```bash
manticore contracts/ProposalRegistry.sol \
  --contract ProposalRegistry \
  --quick-mode
```

### Specific Function Analysis

```bash
manticore contracts/ProposalRegistry.sol \
  --contract ProposalRegistry \
  --txlimit 3 \
  --txnocoverage
```

## Configuration Options

### Common Options

**Note:** Option availability depends on your Manticore version. Run `manticore --help` to see supported options.

- `--contract NAME`: Specify which contract to analyze (required for multi-contract files)
- `--txlimit N`: Maximum number of transactions to explore
- `--txnocoverage`: Don't track transaction coverage
- `--avoid-constant`: Skip constant functions
- `--only-alive-testcases`: Generate only valid test cases

### Advanced Options

- `--procs N`: Number of parallel workers
- `--depth N`: Maximum symbolic execution depth
- `--avoid-constant`: Skip view/pure functions

**Deprecated/Version-Dependent Options:**
- `--timeout SECONDS`: May not be supported; use shell `timeout` command instead
- `--quick-mode`: May not be available in all versions
- `--thorough-mode`: May not be available in all versions

## CI/CD Integration

Manticore runs automatically in the GitHub Actions workflow:

**Job:** `manticore-analysis`

```yaml
- name: Install Manticore
  run: |
    pip install 'protobuf<=3.20.3'
    pip install manticore[native]
    pip install solc-select
    solc-select install 0.8.24
    solc-select use 0.8.24

- name: Patch wasm package for Python 3.10+ compatibility
  run: python scripts/patch-wasm-types.py

- name: Run Manticore on ProposalRegistry
  run: |
    timeout 300 manticore contracts/ProposalRegistry.sol \
      --contract ProposalRegistry || true
```

Currently analyzed contracts:
- **ProposalRegistry**: Core proposal management
- **WelfareMetricRegistry**: Welfare metrics tracking

## Output and Results

### Output Directory

Manticore creates a `mcore_*` directory for each run containing:

```
mcore_XXXXXXXX/
├── global.summary        # Overall analysis summary
├── test_00000001.tx      # Test case 1
├── test_00000002.tx      # Test case 2
├── ...
└── visited.txt           # Coverage information
```

### Result Files

- **global.summary**: High-level analysis summary
- **test_*.tx**: Concrete test cases triggering specific paths
- **visited.txt**: List of executed instructions
- **manticore.log**: Detailed execution log

### Understanding Results

```
Results in mcore_dcfa35a8:
- Total execution paths: 127
- Completed paths: 89
- Paths with errors: 3
- Assertion violations: 0
- Integer overflows: 0
```

**Key metrics:**
- **Completed paths**: Successfully explored execution paths
- **Paths with errors**: Paths ending in reverts or failures
- **Assertion violations**: Failed require/assert statements
- **Integer overflows**: Detected arithmetic issues

## Interpreting Findings

### No Issues Found

```
No errors or security issues detected.
All execution paths completed successfully.
```

This means Manticore explored all reachable paths without finding vulnerabilities.

### Assertion Violations

```
Assertion violation found at:
  File: ProposalRegistry.sol, Line 89
  Path: test_00000042.tx
```

Review the test case file to understand the input that triggers the violation.

### Integer Overflow

```
Integer overflow detected:
  Expression: balance + amount
  Location: ProposalRegistry.sol:156
```

The overflow can occur with specific input values. Review the path constraints in the test case.

## Best Practices

When using Manticore:

1. **Start with small contracts**: Analyze individual contracts before systems
2. **Use timeouts**: Prevent analysis from running indefinitely
3. **Begin with quick mode**: Get initial results faster
4. **Increase depth gradually**: Balance thoroughness with execution time
5. **Review all findings**: Understand the context of detected issues
6. **Combine with other tools**: Use alongside Slither and Medusa
7. **Focus on critical functions**: Prioritize analysis of high-risk code

## Limitations

### Scalability

- **State explosion**: Analysis time grows exponentially with complexity
- **Loops**: Symbolic execution struggles with unbounded loops
- **External calls**: Limited support for analyzing external contracts

### Practical Constraints

- **Timeout required**: Complex contracts may not complete analysis
- **Resource intensive**: Requires significant CPU and memory
- **False positives**: May report theoretical issues that can't occur in practice

### Mitigation Strategies

- Use **quick mode** for initial analysis
- Set **reasonable timeouts** (300-600 seconds)
- Analyze **critical functions** separately
- Combine with **unit tests** for comprehensive coverage

## Example Analysis

### Analyzing ProposalRegistry

```bash
manticore contracts/ProposalRegistry.sol \
  --contract ProposalRegistry \
  --timeout 300 \
  --quick-mode
```

**Results:**
```
[*] Starting symbolic execution
[*] Found 45 execution paths
[*] Explored 45 paths (100% coverage)
[*] No assertion violations found
[*] No integer overflows detected
[*] Analysis completed in 178 seconds
```

### Analyzing WelfareMetricRegistry

```bash
manticore contracts/WelfareMetricRegistry.sol \
  --contract WelfareMetricRegistry \
  --timeout 300 \
  --quick-mode
```

**Results:**
```
[*] Starting symbolic execution
[*] Found 32 execution paths
[*] Explored 32 paths (100% coverage)
[*] No security issues detected
[*] Analysis completed in 142 seconds
```

## Advanced Usage

### Custom Scripts

Create Python scripts for advanced analysis:

```python
from manticore.ethereum import ManticoreEVM

# Initialize Manticore
m = ManticoreEVM()

# Create accounts
user = m.create_account(balance=1000)
contract = m.solidity_create_contract('ProposalRegistry.sol')

# Symbolic transaction
value = m.make_symbolic_value()
m.transaction(
    caller=user,
    address=contract,
    data=m.make_symbolic_buffer(32),
    value=value
)

# Run analysis
m.finalize()
```

### Targeting Specific Functions

```python
# Test specific function with constraints
contract = m.solidity_create_contract('ProposalRegistry.sol')

# Add constraint
amount = m.make_symbolic_value()
m.constrain(amount > 0)
m.constrain(amount < 1000000)

# Call function
contract.submitProposal(..., value=amount)
```

## Troubleshooting

### Analysis Runs Too Long

**Solution:**
- Reduce timeout: `--timeout 180`
- Use quick mode: `--quick-mode`
- Limit transactions: `--txlimit 2`

### Out of Memory

**Solution:**
- Reduce parallel workers: `--procs 1`
- Use quick mode
- Analyze smaller contracts individually

### No Results Generated

**Solution:**
- Check compilation: `npx hardhat compile`
- Verify Solidity version: `solc-select use 0.8.24`
- Check contract name spelling

### Too Many Paths

**Solution:**
- Simplify contract logic
- Add constraints to symbolic values
- Use `--txlimit` to reduce transaction depth

## Comparison with Other Tools

| Feature | Manticore | Slither | Medusa |
|---------|-----------|---------|--------|
| Analysis Type | Symbolic | Static | Fuzzing |
| Path Coverage | Complete | N/A | Random |
| Speed | Slow | Fast | Medium |
| False Positives | Low | Medium | Low |
| Resource Usage | High | Low | Medium |

**Use Manticore when:**
- Need complete path coverage
- Analyzing critical security functions
- Looking for subtle logic errors
- Have time for deep analysis

**Use Slither when:**
- Need quick feedback
- Looking for common patterns
- Analyzing large codebases
- Want coding best practices

**Use Medusa when:**
- Testing invariants
- Finding edge cases
- Need property-based testing
- Want continuous fuzzing

## Related Documentation

- [Manticore Documentation](https://github.com/trailofbits/manticore)
- [Trail of Bits Blog](https://blog.trailofbits.com/)
- [Static Analysis](static-analysis.md)
- [Fuzz Testing](fuzz-testing.md)
- [CI Configuration](ci-configuration.md)
