# Welcome to FairWins & ClearPath

**Private wagers with friends, powered by trustless oracles** — A platform suite built on shared, privacy-preserving infrastructure.

## Platform Suite Overview

### 🎯 FairWins — P2P Wager Management Layer

FairWins is a peer-to-peer wager platform where friends create, accept, and resolve private wagers with trustless oracle integration. Stakes are locked in escrow and automatically settled.

**Key Features:**
- Create 1v1 private wagers on any topic
- Share wagers via QR code or invite link
- Multiple oracle sources (Polymarket, Chainlink, UMA, manual + challenge)
- Escrow-based stake management
- Flexible binary outcome types (Yes/No, Over/Under, Win/Lose, etc.)

### 🏛️ ClearPath — DAO Governance Platform

ClearPath brings clarity to governance through futarchy-based decision-making, integrating privacy-preserving mechanisms for transparent yet secure collective intelligence in decentralized organizations.

**Key Features:**
- Futarchy-based governance (vote on values, bet on beliefs)
- Democratic welfare metric selection
- Treasury management and proposal evaluation
- Privacy-preserving voting mechanisms
- Minority protection through ragequit

## System Overview

Both FairWins and ClearPath are built on the same secure foundation:

- **Conditional tokens** (Gnosis CTF) enable efficient binary outcome markets
- **Oracle integration** resolves wagers and proposals via trusted data sources
- **Privacy mechanisms** prevent collusion and protect participant identity
- **Smart contract escrow** ensures trustless stake management

## Quick Navigation

<div class="grid cards" markdown>

-   :fontawesome-solid-users:{ .lg .middle } __User Guide__

    ---

    Learn how to create wagers, accept challenges, and track results.

    [:octicons-arrow-right-24: Getting Started](user-guide/getting-started.md)

-   :fontawesome-solid-code:{ .lg .middle } __Developer Guide__

    ---

    Set up your development environment and learn about the shared architecture.

    [:octicons-arrow-right-24: Setup Instructions](developer-guide/setup.md)

-   :fontawesome-solid-diagram-project:{ .lg .middle } __Architecture__

    ---

    Understand P2P wager flows, oracle integration, and system design.

    [:octicons-arrow-right-24: Architecture](architecture/P2P_WAGER_PLATFORM_ASSESSMENT.md)

-   :fontawesome-solid-book:{ .lg .middle } __API Reference__

    ---

    Detailed reference documentation for smart contracts and APIs.

    [:octicons-arrow-right-24: API Docs](reference/api.md)

</div>

## Choosing Your Platform

### When to Use FairWins

Choose FairWins for:
- **Private wagers** between friends or small groups
- **Event predictions** with automatic oracle resolution
- **Casual bets** with trustless escrow (no need to trust the other party)
- **Any binary outcome** — sports, crypto prices, weather, custom events

### When to Use ClearPath

Choose ClearPath for:
- **DAO governance** with formal proposal processes
- **Treasury management** for institutional investors
- **Protocol decisions** requiring welfare metric tracking
- **Grant allocation** with transparent evaluation

## Key Features

### :handshake: P2P Wager Flow

1. **Create** — Pick a topic, set the stake, choose an oracle
2. **Invite** — Share a QR code or link with your friend
3. **Lock** — Both stakes are held in smart contract escrow
4. **Resolve** — Oracle determines outcome automatically
5. **Settle** — Winner claims the combined stake

### :shield: Oracle Sources

- **Polymarket** — Peg to real-world event outcomes
- **Chainlink** — Price feeds for crypto wagers
- **UMA** — Custom truth assertions with dispute resolution
- **Manual + Challenge** — Creator resolves with 24h dispute window

### :closed_lock_with_key: Privacy & Security

- **Zero-Knowledge Position Encryption**: Poseidon encryption and Groth16 zkSNARKs for private positions
- **MACI Integration**: Key-change messages prevent verifiable vote buying
- **Escrow**: All stakes locked in audited smart contracts until resolution

## System Components

### FairWins Smart Contracts

1. **FriendGroupMarketFactory** — Creates P2P wager markets between trusted parties
2. **ConditionalMarketFactory** — Deploys binary outcome token pairs (CTF-compatible)
3. **OracleResolver** — Multi-stage oracle resolution with dispute mechanism
4. **CTF1155** — ERC-1155 conditional tokens for wager positions

### ClearPath Smart Contracts

5. **FutarchyGovernor** — Main governance coordinator
6. **WelfareMetricRegistry** — Welfare metrics management
7. **ProposalRegistry** — Proposal submission and management
8. **RagequitModule** — Minority protection

### Shared Infrastructure

9. **PrivacyCoordinator** — Privacy and anti-collusion
10. **TieredRoleManager** — Role-based access control
11. **NullifierRegistry** — RSA accumulator-based blocklist

## Getting Started

Choose your path based on your use case:

=== "FairWins (P2P Wagers)"

    Want to create private wagers with friends or build on the wager platform?

    :octicons-arrow-right-24: [FairWins User Guide](user-guide/getting-started.md#fairwins-wagers)

=== "ClearPath (DAO Governance)"

    Want to participate in institutional governance or manage a DAO treasury?

    :octicons-arrow-right-24: [ClearPath User Guide](user-guide/getting-started.md#clearpath-dao)

=== "Developers"

    Want to contribute to the project or integrate with the systems?

    :octicons-arrow-right-24: [Developer Guide](developer-guide/setup.md)

=== "Researchers"

    Want to understand the technical details and design decisions?

    :octicons-arrow-right-24: [Architecture](architecture/P2P_WAGER_PLATFORM_ASSESSMENT.md)

## Security Notice

!!! warning "Development Status"
    Both FairWins and ClearPath are in active development. Before mainnet deployment:

    1. Complete professional security audits (minimum 2)
    2. Run bug bounty program
    3. Community review period (30+ days)
    4. Formal verification of critical functions
    5. Progressive decentralization of guardian powers

## License

This project is licensed under the Apache License 2.0. See [LICENSE](https://github.com/chippr-robotics/prediction-dao-research/blob/main/LICENSE) for details.

## Contributing

Contributions are welcome! Please read our [contributing guidelines](developer-guide/contributing.md) to get started.
