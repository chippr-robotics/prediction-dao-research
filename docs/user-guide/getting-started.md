# Getting Started

Welcome to the Prediction DAO! This guide will help you get started with using the system.

## What You'll Need

### Required

- **Web3 Wallet**: MetaMask or compatible Web3 wallet
- **ETC Tokens**: For paying gas fees and bonds
- **Web Browser**: Modern browser (Chrome, Firefox, Safari, or Brave)

### Recommended

- Basic understanding of blockchain and DAOs
- Familiarity with prediction markets (helpful but not required)

## Installation Steps

### 1. Install MetaMask

If you don't already have MetaMask:

1. Visit [metamask.io](https://metamask.io)
2. Download and install the browser extension
3. Create a new wallet or import an existing one
4. **Securely store** your seed phrase

!!! danger "Security Warning"
    Never share your seed phrase with anyone. The Prediction DAO will never ask for it.

### 2. Add the Network

Connect to the appropriate network:

=== "Mainnet (Production)"

    - **Network Name**: Ethereum Classic
    - **RPC URL**: Check with your preferred provider
    - **Chain ID**: 61
    - **Currency Symbol**: ETC

=== "Testnet (Mordor)"

    - **Network Name**: Ethereum Classic Mordor
    - **RPC URL**: https://rpc.mordor.etccooperative.org
    - **Chain ID**: 63
    - **Currency Symbol**: mETC

=== "Local Development"

    - **Network Name**: Hardhat Local
    - **RPC URL**: http://127.0.0.1:8545
    - **Chain ID**: 1337
    - **Currency Symbol**: ETH

### 3. Get ETC Tokens

=== "Mainnet"

    Purchase ETC from a cryptocurrency exchange and transfer to your wallet.

=== "Testnet"

    Request testnet tokens from a faucet:
    
    - [Mordor Testnet Faucet](https://easy.hebeswap.com/#/faucet)

=== "Local Development"

    The local Hardhat node provides test accounts with pre-funded ETH.

### 4. Access the Application

1. Navigate to the Prediction DAO web interface
2. Click "Connect Wallet" in the top right
3. Select MetaMask and approve the connection
4. You're ready to go!

## Understanding the Interface

### Dashboard

The main dashboard shows:

- **Active Proposals**: Currently trading proposals
- **Your Positions**: Your active market positions
- **Welfare Metrics**: Current protocol success measures
- **Recent Activity**: Latest system events

### Navigation

- **Proposals**: View and create proposals
- **Markets**: Browse and trade on prediction markets
- **Metrics**: View welfare metrics and voting
- **Portfolio**: Manage your positions and balances
- **Settings**: Configure your preferences

## User Roles

### :material-lightbulb: Proposer

Submit proposals for the DAO to consider. Requires a 50 ETC bond.

[Learn more about submitting proposals →](submitting-proposals.md)

### :material-chart-line: Trader

Trade on prediction markets to express your beliefs about proposals.

[Learn more about trading →](trading-on-markets.md)

### :material-vote: Voter

Participate in welfare metric selection and governance decisions.

### :material-gavel: Oracle Reporter

Report welfare metric values after proposals execute. Requires a 100 ETC bond.

### :material-shield: Challenger

Challenge incorrect oracle reports. Requires a 150 ETC bond.

## Key Concepts

### Futarchy

"Vote on values, bet on beliefs" - The DAO uses prediction markets to make decisions:

1. The community votes on **welfare metrics** (what defines success)
2. Proposers submit **proposals** (suggested actions)
3. Markets are created with **PASS** and **FAIL** tokens
4. Traders bet on whether proposals will improve welfare metrics
5. The market's prediction determines if the proposal is executed

### Privacy Protection

Your trading positions are private:

- Positions are encrypted using zero-knowledge proofs
- Your identity is not linked to your trades
- Key-change capability prevents vote buying
- Only aggregate market data is public

### Welfare Metrics

The protocol uses four types of metrics to measure success:

1. **Treasury Value** (Primary): Total value of DAO treasury
2. **Network Activity** (Secondary): Transaction volume and active users
3. **Hash Rate Security** (Tertiary): Network security metrics
4. **Developer Activity** (Quaternary): GitHub activity and contributions

## Next Steps

Ready to participate? Choose your path:

<div class="grid cards" markdown>

-   :material-file-document:{ .lg .middle } __Submit a Proposal__

    ---

    Have an idea for the DAO? Learn how to submit a proposal.

    [:octicons-arrow-right-24: Proposal Guide](submitting-proposals.md)

-   :material-chart-line:{ .lg .middle } __Trade on Markets__

    ---

    Express your beliefs about proposals by trading.

    [:octicons-arrow-right-24: Trading Guide](trading-on-markets.md)

-   :material-help-circle:{ .lg .middle } __Get Help__

    ---

    Have questions? Check our FAQ.

    [:octicons-arrow-right-24: FAQ](faq.md)

</div>

## Getting Help

If you need assistance:

- Check the [FAQ](faq.md) for common questions
- Review the [System Overview](../system-overview/how-it-works.md) for technical details
- Join our community channels (links in the app)
