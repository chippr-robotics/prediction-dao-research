# ADR 001: Adoption of Trail of Bits Security Testing Toolchain

**Status**: Accepted

**Date**: 2024-06-15 (Initial adoption)  
**Updated**: 2025-12-23 (Formalized as ADR)

**Deciders**: Development Team, Security Team

**Technical Story**: Security testing infrastructure for smart contract development

## Context

Smart contract vulnerabilities can lead to significant financial losses and security breaches. The Ethereum ecosystem has seen numerous high-profile exploits due to insufficient testing and security analysis. We needed a comprehensive, industry-standard approach to security testing that would:

1. Detect vulnerabilities before deployment
2. Provide multiple layers of security analysis
3. Integrate seamlessly with our CI/CD pipeline
4. Be maintained by reputable security experts
5. Support our Solidity 0.8.24+ contracts

Trail of Bits is a leading blockchain security firm that has developed and maintains a suite of open-source security tools specifically designed for smart contract analysis. Their toolchain is widely adopted in the industry and regularly updated to detect new vulnerability patterns.

## Decision

We adopt the **Trail of Bits security testing toolchain** as our primary security testing infrastructure, consisting of:

### Core Tools

1. **Slither** - Static analysis framework
   - Detects 90+ vulnerability patterns
   - Analyzes code without execution
   - Provides optimization recommendations
   - Configuration: `slither.config.json`

2. **Medusa** - Fuzzing framework
   - Property-based testing with random inputs
   - Assertion testing for invariants
   - Coverage-guided fuzzing
   - Configuration: `medusa.json`

3. **Manticore** - Symbolic execution engine
   - Explores all possible execution paths
   - Detects complex multi-transaction vulnerabilities
   - Identifies assertion violations
   - Used for targeted deep analysis

### Integration Approach

- **CI/CD Integration**: All tools run automatically on pull requests and scheduled builds
- **Hardhat Integration**: Unit tests run via Hardhat with gas reporting and coverage
- **Layered Testing**: Multiple complementary approaches (unit → static → symbolic → fuzz)
- **Configuration Management**: Tool configurations versioned in repository root

### Testing Layers

```
Layer 1: Unit Testing (Hardhat)
  ↓ Functional correctness, edge cases
Layer 2: Static Analysis (Slither)  
  ↓ Vulnerability patterns, code quality
Layer 3: Symbolic Execution (Manticore)
  ↓ Path exploration, assertion checking
Layer 4: Fuzz Testing (Medusa)
  ↓ Property invariants, random input testing
```

## Rationale

### Why Trail of Bits?

1. **Industry Leadership**: Trail of Bits is a recognized authority in blockchain security
2. **Active Maintenance**: Tools are regularly updated with new vulnerability patterns
3. **Comprehensive Coverage**: Different tools catch different vulnerability classes
4. **Open Source**: Full transparency and community contributions
5. **Battle-Tested**: Used by major DeFi protocols (Uniswap, Aave, Compound, etc.)

### Why This Specific Toolchain?

- **Slither**: Fastest feedback loop, catches 90% of common issues
- **Medusa**: Modern fuzzing with better performance than Echidna
- **Manticore**: Deep analysis for critical contracts (slower but thorough)

### Alternatives Considered

| Tool | Considered | Decision | Reason |
|------|------------|----------|---------|
| **Echidna** | Yes | Not adopted | Medusa offers better performance and coverage |
| **Mythril** | Yes | Not adopted | Slither has better Solidity 0.8+ support |
| **Certora** | Yes | Future consideration | Commercial tool, may add for critical contracts |
| **Foundry Fuzz** | Yes | Complementary | Keep for unit-test-level fuzzing |

## Consequences

### Positive

1. **Multi-Layer Security**: Different tools catch different vulnerability classes
2. **Early Detection**: Issues caught in CI/CD before code review
3. **Confidence**: Industry-standard tools reduce audit findings
4. **Documentation**: Security testing approach is well-documented
5. **Automation**: Minimal manual intervention required
6. **Gas Optimization**: Slither identifies optimization opportunities

### Negative

1. **CI/CD Time**: Full security suite adds 10-15 minutes to CI/CD
2. **False Positives**: Static analysis can flag benign patterns (requires configuration)
3. **Learning Curve**: Developers need to understand tool outputs
4. **Tool Maintenance**: Need to keep tools updated and configurations current
5. **Resource Usage**: Symbolic execution and fuzzing are computationally intensive

### Neutral

1. **Tool Versions**: Must pin versions for reproducibility
2. **Configuration Tuning**: Ongoing refinement of filters and settings
3. **Result Triage**: Security team reviews findings weekly

## Implementation

### Current Configuration

**Slither Configuration** (`slither.config.json`):
```json
{
  "filter_paths": "node_modules|test|contracts/mocks",
  "exclude_dependencies": true,
  "exclude_optimization": false,
  "exclude_informational": false,
  "exclude_low": false,
  "exclude_medium": false,
  "exclude_high": false,
  "json": "slither-report.json",
  "solc_remaps": [
    "@openzeppelin/contracts=node_modules/@openzeppelin/contracts"
  ],
  "compile_force_framework": "hardhat"
}
```

**Medusa Configuration** (`medusa.json`):
- 10 workers for parallel fuzzing
- 100-step call sequences
- Coverage-enabled fuzzing
- Targets all core contracts
- Assertion, property, and optimization testing enabled

**CI/CD Integration** (`.github/workflows/security-testing.yml`):
- Runs on PR to main/develop
- Weekly scheduled runs
- Artifacts retained for 30 days
- Results summarized in GitHub UI

### Installation

```bash
# Install Slither
pip install slither-analyzer
pip install solc-select
solc-select install 0.8.24
solc-select use 0.8.24

# Install Medusa
go install github.com/crytic/medusa@latest

# Install Manticore (optional, for deep analysis)
pip install manticore
```

### Usage

```bash
# Static analysis
slither . --config-file slither.config.json

# Fuzz testing
medusa fuzz

# Symbolic execution (targeted)
manticore contracts/YourContract.sol --contract YourContract
```

### Documentation

Comprehensive documentation maintained in:
- [Security Testing Overview](../security/index.md)
- [Static Analysis Guide](../security/static-analysis.md)
- [Fuzz Testing Guide](../security/fuzz-testing.md)
- [Symbolic Execution Guide](../security/symbolic-execution.md)
- [CI/CD Configuration](../security/ci-configuration.md)

## Success Metrics

| Metric | Target | Current Status |
|--------|--------|----------------|
| Slither Findings | 0 high/medium | ✅ Achieved |
| Test Coverage | >90% | ✅ 95%+ |
| CI/CD Pass Rate | >95% | ✅ 98% |
| Fuzzing Runtime | <10 min | ✅ 6 min avg |
| Critical Vulns Found | 0 in production | ✅ 0 |

## Review and Updates

This ADR should be reviewed:
- When new Trail of Bits tools are released
- When major vulnerabilities are discovered in the wild
- Before mainnet deployment
- Annually as part of security posture review

## References

- [Trail of Bits GitHub](https://github.com/trailofbits)
- [Slither Documentation](https://github.com/crytic/slither)
- [Medusa Documentation](https://github.com/crytic/medusa)
- [Manticore Documentation](https://github.com/trailofbits/manticore)
- [Building Secure Contracts](https://secure-contracts.com/)
- [Trail of Bits Blog](https://blog.trailofbits.com/)

## Appendix: Tool Comparison Matrix

| Feature | Slither | Medusa | Manticore | Hardhat |
|---------|---------|--------|-----------|---------|
| **Analysis Type** | Static | Fuzzing | Symbolic | Unit Testing |
| **Speed** | Fast (seconds) | Medium (minutes) | Slow (hours) | Fast (seconds) |
| **False Positives** | Some | Few | Very Few | None |
| **Setup Complexity** | Low | Medium | High | Low |
| **CI/CD Suitable** | ✅ Yes | ✅ Yes | ⚠️ Limited | ✅ Yes |
| **Coverage** | Code patterns | State space | Execution paths | Code lines |
| **Best For** | First-pass analysis | Invariant testing | Deep verification | Functional testing |

---

**Next ADR**: [ADR 002: Documentation Organization Strategy] (if/when needed)
