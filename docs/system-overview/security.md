# Security Model

Security architecture and threat mitigations for Prediction DAO.

## Threat Model

### Threats Considered

1. **Market Manipulation**: Artificially moving prices
2. **Oracle Manipulation**: False welfare metric reports
3. **Vote Buying**: Bribing traders to vote certain ways
4. **Collusion**: Coordinated attacks by multiple parties
5. **Smart Contract Exploits**: Code vulnerabilities
6. **Front-running**: Exploiting transaction ordering
7. **Sybil Attacks**: Multiple fake identities

### Threats Out of Scope

- Nation-state level attacks
- Physical coercion of participants
- Complete network compromise

## Security Mechanisms

### Bond System

Economic deterrents for malicious behavior:

| Action | Bond | Risk |
|--------|------|------|
| Propose | 50 ETC | Slashed if spam |
| Oracle Report | 100 ETC | Slashed if false |
| Challenge Report | 150 ETC | Slashed if frivolous |

### Access Control

Multi-layered permissions:

- **Guardian Multisig**: Emergency pause (5-of-7)
- **Timelock**: 2-day delay before execution
- **Spending Limits**: Per-proposal and daily caps

### Oracle Security

**Multi-stage Verification**:

1. Designated reporter (100 ETC bond)
2. Evidence requirements (IPFS hash)
3. Challenge period (2 days, 150 ETC bond)
4. UMA escalation if disputed

**TWAP Oracles**: Time-weighted pricing prevents manipulation

### Privacy Protection

**Prevents Vote Buying**:

- MACI key changes break commitments
- Non-verifiable positions
- Encrypted communications

**Prevents Front-running**:

- Batch processing in epochs
- Encrypted position submission
- No mempool visibility of intent

### Smart Contract Security

**Best Practices**:

- OpenZeppelin contracts used where possible
- Reentrancy guards
- Integer overflow protection (Solidity 0.8+)
- Access control on all sensitive functions

**Planned Audits**:

- Minimum 2 independent security audits required
- Bug bounty program (100k USD in ETC)
- Formal verification of critical functions

### Upgradeability

**UUPS Proxy Pattern**:

- Upgrades controlled by futarchy process
- Meta-governance: system governs itself
- Guardian multisig for emergency fixes
- Timelock on all upgrades

## Attack Scenarios & Mitigations

### Scenario 1: Price Manipulation

**Attack**: Large trader moves market price artificially

**Mitigations**:
- LMSR ensures bounded impact
- TWAP smooths price volatility
- Multi-day trading periods
- Privacy prevents coordination

### Scenario 2: Oracle Corruption

**Attack**: Oracle reports false welfare metrics

**Mitigations**:
- 100 ETC bond at risk
- Evidence requirements
- Community challenge period
- UMA escalation
- Bond slashing if caught

### Scenario 3: Collusion

**Attack**: Multiple traders coordinate

**Mitigations**:
- Privacy hides positions
- MACI key changes break agreements
- Non-verifiable commitments
- Economic cost increases with scale

### Scenario 4: Smart Contract Exploit

**Attack**: Vulnerability in contract code

**Mitigations**:
- Security audits (2+ required)
- Bug bounty program
- Emergency pause capability
- Gradual decentralization
- Formal verification

### Scenario 5: Ragequit Attack

**Attack**: Mass exit to drain treasury

**Mitigations**:
- Proportional shares only
- Time-windowed execution
- Guardian pause if abnormal
- Gradual processing

## Progressive Decentralization

### Year 1: Guarded Launch

- Guardian multisig active (5-of-7)
- Full emergency pause authority
- Conservative spending limits
- Close monitoring

### Year 2: Increased Threshold

- Guardian threshold raised to 6-of-7
- Pause requires more signers
- Spending limits increase
- Community oversight grows

### Year 3: Reduced Powers

- Guardian can only pause, not modify
- Longer timelock periods
- Higher spending limits
- More community control

### Year 4+: Full Decentralization

- Guardian multisig disbanded
- Full community control
- System governs itself via futarchy
- No special privileges

## Security Monitoring

### Key Metrics

Monitor for anomalies:

- Unusual trading volumes
- Rapid price movements
- Failed transactions (potential exploits)
- Bond forfeitures
- Challenge rates

### Incident Response

1. **Detection**: Automated monitoring + community reports
2. **Assessment**: Guardians evaluate severity
3. **Response**: Pause if critical, investigate
4. **Resolution**: Fix + upgrade if needed
5. **Post-mortem**: Public disclosure + improvements

## Security Best Practices for Users

**For All Users**:
- Use hardware wallets for large amounts
- Verify contract addresses
- Never share private keys
- Be wary of phishing

**For Traders**:
- Start with small positions
- Use key changes if suspicious
- Monitor your positions
- Report anomalies

**For Proposers**:
- Provide accurate information
- Respond to questions
- Don't promise unrealistic outcomes
- Engage honestly with community

## Audit Status

!!! warning "Pre-Audit Status"
    This is research code. Before mainnet deployment:
    
    - [ ] 2 independent security audits
    - [ ] Bug bounty program (100k USD)
    - [ ] Formal verification of critical functions
    - [ ] 30-day community review period
    - [ ] Testnet deployment and testing

## Responsible Disclosure

Found a vulnerability? Please report responsibly:

- **DO NOT** create public issues
- Email: security@example.com
- Include detailed description and reproduction steps
- Allow time for fix before disclosure
- Eligible for bug bounty rewards

## For More Details

- [Introduction](introduction.md)
- [How It Works](how-it-works.md)
- [Privacy Mechanisms](privacy.md)
