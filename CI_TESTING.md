# Continuous Integration Testing Documentation

This document provides comprehensive information about the automated testing and security analysis workflows for the Prediction DAO smart contracts.

## Overview

The repository implements multiple layers of automated testing and security analysis:

1. **Unit Testing** - Comprehensive test coverage using Hardhat
2. **Gas Optimization** - Automated gas usage reporting
3. **Coverage Analysis** - Code coverage metrics for all contracts
4. **Static Analysis** - Slither for detecting vulnerabilities
5. **Symbolic Execution** - Manticore for deep vulnerability analysis
6. **Fuzz Testing** - Medusa for property-based testing

## Workflows

### Security Testing Workflow (`security-testing.yml`)

**Triggers:**
- Pull requests to `main` or `develop` branches
- Direct pushes to `main` or `develop` branches
- Weekly schedule (Mondays at 00:00 UTC)
- Manual workflow dispatch

**Jobs:**

#### 1. Hardhat Unit Tests & Gas Report
- Runs all unit tests in the `test/` directory
- Generates detailed gas usage reports for all contract methods
- Reports are saved as artifacts for 30 days

**Environment Variables:**
- `REPORT_GAS=true` - Enables gas reporting

#### 2. Coverage Analysis
- Generates code coverage reports using `solidity-coverage`
- Produces HTML reports showing line, branch, and statement coverage
- Coverage reports are uploaded as artifacts

#### 3. Slither Static Analysis
- Performs comprehensive static analysis of all contracts
- Detects common vulnerabilities and code quality issues
- Outputs both JSON and Markdown reports

**Configuration:** `slither.config.json`

#### 4. Manticore Symbolic Execution
- Executes symbolic analysis on key contracts
- Explores different execution paths
- Detects potential vulnerabilities through path exploration
- Limited to 300 seconds per contract to prevent timeouts

**Analyzed Contracts:**
- ProposalRegistry
- WelfareMetricRegistry

#### 5. Medusa Fuzz Testing
- Performs property-based fuzz testing
- Tests invariants defined in fuzz test contracts
- Runs for up to 300 seconds
- Uses corpus-based fuzzing for better coverage

**Configuration:** `medusa.json`

#### 6. Summary Generation
- Aggregates results from all testing jobs
- Generates a comprehensive summary in the workflow UI
- Includes key metrics and artifact links

## Tool Versions

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20.x | Runtime for Hardhat |
| Hardhat | 2.22.0 | Testing framework |
| Python | 3.11 | Runtime for security tools |
| Slither | latest | Static analysis |
| Manticore | latest | Symbolic execution |
| Medusa | latest | Fuzz testing |
| Go | 1.21 | Runtime for Medusa |

## Local Testing

### Prerequisites

```bash
# Install Node.js dependencies
npm install

# Install Python tools
pip install slither-analyzer manticore[native] crytic-compile solc-select

# Install Medusa
go install github.com/crytic/medusa@latest

# Select Solidity compiler version
solc-select install 0.8.24
solc-select use 0.8.24
```

### Running Tests Locally

#### Unit Tests
```bash
npm test
```

#### Unit Tests with Gas Reporting
```bash
REPORT_GAS=true npm test
```

#### Coverage Report
```bash
npm run test:coverage
```

#### Slither Analysis
```bash
slither . --config-file slither.config.json
```

#### Manticore Analysis
```bash
# Analyze specific contract
manticore contracts/ProposalRegistry.sol --contract ProposalRegistry --timeout 300

# Quick mode for faster analysis
manticore contracts/ProposalRegistry.sol --contract ProposalRegistry --timeout 300 --quick-mode
```

#### Medusa Fuzzing
```bash
# Run fuzzing with default configuration
medusa fuzz

# Run with custom timeout
medusa fuzz --timeout 600
```

## Configuration Files

### `hardhat.config.js`

Configures Hardhat testing environment and gas reporter:

```javascript
gasReporter: {
  enabled: process.env.REPORT_GAS ? true : false,
  currency: "USD",
  outputFile: process.env.REPORT_GAS ? "gas-report.txt" : undefined,
  noColors: process.env.REPORT_GAS ? true : false,
}
```

### `slither.config.json`

Configures Slither static analysis:

- Filters out test files and dependencies
- Includes all severity levels
- Outputs JSON and Markdown reports
- Uses Hardhat compilation framework

### `medusa.json`

Configures Medusa fuzzing:

- 10 parallel workers
- 100 call sequence length
- Coverage-enabled fuzzing
- Targets all main contracts
- Assertion, property, and optimization testing enabled

## Test Coverage

All contracts in the repository have comprehensive test coverage:

| Contract | Unit Tests | Fuzz Tests |
|----------|------------|------------|
| ConditionalMarketFactory | ✅ | - |
| DAOFactory | ✅ | - |
| FutarchyGovernor | ✅ | - |
| OracleResolver | ✅ | - |
| PrivacyCoordinator | ✅ | - |
| ProposalRegistry | ✅ | ✅ |
| RagequitModule | ✅ | - |
| WelfareMetricRegistry | ✅ | ✅ |

## Interpreting Results

### Gas Reports

Gas reports show the gas consumption for each contract method:

- **deployments** - Gas used to deploy contracts
- **method calls** - Gas used for each function call
- **avg/min/max** - Statistical analysis of gas usage

Use these metrics to:
- Identify expensive operations
- Compare gas usage across different implementations
- Optimize contract code

### Coverage Reports

Coverage reports show:
- **Line coverage** - Percentage of lines executed
- **Branch coverage** - Percentage of branches taken
- **Statement coverage** - Percentage of statements executed

Target: Aim for >80% coverage for all metrics.

### Slither Results

Slither categorizes issues by severity:

- **High** - Critical vulnerabilities that should be fixed immediately
- **Medium** - Important issues that should be addressed
- **Low** - Minor issues and best practice violations
- **Informational** - Code quality suggestions

### Manticore Results

Manticore explores execution paths and reports:
- Potential vulnerabilities
- Assertion violations
- Integer overflows/underflows
- Reentrancy issues

Review `mcore_*` directories for detailed analysis results.

### Medusa Results

Medusa tests invariants and properties:
- **property_*** - Property tests that should always hold
- **optimize_*** - Optimization opportunities
- **Failed tests** - Invariant violations that need attention

## Maintenance

### Updating Tool Versions

#### Hardhat and Dependencies
```bash
# Update package.json versions
npm update

# Check for outdated packages
npm outdated

# Update specific package
npm update hardhat --save-dev
```

#### Python Tools
```bash
# Update Slither
pip install --upgrade slither-analyzer

# Update Manticore
pip install --upgrade manticore[native]

# Update crytic-compile
pip install --upgrade crytic-compile
```

#### Medusa
```bash
# Update Medusa
go install github.com/crytic/medusa@latest
```

### Adding New Tests

#### Unit Tests
1. Create test file in `test/` directory
2. Follow existing test patterns
3. Run tests locally before committing

#### Fuzz Tests
1. Create fuzz test contract in `test/fuzzing/` directory
2. Implement property functions with `property_` prefix
3. Add contract name to `medusa.json` targetContracts
4. Run Medusa locally to verify

### Adding New Contracts

When adding new contracts:

1. **Create unit tests** in `test/`
2. **Add to Medusa config** if fuzz testing is needed
3. **Run full test suite** to ensure no regressions
4. **Review security analysis** results carefully

## Troubleshooting

### Tests Fail in CI but Pass Locally

- Ensure Node.js version matches (v20)
- Check for environment-specific issues
- Review GitHub Actions logs for detailed errors

### Slither Errors

- Verify Solidity compiler version matches
- Check that all imports are resolved correctly
- Review `slither.config.json` for correct paths

### Manticore Timeouts

- Reduce timeout value for faster feedback
- Use `--quick-mode` for preliminary analysis
- Consider splitting analysis into smaller chunks

### Medusa Fails to Run

- Ensure Go is installed and in PATH
- Verify `medusa.json` configuration is valid
- Check that contracts compile successfully

### High Gas Usage

- Review gas reports for expensive operations
- Consider optimization techniques:
  - Use events instead of storage when possible
  - Batch operations
  - Optimize storage layout
  - Use appropriate data types

## CI/CD Best Practices

1. **Always run tests locally** before pushing
2. **Review security analysis results** carefully
3. **Don't ignore warnings** - they often indicate real issues
4. **Keep dependencies updated** regularly
5. **Add tests for new features** immediately
6. **Monitor gas usage** to prevent regression
7. **Fix security issues** before merging PRs

## Support and Resources

### Documentation
- [Hardhat Documentation](https://hardhat.org/docs)
- [Slither Documentation](https://github.com/crytic/slither)
- [Manticore Documentation](https://github.com/trailofbits/manticore)
- [Medusa Documentation](https://github.com/crytic/medusa)

### Security Resources
- [Smart Contract Security Best Practices](https://consensys.github.io/smart-contract-best-practices/)
- [SWC Registry](https://swcregistry.io/)
- [OpenZeppelin Security](https://docs.openzeppelin.com/contracts/5.x/security)

### Getting Help

For issues with the CI/CD pipeline:
1. Check the GitHub Actions workflow logs
2. Review this documentation
3. Open an issue in the repository
4. Contact the development team

## Appendix: Workflow Artifacts

All workflow runs produce artifacts that are retained for 30 days:

- **gas-report** - Detailed gas usage statistics
- **coverage-report** - HTML coverage reports
- **slither-reports** - JSON and Markdown analysis reports
- **manticore-results** - Symbolic execution results
- **medusa-results** - Fuzz testing corpus and results

Access artifacts from the GitHub Actions UI:
1. Navigate to the Actions tab
2. Select the workflow run
3. Scroll to "Artifacts" section
4. Download desired artifacts
