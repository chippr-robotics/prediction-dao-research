# Integration Tests

This directory contains integration tests for the Prediction DAO Research platform. Integration tests validate end-to-end workflows across multiple contracts, ensuring the system works correctly as an integrated whole.

## Directory Structure

```
test/integration/
├── README.md                           # This file
├── fixtures/
│   └── deploySystem.js                # System-wide deployment fixture
├── helpers/
│   └── index.js                       # Reusable helper functions
├── clearpath/
│   └── proposal-lifecycle.test.js     # ClearPath proposal lifecycle tests
├── fairwins/                          # FairWins market tests (to be implemented)
├── oracle/                            # Oracle resolution tests (to be implemented)
└── factory/                           # DAO factory tests (to be implemented)
```

## Running Integration Tests

```bash
# Run all integration tests
npm run test:integration

# Run specific test suite
npm run test:integration:clearpath

# Run with gas reporting
REPORT_GAS=true npm run test:integration

# Run specific test file
npx hardhat test test/integration/clearpath/proposal-lifecycle.test.js

# Run with verbose output
npx hardhat test test/integration/**/*.test.js --verbose
```

## Test Organization

Integration tests are organized by feature area:

- **clearpath/**: Tests for ClearPath (DAO governance) workflows
- **fairwins/**: Tests for FairWins (prediction markets) workflows
- **oracle/**: Tests for oracle resolution and dispute mechanisms
- **factory/**: Tests for DAO factory deployment

## Fixtures

### deploySystemFixture

The main fixture that deploys and configures the entire system:

```javascript
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deploySystemFixture } = require("../fixtures/deploySystem");

it("Should test something", async function() {
  const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
  // Test implementation
});
```

**Returns:**
- `contracts`: All deployed contracts (futarchyGovernor, proposalRegistry, etc.)
- `accounts`: Test accounts (owner, proposer1, trader1, etc.)
- `constants`: Common constants (BOND_AMOUNT, FUNDING_AMOUNT, etc.)

## Helper Functions

Common operations are abstracted into helper functions:

```javascript
const {
  submitAndActivateProposal,
  executeTrades,
  completeOracleResolution,
  getFutureTimestamp,
  advanceDays,
  createProposalData,
  waitForTradingPeriodEnd,
  verifyProposalState,
  createTradeConfigs
} = require("../helpers");
```

### Key Helpers

- **submitAndActivateProposal**: Submit proposal and activate it in one step
- **executeTrades**: Execute multiple trades from different accounts
- **completeOracleResolution**: Complete full oracle resolution including challenge period
- **advanceDays**: Fast-forward blockchain time by specified days
- **createProposalData**: Generate proposal data with sensible defaults

## Writing Integration Tests

### Template

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deploySystemFixture } = require("../fixtures/deploySystem");
const { submitAndActivateProposal, /* ... */ } = require("../helpers");

describe("Integration: [Feature Name]", function () {
  this.timeout(120000); // 2 minutes

  describe("[Workflow Name]", function () {
    it("Should [expected behavior]", async function () {
      // Setup
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);

      // Execute workflow steps
      // ...

      // Verify expectations
      expect(actualValue).to.equal(expectedValue);
    });
  });
});
```

### Best Practices

1. **Use Fixtures**: Always use `loadFixture(deploySystemFixture)` for consistent state
2. **Use Helpers**: Leverage helper functions to reduce code duplication
3. **Clear Steps**: Add comments or console.log to show workflow progression
4. **Verify State**: Check both contract state and event emissions
5. **Test Error Paths**: Include tests for failure scenarios
6. **Descriptive Names**: Use clear, descriptive test names

### Example Test

```javascript
it("Should complete entire proposal lifecycle successfully", async function () {
  const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
  
  // Step 1: Submit and activate proposal
  const proposalData = await createProposalData({
    recipient: accounts.proposer1.address,
    bond: constants.BOND_AMOUNT
  });
  
  const proposalId = await submitAndActivateProposal(
    contracts,
    { proposer: accounts.proposer1, owner: accounts.owner },
    proposalData
  );
  
  // Step 2: Execute trades
  const trades = createTradeConfigs(
    [accounts.trader1, accounts.trader2],
    [true, false],
    [constants.TRADE_AMOUNT, constants.TRADE_AMOUNT]
  );
  await executeTrades(contracts.marketFactory, trades, proposalId);
  
  // Step 3: Complete trading period
  await waitForTradingPeriodEnd(14);
  
  // Step 4: Oracle resolution
  await completeOracleResolution(
    contracts.oracleResolver,
    { owner: accounts.owner, reporter: accounts.reporter },
    proposalId,
    ethers.parseEther("1.2"),
    "Positive outcome"
  );
  
  // Step 5: Execute proposal
  await contracts.futarchyGovernor.connect(accounts.owner).executeProposal(proposalId);
  
  // Verify final state
  const proposal = await contracts.proposalRegistry.getProposal(proposalId);
  expect(proposal.status).to.equal(3); // Executed
});
```

## Key Workflows Covered

### 1. Complete Proposal Lifecycle
- Proposal submission with bond
- Proposal activation and market creation
- Trading period with multiple traders
- Oracle resolution
- Proposal execution

### 2. Privacy-Preserving Trading (To be implemented)
- Encrypted position submission
- zkSNARK proof verification
- Key-change messages
- Batch processing

### 3. Multi-Stage Oracle Resolution (To be implemented)
- Initial report submission
- Challenge period
- Dispute resolution
- Final settlement

### 4. Ragequit Protection (To be implemented)
- Token holder exit
- Proportional share calculation
- Treasury withdrawal

### 5. FairWins Market Lifecycle (To be implemented)
- Market creation
- Trading
- Resolution
- Settlement

### 6. DAO Factory Deployment (To be implemented)
- Complete DAO deployment
- Configuration
- Access control setup

## Debugging

### Enable Console Logs

Add to your contract:
```solidity
import "hardhat/console.sol";
console.log("Debug info:", value);
```

### Stack Traces

Run with stack traces:
```bash
npx hardhat test --show-stack-traces
```

### Verbose Output

Run with verbose mode:
```bash
npx hardhat test --verbose
```

## Continuous Integration

Integration tests run automatically in CI/CD:

- On every pull request
- On pushes to main/develop branches
- Can be triggered manually via GitHub Actions

See `.github/workflows/integration-tests.yml` (to be created)

## Coverage Goals

| Metric | Target | Status |
|--------|--------|--------|
| E2E Workflows | 100% | 🟡 In Progress (1/6) |
| Critical Paths | 100% | 🟡 In Progress |
| Contract Interactions | ≥ 90% | 🟡 In Progress |
| Error Scenarios | ≥ 80% | 🔴 To Implement |

## Contributing

When adding new integration tests:

1. Follow the directory structure
2. Use the deployment fixture
3. Leverage existing helper functions
4. Add new helpers for reusable operations
5. Include both happy path and error scenarios
6. Update this README if adding new test suites

## References

- [Integration Testing Plan](../../docs/developer-guide/integration-testing.md)
- [ADR-002: Integration Testing Strategy](../../docs/adr/002-integration-testing-strategy.md)
- [Testing Guide](../../docs/developer-guide/testing.md)
- [Hardhat Network Helpers](https://hardhat.org/hardhat-network-helpers/docs)
