# Medusa Fuzz Testing Setup

## Overview

This document describes the Medusa fuzz testing setup for the Prediction DAO smart contracts.

## What Was Fixed

The Medusa fuzzing configuration was incorrectly targeting production contracts instead of fuzz test contracts. This has been corrected to ensure proper security testing.

### Changes Made

1. **Updated medusa.json configuration**
   - Changed `targetContracts` from production contracts to fuzz test contracts:
     - `ProposalRegistryFuzzTest`
     - `WelfareMetricRegistryFuzzTest`

2. **Relocated fuzz test contracts**
   - Moved fuzz test contracts from `test/fuzzing/` to `contracts/` directory
   - This ensures they are properly compiled by crytic-compile which Medusa uses

3. **Fixed imports**
   - Updated import paths to reflect the new location
   - Changed from `../../contracts/X.sol` to `./X.sol`

4. **Improved test implementations**
   - Fixed invariant tests to properly track state changes between calls
   - Updated WelfareMetricRegistryFuzzTest to use correct contract methods

5. **Updated .gitignore**
   - Added `medusa-corpus/` to prevent committing test artifacts

## Running Medusa Locally

To run Medusa fuzz testing locally:

```bash
# Install Go (if not already installed)
# Install Medusa
go install github.com/crytic/medusa@latest

# Install crytic-compile
pip install crytic-compile

# Compile contracts
npm run compile

# Run Medusa (with 5-minute timeout)
export PATH=$PATH:$HOME/go/bin
medusa fuzz --timeout 300
```

## Test Results

Medusa now successfully runs and validates:

### Property Tests (Invariants)
1. `ProposalRegistryFuzzTest.property_bond_amount_positive()` - Ensures bond amount is always positive
2. `ProposalRegistryFuzzTest.property_proposal_count_never_decreases()` - Ensures proposal count monotonically increases
3. `WelfareMetricRegistryFuzzTest.property_metric_count_never_decreases()` - Ensures metric count monotonically increases
4. `WelfareMetricRegistryFuzzTest.property_total_weight_bounded()` - Ensures individual metric weights never exceed maximum

### Assertion Tests
6 additional assertion tests validate contract state and view functions

All 10 tests pass successfully with no security vulnerabilities detected.

## CI/CD Integration

Medusa runs automatically in the GitHub Actions workflow:
- Job: `medusa-fuzzing` in `security-testing.yml`
- Timeout: 30 minutes
- Results are collected and uploaded as artifacts
- The job continues on error to allow review of any findings

## Configuration

The Medusa configuration is in `medusa.json` with the following key settings:

- **Workers**: 10 parallel workers for fuzzing
- **Call Sequence Length**: 100 calls per sequence
- **Coverage**: Enabled with HTML and LCOV reports
- **Target Contracts**: `ProposalRegistryFuzzTest`, `WelfareMetricRegistryFuzzTest`
- **Property Testing**: Enabled with `property_` prefix
- **Assertion Testing**: Enabled
- **Optimization Testing**: Enabled with `optimize_` prefix

## Further Reading

- [Medusa Documentation](https://github.com/crytic/medusa)
- [Fuzz Testing Best Practices](https://chippr-robotics.github.io/prediction-dao-research/security/fuzz-testing/)
