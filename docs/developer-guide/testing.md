# Testing

Comprehensive testing guide for Prediction DAO smart contracts and frontend.

## Test Structure

```
test/
├── WelfareMetricRegistry.test.js
├── ProposalRegistry.test.js
├── ConditionalMarketFactory.test.js
├── PrivacyCoordinator.test.js
├── OracleResolver.test.js
├── RagequitModule.test.js
└── FutarchyGovernor.test.js
```

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npx hardhat test test/ProposalRegistry.test.js

# Run with coverage
npm run test:coverage

# Run with gas reporting
npx hardhat test --gas-reporter
```

## Writing Tests

### Basic Test Structure

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("ProposalRegistry", function () {
  // Fixture for reusable setup
  async function deployFixture() {
    const [owner, proposer, other] = await ethers.getSigners();
    
    const ProposalRegistry = await ethers.getContractFactory("ProposalRegistry");
    const proposalRegistry = await ProposalRegistry.deploy();
    await proposalRegistry.waitForDeployment();
    
    return { proposalRegistry, owner, proposer, other };
  }

  describe("Proposal Submission", function () {
    it("Should submit proposal with correct bond", async function () {
      const { proposalRegistry, proposer } = await loadFixture(deployFixture);
      
      const tx = await proposalRegistry.connect(proposer).submitProposal(
        "Test Proposal",
        "Description",
        ethers.parseEther("1000"),
        proposer.address,
        1,
        { value: ethers.parseEther("50") }
      );
      
      await expect(tx)
        .to.emit(proposalRegistry, "ProposalSubmitted")
        .withArgs(0, proposer.address);
    });

    it("Should revert if bond is insufficient", async function () {
      const { proposalRegistry, proposer } = await loadFixture(deployFixture);
      
      await expect(
        proposalRegistry.connect(proposer).submitProposal(
          "Test",
          "Description",
          ethers.parseEther("1000"),
          proposer.address,
          1,
          { value: ethers.parseEther("40") } // Too low
        )
      ).to.be.revertedWith("Insufficient bond");
    });
  });
});
```

### Testing Events

```javascript
it("Should emit correct event", async function () {
  const tx = await contract.doSomething();
  
  await expect(tx)
    .to.emit(contract, "SomethingDone")
    .withArgs(expectedArg1, expectedArg2);
});
```

### Testing Reverts

```javascript
it("Should revert with correct message", async function () {
  await expect(
    contract.restrictedFunction()
  ).to.be.revertedWith("Not authorized");
  
  // For custom errors
  await expect(
    contract.restrictedFunction()
  ).to.be.revertedWithCustomError(contract, "Unauthorized");
});
```

### Testing State Changes

```javascript
it("Should update state correctly", async function () {
  await contract.updateValue(42);
  
  expect(await contract.value()).to.equal(42);
});
```

## Test Coverage Goals

Aim for comprehensive coverage:

- **Statements**: > 95%
- **Branches**: > 90%
- **Functions**: > 95%
- **Lines**: > 95%

Check coverage:

```bash
npm run test:coverage
```

## Integration Tests

Test contract interactions:

```javascript
describe("Proposal Lifecycle", function () {
  it("Should complete full proposal flow", async function () {
    // Setup
    const { futarchyGovernor, proposalRegistry, marketFactory } = 
      await loadFixture(deploySystemFixture);
    
    // Submit proposal
    await proposalRegistry.submitProposal(...);
    
    // Activate
    await futarchyGovernor.activateProposal(0);
    
    // Verify market created
    const marketId = await marketFactory.getMarketForProposal(0);
    expect(marketId).to.not.equal(0);
    
    // Trade
    // ... trade on market
    
    // Resolve
    await oracleResolver.submitReport(...);
    
    // Execute
    await futarchyGovernor.executeProposal(0);
    
    // Verify execution
    const proposal = await proposalRegistry.getProposal(0);
    expect(proposal.status).to.equal(ProposalStatus.Executed);
  });
});
```

## Gas Optimization Tests

```javascript
it("Should use reasonable gas", async function () {
  const tx = await contract.expensiveOperation();
  const receipt = await tx.wait();
  
  expect(receipt.gasUsed).to.be.lessThan(300000);
});
```

## Security Tests

Test for common vulnerabilities:

```javascript
describe("Security", function () {
  it("Should prevent reentrancy", async function () {
    const Attacker = await ethers.getContractFactory("ReentrancyAttacker");
    const attacker = await Attacker.deploy(contract.target);
    
    await expect(
      attacker.attack()
    ).to.be.reverted;
  });
  
  it("Should enforce access control", async function () {
    const { contract, unauthorized } = await loadFixture(deployFixture);
    
    await expect(
      contract.connect(unauthorized).privilegedFunction()
    ).to.be.revertedWith("Not authorized");
  });
});
```

## Frontend Testing

See `frontend/` directory for React component tests.

## Continuous Integration

Tests run automatically on every commit via GitHub Actions.

For more details, see:

- [Smart Contracts](smart-contracts.md)
- [Contributing Guidelines](contributing.md)
- [Setup Guide](setup.md)
