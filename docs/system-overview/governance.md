# Governance

Governance structure and progressive decentralization roadmap for FairWins.

## On-chain operator roles

The protocol's privileged actions are split across four OpenZeppelin
AccessControl roles, deliberately separated so no single key carries blanket
authority. For the full privilege matrix see
[Roles and Tiers](roles-and-tiers.md).

| Role | Power | Holder |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | Tier configuration, treasury withdrawal, grant/revoke all other admin roles | Guardian Multisig |
| `GUARDIAN_ROLE` | Pause / unpause `WagerRegistry` in response to security incidents | Guardian Multisig + on-call signer(s) |
| `ACCOUNT_MODERATOR_ROLE` | Per-account freeze / unfreeze on `WagerRegistry`. See [Account Moderation Policy](account-moderation.md). | Trust-and-safety multisig |
| `ROLE_MANAGER_ROLE` | Grant / revoke `WAGER_PARTICIPANT` memberships outside the purchase flow | Ops multisig |

### The right to pause

`GUARDIAN_ROLE` holders can pause `WagerRegistry`, halting wager creation and
acceptance protocol-wide. Already-active wagers can still settle and pay
out — pause is not a fund freeze. Every `pause()` and `unpause()` emits the
OpenZeppelin `Paused` / `Unpaused` events with the caller's address.

### The right to freeze

`ACCOUNT_MODERATOR_ROLE` holders can freeze an individual account on
`WagerRegistry`. A frozen account cannot create, accept, settle, claim, or
refund wagers until unfrozen. Every freeze emits `AccountFrozen(user,
moderator, reason)`; every unfreeze emits `AccountUnfrozen(user, moderator)`.
The full disclosure is in [Account Moderation Policy](account-moderation.md).

## Current Governance Structure

### Guardian Multisig

**Composition**: 5-of-7 multisig

**Powers**:
- Holds `GUARDIAN_ROLE` and `DEFAULT_ADMIN_ROLE` during the guarded launch
- Initial parameter tuning (tier prices, allowlisted tokens)
- Temporary intervention if critical issues

**Members**: TBD during launch phase

### Futarchy Process

All non-emergency decisions go through futarchy:

1. Community votes on welfare metrics
2. Proposals submitted with bonds
3. Prediction markets determine outcomes
4. Execute if markets indicate approval

## Progressive Decentralization

### Phase 1: Guarded Launch (Year 1)

**Guardian Powers**:
- Full emergency pause authority
- Can update certain parameters
- Monitor system closely

**Rationale**: New system needs close oversight

**Spending Limits**:
- 50,000 MATIC per proposal
- 100,000 MATIC daily aggregate

### Phase 2: Increased Threshold (Year 2)

**Changes**:
- Guardian threshold: 5-of-7 → 6-of-7
- Longer timelock periods
- Higher spending limits
- More community oversight

**Rationale**: Require broader consensus for intervention

### Phase 3: Reduced Authority (Year 3)

**Changes**:
- Guardians can only pause, not modify
- Community can override guardian pause
- Significantly higher spending limits
- Automated monitoring reduces need for intervention

**Rationale**: System proven stable, reduce central control

### Phase 4: Full Decentralization (Year 4+)

**Changes**:
- Guardian multisig disbanded
- All decisions via futarchy
- Meta-governance: system governs itself
- No special privileges for anyone

**Rationale**: System mature enough for full autonomy

## Governance Parameters

### Adjustable Parameters

Parameters that can be changed via governance:

**Economic**:
- Bond amounts (proposal, oracle, challenge)
- Spending limits
- LMSR liquidity parameter
- Fee structure

**Timing**:
- Review period duration
- Trading period range
- Challenge period
- Timelock duration

**Welfare Metrics**:
- Add new metrics
- Adjust metric weights
- Change calculation methods
- Update data sources

### Parameter Change Process

1. Submit proposal for parameter change
2. Goes through full futarchy process
3. Market determines if change improves welfare
4. If approved, parameter updated after timelock

## Welfare Metric Governance

### Current Metrics

1. **Treasury Value** (Primary) - Weight: 40%
2. **Network Activity** (Secondary) - Weight: 30%
3. **Hash Rate Security** (Tertiary) - Weight: 20%
4. **Developer Activity** (Quaternary) - Weight: 10%

### Changing Metrics

**Adding New Metrics**:

1. Propose new metric definition
2. Specify calculation methodology
3. Provide data sources
4. Markets decide if addition improves governance

**Adjusting Weights**:

1. Propose new weight distribution
2. Justify based on protocol priorities
3. Markets evaluate impact on decision quality

## Meta-Governance

### System Governs Itself

Once fully decentralized, protocol upgrades go through futarchy:

**Upgrade Process**:

1. Propose contract upgrade
2. Specify changes and rationale
3. Select welfare metric (typically treasury value)
4. Market decides if upgrade improves protocol
5. If approved, UUPS proxy updated

**Benefits**:

- No external control
- Economically optimal decisions
- Continuous improvement
- Self-correcting system

## Emergency Procedures

### When Guardians Can Pause

**Valid Reasons**:
- Critical smart contract vulnerability
- Oracle manipulation detected
- Market manipulation detected
- Significant unexpected behavior

**Invalid Reasons**:
- Disagreement with community decisions
- Political pressure
- Personal interests

### Pause Process

1. Guardian multisig detects issue
2. Threshold of guardians agree (5-of-7)
3. Emergency pause activated
4. Public announcement with explanation
5. Investigation and fix
6. Community review
7. Unpause via futarchy vote

### Overriding Guardian Pause

After Year 3, community can override:

1. Token holders vote
2. Requires supermajority (67%)
3. Unpause if approved
4. Guardian action logged for accountability

## Governance Participation

### Who Can Participate

**Submit Proposals**: Anyone with 50 MATIC bond

**Trade on Markets**: Anyone with MATIC for gas + position collateral

**Report Oracle Values**: Anyone with 100 MATIC bond

**Challenge Reports**: Anyone with 150 MATIC bond

**Vote on Metrics**: Token holders (if applicable)

### Incentives

**Aligned Incentives**:
- Traders profit from accurate predictions
- Proposers bond returned if legitimate
- Oracles build reputation
- Token value increases with good governance

**Penalties**:
- Spam proposals lose bond
- False oracle reports lose bond
- Frivolous challenges lose bond

## Governance Analytics

### Key Metrics to Track

**Participation**:
- Number of proposals per month
- Trading volume per market
- Number of unique traders
- Oracle accuracy rate

**Outcomes**:
- Proposal approval rate
- Average welfare metric improvement
- Challenge frequency
- Ragequit utilization

**Health**:
- Market liquidity
- Price volatility
- Time to resolution
- Bond forfeiture rate

## Future Governance Features

### Potential Additions

**Delegation**: Delegate trading/voting power

**Reputation**: Track historical accuracy

**Quadratic Mechanisms**: QF or QV for certain decisions

**Prediction Markets for Metrics**: Markets decide metric weights

**Multi-chain**: Cross-chain governance coordination

## For More Details

- [Introduction](introduction.md)
- [How It Works](how-it-works.md)
- [Security Model](security.md)
- [Contributing Guidelines](../developer-guide/contributing.md)
