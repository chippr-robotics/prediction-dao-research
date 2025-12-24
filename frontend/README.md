# ClearPath & FairWins Frontend

A unified React application serving two distinct platforms: **ClearPath** (DAO Governance) and **FairWins** (Open Prediction Markets). Both applications share core infrastructure while providing specialized user experiences.

## Architecture Overview

This frontend implements a **dual-application architecture** with shared components and infrastructure:

```
App.jsx (Root)
├── Wallet Connection & Network Detection
├── Platform Routing
└── Shared Web3 Integration
    ├── ClearPathApp (DAO Governance)
    │   ├── Dashboard
    │   ├── Proposal Management
    │   ├── Welfare Metrics
    │   └── DAO Launchpad
    └── FairWinsApp (Prediction Markets)
        ├── Market Trading
        ├── Market Creation
        └── Position Management
```

### Key Features

- **ClearPath**: Institutional-grade DAO governance through futarchy-based decision-making
- **FairWins**: Open prediction markets with flexible controls and resolution
- **Shared Infrastructure**: Common Web3 integration, wallet management, and blockchain interaction
- **Privacy-Preserving**: Built on secure, privacy-focused smart contracts
- **Responsive Design**: Mobile-first approach with accessibility compliance (WCAG 2.1 AA)

## Tech Stack

- **Framework**: React 19.2.x with hooks
- **Build Tool**: Vite 7.2.4
- **Blockchain**: ethers.js v6
- **Styling**: CSS Modules (scoped CSS)
- **Language**: JavaScript (ES6+)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- MetaMask or compatible Web3 wallet
- Local blockchain (Hardhat) or testnet access

### Installation

```bash
# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your configuration
# Update VITE_NETWORK_ID and VITE_RPC_URL as needed
```

### Development

```bash
# Start development server
npm run dev
# Opens at http://localhost:5173 with hot module replacement

# Run linter
npm run lint

# Build for production
npm run build

# Preview production build
npm run preview
```

### Environment Configuration

Create a `.env` file based on `.env.example`:

```bash
VITE_NETWORK_ID=1337              # Network ID (1337 for Hardhat local)
VITE_RPC_URL=http://localhost:8545  # RPC endpoint
```

## Project Structure

```
frontend/
├── public/                  # Static assets (logos, images)
├── src/
│   ├── components/          # React components
│   │   ├── ClearPathApp.jsx     # ClearPath main component
│   │   ├── FairWinsApp.jsx      # FairWins main component
│   │   ├── PlatformSelector.jsx # Platform selection screen
│   │   ├── Dashboard.jsx        # ClearPath dashboard
│   │   ├── ProposalDashboard.jsx
│   │   ├── ProposalSubmission.jsx
│   │   ├── ProposalList.jsx
│   │   ├── WelfareMetrics.jsx
│   │   ├── MetricsDashboard.jsx
│   │   ├── MarketTrading.jsx
│   │   ├── DAOLaunchpad.jsx
│   │   ├── DAOList.jsx
│   │   └── LandingPage.jsx
│   ├── assets/              # Images, icons
│   ├── App.jsx              # Root component with routing
│   ├── App.css              # Global styles
│   ├── main.jsx             # Entry point
│   └── index.css            # Base styles
├── index.html               # HTML template
├── vite.config.js           # Vite configuration
├── eslint.config.js         # ESLint rules
├── package.json             # Dependencies
├── Dockerfile               # Container build
└── nginx.conf               # Production server config
```

## Usage

### Running Both Applications

1. **Start the development server**: `npm run dev`
2. **Navigate to** `http://localhost:5173`
3. **Select your platform**:
   - Click "Enter ClearPath" for DAO governance
   - Click "Enter FairWins" for prediction markets
4. **Connect your wallet** when prompted
5. **Interact with the platform** of your choice

### Switching Between Platforms

Use the "Back" button in either application to return to the platform selector and switch between ClearPath and FairWins.

## Development Guidelines

See [FRONTEND_BUILD_BOOK.md](../FRONTEND_BUILD_BOOK.md) for comprehensive development guidelines including:

- Component development patterns
- State management best practices
- Web3 integration patterns
- Accessibility requirements
- Performance optimization
- Testing strategies

### Key Development Principles

1. **Component-Based**: Build modular, reusable components
2. **Reactive**: Immediate response to user actions and blockchain state
3. **Progressive Enhancement**: Core functionality first, enhanced features layer on
4. **Accessibility First**: WCAG 2.1 AA compliance required
5. **Mobile-First**: Responsive design starting from mobile screens

## Docker Build

This frontend can be containerized and deployed to Google Cloud Run.

### Building the Docker Image

```bash
docker build -t prediction-dao-frontend .
```

### Running Locally

```bash
docker run -p 8080:8080 prediction-dao-frontend
```

Then visit http://localhost:8080

### Deployment

See the main [DEPLOYMENT.md](../DEPLOYMENT.md) file for complete instructions on deploying to Google Cloud Run using GitHub Actions.
