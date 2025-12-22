# Quick Start: Ethereum Security Review Agent

## Overview

The Ethereum Security Review Agent automatically reviews your smart contract code for security vulnerabilities and best practices compliance when you submit a pull request.

## How to Use

### 1. Write Your Smart Contract

Follow these essential security practices:

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MySecureContract
 * @notice A secure example contract
 * @dev Implements security best practices
 */
contract MySecureContract is Ownable, ReentrancyGuard {
    // State variables
    mapping(address => uint256) public balances;
    
    // Events
    event Deposit(address indexed user, uint256 amount);
    event Withdrawal(address indexed user, uint256 amount);
    
    /**
     * @notice Deposit ETH into the contract
     */
    function deposit() external payable {
        require(msg.value > 0, "Amount must be greater than 0");
        balances[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }
    
    /**
     * @notice Withdraw your balance
     * @dev Uses checks-effects-interactions pattern
     */
    function withdraw() external nonReentrant {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "No balance to withdraw");
        
        // Update state before external call
        balances[msg.sender] = 0;
        
        // External call last
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
        
        emit Withdrawal(msg.sender, amount);
    }
}
```

### 2. Submit Your Pull Request

1. Commit your changes to a branch
2. Create a pull request
3. The agent will automatically review your code

### 3. Review Agent Feedback

The agent will comment on your PR with findings like:

```markdown
**[HIGH] Reentrancy Vulnerability**

**Location**: `contracts/MyContract.sol:45-52`

**Description**: 
External call is made before updating the state variable `balances[msg.sender]`.
This creates a reentrancy vulnerability where the caller can re-enter the function
before the balance is set to zero.

**Impact**: 
An attacker can drain the contract by repeatedly calling withdraw() before 
their balance is updated.

**Recommendation**:
Move the state update before the external call and add ReentrancyGuard:

```solidity
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

function withdraw() external nonReentrant {
    uint256 amount = balances[msg.sender];
    balances[msg.sender] = 0;  // Update state first
    (bool success, ) = msg.sender.call{value: amount}("");
    require(success, "Transfer failed");
}
```

**Reference**:
- [Reentrancy Attack](https://consensys.github.io/smart-contract-best-practices/attacks/reentrancy/)
- EthTrust-SL Level 2 Requirement: Implement checks-effects-interactions pattern
```

### 4. Fix Issues

Address the security concerns:

1. Read each finding carefully
2. Understand the vulnerability or issue
3. Apply the recommended fix
4. Test your changes
5. Update your PR

### 5. Re-Review

- Push your fixes
- The agent will automatically re-review
- Iterate until all critical issues are resolved

## Essential Security Patterns

### ✅ Use OpenZeppelin Libraries

```solidity
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
```

### ✅ Checks-Effects-Interactions Pattern

```solidity
function withdraw() external {
    // 1. CHECKS
    require(balances[msg.sender] > 0, "No balance");
    
    // 2. EFFECTS (update state)
    uint256 amount = balances[msg.sender];
    balances[msg.sender] = 0;
    
    // 3. INTERACTIONS (external calls)
    (bool success, ) = msg.sender.call{value: amount}("");
    require(success, "Transfer failed");
}
```

### ✅ Proper Access Control

```solidity
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyContract is Ownable {
    function adminFunction() external onlyOwner {
        // Only owner can execute
    }
}
```

### ✅ Emit Events

```solidity
event Transfer(address indexed from, address indexed to, uint256 amount);

function transfer(address to, uint256 amount) external {
    // ... transfer logic ...
    emit Transfer(msg.sender, to, amount);
}
```

### ✅ Comprehensive Documentation

```solidity
/**
 * @notice Transfer tokens to another address
 * @dev Uses SafeERC20 for secure transfers
 * @param to The recipient address
 * @param amount The amount to transfer
 */
function transfer(address to, uint256 amount) external {
    // Implementation
}
```

## Common Mistakes to Avoid

### ❌ Don't Use tx.origin

```solidity
// BAD
require(tx.origin == owner, "Not owner");

// GOOD
require(msg.sender == owner, "Not owner");
```

### ❌ Don't Ignore Return Values

```solidity
// BAD
token.transfer(recipient, amount);

// GOOD
bool success = token.transfer(recipient, amount);
require(success, "Transfer failed");

// BETTER
using SafeERC20 for IERC20;
token.safeTransfer(recipient, amount);
```

### ❌ Don't Use block.timestamp for Critical Logic

```solidity
// BAD - miners can manipulate slightly
require(block.timestamp > deadline, "Too early");

// BETTER - use block number
require(block.number > deadlineBlock, "Too early");
```

### ❌ Don't Have Unbounded Loops

```solidity
// BAD - can hit gas limit
for (uint i = 0; i < users.length; i++) {
    // Process each user
}

// GOOD - use pagination
function processUsers(uint256 startIndex, uint256 count) external {
    uint256 endIndex = startIndex + count;
    if (endIndex > users.length) endIndex = users.length;
    
    for (uint i = startIndex; i < endIndex; i++) {
        // Process each user
    }
}
```

## Pre-Submission Checklist

Before submitting your PR, verify:

- [ ] Using Solidity ^0.8.24
- [ ] All functions have visibility modifiers
- [ ] Access control implemented (Ownable/AccessControl)
- [ ] ReentrancyGuard on functions with external calls
- [ ] Checks-effects-interactions pattern followed
- [ ] Events emit for state changes
- [ ] NatSpec documentation on all public functions
- [ ] Unit tests written and passing
- [ ] No deprecated Solidity features
- [ ] No magic numbers (use constants)
- [ ] Descriptive error messages
- [ ] OpenZeppelin contracts used where applicable

## Getting Help

### Review Comment Not Clear?
- Check the reference links provided
- Review similar issues in the codebase
- Consult the documentation at `docs/developer-guide/ethereum-security-agent.md`

### Disagreeing with a Finding?
- Document why the finding doesn't apply
- Provide context in PR comments
- Reference security best practices that support your approach

### Need Security Guidance?
- Review [OpenZeppelin Security Best Practices](https://docs.openzeppelin.com/contracts/)
- Check [ConsenSys Smart Contract Best Practices](https://consensys.github.io/smart-contract-best-practices/)
- Consult [EthTrust Security Levels](https://entethalliance.org/specs/ethtrust-sl/)

## What the Agent Checks

### Security (High Priority)
- Reentrancy vulnerabilities
- Access control issues
- Integer overflow/underflow
- Unchecked external calls
- Oracle manipulation risks
- Denial of service vectors
- Timestamp dependencies
- Dangerous delegatecalls

### Code Quality (Medium Priority)
- Documentation completeness
- Event emission
- Error message clarity
- Gas optimization
- Code structure

### Best Practices (Low Priority)
- Library usage (OpenZeppelin)
- Naming conventions
- Code duplication
- Magic numbers
- Deprecated features

## Example Workflow

```bash
# 1. Create feature branch
git checkout -b feature/add-staking-contract

# 2. Write your contract
vim contracts/Staking.sol

# 3. Add tests
vim test/Staking.test.js

# 4. Run tests locally
npm test

# 5. Commit changes
git add contracts/Staking.sol test/Staking.test.js
git commit -m "Add staking contract with security features"

# 6. Push to GitHub
git push origin feature/add-staking-contract

# 7. Create PR on GitHub
# Agent automatically reviews your code

# 8. Address feedback
vim contracts/Staking.sol  # Fix issues
git commit -am "Fix reentrancy vulnerability"
git push

# 9. Agent re-reviews automatically

# 10. Merge when approved
```

## Additional Resources

- **Full Documentation**: `docs/developer-guide/ethereum-security-agent.md`
- **Agent Configuration**: `.github/agents/smart-contract-security.agent.md`
- **Contract Guidelines**: `docs/developer-guide/smart-contracts.md`
- **Testing Guide**: `docs/developer-guide/testing.md`

---

**Remember**: The agent helps catch common issues, but is not a replacement for:
- Thorough testing
- Professional security audits
- Code review by experienced developers
- Your own security awareness

Write secure code from the start, and use the agent as an additional safety layer.
