# How It Works

Detailed explanation of how the Prediction DAO system operates.

## System Flow

For a complete flow diagram, see the [Architecture documentation](../developer-guide/architecture.md).

## Proposal Lifecycle

### 1. Submission Phase

A proposer submits a proposal by:

- Posting a 50 ETC bond
- Providing title, description, funding amount
- Specifying recipient address
- Selecting welfare metric for evaluation
- Optional: Adding milestones

The proposal enters a 7-day review period where the community can discuss it.

### 2. Activation Phase

After review, the Futarchy Governor activates the proposal:

- Conditional Market Factory creates PASS/FAIL token pairs
- LMSR market maker initialized with liquidity
- Trading period begins (configurable 7-21 days)
- Privacy Coordinator enables encrypted trading

### 3. Trading Phase

Traders participate by:

- Registering public keys with Privacy Coordinator
- Creating encrypted position commitments
- Generating zkSNARK proofs of validity
- Submitting trades in batched epochs
- Optionally changing keys to prevent collusion

Market prices adjust based on LMSR:

```
P_pass = e^(q_pass/b) / (e^(q_pass/b) + e^(q_fail/b))
P_fail = e^(q_fail/b) / (e^(q_pass/b) + e^(q_fail/b))
```

Where:
- `b` is the liquidity parameter
- `q_pass`, `q_fail` are outstanding shares

### 4. Resolution Phase

When trading ends:

- Oracle reporter submits welfare metric values for both scenarios
- Provides evidence (typically IPFS hash to data)
- Posts 100 ETC bond
- 3-day settlement window begins

### 5. Challenge Phase

During the 2-day challenge period:

- Anyone can challenge the oracle report
- Challenger posts 150 ETC bond (must exceed reporter's bond)
- Provides counter-evidence
- Escalates to UMA for arbitration if needed

### 6. Execution Phase

After finalization:

- 2-day timelock period
- Ragequit window opens for dissenting members
- If PASS market value > FAIL: Proposal executes
- If FAIL market value > PASS: Proposal rejected
- Bonds returned to honest participants

## Market Mechanics

### LMSR (Logarithmic Market Scoring Rule)

The system uses LMSR for automated market making with these properties:

**Bounded Loss**: Maximum loss = `b * ln(2)`

**Instant Liquidity**: No need to wait for counterparties

**Probability Prices**: Prices reflect implied probabilities

**Sybil Resistance**: Splitting trades doesn't reduce costs

### Token Redemption

After resolution:

```
If PASS wins:
  PASS token value = actual welfare metric value
  FAIL token value = 0

If FAIL wins:
  FAIL token value = actual welfare metric value
  PASS token value = 0
```

Traders profit/loss:

```
Profit = (redemption_value - purchase_price) × token_amount
```

## Privacy Architecture

### Nightmarket-Style Position Encryption

1. **Commitment Phase**:
   - Trader creates position: `(amount, direction, nonce)`
   - Computes Poseidon hash: `H = Poseidon(position, nonce)`
   - Submits commitment

2. **Proof Generation**:
   - Generates Groth16 zkSNARK proof
   - Proves position is valid without revealing details
   - Includes public inputs (commitment, merkle root)

3. **Batch Processing**:
   - Positions accumulated in epochs
   - Processed together to prevent timing analysis
   - Only aggregate data revealed

### MACI-Style Key Changes

1. **Registration**:
   - User registers public key with coordinator
   - Key used to encrypt messages

2. **Key Change Message**:
   - Encrypted with old public key
   - Contains new public key
   - Submitted on-chain

3. **Effect**:
   - Invalidates all previous positions using old key
   - Makes vote-buying unenforceable
   - Prevents collusion

## Oracle System

### Designated Reporter Model

**Phase 1: Report Submission**
- First reporter gets priority
- Posts 100 ETC bond
- Submits PASS and FAIL values
- Provides evidence URI

**Phase 2: Settlement**
- 3-day settlement window
- Data aggregation and verification
- Community review

**Phase 3: Challenge**
- 2-day challenge period
- Requires 150 ETC bond
- Must provide counter-evidence

**Phase 4: Escalation** (if challenged)
- UMA oracle system
- Token holder voting
- Final arbitration

### Evidence Requirements

Oracle reports must include:

- Methodology description
- Data sources used
- Calculation details
- IPFS hash to full data
- Timestamp ranges

## Security Mechanisms

### Bond System

Creates economic incentives for honest behavior:

| Role | Bond | Returned If | Slashed If |
|------|------|-------------|-----------|
| Proposer | 50 ETC | Good faith | Spam/malicious |
| Reporter | 100 ETC | Accurate report | False report |
| Challenger | 150 ETC | Challenge succeeds | Frivolous challenge |

### Timelock and Ragequit

**Timelock** (2 days):
- Prevents immediate execution
- Allows time for community verification
- Opens ragequit window

**Ragequit**:
- Proportional treasury withdrawal
- Available to token holders who disagree
- Executed during timelock period

### Access Control

**Multi-sig Guardians**:
- Can trigger emergency pause
- Initially 5-of-7 threshold
- Powers decrease over time
- Full decentralization by Year 4

**Spending Limits**:
- 50,000 ETC per proposal max
- 100,000 ETC daily aggregate max
- Prevents treasury drainage

## Welfare Metrics

### Primary: Treasury Value

**Measurement**: Time-weighted average price (TWAP) of all treasury holdings

**Calculation**:
```
TWAP = Σ(price_i × duration_i) / Σ(duration_i)
```

**Data Sources**:
- DEX prices
- Oracle price feeds
- Cross-referenced for accuracy

### Secondary: Network Activity

**Composite Index** including:
- Transaction count
- Active addresses
- Contract interactions
- Gas consumption

**Formula**:
```
Activity = weighted_average(txCount, activeAddrs, gasUsed)
```

### Tertiary: Hash Rate Security

**Measurement**: Network hash rate relative to comparable PoW chains

**Calculation**:
```
Security = (network_hashrate / average_hashrate) × 100
```

### Quaternary: Developer Activity

**GitHub Metrics**:
- Commits per week
- Pull requests opened/merged
- Active contributors
- Issue resolution rate

**Scoring**:
```
DevActivity = weighted_sum(commits, PRs, contributors, issues)
```

## Economic Model

### Market Maker Funding

LMSR requires capital:

- Initial: From proposal bond
- Additional: DAO treasury allocation
- Sustainable: Bounded loss property

### Fee Structure

Currently minimal fees:

- No trading fees (subsidized by protocol)
- Gas fees only (network cost)
- May add small spread in future

### Incentive Alignment

**Traders**: Profit from accurate predictions

**Proposers**: Bond returned if proposal legitimate

**Oracles**: Bond and reputation at stake

**Community**: Protocol improves → token value increases

## Upgradeability

### Progressive Decentralization Timeline

**Year 1**: Guardian multisig active

**Year 2**: Increased threshold requirements

**Year 3**: Reduced pause authority

**Year 4+**: Full community control

### Upgrade Process

1. Proposal submitted for upgrade
2. Goes through futarchy process
3. Market decides if upgrade improves welfare
4. If approved, UUPS proxy updated
5. Meta-governance: system governs itself

## For More Details

- [Introduction](introduction.md) - System overview
- [Privacy Mechanisms](privacy.md) - Detailed ZK explanation
- [Security Model](security.md) - Threat analysis
- [Governance](governance.md) - Decentralization roadmap
