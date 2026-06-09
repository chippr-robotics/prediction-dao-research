# Integration Testing Plan

A comprehensive guide for end-to-end (E2E) integration testing of the Prediction DAO Research platform using Hardhat ecosystem best practices.

## Overview

This document outlines the strategy for integration testing that validates complete workflows across multiple contracts, ensuring the entire system functions correctly as an integrated whole. Unlike unit tests that validate individual contracts in isolation, integration tests verify that contracts work together properly and that the full user journey succeeds.

## Key E2E Workflows to Validate

### 1. Complete Proposal Lifecycle (ClearPath)

**Description:** A DAO proposal from submission through execution.

**Steps:**
1. Submit a proposal to ProposalRegistry with bond
2. Activate proposal via FutarchyGovernor
3. Create PASS/FAIL markets through ConditionalMarketFactory
4. Multiple traders execute trades on both markets
5. Privacy-preserving position tracking via PrivacyCoordinator
6. Trading period concludes
7. Oracle submits welfare metric data via OracleResolver
8. Challenge period passes without disputes
9. Proposal executes based on market signals
10. Bonds returned to proposer
11. Markets settled and traders redeem tokens

**Critical Validations:**
- State transitions across all contracts
- Bond accounting and treasury management
- Market liquidity and pricing accuracy
- Event emission sequence
- Access control enforcement
- Time-dependent operations (timelocks, deadlines)

### 2. Privacy-Preserving Trading Flow

**Description:** Encrypted position submission and settlement.

**Steps:**
1. Trader generates encryption keys
2. Submit encrypted position via PrivacyCoordinator
3. Market executes trade through ConditionalMarketFactory
4. Position commitment recorded on-chain
5. Trading period ends
6. Batch reveal process
7. Settlement with privacy guarantees maintained

**Critical Validations:**
- Encryption/decryption integrity
- zkSNARK proof verification
- Key-change message handling (MACI-style)
- Position privacy throughout lifecycle
- Batch processing correctness

### 3. Multi-Stage Oracle Resolution

**Description:** Oracle dispute and escalation process.

**Steps:**
1. Designated reporter submits initial welfare metric data
2. Challenge period opens
3. Challenger submits counter-evidence with escalation bond
4. Secondary oracle review triggered
5. Dispute resolution through UMA-style mechanism
6. Final resolution recorded
7. Bonds distributed to correct parties

**Critical Validations:**
- Multi-phase state transitions
- Bond management and slashing
- Time window enforcement
- Escalation mechanics
- Data integrity across resolution stages

### 4. Ragequit Protection Flow

**Description:** Minority token holder exits with proportional share.

**Steps:**
1. Controversial proposal passes market test
2. Dissenting token holder initiates ragequit
3. Token balance validation
4. Proportional treasury calculation
5. Share transfer from treasury to holder
6. Token burn
7. Governance rights removed

**Critical Validations:**
- Proportional calculation accuracy
- Treasury reserve requirements
- Token accounting
- Timing restrictions
- Access control on ragequit

### 5. FairWins Market Creation and Resolution

**Description:** User-created prediction market lifecycle.

**Steps:**
1. Market creator submits market with parameters
2. Initial liquidity provision
3. Creator bond staked
4. Market opens for trading
5. Multiple participants trade YES/NO tokens
6. Resolution date arrives
7. Creator submits outcome evidence
8. Challenge period (if applicable)
9. Market resolves
10. Winners redeem tokens
11. Creator bond returned

**Critical Validations:**
- Market parameter enforcement
- Liquidity provision mechanics
- Trading execution
- Resolution criteria enforcement
- Payout calculations

### 6. DAO Factory Deployment Flow

**Description:** Complete DAO deployment with all components.

**Steps:**
1. Deploy all core contracts via DAOFactory
2. Verify initialization parameters
3. Set up governance token distribution
4. Configure welfare metrics
5. Establish initial guardians
6. Validate access controls across system
7. Submit first test proposal

**Critical Validations:**
- Deterministic deployment addresses
- Contract interconnections
- Ownership and access control setup
- Initial state correctness

## Hardhat Ecosystem Best Practices

### Testing Framework Selection

**Recommended Stack:**
- **Hardhat Network**: Local Ethereum environment with advanced debugging
- **Hardhat Network Helpers**: Time manipulation, account impersonation, snapshot/revert
- **ethers.js v6**: Contract interaction library
- **Chai with Hardhat Matchers**: Assertion library with Ethereum-specific matchers
- **hardhat-deploy** (optional): Deployment fixture management for complex scenarios

**Why This Stack:**
- Native integration with Hardhat
- Fast execution on Hardhat Network's in-memory blockchain
- Excellent debugging capabilities (console.log in Solidity, stack traces)
- Type-safe with TypeScript support
- Community standard for Hardhat projects

### Test Organization

```
test/
├── unit/                              # Unit tests (existing)
│   ├── ProposalRegistry.test.js
│   ├── WelfareMetricRegistry.test.js
│   └── ...
├── integration/                       # New integration tests
│   ├── fixtures/
│   │   └── deploySystem.js           # Reusable deployment fixture
│   ├── clearpath/
│   │   ├── proposal-lifecycle.test.js
│   │   ├── privacy-trading.test.js
│   │   └── ragequit-flow.test.js
│   ├── fairwins/
│   │   └── market-lifecycle.test.js
│   ├── oracle/
│   │   └── resolution-flow.test.js
│   └── factory/
│       └── dao-deployment.test.js
└── e2e/                              # Full system tests (optional)
    └── complete-governance-cycle.test.js
```

### Fixture Pattern for Integration Tests

Use the `loadFixture` pattern from `@nomicfoundation/hardhat-network-helpers` to efficiently reset state between tests:

```javascript
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

async function deploySystemFixture() {
  // Deploy all contracts
  const [owner, user1, user2, proposer, trader1, trader2] = await ethers.getSigners();
  
  // Deploy and configure entire system
  const welfareRegistry = await deployWelfareRegistry();
  const proposalRegistry = await deployProposalRegistry();
  // ... deploy all contracts
  
  // Setup initial state
  await welfareRegistry.initialize(owner.address);
  // ... initialize all contracts
  
  // Configure relationships
  await proposalRegistry.transferOwnership(futarchyGovernor.address);
  // ... set up ownership and access control
  
  return {
    contracts: { welfareRegistry, proposalRegistry, /* ... */ },
    accounts: { owner, user1, user2, proposer, trader1, trader2 }
  };
}

describe("Integration Tests", function() {
  it("Should complete proposal lifecycle", async function() {
    const { contracts, accounts } = await loadFixture(deploySystemFixture);
    // Test implementation
  });
});
```

**Benefits:**
- Snapshot/restore for fast test execution
- Consistent initial state
- Reusable across multiple test suites
- Reduces test interdependencies

## Recommended Tooling

### Core Testing Tools

| Tool | Purpose | Installation |
|------|---------|--------------|
| **Hardhat** | Development environment | Included in devDependencies |
| **ethers.js v6** | Contract interaction | Included in devDependencies |
| **@nomicfoundation/hardhat-chai-matchers** | Ethereum-specific assertions | Included in devDependencies |
| **@nomicfoundation/hardhat-network-helpers** | Time/block manipulation | Included in devDependencies |
| **chai** | Assertion library | Included in devDependencies |

### Optional Enhancement Tools

| Tool | Purpose | When to Use |
|------|---------|-------------|
| **hardhat-deploy** | Deployment management | Complex deployment scenarios |
| **hardhat-tracer** | Transaction trace debugging | Debugging failed integration tests |
| **@ethereum-waffle/mock-contract** | Mock external contracts | Testing external integrations |
| **hardhat-gas-reporter** | Gas optimization | Performance testing |
| **solidity-coverage** | Code coverage | Ensuring test completeness |

### Testing Helpers

```javascript
// Time manipulation
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// Fast-forward time
await time.increase(3600); // 1 hour
await time.increaseTo(futureTimestamp);

// Mine blocks
await time.advanceBlock();
await time.advanceBlockTo(blockNumber);

// Account impersonation
const { impersonateAccount, setBalance } = require("@nomicfoundation/hardhat-network-helpers");
await impersonateAccount(address);
await setBalance(address, ethers.parseEther("100"));

// Snapshots
const { takeSnapshot } = require("@nomicfoundation/hardhat-network-helpers");
const snapshot = await takeSnapshot();
// ... run tests
await snapshot.restore();
```

## Detailed Setup Steps

### Step 1: Create Integration Test Directory Structure

```bash
mkdir -p test/integration/fixtures
mkdir -p test/integration/clearpath
mkdir -p test/integration/fairwins
mkdir -p test/integration/oracle
mkdir -p test/integration/factory
```

### Step 2: Create System Deployment Fixture

Create `test/integration/fixtures/deploySystem.js`:

```javascript
const { ethers } = require("hardhat");

async function deploySystemFixture() {
  // Get signers
  const [
    owner,
    guardian,
    proposer1,
    proposer2,
    trader1,
    trader2,
    trader3,
    challenger,
    reporter
  ] = await ethers.getSigners();

  // Deploy mock governance token
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const governanceToken = await MockERC20.deploy(
    "Governance Token",
    "GOV",
    ethers.parseEther("1000000")
  );
  await governanceToken.waitForDeployment();

  // Distribute tokens
  await governanceToken.transfer(proposer1.address, ethers.parseEther("10000"));
  await governanceToken.transfer(trader1.address, ethers.parseEther("5000"));
  await governanceToken.transfer(trader2.address, ethers.parseEther("5000"));

  // Deploy WelfareMetricRegistry
  const WelfareMetricRegistry = await ethers.getContractFactory("WelfareMetricRegistry");
  const welfareRegistry = await WelfareMetricRegistry.deploy();
  await welfareRegistry.waitForDeployment();
  await welfareRegistry.initialize(owner.address);

  // Deploy ProposalRegistry
  const ProposalRegistry = await ethers.getContractFactory("ProposalRegistry");
  const proposalRegistry = await ProposalRegistry.deploy();
  await proposalRegistry.waitForDeployment();
  await proposalRegistry.initialize(owner.address);

  // Deploy ConditionalMarketFactory
  const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
  const marketFactory = await ConditionalMarketFactory.deploy();
  await marketFactory.waitForDeployment();
  await marketFactory.initialize(owner.address);

  // Deploy PrivacyCoordinator
  const PrivacyCoordinator = await ethers.getContractFactory("PrivacyCoordinator");
  const privacyCoordinator = await PrivacyCoordinator.deploy();
  await privacyCoordinator.waitForDeployment();
  await privacyCoordinator.initialize(owner.address);

  // Deploy OracleResolver
  const OracleResolver = await ethers.getContractFactory("OracleResolver");
  const oracleResolver = await OracleResolver.deploy();
  await oracleResolver.waitForDeployment();
  await oracleResolver.initialize(owner.address);

  // Deploy RagequitModule
  const RagequitModule = await ethers.getContractFactory("RagequitModule");
  const ragequitModule = await RagequitModule.deploy();
  await ragequitModule.waitForDeployment();
  await ragequitModule.initialize(
    owner.address,
    await governanceToken.getAddress(),
    owner.address // Treasury vault (using owner as placeholder)
  );

  // Deploy FutarchyGovernor
  const FutarchyGovernor = await ethers.getContractFactory("FutarchyGovernor");
  const futarchyGovernor = await FutarchyGovernor.deploy();
  await futarchyGovernor.waitForDeployment();
  await futarchyGovernor.initialize(
    owner.address,
    await welfareRegistry.getAddress(),
    await proposalRegistry.getAddress(),
    await marketFactory.getAddress(),
    await privacyCoordinator.getAddress(),
    await oracleResolver.getAddress(),
    await ragequitModule.getAddress()
  );

  // Transfer ownership to FutarchyGovernor
  await welfareRegistry.transferOwnership(await futarchyGovernor.getAddress());
  await proposalRegistry.transferOwnership(await futarchyGovernor.getAddress());
  await marketFactory.transferOwnership(await futarchyGovernor.getAddress());
  await oracleResolver.transferOwnership(await futarchyGovernor.getAddress());

  // Setup initial welfare metrics
  await futarchyGovernor.connect(owner).proposeMetric(
    "Treasury Value",
    5000, // 50% weight
    0 // Governance category
  );
  await futarchyGovernor.connect(owner).activateMetric(0);

  return {
    contracts: {
      governanceToken,
      welfareRegistry,
      proposalRegistry,
      marketFactory,
      privacyCoordinator,
      oracleResolver,
      ragequitModule,
      futarchyGovernor
    },
    accounts: {
      owner,
      guardian,
      proposer1,
      proposer2,
      trader1,
      trader2,
      trader3,
      challenger,
      reporter
    },
    constants: {
      BOND_AMOUNT: ethers.parseEther("50"),
      FUNDING_AMOUNT: ethers.parseEther("1000"),
      TRADE_AMOUNT: ethers.parseEther("100")
    }
  };
}

module.exports = { deploySystemFixture };
```

### Step 3: Create Example Integration Test

Create `test/integration/clearpath/proposal-lifecycle.test.js`:

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { deploySystemFixture } = require("../fixtures/deploySystem");

describe("Integration: Complete Proposal Lifecycle", function () {
  describe("Full proposal flow from submission to execution", function () {
    it("Should complete entire proposal lifecycle successfully", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { 
        futarchyGovernor,
        proposalRegistry, 
        marketFactory,
        oracleResolver 
      } = contracts;
      const { proposer1, trader1, trader2, reporter } = accounts;

      // Step 1: Submit proposal
      const proposalTx = await proposalRegistry.connect(proposer1).submitProposal(
        "Integration Test Proposal",
        "Testing complete flow",
        constants.FUNDING_AMOUNT,
        proposer1.address,
        0, // welfare metric ID
        ethers.ZeroAddress,
        0,
        await time.latest() + 90 * 24 * 3600,
        { value: constants.BOND_AMOUNT }
      );

      await expect(proposalTx)
        .to.emit(proposalRegistry, "ProposalSubmitted")
        .withArgs(0, proposer1.address);

      // Step 2: Activate proposal (creates markets)
      await futarchyGovernor.connect(accounts.owner).activateProposal(0);

      const proposal = await proposalRegistry.getProposal(0);
      expect(proposal.status).to.equal(1); // Active status

      // Step 3: Execute trades on PASS market
      await marketFactory.connect(trader1).buyTokens(
        0, // marketId
        true, // PASS tokens
        constants.TRADE_AMOUNT,
        { value: constants.TRADE_AMOUNT }
      );

      await marketFactory.connect(trader2).buyTokens(
        0,
        false, // FAIL tokens
        constants.TRADE_AMOUNT,
        { value: constants.TRADE_AMOUNT }
      );

      // Step 4: Advance time past trading period
      await time.increase(14 * 24 * 3600); // 14 days

      // Step 5: Oracle submits resolution
      const reportTx = await oracleResolver.connect(reporter).submitReport(
        0, // proposalId
        ethers.parseEther("1.2"), // welfare metric value (20% increase)
        "Positive outcome evidence"
      );

      await expect(reportTx)
        .to.emit(oracleResolver, "ReportSubmitted");

      // Step 6: Advance time past challenge period
      await time.increase(3 * 24 * 3600); // 3 days

      // Step 7: Finalize resolution
      await oracleResolver.connect(accounts.owner).finalizeResolution(0);

      // Step 8: Execute proposal (if markets indicate positive outcome)
      const executeTx = await futarchyGovernor.connect(accounts.owner).executeProposal(0);

      await expect(executeTx)
        .to.emit(futarchyGovernor, "ProposalExecuted")
        .withArgs(0);

      // Step 9: Verify final state
      const finalProposal = await proposalRegistry.getProposal(0);
      expect(finalProposal.status).to.equal(3); // Executed status

      // Step 10: Verify bonds returned
      const proposerBalance = await ethers.provider.getBalance(proposer1.address);
      expect(proposerBalance).to.be.gt(0); // Bond returned

      // Step 11: Traders redeem tokens
      await marketFactory.connect(trader1).redeemTokens(0, true);
      await marketFactory.connect(trader2).redeemTokens(0, false);
    });

    it("Should handle proposal rejection correctly", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      // Test negative outcome flow
      // ... implementation
    });

    it("Should enforce timelock before execution", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      // Test timelock enforcement
      // ... implementation
    });
  });

  describe("Multi-proposal scenarios", function () {
    it("Should handle multiple concurrent proposals", async function () {
      // Test parallel proposals
      // ... implementation
    });
  });
});
```

### Step 4: Update Package.json Scripts

Add integration test scripts:

```json
{
  "scripts": {
    "test": "hardhat test",
    "test:unit": "hardhat test test/*.test.js",
    "test:integration": "hardhat test test/integration/**/*.test.js",
    "test:integration:clearpath": "hardhat test test/integration/clearpath/**/*.test.js",
    "test:integration:fairwins": "hardhat test test/integration/fairwins/**/*.test.js",
    "test:all": "hardhat test test/**/*.test.js",
    "test:gas": "REPORT_GAS=true hardhat test",
    "test:coverage": "hardhat coverage"
  }
}
```

### Step 5: Configure Hardhat for Integration Tests

Update `hardhat.config.js` if needed:

```javascript
module.exports = {
  // ... existing config
  mocha: {
    timeout: 120000 // 2 minutes for integration tests
  },
  networks: {
    hardhat: {
      chainId: 1337,
      allowUnlimitedContractSize: true,
      accounts: {
        count: 20, // More accounts for integration tests
        accountsBalance: "10000000000000000000000" // 10,000 ETH each
      },
      mining: {
        auto: true,
        interval: 0
      }
    }
  }
};
```

## Writing Integration Tests

### Test Structure Template

```javascript
describe("Integration: [Feature Name]", function () {
  // Use longer timeout for integration tests
  this.timeout(120000);

  describe("[Workflow Name]", function () {
    it("Should [expected behavior]", async function () {
      // 1. Setup
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);

      // 2. Execute workflow steps
      // Step 1: ...
      // Step 2: ...
      // Step N: ...

      // 3. Verify state changes
      expect(actualValue).to.equal(expectedValue);

      // 4. Verify events
      await expect(tx).to.emit(contract, "EventName");

      // 5. Verify cross-contract consistency
      const stateA = await contractA.getState();
      const stateB = await contractB.getState();
      expect(stateA).to.be.consistent.with(stateB);
    });
  });
});
```

### Best Practices for Integration Tests

1. **Use Fixtures for State Management**
   - Create reusable deployment fixtures
   - Use `loadFixture` for snapshot/restore efficiency
   - Minimize redundant setup code

2. **Test Complete Workflows**
   - Cover all steps in the user journey
   - Include both happy path and error scenarios
   - Validate state consistency across contracts

3. **Verify Cross-Contract Interactions**
   - Check that contract A's state updates trigger correct behavior in contract B
   - Validate event emission sequences
   - Ensure proper access control across boundaries

4. **Time-Dependent Operations**
   - Use `time.increase()` to test time-based logic
   - Test deadline enforcement
   - Validate timelock mechanisms

5. **Account for Gas Costs**
   - Ensure test accounts have sufficient ETH
   - Test gas-intensive operations
   - Monitor gas usage in complex workflows

6. **Event-Driven Assertions**
   - Verify event emission for all state changes
   - Check event parameter correctness
   - Validate event ordering in multi-step workflows

7. **Error Handling**
   - Test revert conditions at each step
   - Verify error messages
   - Ensure proper state rollback on failure

8. **Test Data Consistency**
   - Verify data integrity across contract boundaries
   - Check calculation accuracy (bonds, payouts, shares)
   - Validate state synchronization

### Common Integration Test Patterns

#### Pattern 1: Multi-Contract State Verification

```javascript
it("Should maintain consistent state across contracts", async function () {
  const { contracts } = await loadFixture(deploySystemFixture);

  // Perform action
  await contracts.proposalRegistry.submitProposal(/* ... */);

  // Verify consistent state
  const proposalInRegistry = await contracts.proposalRegistry.getProposal(0);
  const proposalInGovernor = await contracts.futarchyGovernor.getProposal(0);
  
  expect(proposalInRegistry.id).to.equal(proposalInGovernor.id);
  expect(proposalInRegistry.status).to.equal(proposalInGovernor.status);
});
```

#### Pattern 2: Event Sequence Validation

```javascript
it("Should emit events in correct order", async function () {
  const { contracts } = await loadFixture(deploySystemFixture);

  const tx = await contracts.futarchyGovernor.activateProposal(0);
  const receipt = await tx.wait();

  // Verify event order
  expect(receipt.logs[0].eventName).to.equal("ProposalActivated");
  expect(receipt.logs[1].eventName).to.equal("MarketsCreated");
  expect(receipt.logs[2].eventName).to.equal("TradingPeriodStarted");
});
```

#### Pattern 3: Time-Based Workflow

```javascript
it("Should enforce time constraints", async function () {
  const { contracts, accounts } = await loadFixture(deploySystemFixture);

  // Setup
  await contracts.proposalRegistry.submitProposal(/* ... */);
  await contracts.futarchyGovernor.activateProposal(0);

  // Attempt execution before timelock expires
  await expect(
    contracts.futarchyGovernor.executeProposal(0)
  ).to.be.revertedWith("Timelock not expired");

  // Advance time
  await time.increase(2 * 24 * 3600); // 2 days

  // Now should succeed
  await expect(contracts.futarchyGovernor.executeProposal(0))
    .to.not.be.reverted;
});
```

#### Pattern 4: Multi-User Interaction

```javascript
it("Should handle concurrent user actions", async function () {
  const { contracts, accounts } = await loadFixture(deploySystemFixture);

  // Multiple users trade simultaneously
  await Promise.all([
    contracts.marketFactory.connect(accounts.trader1).buyTokens(0, true, amount),
    contracts.marketFactory.connect(accounts.trader2).buyTokens(0, false, amount),
    contracts.marketFactory.connect(accounts.trader3).buyTokens(0, true, amount)
  ]);

  // Verify market state reflects all trades
  const marketState = await contracts.marketFactory.getMarket(0);
  expect(marketState.totalVolume).to.equal(amount * 3n);
});
```

#### Pattern 5: Error Recovery

```javascript
it("Should handle and recover from errors gracefully", async function () {
  const { contracts, accounts } = await loadFixture(deploySystemFixture);

  // Attempt invalid operation
  await expect(
    contracts.proposalRegistry.submitProposal(/* invalid params */)
  ).to.be.reverted;

  // Verify state unchanged
  expect(await contracts.proposalRegistry.proposalCount()).to.equal(0);

  // Subsequent valid operation should succeed
  await expect(
    contracts.proposalRegistry.submitProposal(/* valid params */)
  ).to.not.be.reverted;
  
  expect(await contracts.proposalRegistry.proposalCount()).to.equal(1);
});
```

## Maintaining Integration Tests

### Test Maintenance Guidelines

1. **Keep Tests Independent**
   - Each test should run in isolation
   - Use fixtures to ensure clean state
   - Avoid test interdependencies

2. **Update Tests with Contract Changes**
   - When contracts change, update integration tests first
   - Use tests to validate refactoring
   - Maintain test coverage during updates

3. **Refactor Common Patterns**
   - Extract helper functions for repeated operations
   - Create utility modules for common assertions
   - Maintain a library of reusable test components

4. **Document Complex Scenarios**
   - Add comments explaining multi-step workflows
   - Document expected outcomes
   - Reference issue/ticket numbers

5. **Regular Test Review**
   - Review tests during code reviews
   - Remove obsolete tests
   - Update for best practice changes

### Helper Functions Library

Create `test/integration/helpers/index.js`:

```javascript
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function submitAndActivateProposal(contracts, accounts, proposalData) {
  const tx = await contracts.proposalRegistry
    .connect(accounts.proposer)
    .submitProposal(
      proposalData.title,
      proposalData.description,
      proposalData.fundingAmount,
      proposalData.recipient,
      proposalData.metricId,
      proposalData.token,
      proposalData.startDate,
      proposalData.deadline,
      { value: proposalData.bond }
    );

  const receipt = await tx.wait();
  const proposalId = receipt.logs[0].args.proposalId;

  await contracts.futarchyGovernor
    .connect(accounts.owner)
    .activateProposal(proposalId);

  return proposalId;
}

async function executeTrades(marketFactory, traders, marketId, amounts) {
  for (let i = 0; i < traders.length; i++) {
    await marketFactory
      .connect(traders[i].signer)
      .buyTokens(marketId, traders[i].buyPass, amounts[i], {
        value: amounts[i]
      });
  }
}

async function completeOracleResolution(oracleResolver, owner, reporter, proposalId, value) {
  await oracleResolver
    .connect(reporter)
    .submitReport(proposalId, value, "Test evidence");

  await time.increase(3 * 24 * 3600); // Challenge period

  await oracleResolver
    .connect(owner)
    .finalizeResolution(proposalId);
}

module.exports = {
  submitAndActivateProposal,
  executeTrades,
  completeOracleResolution
};
```

## Running Integration Tests

### Basic Commands

```bash
# Run all integration tests
npm run test:integration

# Run specific test suite
npm run test:integration:clearpath

# Run single test file
npx hardhat test test/integration/clearpath/proposal-lifecycle.test.js

# Run with gas reporting
REPORT_GAS=true npm run test:integration

# Run with detailed output
npx hardhat test test/integration/**/*.test.js --verbose

# Run specific test by name
npx hardhat test --grep "Should complete entire proposal lifecycle"
```

### Debugging Integration Tests

```bash
# Enable Hardhat console.log in contracts
# Add to contract: import "hardhat/console.sol";
# Then: console.log("Debug info:", value);

# Run with stack traces
npx hardhat test --show-stack-traces

# Run with verbose errors
npx hardhat test --verbose

# Use hardhat-tracer for detailed traces
npm install --save-dev hardhat-tracer
npx hardhat test --logs
```

### Performance Monitoring

```bash
# Time individual tests
npx hardhat test --reporter mocha-reporter-time

# Memory profiling
NODE_OPTIONS="--max-old-space-size=4096" npm run test:integration

# Parallel execution (if tests are truly independent)
# Note: Use with caution for integration tests
npm install --save-dev hardhat-parallel
```

## Automation and Continuous Integration

### GitHub Actions Workflow

Create `.github/workflows/integration-tests.yml`:

```yaml
name: Integration Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]
  workflow_dispatch:

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run integration tests
        run: npm run test:integration

      - name: Generate test report
        if: always()
        run: |
          npx hardhat test test/integration/**/*.test.js --reporter json > integration-report.json

      - name: Upload test report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: integration-test-report
          path: integration-report.json

      - name: Upload gas report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: gas-report
          path: gas-report.txt

  integration-tests-coverage:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run coverage for integration tests
        run: npx hardhat coverage --testfiles "test/integration/**/*.test.js"

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
          flags: integration-tests
          name: integration-coverage
```

### Pre-commit Hooks

Install Husky for pre-commit hooks:

```bash
npm install --save-dev husky
npx husky install
```

Create `.husky/pre-commit`:

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run integration tests on critical files before commit
npm run test:integration
```

### Continuous Monitoring

Set up automated monitoring:

1. **Test Execution Time Tracking**
   - Monitor test execution duration
   - Alert on significant slowdowns
   - Optimize slow tests

2. **Failure Rate Monitoring**
   - Track flaky tests
   - Identify patterns in failures
   - Prioritize stability improvements

3. **Coverage Tracking**
   - Monitor integration test coverage
   - Set minimum thresholds
   - Alert on coverage drops

## Test Completeness and Success Criteria

### Coverage Metrics

**Integration Test Coverage Goals:**

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| E2E Workflows | 100% | 0% | 🔴 To Implement |
| Critical Paths | 100% | 0% | 🔴 To Implement |
| Contract Interactions | ≥ 90% | 0% | 🔴 To Implement |
| Error Scenarios | ≥ 80% | 0% | 🔴 To Implement |
| Time-dependent Logic | 100% | 0% | 🔴 To Implement |

### Success Criteria for Integration Tests

A comprehensive integration test suite should:

#### 1. **Workflow Coverage**
- [ ] All 6 key E2E workflows have test coverage
- [ ] Each workflow has both happy path and error path tests
- [ ] Multi-user scenarios are tested
- [ ] Concurrent operations are validated

#### 2. **Cross-Contract Validation**
- [ ] State consistency across all contract pairs
- [ ] Event emission sequences are validated
- [ ] Access control across boundaries is tested
- [ ] Data integrity is maintained throughout workflows

#### 3. **Time-Dependent Operations**
- [ ] All timelocks are tested
- [ ] Deadlines are enforced
- [ ] Time-based state transitions work correctly
- [ ] Challenge periods function as expected

#### 4. **Error Handling**
- [ ] Reverts at each workflow step are tested
- [ ] State rollback is verified
- [ ] Error messages are validated
- [ ] Recovery from errors is possible

#### 5. **Performance**
- [ ] Gas usage is within acceptable ranges
- [ ] No test exceeds 2-minute timeout
- [ ] Fixture loading is efficient
- [ ] Tests can run in parallel where appropriate

#### 6. **Maintainability**
- [ ] Tests are well-documented
- [ ] Helper functions reduce duplication
- [ ] Fixtures are reusable
- [ ] Test names clearly describe scenarios

#### 7. **CI/CD Integration**
- [ ] Tests run automatically on PRs
- [ ] Test reports are generated
- [ ] Failures block merges
- [ ] Coverage reports are tracked

### Validation Checklist

Before considering integration testing complete:

- [ ] All 6 key E2E workflows implemented
- [ ] Deployment fixture created and tested
- [ ] Helper functions library established
- [ ] CI/CD pipeline configured
- [ ] Coverage targets met
- [ ] Documentation updated
- [ ] Team trained on writing integration tests
- [ ] Test execution time < 5 minutes for full suite
- [ ] Zero flaky tests
- [ ] All critical bugs caught by integration tests

### Metrics Dashboard

Track these metrics over time:

| Metric | Formula | Target |
|--------|---------|--------|
| **Test Coverage** | (Tested Workflows / Total Workflows) × 100% | ≥ 95% |
| **Pass Rate** | (Passing Tests / Total Tests) × 100% | ≥ 99% |
| **Execution Time** | Total time for integration suite | < 5 min |
| **Flakiness Rate** | (Flaky Tests / Total Tests) × 100% | < 1% |
| **Detection Rate** | (Bugs Found by Tests / Total Bugs) × 100% | ≥ 80% |
| **Mean Time to Failure** | Average time before test fails | Trending up |

## Advanced Topics

### Testing with External Services

For contracts that interact with external oracles or services:

```javascript
const { impersonateAccount, setBalance } = require("@nomicfoundation/hardhat-network-helpers");

it("Should handle external oracle response", async function () {
  // Impersonate oracle account
  const oracleAddress = "0x...";
  await impersonateAccount(oracleAddress);
  await setBalance(oracleAddress, ethers.parseEther("10"));

  const oracle = await ethers.getSigner(oracleAddress);
  
  // Oracle submits data
  await contracts.oracleResolver.connect(oracle).submitData(/* ... */);
});
```

### Testing Upgradeable Contracts

If using proxy patterns:

```javascript
const { upgrades } = require("@openzeppelin/hardhat-upgrades");

it("Should maintain state through upgrade", async function () {
  // Deploy v1
  const ContractV1 = await ethers.getContractFactory("ContractV1");
  const contract = await upgrades.deployProxy(ContractV1, [initArgs]);

  // Set state
  await contract.setState(42);

  // Upgrade to v2
  const ContractV2 = await ethers.getContractFactory("ContractV2");
  const upgraded = await upgrades.upgradeProxy(contract.address, ContractV2);

  // Verify state preserved
  expect(await upgraded.getState()).to.equal(42);
});
```

### Load Testing

For high-throughput scenarios:

```javascript
it("Should handle high transaction volume", async function () {
  this.timeout(300000); // 5 minutes

  const transactions = [];
  for (let i = 0; i < 100; i++) {
    transactions.push(
      contracts.marketFactory.connect(traders[i % traders.length])
        .buyTokens(0, true, ethers.parseEther("1"))
    );
  }

  // Execute in batches
  const batchSize = 10;
  for (let i = 0; i < transactions.length; i += batchSize) {
    const batch = transactions.slice(i, i + batchSize);
    await Promise.all(batch);
  }

  // Verify all transactions succeeded
  const marketState = await contracts.marketFactory.getMarket(0);
  expect(marketState.transactionCount).to.equal(100);
});
```

## Troubleshooting Common Issues

### Issue: Tests Timeout

**Symptoms:** Tests hang and eventually timeout

**Solutions:**
- Increase timeout: `this.timeout(120000)`
- Check for missing `await` on promises
- Verify transaction confirmations
- Check for infinite loops in contracts

### Issue: Inconsistent Test Results

**Symptoms:** Tests pass/fail randomly

**Solutions:**
- Ensure fixtures reset state properly
- Check for race conditions in async code
- Verify time-dependent logic uses `time.increase()`
- Isolate test dependencies

### Issue: Gas Estimation Failures

**Symptoms:** "gas required exceeds allowance" errors

**Solutions:**
- Increase gas limit in hardhat config
- Check for revert conditions in transaction
- Ensure accounts have sufficient balance
- Review contract logic for gas optimization

### Issue: Event Assertion Failures

**Symptoms:** "Event not emitted" errors

**Solutions:**
- Verify event name matches contract
- Check event parameters
- Ensure transaction was mined
- Use `receipt.logs` to inspect all events

## Next Steps

1. **Implement Core Fixtures**
   - Create `deploySystemFixture` in `test/integration/fixtures/`
   - Test fixture loading and state consistency

2. **Write First Integration Test**
   - Start with complete proposal lifecycle test
   - Validate full workflow end-to-end
   - Document learnings and patterns

3. **Expand Test Coverage**
   - Add privacy trading flow tests
   - Implement oracle resolution tests
   - Create ragequit flow tests
   - Add FairWins market tests

4. **Setup CI/CD**
   - Configure GitHub Actions workflow
   - Set up coverage tracking
   - Enable automated test runs

5. **Train Team**
   - Review this document with team
   - Conduct integration test workshop
   - Establish test writing standards
   - Create contribution guidelines

## Resources

### Documentation
- [Hardhat Documentation](https://hardhat.org/docs)
- [Hardhat Network Helpers](https://hardhat.org/hardhat-network-helpers/docs)
- [ethers.js Documentation](https://docs.ethers.org/v6/)
- [Chai Matchers](https://hardhat.org/hardhat-chai-matchers/docs)

### Examples
- [OpenZeppelin Test Helpers](https://docs.openzeppelin.com/test-helpers/)
- [Hardhat Tutorial](https://hardhat.org/tutorial)
- [Uniswap V3 Tests](https://github.com/Uniswap/v3-core/tree/main/test)
- [Compound Protocol Tests](https://github.com/compound-finance/compound-protocol/tree/master/tests)

### Tools
- [hardhat-tracer](https://github.com/zemse/hardhat-tracer) - Advanced debugging
- [solidity-coverage](https://github.com/sc-forks/solidity-coverage) - Coverage tool
- [eth-gas-reporter](https://github.com/cgewecke/eth-gas-reporter) - Gas analysis

## Conclusion

This integration testing plan provides a comprehensive framework for validating the Prediction DAO Research platform's E2E flows. By following these best practices and implementing the recommended test structure, the team can ensure system reliability, catch integration issues early, and maintain high code quality throughout the development lifecycle.

The key to successful integration testing is:
- **Comprehensive coverage** of all critical workflows
- **Efficient test execution** through fixtures and helpers
- **Maintainable test code** with clear patterns and documentation
- **Automated validation** through CI/CD integration
- **Continuous improvement** based on metrics and feedback

Start with the core workflows, build a solid foundation, and expand coverage iteratively.
