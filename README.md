![](docs/assets/logo_fairwins.svg)

# FairWins — Prediction Market Platform Suite

**Clear signals for collective decisions** — A comprehensive prediction market platform with optional DAO governance capabilities:

- **FairWins** (Primary): Open prediction markets for anyone to create, join, and resolve markets

- **ClearPath** (Add-on): Futarchy-based DAO governance feature for institutional decision-making
- **TokenMint** (Add-on): Enterprise token management
  
The platform integrates privacy-preserving mechanisms from Nightmarket (zero-knowledge position encryption), anti-collusion infrastructure from MACI (encrypted key-change voting), and Gnosis Conditional Token Framework standards for market mechanics.

## Build Status

[![Frontend Testing](https://github.com/chippr-robotics/prediction-dao-research/actions/workflows/frontend-testing.yml/badge.svg)](https://github.com/chippr-robotics/prediction-dao-research/actions/workflows/frontend-testing.yml)
[![Smart Contract Tests](https://github.com/chippr-robotics/prediction-dao-research/actions/workflows/test.yml/badge.svg)](https://github.com/chippr-robotics/prediction-dao-research/actions/workflows/test.yml)
[![Torture Testing](https://github.com/chippr-robotics/prediction-dao-research/actions/workflows/torture-test.yml/badge.svg)](https://github.com/chippr-robotics/prediction-dao-research/actions/workflows/torture-test.yml)

## Mordor Contracts

Contracts are deployed at the following addresses:


- WelfareMetricRegistry: [0x7F57BB570cc66f706A9F506dba84F1e419f3530c](https://etc-mordor.blockscout.com/address/0x7F57BB570cc66f706A9F506dba84F1e419f3530c)
- ProposalRegistry: [0xC2B9047eC8DEc58a0b601428079382dCcF9d4541](https://etc-mordor.blockscout.com/address/0xC2B9047eC8DEc58a0b601428079382dCcF9d4541)
- ConditionalMarketFactory: [0xbf243E69dF76Bfa3561B7B1c80C1966BA2BEAd34](https://etc-mordor.blockscout.com/address/0xbf243E69dF76Bfa3561B7B1c80C1966BA2BEAd34)
- PrivacyCoordinator: [0xB8400de133343850a2ef6dDC1B93Feb7FEc24DB9](https://etc-mordor.blockscout.com/address/0xB8400de133343850a2ef6dDC1B93Feb7FEc24DB9)
- OracleResolver: [0x9A669A42d481d519406285637827EBaC6Ee0B80A](https://etc-mordor.blockscout.com/address/0x9A669A42d481d519406285637827EBaC6Ee0B80A)
- RagequitModule: [0xE494d7548dc3DAc0FAcC44609e97089c8D424CA8](https://etc-mordor.blockscout.com/address/0xE494d7548dc3DAc0FAcC44609e97089c8D424CA8)
- FutarchyGovernor: [0x396C25b831fF3675fC93d8E69c61b8D9662FCd37](https://etc-mordor.blockscout.com/address/0x396C25b831fF3675fC93d8E69c61b8D9662FCd37)

## 📚 Documentation

**[View the full documentation →](https://docs.FairWins.app)**

The documentation site provides comprehensive guides for both platforms:
- **User Experience**: Complete narrative guides walking through user journeys, practical scenarios, and interface understanding
- **Users**: Getting started, choosing platforms, trading on markets, submitting proposals
- **Developers**: Setup instructions, architecture, API reference
- **System Overview**: How it works, privacy mechanisms, security model

## Platform Overview

### 🎯 FairWins — Prediction Markets for Friends (Primary Platform)

FairWins is the main prediction market platform where:
- **Anyone can create markets** on any topic with custom parameters
- **Flexible controls** allow market creators to set resolution criteria
- **Fair participation** enables anyone to trade based on their knowledge
- **Transparent resolution** ensures trust and accountability

**Market Types:**
1. **Public Markets** - Open to all users with full oracle support
2. **Friend Group Markets** (P2P Betting) - Private markets between friends with:
   - **Gas-only markets**: Members pay only gas fees (creation fees waived)
   - **ERC20 support**: Pay with USDC, USDT, or other stablecoins
   - **USD pricing**: All prices displayed in USD for clarity
   - **Monthly allocations**: Bronze (15), Silver (30), Gold (100), Platinum (Unlimited)
   - **Membership durations**: 1, 3, 6, 12 months, or enterprise
   - Member limits (2-10 participants)
   - Optional third-party arbitration
   - Market pegging to public markets for automatic settlement
   - Support for 1v1 bets, group prop bets, and event tracking
   - **Updateable pricing**: Managers can adjust fees and limits

**Use Cases:**
- Event outcome predictions
- Financial market forecasting
- Sports and entertainment betting
- Community sentiment tracking
- **Friend group betting** (competitive events, prop bets, office pools)

### 🏛️ ClearPath — DAO Governance (Add-on Feature)

ClearPath is an optional add-on feature within FairWins for DAO governance, offering **two governance modes**:

#### Futarchy Governance (Prediction Markets)
- **Democratic voting** establishes welfare metrics (protocol success measures)
- **Prediction markets** aggregate distributed knowledge about which proposals maximize those metrics
- **Privacy mechanisms** prevent collusion and vote buying
- **Conditional tokens** enable efficient market-based decision making

#### Traditional Democracy Voting
- **Token-weighted voting** where 1 token = 1 vote
- **Direct voting** with For, Against, and Abstain options
- **Configurable quorum** requirements (default 40% of supply)
- **Simple majority** determines proposal approval
- **Timelock period** for execution safety

**Use Cases:**
- DAO treasury management
- Institutional governance
- Protocol upgrades and parameter changes
- Grant allocation and funding decisions
- Enterprise-friendly traditional voting

### 🪙 TokenMint — Enterprise Token Management (Add-on Feature)

TokenMint is an optional add-on feature for creating and managing custom tokens:
- **Token creation** with configurable parameters
- **Vesting schedules** for controlled distribution
- **Access control** and role-based permissions
- **Integration** with FairWins markets and ClearPath governance

**Use Cases:**
- DAO token issuance
- Reward token creation
- Governance token management
- Community token distribution

## Shared Infrastructure

Both platforms are built on the same secure, privacy-preserving foundation:

## System Components

### Smart Contracts (Shared Infrastructure)

1. **FutarchyGovernor.sol** - Main futarchy governance coordinator
   - Integrates all futarchy components
   - Manages proposal lifecycle from submission to execution
   - Implements timelock and emergency pause mechanisms
   - Used by: ClearPath (Futarchy mode)

2. **TraditionalGovernor.sol** - Traditional democracy governance
   - Token-weighted voting with For/Against/Abstain options
   - Configurable voting period and quorum requirements
   - Timelock and daily spending limits
   - Emergency pause and guardian controls
   - Used by: ClearPath (Traditional mode)

3. **WelfareMetricRegistry.sol** - Welfare metrics management
   - On-chain storage of democratically-selected protocol success measures
   - Versioning and weight update mechanisms
   - Primary, secondary, tertiary, and quaternary metrics
   - Used by: ClearPath

3. **ProposalRegistry.sol** - Proposal submission and management
   - Permissionless proposal submission with bond requirements
   - Standardized metadata schemas
   - Milestone tracking and completion criteria
   - Used by: Both governance modes

4. **ConditionalMarketFactory.sol** - Market deployment
   - Automated deployment of PASS/FAIL market pairs
   - Based on Gnosis Conditional Token Framework standards
   - LMSR (Logarithmic Market Scoring Rule) for market making
   - Used by: Both platforms (core component)

5. **PrivacyCoordinator.sol** - Privacy and anti-collusion
   - MACI-style encrypted message submission
   - Key-change capability to prevent vote buying
   - Nightmarket-style position encryption with zkSNARK proofs
   - Poseidon hash commitments for privacy
   - Used by: Both platforms

6. **OracleResolver.sol** - Multi-stage oracle resolution
   - Designated reporting phase
   - Open challenge period
   - UMA-style escalation mechanism
   - Bond-based dispute resolution
   - Used by: Both platforms

7. **RagequitModule.sol** - Minority protection
   - Moloch-style ragequit functionality
   - Allows dissenting token holders to exit with proportional treasury share
   - Prevents forced participation in controversial proposals
   - Used by: ClearPath

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

## Friend Group Markets (P2P Betting)

Friend Group Markets enable prediction markets between trusted groups with reduced costs and simplified operations.

### Key Features

#### Reduced Creation Costs
- **1v1 Markets**: 0.05 ETH (90% cheaper than public markets)
- **Small Group Markets**: 0.1 ETH (10-90% cheaper)
- **Public Markets**: 1 ETH (standard fee)

#### Market Types

1. **One-vs-One (1v1)**
   - Direct betting between two parties
   - Optional third-party arbitrator
   - Lowest creation fee (0.05 ETH)
   - Perfect for friendly wagers

2. **Small Group Markets**
   - 3-10 participants
   - Ideal for office pools and friend groups
   - Collaborative betting environment
   - Moderate creation fee (0.1 ETH)

3. **Event Tracking Markets**
   - Track competitive events and tournaments
   - 3-10 players
   - Transparent accounting
   - Automatic settlement

4. **Prop Bet Markets**
   - General proposition betting
   - Flexible member limits
   - Custom resolution criteria

#### Member Limits (Anti-Bypass Protection)
- Prevents friend markets from bypassing public markets
- 1v1: Exactly 2 participants
- Small Groups: Maximum 10 concurrent members
- Event Tracking: 3-10 players

#### Market Pegging for Easy Settlement
- **Peg to public markets** for automatic resolution
- No manual arbitration needed
- Transparent, verifiable outcomes
- Batch resolution supported

#### Arbitration Options
- **No arbitrator**: For simple, objective outcomes
- **Third-party arbitrator**: Neutral friend for disputes
- **Market pegging**: Automatic based on public market
- **Creator resolution**: For event tracking and monitoring

#### Ragequit Protection
- Integrated with existing RagequitModule
- Exit with proportional treasury share
- Protection for dissenting participants
- Fair exit mechanism

### Safety and Risk Warnings

⚠️ **CRITICAL: Smart Contract Risks** ⚠️

Friend markets create irreversible smart contracts. Before participating:
- **No one controls outcomes** - Not you, your friends, or FairWins
- **Use at your own risk** - You are solely responsible
- **Only bet with trusted friends** you know in real life
- **Read the safety guide** - Required before creating markets

**📚 [Complete Safety Guide](docs/FRIEND_MARKET_SAFETY_GUIDE.md)** - **REQUIRED READING**

**🚨 [Scam Prevention Guide](docs/FRIEND_MARKET_SAFETY_GUIDE.md#how-to-spot-scams)** - Learn red flags

### Smart Contracts

**FriendGroupMarketFactory.sol** - Factory for creating friend markets
- Manages market creation and lifecycle
- Enforces member limits
- Handles market pegging
- Integrates with ConditionalMarketFactory and RagequitModule

### Example Use Cases

#### 1. Competitive Event Tracking
```solidity
// Track a competitive event or tournament
createEventTrackingMarket(
  "Friday Night Game Tournament",
  [player1, player2, player3, player4],
  7 days,
  0  // No pegging
);
```

#### 2. 1v1 Sports Bet
```solidity
// Bet on tonight's game with a friend
createOneVsOneMarket(
  friend,
  "Lakers beat Warriors tonight?",
  1 days,
  mutualFriend,  // Arbitrator
  0  // No pegging
);
```

#### 3. Office Pool Pegged to Public Market
```solidity
// Office pool that settles based on public election market
createSmallGroupMarket(
  "Office 2024 Election Pool",
  [alice, bob, carol, dave],
  10,  // Max 10 members
  90 days,
  address(0),  // No arbitrator needed
  publicElectionMarketId  // Auto-settle based on public market
);
```

## Project Structure

```
prediction-dao-research/
├── contracts/              # Solidity smart contracts
│   ├── FutarchyGovernor.sol
│   ├── TraditionalGovernor.sol
│   ├── WelfareMetricRegistry.sol
│   ├── ProposalRegistry.sol
│   ├── ConditionalMarketFactory.sol
│   ├── FriendGroupMarketFactory.sol  # NEW: P2P betting markets
│   ├── PrivacyCoordinator.sol
│   ├── OracleResolver.sol
│   └── RagequitModule.sol
├── test/                   # Contract tests
│   ├── WelfareMetricRegistry.test.js
│   ├── ProposalRegistry.test.js
│   └── FriendGroupMarketFactory.test.js  # NEW: Friend market tests
├── docs/                   # Documentation
│   ├── FRIEND_MARKET_SAFETY_GUIDE.md     # NEW: Safety warnings & scam prevention
│   └── FRIEND_MARKET_WARNING_UI.md        # NEW: UI warning components
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

### Testnet Seeding (Garden of Eden)

To populate the testnet with market data and simulated trading:

1. Configure seed accounts in `.env` (see `.env.example`)
2. Run the seeding service:
```bash
npm run seed:testnet  # For Mordor testnet
npm run seed:local    # For local development
```

See [Garden of Eden Quick Start](GARDEN_OF_EDEN_QUICKSTART.md) for detailed instructions.

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

You will see a platform selector where you can choose between:
- **ClearPath**: DAO governance interface
- **FairWins**: Prediction market interface

## Usage

### Getting Started

1. **Open Application**: Navigate to the frontend at `http://localhost:5173`
2. **Start with FairWins**: The platform opens with FairWins prediction markets
3. **Connect Wallet**: Click to connect your MetaMask or compatible wallet (optional for browsing)

### Using FairWins (Prediction Markets - Primary Platform)

#### For Market Creators

1. **Connect Wallet**: Connect to FairWins platform
2. **Create Market**: 
   - Define clear prediction question
   - Set resolution criteria and dates
   - Provide initial liquidity (minimum 100 USDC)
   - Stake creator bond (returned after proper resolution)
3. **Monitor Market**: Track participation and trading activity
4. **Resolve Market**: Submit outcome evidence when resolution date arrives

#### For Traders

1. **Browse Markets**: View active prediction markets across all topics
2. **Research**: Review market details, resolution criteria, and current odds
3. **Trade Positions**:
   - Buy YES tokens if you believe the outcome will occur
   - Buy NO tokens if you believe it won't
4. **Track Positions**: Monitor your positions and market developments
5. **Settle**: Redeem winning tokens after market resolution

### Using ClearPath (DAO Governance - Add-on Feature)

ClearPath is an optional add-on feature accessible from the sidebar. It offers two governance modes:

#### Choosing a Governance Mode

1. **Futarchy Mode**: Prediction market-based decision making
   - Best for: Complex decisions requiring distributed knowledge
   - Features: Market trading, welfare metrics, privacy mechanisms
   
2. **Traditional Voting Mode**: Token-weighted democracy
   - Best for: Straightforward decisions, enterprise governance
   - Features: Direct voting, quorum requirements, simple majority

You can switch between modes in the governance interface.

#### For Proposers (Both Modes)

1. **Connect Wallet**: Connect MetaMask or compatible wallet
2. **Submit Proposal**: 
   - Provide title, description, funding amount
   - Specify recipient address
   - Select welfare metric for evaluation (Futarchy only)
   - Pay 50 ETC bond (returned on good-faith resolution)
3. **Add Milestones**: Define completion criteria and timelock periods
4. **Monitor Status**: Track proposal through its lifecycle

#### Traditional Voting Mode

##### For Voters

1. **Connect Wallet**: Ensure you hold governance tokens
2. **View Proposals**: Browse active voting proposals
3. **Cast Vote**: Choose one of three options:
   - **For**: Support the proposal
   - **Against**: Oppose the proposal
   - **Abstain**: Participate in quorum without taking a side
4. **Track Progress**: Monitor vote counts and quorum status
5. **Execution**: Successful proposals are queued and executed after timelock

**Voting Requirements:**
- Must hold governance tokens to vote
- Voting power = token balance (1 token = 1 vote)
- Proposals need 40% quorum to pass (configurable)
- Simple majority (For > Against) required
- 2-day timelock before execution

#### Futarchy Mode

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

## Platform & Governance Comparison

### ClearPath Governance Modes

| Feature | Futarchy Mode | Traditional Voting Mode |
|---------|--------------|-------------------------|
| **Decision Method** | Prediction markets | Token-weighted voting |
| **Voting Options** | PASS/FAIL token trading | For/Against/Abstain |
| **Approval Criteria** | Market price comparison | Simple majority + quorum |
| **Complexity** | High (requires market understanding) | Low (straightforward voting) |
| **Privacy** | High (encrypted positions) | Standard (on-chain votes) |
| **Best For** | Complex decisions, knowledge aggregation | Simple decisions, traditional orgs |
| **Quorum** | N/A (market-based) | 40% of token supply |
| **Execution** | Based on welfare metrics | Based on vote outcome |
| **Enterprise Appeal** | Innovative DAOs | Traditional foundations |

### Feature Comparison

| Feature | FairWins (Primary Platform) | ClearPath (Add-on) |
|---------|----------------------------|-------------------|
| **Primary Use** | General predictions | Governance decisions |
| **Access** | Default, open to anyone | Optional sidebar tab, requires role |
| **Market Creation** | Manual (user-created) | Automated (per proposal) |
| **Resolution Criteria** | Flexible, creator-defined | Welfare metrics or votes |
| **Participation** | Open to anyone | DAO members only |
| **Treasury** | Individual market pools | Shared DAO treasury |
| **Governance Mode** | N/A | Futarchy or Traditional |
| **Voting Integration** | No | Yes (both modes) |
| **Ragequit Protection** | No | Yes (Futarchy mode) |

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
- **Automated Security Review**: GitHub agent reviews all smart contract PRs for vulnerabilities and best practices compliance (see [Security Agent Documentation](docs/developer-guide/ethereum-security-agent.md))

### Privacy Architecture

- **Poseidon Encryption**: SNARK-friendly encryption for positions
- **ECDH Key Exchange**: Secure coordination between traders
- **Groth16 zkSNARKs**: Zero-knowledge proofs for validity
- **Batch Processing**: Positions revealed only after epoch confirmation
- **Key Changes**: MACI-style invalidation of previous commitments

## Testing

The project includes comprehensive automated testing and security analysis:

### Quick Start

Run the complete test suite:
```bash
npm test
```

Run tests with gas reporting:
```bash
npm run test:gas
```

Run with coverage:
```bash
npm run test:coverage
```

### Security Testing Documentation

For comprehensive documentation on all testing and security analysis:

**[View Security Testing Documentation →](https://docs.FairWins.app/security/)**

The security testing documentation covers:
- **[Unit Testing](https://docs.FairWins.app/security/unit-testing/)**: Hardhat test suite with gas reporting
- **[Static Analysis](https://docs.FairWins.app/security/static-analysis/)**: Slither for vulnerability detection
- **[Symbolic Execution](https://docs.FairWins.app/security/symbolic-execution/)**: Manticore for path exploration
- **[Fuzz Testing](https://docs.FairWins.app/security/fuzz-testing/)**: Medusa for property-based testing
- **[CI/CD Configuration](https://docs.FairWins.app/security/ci-configuration/)**: GitHub Actions workflow maintenance

### Test Structure

```
test/
├── ConditionalMarketFactory.test.js   # Market factory tests
├── DAOFactory.test.js                 # DAO factory tests
├── FutarchyGovernor.test.js          # Main governor tests
├── OracleResolver.test.js            # Oracle resolution tests
├── PrivacyCoordinator.test.js        # Privacy mechanism tests
├── ProposalRegistry.test.js          # Proposal management tests
├── RagequitModule.test.js            # Ragequit functionality tests
├── WelfareMetricRegistry.test.js     # Welfare metrics tests
└── fuzzing/                          # Fuzz test contracts
    ├── ProposalRegistryFuzzTest.sol
    └── WelfareMetricRegistryFuzzTest.sol
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

### Smart Contract Security

This repository uses an automated Ethereum security review agent that analyzes all smart contract code changes:

- **Automatic PR Reviews**: Agent reviews all `.sol` file changes
- **Security Standards**: Follows [EthTrust Security Levels](https://entethalliance.org/specs/ethtrust-sl/)
- **Vulnerability Detection**: Identifies reentrancy, access control, and other security issues
- **Best Practices**: Enforces Solidity coding standards and patterns

**Quick Start**: See [Ethereum Security Agent Quick Start](docs/developer-guide/ethereum-security-quickstart.md)

**Full Documentation**: See [Ethereum Security Agent Guide](docs/developer-guide/ethereum-security-agent.md)

## Deployment

### Automated Testnet Deployment (Mordor)

The DAO contracts can be automatically deployed to the Ethereum Classic Mordor testnet using GitHub Actions. This deployment uses the **Safe Singleton Factory** for deterministic, reproducible contract addresses across networks. This mirrors the setup from [@chippr-robotics/mordor-public-faucet](https://github.com/chippr-robotics/mordor-public-faucet).

📖 **Quick Start**: See [DEPLOYMENT_QUICKSTART.md](./DEPLOYMENT_QUICKSTART.md) for a 5-minute setup guide

#### Deterministic Deployment

All contracts are deployed using the [Safe Singleton Factory](https://github.com/safe-fndn/safe-singleton-factory) at address `0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7`. This ensures:
- **Reproducible addresses**: Same contract addresses across different networks
- **Verifiable deployments**: Easy to verify that deployed bytecode matches source
- **No centralization**: Removes reliance on specific deployment keys
- **Security**: Deterministic deployments improve auditability

The factory is pre-deployed on Mordor testnet (Chain ID: 63) and many other EVM-compatible networks.

📖 **For detailed information about deterministic deployment**, see [DETERMINISTIC_DEPLOYMENT.md](./DETERMINISTIC_DEPLOYMENT.md)

#### Prerequisites

1. **Add Private Key to GitHub Secrets**
   - Go to **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**
   - Name: `PRIVATE_KEY`
   - Value: Your Ethereum Classic wallet private key (without the `0x` prefix)
   - Click **Add secret**
   
   ⚠️ **Security Warning**: Never commit your private key to the repository! Always use GitHub Secrets.

2. **Ensure Sufficient Balance**
   - Your wallet needs sufficient Mordor testnet ETC for deployment
   - Get testnet ETC from the [Mordor faucet](https://github.com/chippr-robotics/mordor-public-faucet)

#### Deployment Methods

**Method 1: Automatic Deployment (Recommended)**
- Automatically deploys when you push to the `main` branch with contract changes
- Monitors changes to:
  - `contracts/**`
  - `scripts/deploy-deterministic.js`
  - `hardhat.config.js`

**Method 2: Manual Deployment**
1. Go to the **Actions** tab in GitHub
2. Select **Deploy DAO Contracts to Mordor Testnet** workflow
3. Click **Run workflow**
4. Select the target network (default: mordor)
5. Click **Run workflow** button

#### Deployment Information

- **Network**: Ethereum Classic Mordor Testnet
- **RPC URL**: https://rpc.mordor.etccooperative.org
- **Chain ID**: 63
- **Block Explorer**: https://etc-mordor.blockscout.com/

After deployment, you can view:
- Deployment logs in the GitHub Actions workflow run
- Contract addresses in the workflow summary
- All contracts on Blockscout using the provided links

#### Local Testnet Deployment

For local testing, you can also deploy deterministically:

```bash
export PRIVATE_KEY=your_private_key_without_0x_prefix
npx hardhat run scripts/deploy-deterministic.js --network mordor
```

Or use the non-deterministic deployment script:

```bash
npx hardhat run scripts/deploy.js --network mordor
```

**Note**: The deterministic deployment ensures the same contract addresses will be used if you deploy to other networks that have the Safe Singleton Factory deployed.

### Frontend Deployment to Google Cloud Run

The React frontend can be automatically deployed to Google Cloud Run using GitHub Actions. See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete setup instructions including:
- Google Cloud project configuration
- GitHub secrets setup
- Workload Identity Federation configuration
- Docker containerization details

**Quick Start:**
1. Set up Google Cloud project and enable required APIs
2. Configure GitHub repository secrets
3. Push changes to `main` or `develop` branch
4. GitHub Actions will automatically build and deploy the frontend

For local Docker testing:
```bash
cd frontend
docker build -t prediction-dao-frontend .
docker run -p 8080:8080 prediction-dao-frontend
```

### Mainnet Deployment

Before mainnet deployment:
1. Complete minimum 2 independent security audits
2. Publish audit reports
3. Run bug bounty program (100k USD equivalent in ETC)
4. 30-day community review period
5. Formal verification of critical invariants

## Release Management

This project uses automated release management to maintain clear documentation of changes:

- **Automated Release Notes**: GitHub Actions automatically drafts release notes from merged PRs
- **Semantic Versioning**: Follows [SemVer](https://semver.org/) for version numbering
- **Release Process**: See [RELEASE_PROCESS.md](./RELEASE_PROCESS.md) for complete workflow
- **Changelog**: View releases at [GitHub Releases](https://github.com/chippr-robotics/prediction-dao-research/releases)

For detailed information:
- **Release workflow**: [RELEASE_PROCESS.md](./RELEASE_PROCESS.md)
- **CI/CD pipelines**: [CI_CD_PIPELINE.md](./CI_CD_PIPELINE.md)
- **Solution analysis**: [RELEASE_WORKFLOW_ANALYSIS.md](./RELEASE_WORKFLOW_ANALYSIS.md)

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
4. Label your PRs appropriately (see [RELEASE_PROCESS.md](./RELEASE_PROCESS.md))
5. Submit a pull request

**Note**: PR labels help generate release notes automatically. Use labels like `feature`, `fix`, `documentation`, etc.

## Security

For general inquiries, please email howdy@FairWins.app. For security concerns, please email security@example.com

## Acknowledgments

- Nightmarket team for zero-knowledge position encryption
- MACI/PSE team for anti-collusion infrastructure
- Gnosis team for Conditional Token Framework
- MetaDAO for futarchy research and validation
