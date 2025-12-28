# ClearPath & FairWins Frontend

A unified React application serving two distinct platforms: **ClearPath** (DAO Governance) and **FairWins** (Open Prediction Markets). Both applications share core infrastructure while providing specialized user experiences.

## 🔗 Unified Wallet Management

This application features a comprehensive, site-wide wallet management system that provides a single, cohesive interface for all wallet operations. See [WALLET_MANAGEMENT.md](./WALLET_MANAGEMENT.md) for complete documentation.

**Key Features:**
- Single source of truth for wallet state across the entire app
- Integrated RVAC (Role-Based Access Control) tied to wallet address
- Transaction helpers for signing and sending
- Balance tracking and caching (ETC, WETC, tokens)
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
# Network Configuration
VITE_NETWORK_ID=63                              # 63 for Mordor testnet, 61 for ETC mainnet, 1337 for Hardhat
VITE_RPC_URL=https://rpc.mordor.etccooperative.org  # RPC endpoint

# WalletConnect Configuration (optional, enables mobile wallet support)
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here  # Get from https://cloud.walletconnect.com
```

**WalletConnect Setup** (Optional):
1. Visit [WalletConnect Cloud](https://cloud.walletconnect.com) and create a project
2. Copy your Project ID to `VITE_WALLETCONNECT_PROJECT_ID`
3. Whitelist your domain(s) in the WalletConnect dashboard
4. Without this, only browser wallets (MetaMask) will be available

See [WALLET_MANAGEMENT.md](./WALLET_MANAGEMENT.md) for complete wallet integration documentation.

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

### Test Structure

```
src/test/
├── setup.js                    # Test configuration and mocks
├── Button.test.jsx             # Button component unit tests
├── StatusIndicator.test.jsx    # Status indicator tests
├── accessibility.test.jsx      # WCAG compliance tests
└── web3-integration.test.js    # Web3 wallet integration tests

cypress/
├── e2e/                        # End-to-end test suites
│   ├── 01-onboarding.cy.js     # User onboarding flow
│   ├── 02-fairwins-trading.cy.js  # Market trading flow
│   ├── 03-clearpath-governance.cy.js  # DAO governance flow
│   ├── 04-positions-results.cy.js  # Portfolio management
│   └── 05-integration.cy.js    # Full integration tests
├── support/                    # Custom commands and utilities
│   ├── commands.js             # Reusable Cypress commands
│   └── e2e.js                  # Global configuration
└── fixtures/                   # Test data
```

### Test Coverage

Current test coverage:
- **UI Components**: 30 unit tests for buttons, status indicators, forms
- **Accessibility**: 24 tests for WCAG AA compliance with axe-core
- **Web3 Integration**: 17 tests for wallet connection flows
- **E2E Tests**: 82 tests covering major user flows and integrations
- **Total**: 153+ tests ✅

### End-to-End Testing

Comprehensive Cypress E2E tests validate complete user journeys:

- **User Onboarding**: Landing page, platform selection, wallet connection (15 tests)
- **Market Trading**: Browsing, filtering, trading interface (18 tests)
- **DAO Governance**: Dashboard, proposals, voting (18 tests)
- **Position Management**: Portfolio, balances, results (17 tests)
- **Integration**: Full cross-platform user journeys (14 tests)

See [CYPRESS_E2E_TESTING.md](./CYPRESS_E2E_TESTING.md) for detailed documentation.  
See [E2E_TEST_OUTCOMES.md](./E2E_TEST_OUTCOMES.md) for test results and coverage.

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

Manual testing includes:
- Keyboard navigation (Tab, Enter, Escape)
- Screen reader testing (NVDA, JAWS, VoiceOver)
- Color contrast verification
- Color blindness simulation
- Motion preferences testing
- Mobile accessibility on iOS and Android

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
