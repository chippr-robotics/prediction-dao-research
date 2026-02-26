# Architecture Overview

This document covers the two main system architectures: the **P2P Wager System** (FairWins) and the **Governance System** (ClearPath).

## P2P Wager Architecture (FairWins)

The primary user-facing system. For a detailed assessment, see [P2P Wager Platform Assessment](../architecture/P2P_WAGER_PLATFORM_ASSESSMENT.md) and [Implementation Plan](../architecture/IMPLEMENTATION_PLAN.md).

```
┌─────────────────────────────────────────────────────────────────┐
│                  FriendGroupMarketFactory                        │
│              (P2P Wager Coordination Layer)                      │
│                                                                   │
│  - Wager Creation & Invite Links                                 │
│  - Stake Escrow Management                                       │
│  - Oracle Source Selection                                       │
│  - Resolution & Payout                                           │
└───────────┬─────────────────────────────────────────────────────┘
            │
            │ Coordinates
            │
    ┌───────┴──────────┬──────────────┬────────────────┐
    │                  │              │                │
    ▼                  ▼              ▼                ▼
┌─────────┐    ┌──────────────┐  ┌────────────┐  ┌──────────┐
│ Oracle  │    │  Conditional │  │  CTF1155   │  │ Tiered   │
│Resolver │    │  Market      │  │ Conditional│  │ Role     │
│         │    │  Factory     │  │ Tokens     │  │ Manager  │
└─────────┘    └──────────────┘  └────────────┘  └──────────┘
```

### P2P Wager Lifecycle

```
1. CREATE WAGER
   Creator → FriendGroupMarketFactory
   - Define topic and binary outcome type
   - Set stake amount and token
   - Select oracle source (Polymarket, Chainlink, UMA, manual)
   - Generate invite link / QR code

2. ACCEPT WAGER
   Counterparty → FriendGroupMarketFactory
   - Accept via invite link
   - Match stake deposited to escrow
   - Both stakes locked in contract

3. RESOLUTION
   Oracle → OracleResolver → FriendGroupMarketFactory
   - Polymarket: Peg to existing market outcome
   - Chainlink: Price feed comparison at deadline
   - UMA: Custom assertion with dispute window
   - Manual: Creator resolves, 24h challenge period

4. SETTLEMENT
   FriendGroupMarketFactory → Winner
   - Winner claims combined stake
   - Unclaimed winnings return after 90 days
```

---

## Governance Architecture (ClearPath)

```
┌─────────────────────────────────────────────────────────────────┐
│                      FutarchyGovernor                            │
│                  (Main Coordination Layer)                       │
│                                                                   │
│  - Proposal Lifecycle Management                                 │
│  - Phase Transitions (Submit → Trade → Resolve → Execute)        │
│  - Timelock & Emergency Controls                                 │
│  - Treasury Integration                                          │
└───────────┬─────────────────────────────────────────────────────┘
            │
            │ Coordinates
            │
    ┌───────┴──────────┬──────────────┬────────────────┐
    │                  │              │                │
    ▼                  ▼              ▼                ▼
┌─────────┐    ┌──────────────┐  ┌────────────┐  ┌──────────┐
│ Welfare │    │  Proposal    │  │ Conditional│  │ Privacy  │
│ Metric  │    │  Registry    │  │ Market     │  │ Coord.   │
│ Registry│    │              │  │ Factory    │  │          │
└─────────┘    └──────────────┘  └────────────┘  └──────────┘
                                                       │
    ┌──────────────────────────────────────────────────┤
    │                                                  │
    ▼                                                  ▼
┌─────────┐                                    ┌──────────────┐
│ Oracle  │                                    │  Ragequit    │
│Resolver │                                    │  Module      │
└─────────┘                                    └──────────────┘
```

### Proposal Lifecycle (ClearPath)

```
1. SUBMISSION
   User → ProposalRegistry
   - Submit with 50 ETC bond
   - Define milestones
   - 7-day review period

2. MARKET CREATION
   FutarchyGovernor → ConditionalMarketFactory
   - Deploy PASS/FAIL token pair
   - Initialize LMSR liquidity
   - Set 7-21 day trading period

3. TRADING PHASE
   Traders → PrivacyCoordinator → ConditionalMarketFactory
   - Submit encrypted positions (Nightmarket)
   - Use key-change messages (MACI)
   - Trade PASS/FAIL tokens
   - Batch process in epochs

4. RESOLUTION
   Reporter → OracleResolver
   - Submit welfare metric values
   - 3-day settlement window
   - 2-day challenge period
   - UMA escalation if disputed

5. DECISION
   OracleResolver → ConditionalMarketFactory
   - Compare PASS vs FAIL values
   - Higher value indicates approval
   - Resolve conditional tokens

6. EXECUTION
   FutarchyGovernor → Treasury
   - 2-day timelock
   - Ragequit window opens
   - Execute if approved
   - Return proposer bond
```

## Privacy Architecture

### Nightmarket Integration

```
Trader Position Submission:
1. Generate position data (amount, direction, price)
2. Create Poseidon hash commitment: H = Poseidon(position, nonce)
3. Generate Groth16 zkSNARK proof of validity
4. Submit (commitment, proof) to PrivacyCoordinator
5. Position added to epoch batch

Public Information:
- Total trading volume
- Aggregate prices
- Number of positions

Private Information:
- Individual position sizes
- Trader identities
- Position directions
```

### MACI Integration

```
Anti-Collusion Flow:
1. Trader registers public key with PrivacyCoordinator
2. Submits encrypted position using public key
3. If bribed, submits key-change message
4. Key change invalidates previous positions
5. Makes vote buying unenforceable

Key Change Message:
- Encrypted with old public key
- Contains new public key
- Processed by coordinator
- Previous positions become invalid
```

## Market Mechanics

### LMSR (Logarithmic Market Scoring Rule)

```
Cost Function: C(q) = b * ln(e^(q_pass/b) + e^(q_fail/b))

Where:
- b = liquidity parameter (higher = more liquidity)
- q_pass = quantity of PASS tokens
- q_fail = quantity of FAIL tokens

Price Calculation:
P_pass = e^(q_pass/b) / (e^(q_pass/b) + e^(q_fail/b))
P_fail = e^(q_fail/b) / (e^(q_pass/b) + e^(q_fail/b))

Properties:
- Prices always sum to 1
- Bounded loss for market maker
- Automated liquidity provision
- Price reflects aggregate beliefs
```

### Token Redemption

```
After Resolution:
- PASS tokens: Redeem for actual welfare metric value if passed
- FAIL tokens: Redeem for actual welfare metric value if failed
- Profit = (final_value - purchase_price) * token_amount
```

## Security Model

### Bond System

```
Proposal Bond (50 ETC):
- Required for proposal submission
- Returned on good-faith resolution
- Forfeited for spam/malicious proposals

Oracle Reporter Bond (100 ETC):
- Required for reporting welfare metrics
- Returned if report accepted
- Slashed if report successfully challenged

Challenger Bond (150 ETC):
- Required to challenge oracle report
- Must exceed reporter bond (prevents cheap griefing)
- Returned if challenge succeeds
- Forfeited if challenge fails
```

### Access Control

```
FutarchyGovernor (Owner):
- Can activate proposals
- Can finalize resolutions
- Can execute approved proposals
- Can update guardians

Guardians:
- Can trigger emergency pause
- Multi-sig (initially 5-of-7)
- Powers decrease over time

PrivacyCoordinator (Coordinator):
- Can process message batches
- Can advance epochs
- Cannot decrypt individual positions

Public:
- Can submit proposals (with bond)
- Can trade on markets
- Can report oracle values (with bond)
- Can challenge reports (with bond)
```

## Data Flow

### Welfare Metric Updates

```
1. External Oracle → Fetch on-chain data
   - Treasury balances
   - Transaction counts
   - Hash rate statistics
   - GitHub activity

2. Oracle → Calculate Metrics
   - TWAP for treasury value
   - Composite indices
   - Normalized scores

3. Oracle → OracleResolver
   - Submit pass_value (if proposal passes)
   - Submit fail_value (if proposal fails)
   - Include evidence (IPFS hash)

4. Challenge Period → Verification
   - Community reviews evidence
   - Challengers can dispute
   - Escalate to UMA if needed

5. Finalization → ConditionalMarketFactory
   - Resolve markets
   - Enable token redemption
   - Distribute payouts
```

## Scalability Considerations

### Gas Optimization

```
Batch Operations:
- PrivacyCoordinator processes positions in batches
- Reduces per-transaction costs
- Amortizes verification overhead

Storage Optimization:
- Use mappings over arrays where possible
- Pack struct fields efficiently
- Use events for historical data

Lazy Evaluation:
- Markets resolve only when finalized
- Token redemption on-demand
- Minimize upfront computation
```

### Layer 2 Integration

```
Future Improvements:
- Deploy core contracts on L1
- Move trading to L2 (Optimism/Arbitrum)
- Use L1 for security-critical operations
- Use L2 for high-frequency trading
- Cross-layer messaging for settlement
```

## Upgradeability

### Progressive Decentralization

```
Year 1: Guardian multisig can pause
Year 2: Increase multisig threshold
Year 3: Remove pause authority
Year 4: Full community control

Contract Upgrades:
- Use UUPS proxy pattern
- Upgrade authority controlled by futarchy
- Upgrade proposals go through full process
- Meta-governance: system governs itself
```

## Integration Points

### External Systems

```
Treasury Vault (ECIP-1112):
- FutarchyGovernor whitelisted
- Withdrawal authorization
- Spending limits enforced

UMA Oracle (Dispute Resolution):
- Escalation endpoint
- Token holder voting
- Final arbitration

Gnosis CTF (Conditional Tokens):
- Standard token interface
- Market resolution
- Redemption mechanics

MACI Coordinator:
- Key registry
- Message processing
- Epoch management
```

## Monitoring & Analytics

### Key Metrics

```
Proposal Metrics:
- Submission rate
- Approval rate
- Average funding amount
- Bond forfeiture rate

Market Metrics:
- Trading volume
- Liquidity depth
- Price volatility
- Number of traders

Governance Metrics:
- Participation rate
- Ragequit utilization
- Oracle accuracy
- Challenge frequency

Privacy Metrics:
- Position count per epoch
- Batch processing time
- Key change frequency
- Proof verification success rate
```

## Emergency Procedures

### Emergency Pause

```
Triggers:
- Critical bug discovery
- Oracle manipulation
- Market manipulation
- Security breach

Actions:
- Halt new proposals
- Freeze trading
- Prevent execution
- Preserve funds

Recovery:
- Fix vulnerability
- Deploy patch
- Community review
- Unpause via futarchy vote
```

## Future Enhancements

### Roadmap

```
Phase 1 (Current):
- Core futarchy system
- Basic privacy
- Single-metric evaluation

Phase 2:
- Multi-metric aggregation
- Advanced ZK circuits
- L2 deployment
- Mobile app

Phase 3:
- Cross-chain governance
- Reputation systems
- Automated welfare tracking
- AI-assisted analysis

Phase 4:
- Full decentralization
- Protocol upgrades via futarchy
- DAO-of-DAOs coordination
- Universal governance framework
```
