# Medusa Fuzz Testing Setup

## Overview

This document describes the Medusa fuzz testing setup for the Prediction DAO smart contracts.

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

Medusa fuzz testing runs in two contexts:

### Weekly Torture Test
- **Workflow:** `torture-test.yml`
- **Schedule:** Every Monday at 00:00 UTC
- **Timeout:** 2 hours (120 minutes)
- **Fuzzing Duration:** 1 hour (3600 seconds)
- **Purpose:** Comprehensive security testing with extended fuzzing time
- **Trigger:** Automated weekly + manual dispatch

### Local Development
For quick local testing, use a shorter timeout:
```bash
medusa fuzz --timeout 300  # 5 minutes for quick checks
```

Results are collected and uploaded as artifacts with 90-day retention for the torture test.

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
- [Fuzz Testing Best Practices](https://docs.FairWins.app/security/fuzz-testing/)
