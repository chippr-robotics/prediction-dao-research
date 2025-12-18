# Prediction DAO Research

Research and implementation of a DAO empowered by prediction markets, integrating privacy-preserving mechanisms from Nightmarket (zero-knowledge position encryption), anti-collusion infrastructure from MACI (encrypted key-change voting), and Gnosis Conditional Token Framework standards for market mechanics.

## Overview

This project implements a futarchy-based governance system where:
- **Democratic voting** establishes welfare metrics (protocol success measures)
- **Prediction markets** aggregate distributed knowledge about which proposals maximize those metrics
- **Privacy mechanisms** prevent collusion and vote buying
- **Conditional tokens** enable efficient market-based decision making

## System Components

### Smart Contracts

1. **FutarchyGovernor.sol** - Main governance coordinator
   - Integrates all futarchy components
   - Manages proposal lifecycle from submission to execution
   - Implements timelock and emergency pause mechanisms

2. **WelfareMetricRegistry.sol** - Welfare metrics management
   - On-chain storage of democratically-selected protocol success measures
   - Versioning and weight update mechanisms
   - Primary, secondary, tertiary, and quaternary metrics

3. **ProposalRegistry.sol** - Proposal submission and management
   - Permissionless proposal submission with bond requirements
   - Standardized metadata schemas
   - Milestone tracking and completion criteria

4. **ConditionalMarketFactory.sol** - Market deployment
   - Automated deployment of PASS/FAIL market pairs
   - Based on Gnosis Conditional Token Framework standards
   - LMSR (Logarithmic Market Scoring Rule) for market making

5. **PrivacyCoordinator.sol** - Privacy and anti-collusion
   - MACI-style encrypted message submission
   - Key-change capability to prevent vote buying
   - Nightmarket-style position encryption with zkSNARK proofs
   - Poseidon hash commitments for privacy

6. **OracleResolver.sol** - Multi-stage oracle resolution
   - Designated reporting phase
   - Open challenge period
   - UMA-style escalation mechanism
   - Bond-based dispute resolution

7. **RagequitModule.sol** - Minority protection
   - Moloch-style ragequit functionality
   - Allows dissenting token holders to exit with proportional treasury share
   - Prevents forced participation in controversial proposals

## Features

### Privacy Mechanisms
- **Zero-Knowledge Position Encryption**: Uses Poseidon encryption and Groth16 zkSNARKs for private trading
- **MACI Integration**: Key-change messages prevent verifiable vote buying
- **Batched Submissions**: Prevents timing analysis and correlation attacks

### Anti-Collusion
- **Encrypted Voting**: MACI-style encrypted key changes invalidate previous commitments
- **Position Privacy**: Nightmarket-style encryption hides individual positions
- **Non-Verifiable Commitments**: Participants can change keys to break collusion agreements

### Market Mechanics
- **Conditional Tokens**: Gnosis CTF-compatible PASS/FAIL tokens
- **LMSR Market Making**: Automated liquidity provision with bounded loss
- **Multiple Trading Periods**: 7-21 day configurable trading windows
- **Time-Weighted Pricing**: Reduces manipulation through TWAP oracles

## Project Structure

```
prediction-dao-research/
├── contracts/              # Solidity smart contracts
│   ├── FutarchyGovernor.sol
│   ├── WelfareMetricRegistry.sol
│   ├── ProposalRegistry.sol
│   ├── ConditionalMarketFactory.sol
│   ├── PrivacyCoordinator.sol
│   ├── OracleResolver.sol
│   └── RagequitModule.sol
├── test/                   # Contract tests
│   ├── WelfareMetricRegistry.test.js
│   └── ProposalRegistry.test.js
├── frontend/              # React frontend application
│   ├── src/
│   │   ├── components/   # React components
│   │   │   ├── ProposalSubmission.jsx
│   │   │   ├── ProposalList.jsx
│   │   │   ├── WelfareMetrics.jsx
│   │   │   └── MarketTrading.jsx
│   │   ├── App.jsx       # Main application
│   │   └── App.css       # Styling
│   └── package.json
├── scripts/              # Deployment scripts
├── hardhat.config.js    # Hardhat configuration
└── README.md

```

## Setup and Installation

### Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn
- MetaMask or compatible Web3 wallet

### Smart Contracts

1. Install dependencies:
```bash
npm install
```

2. Compile contracts:
```bash
npx hardhat compile
```

3. Run tests:
```bash
npx hardhat test
```

4. Deploy to local network:
```bash
npx hardhat node
npx hardhat run scripts/deploy.js --network localhost
```

### Frontend

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start development server:
```bash
npm run dev
```

4. Open browser to `http://localhost:5173`

## Usage

### For Proposers

1. **Connect Wallet**: Connect MetaMask or compatible wallet
2. **Submit Proposal**: 
   - Provide title, description, funding amount
   - Specify recipient address
   - Select welfare metric for evaluation
   - Pay 50 ETC bond (returned on good-faith resolution)
3. **Add Milestones**: Define completion criteria and timelock periods
4. **Monitor Status**: Track proposal through review → trading → resolution → execution

### For Traders

1. **Connect Wallet**: Connect to application
2. **Browse Markets**: View active prediction markets for proposals
3. **Trade Tokens**:
   - Buy PASS tokens if you believe proposal will increase welfare metrics
   - Buy FAIL tokens if you believe proposal will decrease welfare metrics
4. **Privacy Protection**: All positions encrypted with zero-knowledge proofs
5. **Settle Positions**: Redeem tokens after oracle resolution

### For Governance Participants

1. **Set Welfare Metrics**: Vote on which protocol success measures to use
2. **Challenge Oracle Reports**: Submit counter-evidence during challenge period
3. **Ragequit**: Exit with proportional treasury share if you disagree with proposal

## Technical Details

### Welfare Metrics

The system uses four types of welfare metrics:

1. **Treasury Value (Primary)**: TWAP of total treasury holdings in USD
2. **Network Activity (Secondary)**: Composite index of transactions and active addresses
3. **Hash Rate Security (Tertiary)**: Network hash rate relative to other PoW chains
4. **Developer Activity (Quaternary)**: GitHub commits, PRs, and contributors

### Security Features

- **Bond Requirements**: 50 ETC for proposals, 100 ETC for oracle reporting, 150 ETC for challenges
- **Timelock**: 2-day minimum before execution
- **Spending Limits**: 50k ETC max per proposal, 100k ETC daily aggregate
- **Emergency Pause**: Guardian multisig can pause in case of critical issues
- **Progressive Decentralization**: Guardian powers decrease on fixed schedule

### Privacy Architecture

- **Poseidon Encryption**: SNARK-friendly encryption for positions
- **ECDH Key Exchange**: Secure coordination between traders
- **Groth16 zkSNARKs**: Zero-knowledge proofs for validity
- **Batch Processing**: Positions revealed only after epoch confirmation
- **Key Changes**: MACI-style invalidation of previous commitments

## Testing

Run the test suite:
```bash
npx hardhat test
```

Run specific test file:
```bash
npx hardhat test test/WelfareMetricRegistry.test.js
```

Run with coverage:
```bash
npx hardhat coverage
```

## Development

### Adding New Features

1. Create contracts in `contracts/` directory
2. Write tests in `test/` directory
3. Update frontend components in `frontend/src/components/`
4. Add deployment scripts in `scripts/`

### Code Style

- Solidity: Follow OpenZeppelin style guide
- JavaScript/React: Use ESLint with Airbnb config
- Comments: Document all public functions

## Deployment

### Testnet Deployment (Mordor)

```bash
npx hardhat run scripts/deploy.js --network mordor
```

### Mainnet Deployment

Before mainnet deployment:
1. Complete minimum 2 independent security audits
2. Publish audit reports
3. Run bug bounty program (100k USD equivalent in ETC)
4. 30-day community review period
5. Formal verification of critical invariants

## References

- [Futarchy Specification](https://gist.github.com/realcodywburns/8c89419db5c7797b678afe5ee66cc02b)
- [Nightmarket Privacy](https://blog.zkga.me/nightmarket)
- [MACI Anti-Collusion](https://github.com/privacy-scaling-explorations/maci)
- [Gnosis Conditional Tokens](https://docs.gnosis.io/conditionaltokens/)
- [MetaDAO Research](https://metadao.fi)

## License

Apache License 2.0

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## Security

For security concerns, please email security@example.com

## Acknowledgments

- Nightmarket team for zero-knowledge position encryption
- MACI/PSE team for anti-collusion infrastructure
- Gnosis team for Conditional Token Framework
- MetaDAO for futarchy research and validation
