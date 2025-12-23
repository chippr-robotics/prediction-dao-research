# Welcome to ClearPath & FairWins

**Clear signals for collective decisions** — A comprehensive platform suite offering two distinct applications built on shared, privacy-preserving infrastructure.

## Platform Suite Overview

### 🏛️ ClearPath — DAO Governance Platform

ClearPath brings clarity to governance through futarchy-based decision-making, integrating privacy-preserving mechanisms for transparent yet secure collective intelligence in decentralized organizations.

**Key Features:**
- Futarchy-based governance (vote on values, bet on beliefs)
- Democratic welfare metric selection
- Treasury management and proposal evaluation
- Privacy-preserving voting mechanisms
- Minority protection through ragequit

### 🎯 FairWins — Open Prediction Markets

FairWins provides an open prediction market platform where anyone can create, join, and resolve markets with flexible, fair controls for transparent, market-driven outcomes.

**Key Features:**
- Create custom prediction markets on any topic
- Open participation for all users
- Flexible resolution criteria
- Fair market controls
- Market-maker automated liquidity

## System Overview

Both ClearPath and FairWins are built on the same secure foundation:

- **Democratic voting** establishes success criteria and welfare metrics
- **Prediction markets** aggregate distributed knowledge about outcomes
- **Privacy mechanisms** prevent collusion and vote buying
- **Conditional tokens** enable efficient market-based decision making

The system combines Nightmarket's zero-knowledge position encryption, MACI's anti-collusion infrastructure, and Gnosis Conditional Token Framework standards to create platforms that balance transparency with privacy.

## Quick Navigation

<div class="grid cards" markdown>

-   :fontawesome-solid-users:{ .lg .middle } __User Guide__

    ---

    Learn how to use both platforms, submit proposals, and trade on prediction markets.

    [:octicons-arrow-right-24: Getting Started](user-guide/getting-started.md)

-   :fontawesome-solid-code:{ .lg .middle } __Developer Guide__

    ---

    Set up your development environment and learn about the shared architecture.

    [:octicons-arrow-right-24: Setup Instructions](developer-guide/setup.md)

-   :fontawesome-solid-diagram-project:{ .lg .middle } __System Overview__

    ---

    Understand how both platforms work, including privacy and security features.

    [:octicons-arrow-right-24: How It Works](system-overview/how-it-works.md)

-   :fontawesome-solid-book:{ .lg .middle } __API Reference__

    ---

    Detailed reference documentation for smart contracts and APIs.

    [:octicons-arrow-right-24: API Docs](reference/api.md)

</div>

## Choosing Your Platform

### When to Use ClearPath

Choose ClearPath for:
- **DAO governance** with formal proposal processes
- **Treasury management** for institutional investors
- **Protocol decisions** requiring welfare metric tracking
- **Grant allocation** with transparent evaluation
- **Organizational governance** with minority protection

### When to Use FairWins

Choose FairWins for:
- **Event predictions** on any topic
- **Market creation** without governance overhead
- **Open participation** from anyone
- **Flexible resolution** criteria
- **Simple prediction** markets

## Key Features

### :shield: Privacy Mechanisms

- **Zero-Knowledge Position Encryption**: Uses Poseidon encryption and Groth16 zkSNARKs for private trading
- **MACI Integration**: Key-change messages prevent verifiable vote buying
- **Batched Submissions**: Prevents timing analysis and correlation attacks

### :closed_lock_with_key: Anti-Collusion

- **Encrypted Voting**: MACI-style encrypted key changes invalidate previous commitments
- **Position Privacy**: Nightmarket-style encryption hides individual positions
- **Non-Verifiable Commitments**: Participants can change keys to break collusion agreements

### :chart_with_upwards_trend: Market Mechanics

- **Conditional Tokens**: Gnosis CTF-compatible PASS/FAIL tokens
- **LMSR Market Making**: Automated liquidity provision with bounded loss
- **Multiple Trading Periods**: 7-21 day configurable trading windows
- **Time-Weighted Pricing**: Reduces manipulation through TWAP oracles

## System Components

Both ClearPath and FairWins share the following smart contract infrastructure:

1. **FutarchyGovernor** - Main governance coordinator (ClearPath)
2. **WelfareMetricRegistry** - Welfare metrics management (ClearPath)
3. **ProposalRegistry** - Proposal submission and management (Both)
4. **ConditionalMarketFactory** - Market deployment (Both - Core)
5. **PrivacyCoordinator** - Privacy and anti-collusion (Both)
6. **OracleResolver** - Multi-stage oracle resolution (Both)
7. **RagequitModule** - Minority protection (ClearPath)

## What is Futarchy?

> "Vote on values, bet on beliefs"

Futarchy is a governance mechanism where:

- **Democratic voting** establishes what metrics define success (welfare metrics)
- **Prediction markets** decide which proposals will maximize those metrics
- **Market prices** aggregate distributed knowledge better than voting alone

## Getting Started

Choose your path based on your use case:

=== "ClearPath (DAO Governance)"

    Want to participate in institutional governance or manage a DAO treasury?
    
    :octicons-arrow-right-24: [ClearPath User Guide](user-guide/getting-started.md#clearpath-dao)

=== "FairWins (Prediction Markets)"

    Want to create prediction markets or trade on outcomes?
    
    :octicons-arrow-right-24: [FairWins User Guide](user-guide/getting-started.md#fairwins-markets)

=== "Developers"

    Want to contribute to the project or integrate with the systems?
    
    :octicons-arrow-right-24: [Developer Guide](developer-guide/setup.md)

=== "Researchers"

    Want to understand the technical details and design decisions?
    
    :octicons-arrow-right-24: [System Overview](system-overview/introduction.md)

## Security Notice

!!! warning "Development Status"
    Both ClearPath and FairWins are in active development. Before mainnet deployment:
    
    1. Complete professional security audits (minimum 2)
    2. Run bug bounty program
    3. Community review period (30+ days)
    4. Formal verification of critical functions
    5. Progressive decentralization of guardian powers

## License

This project is licensed under the Apache License 2.0. See [LICENSE](https://github.com/chippr-robotics/prediction-dao-research/blob/main/LICENSE) for details.

## Contributing

Contributions are welcome! Please read our [contributing guidelines](developer-guide/contributing.md) to get started.
