# Unit Testing

Unit testing ensures functional correctness of smart contracts through comprehensive test coverage using the Hardhat testing framework.

## What Unit Testing Tests For

Unit tests validate:

- **Functional Correctness**: Each contract method behaves as specified
- **Edge Cases**: Boundary conditions and unusual inputs are handled properly
- **Access Control**: Only authorized users can call restricted functions
- **State Management**: Contract state updates correctly after operations
- **Event Emissions**: Events are emitted with correct parameters
- **Revert Conditions**: Functions revert with appropriate error messages
- **Gas Efficiency**: Operations use reasonable amounts of gas

## Test Coverage

All contracts in the repository have comprehensive unit tests:

| Contract | Test File | Tests |
|----------|-----------|-------|
| ConditionalMarketFactory | `ConditionalMarketFactory.test.js` | 12 tests |
| DAOFactory | `DAOFactory.test.js` | 24 tests (skipped*) |
| FutarchyGovernor | `FutarchyGovernor.test.js` | 13 tests |
| OracleResolver | `OracleResolver.test.js` | 13 tests |
| PrivacyCoordinator | `PrivacyCoordinator.test.js` | 13 tests |
| ProposalRegistry | `ProposalRegistry.test.js` | 25 tests |
| RagequitModule | `RagequitModule.test.js` | 12 tests |
| WelfareMetricRegistry | `WelfareMetricRegistry.test.js` | 17 tests |

**Total: 95 passing tests**

\* *DAOFactory tests are skipped due to the contract exceeding EIP-170's 24KB bytecode size limit. The contract deploys 6 sub-contracts in the constructor, causing it to exceed the deployment size limit. This is a known issue that requires contract refactoring (e.g., using EIP-1167 minimal proxies).*

## Running Unit Tests

### All Tests

```bash
npm test
```

### Specific Test File

```bash
npx hardhat test test/ProposalRegistry.test.js
```

### With Gas Reporting

```bash
npm run test:gas
```

This generates a detailed gas usage report showing:
- Gas used for contract deployment
- Gas used for each method call
- Average, minimum, and maximum gas consumption
- USD cost estimates (when API key provided)

### With Coverage

```bash
npm run test:coverage
```

Generates HTML coverage reports showing:
- Line coverage
- Branch coverage
- Statement coverage
- Function coverage

Coverage reports are saved to `coverage/` directory.

## Coverage Goals

Target coverage metrics:

- **Statements**: > 80%
- **Branches**: > 75%
- **Functions**: > 90%
- **Lines**: > 80%

## Test Structure

Tests follow a consistent structure:

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ContractName", function () {
  let contract;
  let owner;
  let addr1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    
    const Contract = await ethers.getContractFactory("ContractName");
    contract = await Contract.deploy();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await contract.owner()).to.equal(owner.address);
    });
  });

  describe("FunctionName", function () {
    it("Should perform expected action", async function () {
      await expect(contract.functionName())
        .to.emit(contract, "EventName");
    });

    it("Should revert on invalid input", async function () {
      await expect(contract.functionName(invalidInput))
        .to.be.revertedWith("Error message");
    });
  });
});
```

## Helper Contracts

Mock contracts are available for testing:

- **MockERC20**: ERC20 token for testing token interactions
  - Located in `contracts/mocks/MockERC20.sol`
  - Includes `mint` and `burn` functions for flexible testing

## CI/CD Integration

Unit tests run automatically in the GitHub Actions workflow:

**Job:** `hardhat-tests`

```yaml
- name: Run tests with gas reporting
  env:
    REPORT_GAS: true
  run: npm test
```

- Runs on every pull request and push
- Uploads gas report as artifact
- Fails the build if any test fails

## Best Practices

When writing unit tests:

1. **Test one thing at a time**: Each test should verify a single behavior
2. **Use descriptive names**: Test names should clearly state what they test
3. **Test both success and failure cases**: Cover happy paths and error conditions
4. **Use beforeEach for setup**: Keep tests independent and repeatable
5. **Check events and state changes**: Verify complete contract behavior
6. **Use helper functions**: Create utilities for common test operations
7. **Test access control**: Verify permissions are enforced correctly
8. **Test edge cases**: Check boundary conditions and unusual inputs

## Gas Optimization

Monitor gas usage with the gas reporter:

```bash
REPORT_GAS=true npm test
```

Look for:
- **High gas usage**: Operations using > 300,000 gas
- **Inconsistent costs**: Wide variation between min/max values
- **Optimization opportunities**: Storage operations, loops, string manipulation

## Example Test

```javascript
describe("ProposalRegistry", function () {
  describe("Proposal Submission", function () {
    it("Should allow submission with correct bond", async function () {
      const BOND_AMOUNT = ethers.parseEther("50");
      
      await expect(
        proposalRegistry.connect(proposer).submitProposal(
          "Test Proposal",
          "Description",
          ethers.parseEther("1000"),
          recipient.address,
          0, // welfareMetricId
          ethers.ZeroAddress, // native token
          0, // startDate
          getFutureTimestamp(90), // deadline
          { value: BOND_AMOUNT }
        )
      ).to.emit(proposalRegistry, "ProposalSubmitted");
    });

    it("Should reject submission with incorrect bond", async function () {
      await expect(
        proposalRegistry.connect(proposer).submitProposal(
          "Test Proposal",
          "Description",
          ethers.parseEther("1000"),
          recipient.address,
          0,
          ethers.ZeroAddress,
          0,
          getFutureTimestamp(90),
          { value: ethers.parseEther("10") } // Too low
        )
      ).to.be.revertedWith("Insufficient bond");
    });
  });
});
```

## Troubleshooting

### Tests Fail Locally But Pass in CI

- Ensure Node.js version matches CI (v20)
- Clear Hardhat cache: `npm run clean`
- Reinstall dependencies: `rm -rf node_modules && npm install`

### Timeout Errors

- Increase timeout in test: `this.timeout(60000)`
- Check for stuck async operations
- Verify network connection for tests requiring external services

### Gas Estimation Errors

- Ensure sufficient balance in test accounts
- Check for revert conditions in the transaction
- Verify contract state before transaction

## Related Documentation

- [Developer Guide: Testing](../developer-guide/testing.md)
- [Static Analysis](static-analysis.md)
- [CI Configuration](ci-configuration.md)
