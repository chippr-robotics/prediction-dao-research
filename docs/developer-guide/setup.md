# Developer Setup

This guide will help you set up your development environment for contributing to Prediction DAO Research.

## Prerequisites

Before you begin, ensure you have the following installed:

### Required Software

- **Node.js** v18 or higher ([download](https://nodejs.org/))
- **npm** or **yarn** package manager
- **Git** version control ([download](https://git-scm.com/))
- **MetaMask** browser extension for testing

### Recommended Tools

- **VS Code** or your preferred IDE
- **Hardhat** for Solidity development
- **Solidity** language support for your IDE
- **Git GUI** (optional, e.g., GitKraken, SourceTree)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/chippr-robotics/prediction-dao-research.git
cd prediction-dao-research
```

### 2. Install Dependencies

Install root project dependencies:

```bash
npm install
```

Install frontend dependencies:

```bash
cd frontend
npm install
cd ..
```

### 3. Verify Installation

Check that everything is installed correctly:

```bash
# Verify Hardhat installation
npx hardhat --version

# Verify compilation works
npx hardhat compile
```

## Project Structure

```
prediction-dao-research/
├── contracts/              # Solidity smart contracts
│   ├── FutarchyGovernor.sol
│   ├── WelfareMetricRegistry.sol
│   ├── ProposalRegistry.sol
│   ├── ConditionalMarketFactory.sol
│   ├── PrivacyCoordinator.sol
│   ├── OracleResolver.sol
│   └── RagequitModule.sol
├── test/                   # Contract tests (Mocha/Chai)
│   ├── WelfareMetricRegistry.test.js
│   └── ProposalRegistry.test.js
├── scripts/                # Deployment and utility scripts
│   └── deploy.js
├── frontend/              # React frontend application
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── App.jsx       # Main application
│   │   └── App.css       # Styles
│   ├── public/           # Static assets
│   └── package.json
├── hardhat.config.js      # Hardhat configuration
├── package.json           # Project dependencies
└── README.md             # Project documentation
```

## Local Development Workflow

### 1. Start Local Blockchain

Open a terminal and start the Hardhat network:

```bash
npm run node
```

This will:

- Start a local Ethereum node at `http://127.0.0.1:8545`
- Create 20 test accounts with 10,000 ETH each
- Display account addresses and private keys
- Keep running in the background

!!! tip "Keep This Terminal Open"
    Keep this terminal running throughout your development session. The blockchain state resets when you stop it.

### 2. Deploy Contracts

In a new terminal, deploy contracts to the local network:

```bash
npm run deploy:local
```

This will:

- Compile all smart contracts
- Deploy them to the local network
- Display contract addresses
- Save deployment artifacts

**Save the contract addresses** for frontend configuration.

### 3. Run Tests

Run the test suite:

```bash
# Run all tests
npm test

# Run specific test file
npx hardhat test test/WelfareMetricRegistry.test.js

# Run with coverage
npm run test:coverage

# Run with gas reporting
npx hardhat test --gas-reporter
```

### 4. Start Frontend

In a third terminal, start the frontend development server:

```bash
npm run frontend
```

Or navigate to the frontend directory:

```bash
cd frontend
npm run dev
```

The frontend will be available at `http://localhost:5173`

## Configuration

### Configure MetaMask for Local Development

1. Open MetaMask
2. Click on network dropdown
3. Select "Add Network" → "Add a network manually"
4. Enter:
   - **Network Name**: Hardhat Local
   - **RPC URL**: http://127.0.0.1:8545
   - **Chain ID**: 1337
   - **Currency Symbol**: ETH

5. Import a test account:
   - Copy a private key from Hardhat node output
   - MetaMask → Account menu → Import Account
   - Paste private key

### Configure Frontend

Update contract addresses in the frontend:

```javascript
// frontend/src/config.js
export const contracts = {
  FutarchyGovernor: "0x...",
  WelfareMetricRegistry: "0x...",
  ProposalRegistry: "0x...",
  // ... other contracts
};
```

### Environment Variables

Create a `.env` file in the root directory (never commit this!):

```bash
# For testnet/mainnet deployment
PRIVATE_KEY=your_private_key_here
INFURA_KEY=your_infura_key_here
ETHERSCAN_API_KEY=your_etherscan_key_here

# For production frontend
VITE_CONTRACT_ADDRESS_GOVERNOR=0x...
VITE_CONTRACT_ADDRESS_REGISTRY=0x...
```

## Development Commands

### Smart Contract Commands

```bash
# Compile contracts
npm run compile
npx hardhat compile

# Run tests
npm test
npx hardhat test

# Test specific file
npx hardhat test test/ProposalRegistry.test.js

# Generate coverage report
npm run test:coverage
npx hardhat coverage

# Clean artifacts
npm run clean
npx hardhat clean

# Deploy to local network
npm run deploy:local

# Deploy to testnet
npx hardhat run scripts/deploy.js --network mordor
```

### Frontend Commands

```bash
# Start development server
cd frontend
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linting
npm run lint
```

## Testing

### Writing Tests

Tests use Mocha and Chai:

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProposalRegistry", function () {
  let proposalRegistry;
  let owner, proposer;

  beforeEach(async function () {
    [owner, proposer] = await ethers.getSigners();
    
    const ProposalRegistry = await ethers.getContractFactory("ProposalRegistry");
    proposalRegistry = await ProposalRegistry.deploy();
    await proposalRegistry.waitForDeployment();
  });

  it("Should submit a proposal", async function () {
    const tx = await proposalRegistry.connect(proposer).submitProposal(
      "Test Proposal",
      "Description",
      ethers.parseEther("100"),
      proposer.address,
      1, // welfare metric
      { value: ethers.parseEther("50") } // bond
    );
    
    await expect(tx)
      .to.emit(proposalRegistry, "ProposalSubmitted")
      .withArgs(0, proposer.address);
  });
});
```

### Test Coverage

Aim for high test coverage:

- **Unit Tests**: Test individual functions
- **Integration Tests**: Test contract interactions
- **Edge Cases**: Test boundary conditions
- **Error Cases**: Test failure scenarios

Run coverage:

```bash
npm run test:coverage
```

## Code Style

### Solidity Style Guide

Follow the [Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html):

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
 * @title ProposalRegistry
 * @notice Manages proposal submission and lifecycle
 */
contract ProposalRegistry {
    // State variables
    uint256 public proposalCount;
    
    // Events
    event ProposalSubmitted(uint256 indexed proposalId, address indexed proposer);
    
    // Modifiers
    modifier onlyProposer(uint256 proposalId) {
        require(proposals[proposalId].proposer == msg.sender, "Not proposer");
        _;
    }
    
    // Functions (grouped by visibility)
    function submitProposal(
        string memory title,
        string memory description,
        uint256 fundingAmount,
        address recipient,
        uint256 welfareMetricId
    ) external payable returns (uint256) {
        // Implementation
    }
}
```

### JavaScript/React Style

Use ESLint with appropriate config:

```javascript
// Use arrow functions
const MyComponent = ({ prop1, prop2 }) => {
  // Use hooks
  const [state, setState] = useState(initialState);
  
  useEffect(() => {
    // Side effects
  }, [dependencies]);
  
  return (
    <div className="my-component">
      {/* JSX */}
    </div>
  );
};

export default MyComponent;
```

## Debugging

### Hardhat Console

Debug contracts interactively:

```bash
npx hardhat console --network localhost
```

```javascript
> const ProposalRegistry = await ethers.getContractFactory("ProposalRegistry");
> const registry = await ProposalRegistry.attach("0x...");
> await registry.proposalCount();
BigNumber { value: "5" }
```

### Console Logging in Contracts

Use Hardhat's `console.log`:

```solidity
import "hardhat/console.sol";

contract MyContract {
    function debug() public {
        console.log("Debug value:", someValue);
    }
}
```

### Frontend Debugging

Use browser developer tools:

```javascript
// Add debug logging
console.log("Contract address:", contractAddress);
console.log("Transaction hash:", tx.hash);

// Inspect transaction details
const receipt = await tx.wait();
console.log("Transaction receipt:", receipt);
```

## Common Issues

### Contract Deployment Fails

**Problem**: `Error: insufficient funds`

**Solution**: Ensure your account has enough ETH for gas fees

---

**Problem**: `Error: nonce too low`

**Solution**: Reset MetaMask account or clear transaction history

---

**Problem**: Contract verification fails

**Solution**: Ensure you're using the correct compiler version

### Frontend Connection Issues

**Problem**: MetaMask doesn't connect

**Solutions**:

- Check network (should be Hardhat Local)
- Verify RPC URL is correct
- Clear MetaMask cache
- Reload the page

---

**Problem**: Contract calls fail

**Solutions**:

- Verify contract addresses are correct
- Check if contracts are deployed
- Ensure ABI is up to date
- Verify you're on the correct network

## Best Practices

### Development Workflow

1. **Branch**: Create feature branch from `main`
2. **Code**: Implement changes with tests
3. **Test**: Ensure all tests pass
4. **Commit**: Make atomic, well-described commits
5. **Push**: Push to your fork
6. **PR**: Create pull request with description

### Git Commits

Write clear commit messages:

```bash
# Good commits
git commit -m "Add proposal submission validation"
git commit -m "Fix oracle bond requirement check"
git commit -m "Update ProposalList component styling"

# Bad commits
git commit -m "fixes"
git commit -m "update"
git commit -m "WIP"
```

### Testing Before Committing

Always run tests before committing:

```bash
# Run all checks
npm run compile
npm test
cd frontend && npm run lint && npm run build
```

## Next Steps

Now that your environment is set up:

- [Learn about the architecture](architecture.md)
- [Explore the smart contracts](smart-contracts.md)
- [Understand testing practices](testing.md)
- [Read the contributing guidelines](contributing.md)
- [Check out the frontend development guide](frontend.md)

## Getting Help

If you encounter issues:

- Check the [FAQ](../user-guide/faq.md)
- Review existing [GitHub issues](https://github.com/chippr-robotics/prediction-dao-research/issues)
- Ask in community channels
- Create a new issue with details
