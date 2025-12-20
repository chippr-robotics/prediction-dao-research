# GitHub Agents

This directory contains custom GitHub Copilot agent configurations for automated code review and assistance specific to this repository.

## Available Agents

### Ethereum Security Reviewer

**File**: `ethereum-security-reviewer.md`

**Purpose**: Automatically reviews all smart contract code changes for security vulnerabilities, best practices compliance, and adherence to Ethereum security standards.

**Capabilities**:
- Detects critical security vulnerabilities (reentrancy, access control, integer overflow, etc.)
- Enforces Solidity best practices and secure coding patterns
- Assesses compliance with EthTrust Security Levels
- Provides actionable recommendations with code examples
- Reviews code quality, documentation, and gas optimization

**Expertise**:
- Ethereum smart contract security
- Solidity programming language
- EVM behavior and gas mechanics
- [EthTrust Security Levels](https://entethalliance.org/specs/ethtrust-sl/) specification
- Industry security standards and best practices

**Automatic Triggers**:
- Pull requests that modify `.sol` files in `contracts/` directory
- Manual invocation for security audits

**Documentation**:
- Full Guide: [docs/developer-guide/ethereum-security-agent.md](../../docs/developer-guide/ethereum-security-agent.md)
- Quick Start: [docs/developer-guide/ethereum-security-quickstart.md](../../docs/developer-guide/ethereum-security-quickstart.md)
- Configuration: [docs/developer-guide/ethereum-security-agent-configuration.md](../../docs/developer-guide/ethereum-security-agent-configuration.md)

## How GitHub Agents Work

GitHub Copilot agents are specialized AI assistants configured with domain-specific knowledge and expertise. When enabled:

1. **Automatic Activation**: The agent activates when relevant code changes are detected (e.g., `.sol` files)
2. **Deep Analysis**: Agent applies its specialized knowledge to review the changes
3. **Contextual Feedback**: Provides detailed comments on specific code locations
4. **Severity Classification**: Categorizes findings by impact (Critical/High/Medium/Low)
5. **Actionable Recommendations**: Suggests specific fixes with code examples

## Agent Configuration

Each agent is defined by a markdown file in this directory that includes:

- **Role Definition**: What the agent specializes in
- **Expertise Areas**: Deep knowledge domains
- **Review Process**: Systematic approach to analysis
- **Standards & Best Practices**: What the agent enforces
- **Communication Style**: How feedback is provided
- **Scope**: What the agent reviews (and what it doesn't)

## Using Agents

### For Developers

When you submit a pull request:
1. The appropriate agent automatically reviews your changes
2. Review comments appear directly on your PR
3. Address the feedback and update your PR
4. Agent re-reviews automatically on updates

### For Reviewers

Agents complement human review:
- Catch common security issues and patterns
- Ensure consistency in code quality
- Free up reviewer time for architectural concerns
- Provide educational feedback to developers

## Customization

Agents can be customized by editing their configuration files:

1. **Adjust Severity Thresholds**: Define what constitutes each severity level
2. **Add Project-Specific Rules**: Include custom security patterns
3. **Set Requirements**: Specify minimum security levels or test coverage
4. **Configure Exclusions**: Skip certain files or directories
5. **Update Standards**: Keep agent knowledge current

See individual agent documentation for configuration details.

## Best Practices

### When to Use Agents
✅ All smart contract changes
✅ Security-critical code paths
✅ Before requesting human review
✅ During development for quick feedback

### When to Seek Human Review
⚠️ Architectural decisions
⚠️ Complex security trade-offs
⚠️ Novel patterns or approaches
⚠️ Business logic validation
⚠️ Final security audit

### Responding to Agent Feedback
1. **Read Carefully**: Understand the issue and its impact
2. **Research**: Check provided references and documentation
3. **Apply Fix**: Implement recommended changes
4. **Test**: Verify fix works correctly
5. **Ask Questions**: If unclear, request clarification in PR comments

## Adding New Agents

To add a new agent:

1. Create a new `.md` file in this directory
2. Define the agent's role, expertise, and process
3. Document the agent in this README
4. Add documentation in `docs/developer-guide/`
5. Update relevant workflows if needed
6. Test with sample PRs

## Maintenance

Agents should be updated regularly:

- **Security Updates**: Add new vulnerability patterns as discovered
- **Standard Updates**: Incorporate new security standards and best practices  
- **Tool Updates**: Update recommended tools and versions
- **Feedback Integration**: Improve based on developer feedback
- **Knowledge Refresh**: Keep current with Ethereum ecosystem

## Support

### Questions About Agents
- Review the agent's documentation in `docs/developer-guide/`
- Check examples in past PRs
- Open a GitHub discussion

### Reporting Issues
If an agent:
- Misses a real vulnerability
- Reports false positives
- Needs updated knowledge
- Has technical issues

Open an issue with:
- Description of the problem
- Link to relevant PR or code
- Expected vs actual behavior
- Suggested improvements

### Feedback

We welcome feedback on agent performance:
- What's working well
- What could be improved
- False positive/negative rates
- Feature requests

## Security Note

Agents are tools to **assist** security review, not **replace** it. Always:
- Understand security issues yourself
- Seek expert review for critical code
- Run comprehensive tests
- Consider professional security audits
- Stay informed about new vulnerabilities

## Resources

- [GitHub Copilot Documentation](https://docs.github.com/en/copilot)
- [EthTrust Security Levels](https://entethalliance.org/specs/ethtrust-sl/)
- [Smart Contract Best Practices](https://consensys.github.io/smart-contract-best-practices/)
- [OpenZeppelin Security](https://docs.openzeppelin.com/contracts/security)

---

**Version**: 1.0.0  
**Last Updated**: 2025-12-20  
**License**: Apache-2.0
