# Frequently Asked Questions (FAQ)

Common questions about the Prediction DAO system.

## General Questions

### What is Prediction DAO?

Prediction DAO is a futarchy-based governance system that uses prediction markets to make decisions. Instead of voting directly on proposals, the community votes on welfare metrics (what defines success), and prediction markets determine which proposals will maximize those metrics.

### What is futarchy?

Futarchy is a governance system based on the principle: **"Vote on values, bet on beliefs."**

- Community votes on **values** (welfare metrics that define success)
- Prediction markets **bet** on which proposals will maximize those values
- Market prices aggregate distributed knowledge better than voting alone

### How does this differ from traditional DAOs?

Traditional DAOs use direct voting on proposals. Prediction DAO uses:

- **Market-based decisions**: Traders put money behind their beliefs
- **Privacy protection**: Zero-knowledge proofs hide individual positions
- **Welfare metrics**: Objective measures of success
- **Anti-collusion**: MACI-style key changes prevent vote buying

### Is this system suitable for all types of decisions?

Futarchy works best for decisions that:

- Have measurable outcomes
- Affect objective metrics
- Benefit from diverse information
- Need to prevent collusion

It may not be ideal for purely subjective or values-based decisions.

## Getting Started

### What do I need to participate?

- MetaMask or compatible Web3 wallet
- ETC tokens for gas fees and bonds
- Understanding of the proposal you're voting on

### Where do I get ETC?

- **Mainnet**: Purchase from cryptocurrency exchanges
- **Testnet**: Request from Mordor testnet faucet
- **Local**: Use pre-funded Hardhat test accounts

### How much does it cost to participate?

**Trading**: Only gas fees (~150,000 gas per trade)

**Submitting Proposals**: 50 ETC bond + gas fees (bond returned)

**Oracle Reporting**: 100 ETC bond + gas fees (bond returned)

**Challenging**: 150 ETC bond + gas fees (forfeited if challenge fails)

### Can I participate anonymously?

Yes! Privacy protection is built-in:

- Your trading positions are encrypted
- Zero-knowledge proofs hide your identity
- Only aggregate market data is public
- Key-change capability prevents linking positions

## Proposals

### How do I submit a proposal?

1. Connect your wallet
2. Navigate to "Submit Proposal"
3. Fill in all required details
4. Post 50 ETC bond
5. Submit transaction

See the [Submitting Proposals guide](submitting-proposals.md) for details.

### What makes a good proposal?

A good proposal has:

- Clear objectives and deliverables
- Reasonable budget and timeline
- Strong rationale for funding
- Appropriate welfare metric selection
- Credible team or individual

### Can I edit a proposal after submission?

No, proposals cannot be edited after submission. Consider your proposal carefully before submitting.

### What happens if my proposal is rejected?

If your proposal fails (FAIL tokens win):

- Proposal is not executed
- No funds are transferred
- Your 50 ETC bond is returned (if submitted in good faith)
- You can learn from feedback and submit an improved version

### How long does the proposal process take?

Minimum timeline:

- 7 days: Review period
- 7-21 days: Trading period
- 3 days: Oracle settlement
- 2 days: Challenge period
- 2 days: Timelock
- **Total: 21-35 days minimum**

### Can I submit multiple proposals?

Yes, but each requires a separate 50 ETC bond. Consider timing to avoid having too many proposals active simultaneously.

## Trading

### How do prediction markets work?

Prediction markets create conditional tokens:

- **PASS tokens**: Bet that the proposal will succeed
- **FAIL tokens**: Bet that the proposal will fail
- **Prices**: Reflect aggregate market beliefs (0-1 ETC)
- **Winner**: Determined by oracle-reported welfare metrics

### Do I need a counterparty to trade?

No! The system uses LMSR (Logarithmic Market Scoring Rule) for automated market making. You can always trade against the automated market maker.

### How are prices determined?

Prices are calculated using LMSR:

```
P_pass + P_fail = 1
```

Prices adjust based on:

- Current token holdings
- Liquidity parameter (b)
- Recent trading activity

### What is slippage?

Slippage is the difference between expected and executed price. Larger trades cause more slippage. You can:

- Split large orders into smaller trades
- Trade during high liquidity periods
- Accept higher slippage for faster execution

### Can I lose more than I invest?

No, maximum loss is limited to your initial investment. There are no margin calls or negative balances.

### When can I redeem my tokens?

After the market resolves:

1. Oracle submits welfare metric values
2. Challenge period passes (2 days)
3. Market finalizes
4. Winning tokens become redeemable

Navigate to your portfolio and click "Redeem" on settled positions.

### What if I hold the losing tokens?

Losing tokens become worthless. For example:

- If PASS wins: FAIL tokens are worth 0
- If FAIL wins: PASS tokens are worth 0

This is the risk of trading prediction markets.

## Privacy & Security

### How is my privacy protected?

Multiple privacy layers:

1. **Poseidon Encryption**: Positions encrypted with SNARK-friendly hash
2. **Zero-Knowledge Proofs**: Groth16 zkSNARKs prove validity without revealing details
3. **Batch Processing**: Trades mixed in epochs
4. **Key Changes**: MACI-style key updates prevent linking

### What information is public?

Public:

- Total trading volume
- Aggregate PASS/FAIL prices
- Number of positions (not identities)
- Proposal outcomes

Private:

- Your position size
- Your trading direction
- Your identity
- Your profit/loss

### What is a key change and when should I use it?

Key change is a MACI feature that lets you change your encryption key, invalidating previous commitments. Use it if:

- You suspect vote buying attempts
- You want to break collusion agreements
- You want additional privacy
- You're concerned about coercion

### Is the smart contract code audited?

!!! warning "Security Status"
    This is research and demonstration code. Before mainnet deployment:
    
    - Minimum 2 independent security audits required
    - Bug bounty program (100k USD in ETC)
    - 30-day community review period
    - Formal verification of critical functions

### What are the main security risks?

Potential risks:

- Smart contract vulnerabilities
- Oracle manipulation
- Market manipulation
- Privacy proof failures
- Network attacks

Mitigations are built-in, but always DYOR (Do Your Own Research).

## Welfare Metrics

### What are welfare metrics?

Welfare metrics are objective measures of protocol success:

1. **Treasury Value**: Total DAO treasury value (TWAP)
2. **Network Activity**: Transaction volume and active addresses
3. **Hash Rate Security**: Network hash rate metrics
4. **Developer Activity**: GitHub contributions and activity

### How are welfare metrics measured?

Each metric has specific calculation methods:

- **Treasury**: Time-weighted average price of holdings
- **Network Activity**: Composite index of on-chain activity
- **Hash Rate**: Relative to other PoW chains
- **Developer**: GitHub API data

### Can welfare metrics be changed?

Yes, through the governance process itself. The DAO can vote to:

- Add new welfare metrics
- Adjust metric weights
- Change calculation methods
- Update data sources

### What if the oracle reports incorrectly?

There's a 2-day challenge period where anyone can:

1. Post 150 ETC challenge bond
2. Submit counter-evidence
3. Escalate to UMA for arbitration

If the challenge succeeds:

- Oracle's 100 ETC bond is slashed
- Challenger receives compensation
- Correct values are used

## Technical Issues

### Why did my transaction fail?

Common reasons:

- **Insufficient gas**: Increase gas limit
- **Insufficient balance**: Need more ETC
- **Slippage**: Price moved too much, increase tolerance
- **Network congestion**: Try again or increase gas price
- **Wrong network**: Verify you're on correct network

### I can't see my position

Check:

- You're on the correct network
- You're using the right wallet address
- The transaction confirmed
- Your browser cache (try clearing)
- Wait for block confirmations

### The website won't load

Try:

- Refresh the page
- Clear browser cache
- Try a different browser
- Check if MetaMask is up to date
- Verify your internet connection

### Gas fees are too high

Strategies to reduce costs:

- Trade during off-peak hours
- Batch multiple actions
- Use Layer 2 solutions (when available)
- Wait for lower network congestion

## Governance

### What is ragequit?

Ragequit allows minority token holders to exit with their proportional treasury share if they disagree with a proposal. It's a minority protection mechanism borrowed from Moloch DAO.

### When can I ragequit?

During the 2-day timelock period after a proposal passes but before execution.

### How do guardians work?

Guardians are a multisig that can:

- Trigger emergency pause
- Initially 5-of-7 multisig
- Powers decrease over time
- Full decentralization after Year 4

### What is progressive decentralization?

A schedule for reducing guardian powers:

- **Year 1**: Full pause authority
- **Year 2**: Increased multisig threshold
- **Year 3**: Reduced pause authority
- **Year 4+**: Full community control

## Oracle System

### Who can be an oracle reporter?

Anyone can report oracle values by posting a 100 ETC bond. The first reporter for each proposal gets priority.

### How are oracle values verified?

Multiple stages:

1. **Designated Reporter**: Posts bond and submits values
2. **Evidence**: Provides IPFS hash to data sources
3. **Challenge Period**: 2-day community review
4. **UMA Escalation**: If challenged, UMA token holders arbitrate

### What prevents oracle manipulation?

Protections include:

- Bond requirements (100 ETC)
- Challenge mechanism (150 ETC bond)
- Evidence requirements
- UMA escalation for disputes
- Slashing for false reports

## Economic Questions

### How does LMSR work?

LMSR (Logarithmic Market Scoring Rule) provides:

- Automated liquidity
- Bounded loss for market maker
- Prices that reflect probabilities
- No need for order books

The cost function is:

```
C(q) = b * ln(e^(q_pass/b) + e^(q_fail/b))
```

### Where does market liquidity come from?

Liquidity is provided by:

- The LMSR automated market maker
- Initial liquidity from proposal bond
- DAO treasury allocation
- Trader activity

### What is the maximum loss for the market maker?

The liquidity parameter (b) bounds the maximum loss:

```
Max Loss = b * ln(2)
```

This makes market making sustainable.

### Can markets be manipulated?

Safeguards against manipulation:

- Time-weighted average prices (TWAP)
- Privacy prevents front-running
- Multi-day trading periods
- Oracle verification process
- Economic cost to manipulate

## Getting Help

### Where can I get support?

- Check this FAQ
- Review the documentation
- Join community channels
- Ask in Discord/Telegram
- Submit GitHub issues

### How do I report a bug?

1. Check if it's a known issue
2. Gather relevant details
3. Submit to GitHub issues
4. Include reproduction steps
5. Add screenshots if applicable

### How can I contribute?

See the [Contributing Guide](../developer-guide/contributing.md) for:

- Code contributions
- Documentation improvements
- Bug reports
- Feature suggestions
- Community support

### Where can I learn more?

Additional resources:

- [System Overview](../system-overview/introduction.md)
- [Developer Guide](../developer-guide/setup.md)
- [Architecture Documentation](../developer-guide/architecture.md)
- [Original Futarchy Specification](https://gist.github.com/realcodywburns/8c89419db5c7797b678afe5ee66cc02b)

## Still Have Questions?

If your question isn't answered here:

1. Search the full documentation
2. Ask in community channels
3. Submit a question via GitHub discussions
4. Contact the team directly

---

**Last Updated**: December 2025
