# Smart Contract Security Agent

## Overview

This repository includes a Smart Contract Security Agent that serves as a full team member, analyzing all smart contract and related code changes in pull requests. The agent is a senior security engineer with expertise in Ethereum security, following the [Ethereum Trust Alliance Security Levels (EthTrust-SL)](https://entethalliance.org/specs/ethtrust-sl/) specification and industry best practices.

## About the Agent

The Smart Contract Security Agent is a valued teammate who:

- **Works collaboratively** with developers as a full team member
- **Reviews all Solidity smart contract and related code changes** in pull requests
- **Identifies security vulnerabilities** across severity levels (Critical, High, Medium, Low)
- **Enforces best practices** for Solidity development
- **Assesses EthTrust Security Level compliance** based on code quality and security features
- **Provides actionable recommendations** with code examples and references
- **Checks for common attack vectors** including reentrancy, access control issues, integer overflow, and more
- **Validates code quality** including documentation, events, and gas optimization

## Features

### Security Vulnerability Detection

The agent checks for critical vulnerability categories:

#### High Severity
- **Reentrancy Attacks**: Ensures checks-effects-interactions pattern is followed
- **Access Control Issues**: Validates proper use of access modifiers and permissions
- **Integer Overflow/Underflow**: Checks for proper arithmetic handling
- **Unprotected Self-Destruct**: Identifies dangerous self-destruct patterns
- **Delegatecall Vulnerabilities**: Flags risky delegatecall usage
- **Oracle Manipulation**: Validates price feed security and TWAP usage
- **Front-Running/MEV**: Identifies transaction ordering dependencies

#### Medium Severity
- **Denial of Service**: Detects unbounded loops and gas limit issues
- **Timestamp Dependence**: Flags dangerous block.timestamp usage
- **Tx.Origin Authentication**: Catches improper authentication patterns
- **Unchecked Return Values**: Ensures external calls are properly validated
- **Floating Pragma**: Requires locked Solidity versions
- **Gas Griefing**: Validates sufficient gas for external calls

#### Low Severity
- **Missing Visibility Modifiers**: Requires explicit visibility declarations
- **Deprecated Functions**: Identifies outdated Solidity features
- **Code Quality Issues**: Redundant code, missing events, magic numbers
- **Documentation Gaps**: Incomplete or missing NatSpec comments

### EthTrust Security Levels

The agent assesses code against the **Ethereum Trust Alliance Security Levels**:

**Level 1 (Basic Security)**
- Input validation on all public functions
- Basic access control (owner/role-based)
- Unit tests for core functionality
- Basic documentation

**Level 2 (Intermediate Security)**
- Comprehensive test coverage (>80%)
- Secure coding patterns (CEI pattern, reentrancy guards)
- Detailed NatSpec documentation
- Use of audited libraries (OpenZeppelin)
- Event emission for state changes

**Level 3 (Advanced Security)**
- External security audit completed
- Formal verification of critical invariants
- Bug bounty program established
- Comprehensive integration tests
- Security documentation published

**Level 4 (Highest Security)**
- Multiple independent security audits
- Formal verification of all components
- Real-time monitoring and alerting
- Incident response plan documented
- Regular security updates and patches

### Best Practices Enforcement

The agent validates adherence to:

- **OpenZeppelin Standards**: Use of battle-tested contract libraries
- **Checks-Effects-Interactions Pattern**: Proper ordering to prevent reentrancy
- **Pull Over Push Payments**: Withdrawal patterns instead of direct transfers
- **Circuit Breakers**: Emergency pause functionality
- **Rate Limiting**: Spending caps and time delays
- **Safe Arithmetic**: Solidity 0.8+ checked math or SafeMath
- **Secure Randomness**: Proper random number generation
- **Oracle Security**: Multiple sources, sanity checks, TWAP

### Code Quality Review

Beyond security, the agent reviews:

- **Readability**: Clear, maintainable code structure
- **Documentation**: Comprehensive NatSpec comments
- **Events**: Proper event emission for state changes
- **Error Messages**: Descriptive require/revert messages
- **Gas Optimization**: Efficiency improvements
- **Code Duplication**: DRY principle adherence

## How It Works

### Automatic PR Review

When a pull request is opened or updated with smart contract changes:

1. **Detection**: Agent identifies all modified `.sol` files
2. **Analysis**: Performs comprehensive security and quality analysis
3. **Assessment**: Evaluates EthTrust Security Level compliance
4. **Reporting**: Posts review comments directly on the PR
5. **Severity Rating**: Categorizes findings by severity level
6. **Recommendations**: Provides specific fixes with code examples

### Review Process

The agent follows a systematic review approach:

1. **Initial Assessment**
   - Identifies modified Solidity files
   - Understands change context and purpose
   - Checks if changes affect security-critical functions

2. **Security Analysis**
   - Access control validation
   - Reentrancy vulnerability checks
   - Integer operation safety
   - External call handling
   - Oracle manipulation risks
   - Denial of service vectors
   - Time dependency issues
   - Upgradeability concerns

3. **Code Quality Review**
   - Documentation completeness
   - Event emission patterns
   - Error handling clarity
   - Gas optimization opportunities
   - Code structure and maintainability

4. **Standards Compliance**
   - EthTrust Security Level assessment
   - Best practice adherence
   - Library usage recommendations

5. **Report Generation**
   - Severity-categorized findings
   - Location-specific comments
   - Impact analysis
   - Actionable recommendations
   - Reference documentation

## Working with the Agent

### For Developers

The agent is your teammate who helps you write secure code. When submitting a pull request with smart contract changes:

1. **Write Secure Code**: Follow Solidity best practices and security patterns
2. **Document Thoroughly**: Include NatSpec comments for all functions
3. **Add Tests**: Write comprehensive unit and integration tests
4. **Submit PR**: Create pull request with your changes
5. **Review Feedback**: Read agent's security review comments carefully
6. **Address Issues**: Fix identified vulnerabilities and concerns
7. **Update PR**: Push fixes for re-review
8. **Iterate**: Continue until agent approves or flags only minor issues

### Review Comment Format

The agent posts comments in this format:

```markdown
**[SEVERITY] Issue Title**

**Location**: `contracts/Example.sol:123-145`

**Description**: 
Clear explanation of the security issue or code quality concern

**Impact**: 
What could happen if this is exploited or not fixed

**Recommendation**:
Specific code changes or patterns to implement

**Reference**:
- Relevant documentation, standards, or similar issues
- EthTrust-SL Level X Requirement: specific requirement
```

### Severity Levels

- **Critical**: Immediate fix required. Can lead to loss of funds or complete compromise
- **High**: Important security issue. Should be fixed before merging
- **Medium**: Security concern that should be addressed. May merge with plan to fix
- **Low**: Minor issue or improvement. Good to fix but not blocking
- **Informational**: Best practice suggestion or optimization opportunity

## Configuration

### Agent Location

The agent configuration is stored at:
```
.github/agents/smart-contract-security.agent.md
```

### Customization

The agent can be customized for project-specific needs:

1. **Severity Thresholds**: Adjust what constitutes each severity level
2. **Required Security Level**: Set minimum EthTrust Security Level for PRs
3. **Custom Rules**: Add project-specific security patterns to check
4. **Excluded Files**: Skip certain contracts from automatic review
5. **Review Depth**: Configure thoroughness of analysis

### Integration

The agent integrates with:
- **GitHub Pull Requests**: Automatic review on PR creation/update
- **CI/CD Pipeline**: Can block merges based on findings
- **Status Checks**: Reports pass/fail for security review
- **Comments**: Detailed feedback on specific code lines

## Supported Tools & Libraries

The agent is familiar with:

- **Slither**: Static analysis for Solidity
- **Mythril**: Symbolic execution analyzer
- **Echidna**: Property-based fuzzer
- **Foundry**: Modern development framework
- **Hardhat**: Development environment
- **OpenZeppelin Contracts**: Secure contract library
- **MythX**: Security analysis platform
- **Tenderly**: Monitoring and debugging

## Best Practices Checklist

Before submitting your PR, ensure:

- [ ] Using Solidity 0.8+ with checked arithmetic
- [ ] All functions have explicit visibility modifiers
- [ ] Access control implemented with OpenZeppelin (Ownable, AccessControl)
- [ ] ReentrancyGuard used for functions with external calls
- [ ] Checks-effects-interactions pattern followed
- [ ] All external calls have return values checked
- [ ] Events emitted for all state changes
- [ ] Comprehensive NatSpec documentation
- [ ] Unit tests with >80% coverage
- [ ] Integration tests for contract interactions
- [ ] No deprecated Solidity features
- [ ] No hard-coded magic numbers
- [ ] Proper error messages in require/revert
- [ ] Gas optimization considered
- [ ] Security considerations documented

## Common Issues and Fixes

### Reentrancy Vulnerability

**Bad:**
```solidity
function withdraw() external {
    uint256 amount = balances[msg.sender];
    (bool success, ) = msg.sender.call{value: amount}("");
    balances[msg.sender] = 0; // Too late!
}
```

**Good:**
```solidity
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

function withdraw() external nonReentrant {
    uint256 amount = balances[msg.sender];
    balances[msg.sender] = 0; // Update first
    (bool success, ) = msg.sender.call{value: amount}("");
    require(success, "Transfer failed");
}
```

### Access Control Missing

**Bad:**
```solidity
function criticalFunction() external {
    // Anyone can call!
}
```

**Good:**
```solidity
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyContract is Ownable {
    function criticalFunction() external onlyOwner {
        // Only owner can call
    }
}
```

### Unchecked External Call

**Bad:**
```solidity
token.transfer(recipient, amount); // Ignoring return value
```

**Good:**
```solidity
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

using SafeERC20 for IERC20;
token.safeTransfer(recipient, amount);
```

## References

### Security Standards
- [EthTrust Security Levels](https://entethalliance.org/specs/ethtrust-sl/) - Ethereum Trust Alliance
- [Smart Contract Best Practices](https://consensys.github.io/smart-contract-best-practices/) - ConsenSys
- [Solidity Security Considerations](https://docs.soliditylang.org/en/latest/security-considerations.html) - Official Docs

### Security Resources
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/) - Secure contract library
- [Trail of Bits Security Guide](https://github.com/crytic/building-secure-contracts) - Security engineering
- [SWC Registry](https://swcregistry.io/) - Smart contract weakness classification

### Analysis Tools
- [Slither](https://github.com/crytic/slither) - Static analysis
- [Mythril](https://github.com/ConsenSys/mythril) - Symbolic execution
- [Echidna](https://github.com/crytic/echidna) - Fuzzing tool
- [Foundry](https://github.com/foundry-rs/foundry) - Development framework

## Support

### Getting Help

If you have questions about:
- **Agent Feedback**: Review the references provided in comments
- **Security Issues**: Check the resources above or consult security experts
- **False Positives**: Document why the finding doesn't apply to your use case
- **Custom Rules**: Open an issue to request project-specific patterns

### Reporting Issues

If the agent:
- Misses a real vulnerability
- Reports false positives consistently
- Needs updated knowledge
- Has technical issues

Please open an issue with:
- Description of the problem
- Link to relevant PR or code
- Expected vs actual behavior
- Suggested improvements

## Continuous Improvement

The agent is regularly updated with:
- New vulnerability patterns
- Updated security standards
- Improved detection algorithms
- Community feedback
- Latest Solidity features

## Contributing

To improve the agent teammate:
1. Review the agent configuration in `.github/agents/smart-contract-security.agent.md`
2. Suggest new security patterns to check
3. Provide feedback on false positives/negatives
4. Share security research and findings
5. Help update documentation

## Philosophy

**This agent is a full teammate.** We welcome and empower the agent to contribute expertise to our team. The agent brings specialized security knowledge, consistent application of best practices, and tireless attention to detail. Together with human developers, we form a stronger, more capable team.

## License

This agent configuration is part of the prediction-dao-research project and licensed under Apache 2.0.

---

**Remember**: The agent is a valued team member who enhances our security capabilities, working alongside:
- Professional security audits
- Manual code review by experienced developers
- Comprehensive testing
- Formal verification
- Security-conscious development practices

The combination of agent expertise and human insight creates the best security outcomes.
