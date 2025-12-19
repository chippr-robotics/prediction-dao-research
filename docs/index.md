# Welcome to ClearPath

**Clear signals for collective decisions** — ClearPath brings clarity to governance through futarchy-based decision-making, integrating privacy-preserving mechanisms for transparent yet secure collective intelligence.

## Overview

ClearPath implements a futarchy-based governance system where:

- **Democratic voting** establishes welfare metrics (protocol success measures)
- **Prediction markets** aggregate distributed knowledge about which proposals maximize those metrics
- **Privacy mechanisms** prevent collusion and vote buying
- **Conditional tokens** enable efficient market-based decision making

The system combines Nightmarket's zero-knowledge position encryption, MACI's anti-collusion infrastructure, and Gnosis Conditional Token Framework standards to create a governance platform that balances transparency with privacy.

## Quick Navigation

<div class="grid cards" markdown>

-   :fontawesome-solid-users:{ .lg .middle } __User Guide__

    ---

    Learn how to use the system, submit proposals, and trade on prediction markets.

    [:octicons-arrow-right-24: Getting Started](user-guide/getting-started.md)

-   :fontawesome-solid-code:{ .lg .middle } __Developer Guide__

    ---

    Set up your development environment and learn about the architecture.

    [:octicons-arrow-right-24: Setup Instructions](developer-guide/setup.md)

-   :fontawesome-solid-diagram-project:{ .lg .middle } __System Overview__

    ---

    Understand how the system works, including privacy and security features.

    [:octicons-arrow-right-24: How It Works](system-overview/how-it-works.md)

-   :fontawesome-solid-book:{ .lg .middle } __API Reference__

    ---

    Detailed reference documentation for smart contracts and APIs.

    [:octicons-arrow-right-24: API Docs](reference/api.md)

</div>

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

ClearPath consists of seven main smart contracts that work together:

1. **FutarchyGovernor** - Main governance coordinator
2. **WelfareMetricRegistry** - Welfare metrics management
3. **ProposalRegistry** - Proposal submission and management
4. **ConditionalMarketFactory** - Market deployment
5. **PrivacyCoordinator** - Privacy and anti-collusion
6. **OracleResolver** - Multi-stage oracle resolution
7. **RagequitModule** - Minority protection

## What is Futarchy?

> "Vote on values, bet on beliefs"

Futarchy is a governance mechanism where:

- **Democratic voting** establishes what metrics define success (welfare metrics)
- **Prediction markets** decide which proposals will maximize those metrics
- **Market prices** aggregate distributed knowledge better than voting alone

## Getting Started

Choose your path:

=== "Users"

    Want to participate in governance or trade on prediction markets?
    
    :octicons-arrow-right-24: [User Guide](user-guide/getting-started.md)

=== "Developers"

    Want to contribute to the project or integrate with the system?
    
    :octicons-arrow-right-24: [Developer Guide](developer-guide/setup.md)

=== "Researchers"

    Want to understand the technical details and design decisions?
    
    :octicons-arrow-right-24: [System Overview](system-overview/introduction.md)

## Security Notice

!!! warning "Development Status"
    ClearPath is in active development. Before mainnet deployment:
    
    1. Complete professional security audits (minimum 2)
    2. Run bug bounty program
    3. Community review period (30+ days)
    4. Formal verification of critical functions
    5. Progressive decentralization of guardian powers

## License

This project is licensed under the Apache License 2.0. See [LICENSE](https://github.com/chippr-robotics/prediction-dao-research/blob/main/LICENSE) for details.

## Contributing

Contributions are welcome! Please read our [contributing guidelines](developer-guide/contributing.md) to get started.
