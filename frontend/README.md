# FairWins Frontend

A React application for FairWins — open prediction markets with private 1v1 and group wagers between friends as the core mechanic.

## 🔗 Unified Wallet Management

This application features a comprehensive, site-wide wallet management system that provides a single, cohesive interface for all wallet operations. See [WALLET_MANAGEMENT.md](./WALLET_MANAGEMENT.md) for complete documentation.

**Key Features:**
- Single source of truth for wallet state across the entire app
- Integrated RBAC (Role-Based Access Control) tied to wallet address
- Transaction helpers for signing and sending
- Balance tracking and caching (native, wrapped-native, tokens)
- Network validation and switching
- Specialized hooks for different use cases

**Quick Start:**
```jsx
import { useWallet, useWalletRoles } from './hooks'

function MyComponent() {
  const { address, isConnected, balances, sendTransaction } = useWallet()
  const { hasRole, grantRole } = useWalletRoles()

  // Use wallet functionality...
}
```

## Architecture Overview

```
App.jsx (Root)
├── Wallet Connection & Network Detection
├── Routing
└── Shared Web3 Integration
    └── FairWins Dashboard
        ├── Friend Markets (private 1v1 / group wagers)
        ├── Public Market Trading
        ├── Market Creation
        └── Position Management
```

### Key Features

- **Private Wagers**: 1v1, small group, and event-tracking markets settled between friends, with encrypted on-chain metadata
- **Open Prediction Markets**: Public markets with flexible resolution and challenge periods
- **Polymarket-Pegged Side Bets**: Settle by referenced lookup against Polymarket's Conditional Tokens Framework on Polygon Amoy
- **Privacy-Preserving**: Encrypted envelope flow keyed to on-chain wallet public keys
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
# Network Configuration
VITE_NETWORK_ID=80002                                 # 80002 for Polygon Amoy (Polymarket testnet), 1337 for Hardhat
VITE_RPC_URL=https://rpc-amoy.polygon.technology     # RPC endpoint

# Application URL (required for production, optional for development)
VITE_APP_URL=http://localhost:5173            # Used for WalletConnect metadata and external integrations

# WalletConnect Configuration (optional, enables mobile wallet support)
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here  # Get from https://cloud.walletconnect.com
```

**WalletConnect Setup** (Optional):
1. Visit [WalletConnect Cloud](https://cloud.walletconnect.com) and create a project
2. Copy your Project ID to `VITE_WALLETCONNECT_PROJECT_ID`
3. Set `VITE_APP_URL` to your application URL (e.g., `http://localhost:5173` for dev, `https://your-domain.com` for production)
4. Whitelist your domain(s) in the WalletConnect dashboard
5. Without these settings, fallback values will be used and warning messages may appear

See [WALLET_MANAGEMENT.md](./WALLET_MANAGEMENT.md) for complete wallet integration documentation.

## Project Structure

```
frontend/
├── public/                  # Static assets (logos, images)
├── src/
│   ├── components/          # React components
│   │   ├── fairwins/           # Active FairWins dashboard & private-wager flows
│   │   ├── ui/                 # Reusable UI primitives
│   │   ├── wallet/             # Wallet connection, role details
│   │   ├── admin/              # Admin nullifier tab
│   │   ├── AdminPanel.jsx
│   │   ├── Header.jsx
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

1. **Start the development server**: `npm run dev`
2. **Navigate to** `http://localhost:5173`
3. **Connect your wallet** when prompted
4. **Open the FairWins dashboard** and create or join a wager

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

## Testing

The project includes comprehensive testing for UI components, Web3 integration, accessibility compliance, and end-to-end user flows.

### Running Tests

```bash
# Run unit tests once
npm test

# Run tests in watch mode (for development)
npm test -- --watch

# Run with coverage report
npm run test:coverage

# Run tests with interactive UI
npm run test:ui

# Run specific test file
npm test Button.test

# Run E2E tests with Cypress
npm run test:e2e

# Open Cypress interactive test runner
npm run cypress:open
```

### End-to-End Testing

Cypress E2E suites cover the public trading flow, position management, market sorting, and nullifier management. See [CYPRESS_E2E_TESTING.md](./CYPRESS_E2E_TESTING.md) for documentation.

### Writing New Tests

Tests use Vitest, React Testing Library, and axe-core:

```javascript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import MyComponent from './MyComponent'

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<MyComponent />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
```

### Accessibility Testing

#### Automated Testing

- **axe-core**: Integrated in unit tests for WCAG compliance
- **Lighthouse CI**: Automated in CI/CD pipeline
- **Target**: Lighthouse accessibility score of 100

Run accessibility tests specifically:
```bash
npm test accessibility.test
```

#### Manual Testing

For comprehensive manual accessibility testing procedures, see:
- [MANUAL_ACCESSIBILITY_TESTING.md](../MANUAL_ACCESSIBILITY_TESTING.md)

### CI/CD Testing

Tests run automatically on:
- Every pull request to `main` or `develop`
- Every push to `main` or `develop`
- Before deployment to production

See [CI_CD_PIPELINE.md](../CI_CD_PIPELINE.md) for complete CI/CD documentation.

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

## Dependencies

### Planned/Future Dependencies

The following dependencies are included in preparation for upcoming features:

- **cross-fetch** (^4.1.0) - Universal fetch API for isomorphic applications. Reserved for server-side rendering or Node.js environment compatibility.
- **eventemitter2** (^6.4.9) - Enhanced event emitter. Reserved for advanced event-driven features and real-time updates.
- **socket.io-client** (^4.8.3) - WebSocket client library. Reserved for real-time market updates and live blockchain event streaming.

These dependencies are not currently utilized in the codebase but are maintained for planned feature development.
