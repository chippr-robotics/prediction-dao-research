# Static Analysis with Slither

Slither is a static analysis framework that detects vulnerabilities and code quality issues in Solidity contracts without executing them.

## What Slither Tests For

Slither analyzes code for:

### Vulnerability Detection

- **Reentrancy**: Detects potential reentrancy vulnerabilities
- **Unprotected Functions**: Identifies functions missing access control
- **Integer Overflow/Underflow**: Finds unsafe arithmetic operations
- **Uninitialized Storage**: Detects uninitialized storage pointers
- **Dangerous Delegatecall**: Warns about unsafe delegatecall usage
- **Incorrect Equality**: Identifies problematic equality checks
- **Timestamp Dependence**: Detects reliance on block.timestamp
- **Unchecked Return Values**: Finds ignored return values from calls

### Code Quality Issues

- **Unused Variables**: Identifies declared but unused variables
- **Dead Code**: Detects unreachable code
- **Naming Conventions**: Checks adherence to Solidity naming standards
- **Code Duplication**: Finds repeated code patterns
- **Missing Events**: Detects state changes without event emissions
- **Inefficient Patterns**: Identifies gas-inefficient code constructs

### Best Practices

- **Solidity Version**: Checks for up-to-date compiler version
- **External Calls**: Ensures safe external call patterns
- **State Variable Shadowing**: Detects variable shadowing issues
- **Constructor Issues**: Identifies constructor-related problems
- **Assembly Usage**: Warns about inline assembly risks

## Installation

### Local Installation

```bash
pip install slither-analyzer
pip install solc-select

# Select Solidity compiler version
solc-select install 0.8.24
solc-select use 0.8.24
```

### Verify Installation

```bash
slither --version
```

## Configuration

Slither is configured via `slither.config.json`:

```json
{
  "filter_paths": "node_modules|test|contracts/mocks",
  "exclude_dependencies": true,
  "exclude_optimization": false,
  "exclude_informational": false,
  "exclude_low": false,
  "exclude_medium": false,
  "exclude_high": false,
  "json": "slither-report.json",
  "markdown-root": ".",
  "checklist": true,
  "markdown": "slither-report.md",
  "solc_remaps": [
    "@openzeppelin/contracts=node_modules/@openzeppelin/contracts"
  ],
  "compile_force_framework": "hardhat"
}
```

### Configuration Options

- **filter_paths**: Exclude specific directories from analysis
- **exclude_dependencies**: Skip analysis of imported dependencies
- **exclude_[severity]**: Filter results by severity level
- **json/markdown**: Output format and location
- **solc_remaps**: Map import paths for dependency resolution
- **compile_force_framework**: Use Hardhat for compilation

## Running Slither

### Basic Analysis

```bash
slither . --config-file slither.config.json
```

### Analyze Specific Contract

```bash
slither contracts/ProposalRegistry.sol
```

### With Specific Detectors

```bash
slither . --detect reentrancy-eth,unprotected-upgrade
```

### Generate Reports

```bash
# JSON report
slither . --json slither-report.json

# Markdown report
slither . --markdown-root . --checklist
```

## Output Format

Slither categorizes findings by severity:

### High Severity

Critical vulnerabilities requiring immediate attention:
- Reentrancy vulnerabilities
- Unprotected ether withdrawal
- Arbitrary code execution
- Unsafe delegatecall

### Medium Severity

Important issues that should be addressed:
- Missing zero-address validation
- Incorrect access control
- Unsafe type casting
- Dangerous strict equalities

### Low Severity

Minor issues and code quality concerns:
- Unused state variables
- Public functions that could be external
- Costly operations in loops
- Missing events for critical functions

### Informational

Code quality suggestions:
- Naming convention violations
- Solidity version recommendations
- Optimization opportunities
- Best practice improvements

## CI/CD Integration

Slither runs automatically in the GitHub Actions workflow:

**Job:** `slither-analysis`

```yaml
- name: Install Slither
  run: |
    pip install slither-analyzer
    pip install solc-select
    solc-select install 0.8.24
    solc-select use 0.8.24

- name: Run Slither analysis
  run: |
    slither . --config-file slither.config.json || true
```

Results are:
- Saved as JSON and Markdown reports
- Uploaded as workflow artifacts
- Displayed in the workflow summary

## Interpreting Results

### Understanding the Output

```
ProposalRegistry.submitProposal(string,string,uint256,address,uint256,address,uint256,uint256) (contracts/ProposalRegistry.sol#80-110) uses a dangerous strict equality:
- require(bool,string)(msg.value == bondAmount,Insufficient bond) (contracts/ProposalRegistry.sol#89)
Reference: https://github.com/crytic/slither/wiki/Detector-Documentation#dangerous-strict-equalities
```

This output shows:
- **Function/Location**: Where the issue was found
- **Issue Type**: What vulnerability or problem was detected
- **Reference Link**: Documentation about the detector

### False Positives

Not all Slither findings are actual vulnerabilities:

- **Context matters**: Some patterns are safe in specific contexts
- **Use suppressions**: Add comments to suppress known false positives
- **Review carefully**: Don't blindly fix all issues without understanding them

### Suppressing Findings

Add comments to suppress false positives:

```solidity
// slither-disable-next-line reentrancy-eth
function withdraw() external {
    // Safe withdrawal pattern
}
```

## Common Findings

### Reentrancy

**What it detects:**
Functions that make external calls before updating state.

**Example:**
```solidity
// Vulnerable
function withdraw() external {
    uint256 amount = balances[msg.sender];
    (bool success, ) = msg.sender.call{value: amount}("");
    require(success);
    balances[msg.sender] = 0; // State update after external call
}
```

**Fix:**
```solidity
// Safe
function withdraw() external nonReentrant {
    uint256 amount = balances[msg.sender];
    balances[msg.sender] = 0; // State update before external call
    (bool success, ) = msg.sender.call{value: amount}("");
    require(success);
}
```

### Unprotected Functions

**What it detects:**
Functions that change critical state without access control.

**Example:**
```solidity
// Vulnerable
function setOwner(address newOwner) external {
    owner = newOwner;
}
```

**Fix:**
```solidity
// Safe
function setOwner(address newOwner) external onlyOwner {
    owner = newOwner;
}
```

### Missing Zero-Address Checks

**What it detects:**
Functions that accept addresses without validating them.

**Example:**
```solidity
// Vulnerable
constructor(address _token) {
    token = _token;
}
```

**Fix:**
```solidity
// Safe
constructor(address _token) {
    require(_token != address(0), "Invalid token");
    token = _token;
}
```

## Best Practices

When using Slither:

1. **Run regularly**: Analyze code before every commit
2. **Fix high severity**: Address critical issues immediately
3. **Review medium severity**: Evaluate and fix important issues
4. **Consider low severity**: Improve code quality when practical
5. **Document suppressions**: Explain why findings are suppressed
6. **Keep up to date**: Update Slither regularly for new detectors
7. **Combine with other tools**: Use alongside Manticore and Medusa

## Advanced Usage

### Custom Detectors

Create project-specific detectors:

```bash
slither . --detect detector-name
```

### Integration with Other Tools

Combine Slither with:
- **Mythril**: For deeper symbolic analysis
- **Echidna**: For property-based fuzzing
- **Securify**: For additional static analysis

### Continuous Monitoring

Set up automated Slither checks:
- Pre-commit hooks
- Pull request reviews
- Scheduled security scans

## Troubleshooting

### Compilation Errors

If Slither fails to compile:

```bash
# Clean and recompile
npm run clean
npm run compile

# Verify Hardhat works
npx hardhat compile
```

### Import Resolution Issues

If imports aren't resolved:

```json
{
  "solc_remaps": [
    "@openzeppelin/contracts=node_modules/@openzeppelin/contracts",
    "@custom/library=node_modules/@custom/library"
  ]
}
```

### Too Many Results

Filter by severity:

```bash
slither . --exclude-low --exclude-informational
```

## Example Report

Sample Slither findings for ClearPath contracts:

```
Summary:
- High: 0 findings
- Medium: 2 findings
- Low: 8 findings
- Informational: 15 findings

Medium Severity:
1. WelfareMetricRegistry.proposeMetric(string,uint256,string) 
   Missing zero-address validation for metric name

2. OracleResolver.submitReport(uint256,uint256,uint256,bytes)
   Uses timestamp for sensitive operations

Low Severity:
- Multiple unused function parameters
- Public functions that could be external
- Missing events for state changes
```

## Related Documentation

- [Slither GitHub Repository](https://github.com/crytic/slither)
- [Slither Wiki](https://github.com/crytic/slither/wiki)
- [Symbolic Execution](symbolic-execution.md)
- [CI Configuration](ci-configuration.md)
