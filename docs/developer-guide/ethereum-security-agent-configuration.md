# Configuring the Smart Contract Security Agent

## Overview

The Smart Contract Security Agent can be customized to fit your project's specific security requirements and development workflow. This guide explains how to configure the agent teammate, adjust security thresholds, and add custom rules.

## Agent Configuration File

The agent is configured through the file:
```
.github/agents/smart-contract-security.agent.md
```

This markdown file contains the agent's identity, instructions, expertise areas, and review processes as a full team member.

## Configuration Options

### 1. Adjusting Severity Thresholds

You can customize what constitutes each severity level based on your project's risk tolerance.

#### Default Severity Levels

**Critical**
- Immediate fix required
- Can lead to loss of funds
- Complete compromise possible
- Examples: Unprotected self-destruct, critical reentrancy

**High**
- Important security issue
- Should be fixed before merging
- Significant risk of exploitation
- Examples: Access control bypass, oracle manipulation

**Medium**
- Security concern
- May merge with plan to fix
- Moderate risk
- Examples: DoS vectors, timestamp dependence

**Low**
- Minor issue
- Good to fix but not blocking
- Examples: Missing visibility modifiers, deprecated features

**Informational**
- Best practice suggestions
- Optimization opportunities
- Examples: Gas optimization, code structure

#### Custom Severity Configuration

To adjust severity levels, edit the "Security Vulnerability Categories" section in the agent configuration:

```markdown
### Security Vulnerability Categories

#### Critical Severity (Project-Specific)
- **Unprotected Self-Destruct**: Any selfdestruct without multisig
- **Access Control Bypass**: Missing owner checks on critical functions
- **Reentrancy in Core Functions**: Reentrancy in deposit/withdraw/claim
```

### 2. Required EthTrust Security Level

Set the minimum EthTrust Security Level required for PRs to pass:

```markdown
## Required Security Level

This project requires **EthTrust Security Level 2 (Intermediate)** for all smart contracts.

Minimum requirements:
- Comprehensive test coverage (>80%)
- Secure coding patterns (CEI, reentrancy guards)
- Detailed NatSpec documentation
- Use of audited libraries (OpenZeppelin)
- Event emission for state changes
```

### 3. Project-Specific Rules

Add custom security rules specific to your project:

```markdown
### Project-Specific Security Requirements

#### ClearPath DAO Requirements
- All governance functions must use TimelockController
- All oracle interactions must use TWAP with minimum 30-minute window
- All treasury withdrawals must enforce daily spending limits
- All privacy-related functions must use Poseidon hash commitments
- All market functions must include slippage protection

#### Mandatory Patterns
1. **Governance Operations**: Must use 2-day timelock minimum
2. **Oracle Queries**: Must validate against min/max bounds
3. **Treasury Operations**: Must check against daily limits
4. **Privacy Functions**: Must emit encrypted events only
```

### 4. Excluded Files

Configure files or patterns to skip during review:

```markdown
## Review Scope

### Included Files
- All `.sol` files in `contracts/` directory
- All subdirectories of `contracts/`

### Excluded Files
- `contracts/test/` - Test contracts
- `contracts/mocks/` - Mock contracts for testing
- `contracts/deprecated/` - Deprecated contracts
- Files matching pattern `*.t.sol` - Foundry test files
```

### 5. Required Dependencies

Specify which libraries and versions are approved:

```markdown
## Approved Dependencies

### Required Libraries
- OpenZeppelin Contracts: ^5.4.0 or higher
- Solidity Version: ^0.8.24 (exact)

### Approved External Dependencies
- Gnosis Conditional Token Framework
- MACI (Minimal Anti-Collusion Infrastructure)
- Poseidon Hash Libraries (for zero-knowledge)

### Prohibited Dependencies
- Any unaudited DeFi protocols
- Contracts without security audits
- Deprecated OpenZeppelin versions (<4.0.0)
```

### 6. Gas Optimization Priorities

Set priorities for gas optimization recommendations:

```markdown
## Gas Optimization Standards

### High Priority Optimizations
- Unbounded loops (must be paginated)
- Storage reads in loops (must be cached)
- Redundant storage writes (must be eliminated)

### Medium Priority Optimizations
- Use of immutable for constants
- Calldata vs memory for parameters
- Tight variable packing

### Low Priority Optimizations
- Short-circuiting logic
- Unchecked arithmetic where safe
- Event parameter indexing
```

### 7. Testing Requirements

Configure minimum test coverage and test types:

```markdown
## Testing Requirements

### Coverage Thresholds
- Statement Coverage: >95%
- Branch Coverage: >90%
- Function Coverage: >95%
- Line Coverage: >95%

### Required Test Types
1. **Unit Tests**: Every public/external function
2. **Integration Tests**: Contract interactions
3. **Negative Tests**: All require/revert cases
4. **Edge Cases**: Boundary conditions, zero values, max values
5. **Fuzzing**: Property-based testing for critical functions

### Test Documentation
Each test must include:
- Clear description of what is tested
- Setup requirements
- Expected outcomes
- Edge cases covered
```

### 8. Documentation Standards

Set requirements for code documentation:

```markdown
## Documentation Requirements

### NatSpec Standards
All public/external functions must include:

```solidity
/**
 * @notice User-friendly description (required)
 * @dev Developer notes (required for complex functions)
 * @param paramName Description of parameter (required for all params)
 * @return Description of return value (required if function returns)
 * @custom:security Security considerations (required for sensitive functions)
 */
```

### Contract Documentation
Each contract must include:
- Title and purpose
- Inheritance hierarchy
- State variable descriptions
- Event descriptions
- Security considerations
```

## Advanced Configurations

### 1. Integration with CI/CD

Configure the agent to work with GitHub Actions:

```yaml
# .github/workflows/security-review.yml
name: Security Review

on:
  pull_request:
    paths:
      - 'contracts/**/*.sol'

jobs:
  security-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Security Agent
        uses: github/copilot-agent@v1
        with:
          agent: smart-contract-security
          files: 'contracts/**/*.sol'
```

### 2. Auto-Blocking PRs

Configure PR status checks to block merging if critical issues found:

```markdown
## PR Blocking Rules

### Critical Issues
- Any Critical severity finding blocks merge
- Requires fix and re-review before merge

### High Severity Issues
- More than 2 High severity findings block merge
- Must be addressed or documented as accepted risk

### Medium/Low Issues
- Does not block merge
- Should be tracked in issues for future resolution
```

### 3. Multiple Review Levels

Configure different review depths based on file criticality:

```markdown
## Review Depth by Contract Type

### Critical Contracts (Comprehensive Review)
- `FutarchyGovernor.sol` - Full security analysis + formal verification check
- `PrivacyCoordinator.sol` - Full analysis + cryptographic review
- `OracleResolver.sol` - Full analysis + manipulation scenario testing

### Standard Contracts (Standard Review)
- `ProposalRegistry.sol` - Standard security analysis
- `WelfareMetricRegistry.sol` - Standard analysis

### Supporting Contracts (Basic Review)
- Utility libraries - Basic pattern check
- Interface files - Consistency check only
```

### 4. Custom Security Checklist

Add a project-specific security checklist:

```markdown
## ClearPath Security Checklist

Before approving any PR with smart contract changes, verify:

- [ ] All governance operations use 2-day timelock
- [ ] All oracle queries validate against reasonable bounds
- [ ] All treasury withdrawals check daily spending limits
- [ ] All privacy functions use Poseidon commitments
- [ ] All market functions include slippage protection
- [ ] All external calls use checks-effects-interactions
- [ ] All critical functions emit events
- [ ] All admin functions have access control
- [ ] All tests pass with >95% coverage
- [ ] All functions have NatSpec documentation
```

## Example Configurations

### Configuration for High-Security Project

```markdown
## High-Security Configuration

### Required Security Level
EthTrust Level 3 (Advanced) - All contracts

### Mandatory Features
- Multiple external audits (minimum 2)
- Formal verification of core invariants
- Active bug bounty program
- Real-time monitoring
- Incident response plan

### Blocking Conditions
- Any Critical/High findings block merge
- Must achieve 100% test coverage
- Must have full NatSpec documentation
- Must pass Slither with zero high-severity findings
- Must pass Mythril with zero vulnerabilities
```

### Configuration for Development/Testing Phase

```markdown
## Development Phase Configuration

### Required Security Level
EthTrust Level 1 (Basic) - Minimum acceptable

### Review Focus
- Critical vulnerabilities only
- Basic access control
- Essential security patterns
- Informational issues logged but not blocking

### Blocking Conditions
- Only Critical severity findings block merge
- Medium/Low issues tracked for future fixes
- 80% test coverage acceptable
```

## Maintenance and Updates

### Updating Agent Knowledge

The agent configuration should be updated when:

1. **New Vulnerabilities Discovered**: Add to vulnerability categories
2. **Standards Updated**: Update EthTrust level requirements
3. **Project Evolution**: Adjust project-specific rules
4. **Tooling Changes**: Update recommended tools and versions
5. **Team Feedback**: Incorporate lessons learned

### Version Control

Track changes to agent configuration:

```bash
# Create branch for config updates
git checkout -b update/security-agent-config

# Edit configuration
vim .github/agents/smart-contract-security.agent.md

# Commit with clear description
git commit -m "Update security agent: add oracle manipulation checks"

# Create PR for review
git push origin update/security-agent-config
```

### Testing Configuration Changes

After updating the agent configuration:

1. Create a test PR with known security issues
2. Verify the agent correctly identifies them
3. Check severity levels match expectations
4. Confirm blocking rules work as intended
5. Validate false positive rate

## Troubleshooting

### Agent Not Reviewing PRs

Check:
- Agent configuration file exists at `.github/agents/smart-contract-security.agent.md`
- PR includes modified `.sol` files or related smart contract code
- GitHub Actions has proper permissions
- No syntax errors in configuration file

### Too Many False Positives

Adjust:
- Severity thresholds
- Project-specific exclusions
- Context-aware rules
- File exclusion patterns

### Missing Real Issues

Enhance:
- Vulnerability pattern descriptions
- Custom security rules
- Project-specific requirements
- Test coverage requirements

## Best Practices

### 1. Regular Reviews
- Review agent configuration quarterly
- Update based on new vulnerability research
- Incorporate audit findings
- Add lessons learned from incidents

### 2. Team Alignment
- Ensure team understands severity levels
- Train on common vulnerabilities
- Share agent feedback in team meetings
- Document accepted security trade-offs

### 3. Continuous Improvement
- Track false positive/negative rates
- Gather developer feedback
- Update patterns based on new exploits
- Align with industry standards

### 4. Documentation
- Keep configuration well-commented
- Document why rules exist
- Provide examples for clarity
- Link to security resources

## Additional Resources

- [EthTrust Security Levels](https://entethalliance.org/specs/ethtrust-sl/)
- [Smart Contract Best Practices](https://consensys.github.io/smart-contract-best-practices/)
- [Solidity Security Considerations](https://docs.soliditylang.org/en/latest/security-considerations.html)
- [OpenZeppelin Security Guidelines](https://docs.openzeppelin.com/contracts/security)

## Support

For questions about configuration:
- Review existing agent documentation
- Check similar projects' configurations
- Consult security experts
- Open GitHub discussions

---

**Remember**: The agent is a tool to assist developers, not replace human judgment. Configure it to match your project's security requirements and development workflow.
