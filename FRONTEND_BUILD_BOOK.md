# Frontend Build Book
## ClearPath & FairWins Platform Suite

A comprehensive guide to building dynamic, reactive user experiences for the Prediction DAO platform suite.

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Development Workflow](#development-workflow)
5. [Component Library](#component-library)
6. [State Management](#state-management)
7. [Web3 Integration](#web3-integration)
8. [Responsive Design Implementation](#responsive-design-implementation)
9. [Performance Optimization](#performance-optimization)
10. [Testing Strategy](#testing-strategy)
11. [Deployment](#deployment)

---

## Architecture Overview

### Platform Architecture
The frontend consists of two distinct applications sharing common infrastructure:

```
┌─────────────────────────────────────┐
│        App.jsx (Root)               │
│   - Wallet Connection               │
│   - Network Detection               │
│   - Platform Routing                │
└──────────────┬──────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼──────┐  ┌─────▼──────┐
│ ClearPath   │  │  FairWins  │
│  App.jsx    │  │  App.jsx   │
└─────────────┘  └────────────┘
       │                │
       └────────┬───────┘
                │
    ┌───────────▼───────────┐
    │  Shared Components    │
    │  - Web3 Integration   │
    │  - Form Handlers      │
    │  - Data Fetching      │
    └───────────────────────┘
```

### Design Philosophy
1. **Component-Based**: Modular, reusable components
2. **Reactive**: Immediate response to user actions and blockchain state changes
3. **Progressive Enhancement**: Core functionality works first, enhanced features layer on top
4. **Accessibility First**: WCAG 2.1 AA compliance from the start

---

## Tech Stack

### Core Technologies
```json
{
  "framework": "React 18+",
  "buildTool": "Vite 5.x",
  "blockchain": "ethers.js v6",
  "styling": "CSS Modules / Scoped CSS",
  "language": "JavaScript (ES6+)"
}
```

### Key Dependencies
```json
{
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "ethers": "^6.x",
  "vite": "^5.x"
}
```

### Development Tools
- **ESLint**: Code quality and consistency
- **Prettier**: Code formatting (future)
- **Chrome DevTools**: Debugging and profiling
- **Lighthouse**: Performance and accessibility audits

---

## Project Structure

```
frontend/
├── public/                  # Static assets
│   ├── logo_clearpath.png
│   ├── logo_fairwins.png
│   └── logo_fwcp.png
├── src/
│   ├── components/          # React components
│   │   ├── ClearPathApp.jsx/css
│   │   ├── FairWinsApp.jsx/css
│   │   ├── PlatformSelector.jsx/css
│   │   ├── LandingPage.jsx/css
│   │   ├── Dashboard.jsx/css
│   │   ├── ProposalSubmission.jsx
│   │   ├── ProposalList.jsx
│   │   ├── ProposalDashboard.jsx/css
│   │   ├── WelfareMetrics.jsx
│   │   ├── MetricsDashboard.jsx/css
│   │   ├── MarketTrading.jsx
│   │   ├── DAOLaunchpad.jsx/css
│   │   └── DAOList.jsx/css
│   ├── assets/              # Images, icons
│   │   └── react.svg
│   ├── App.jsx              # Root component
│   ├── App.css              # Global styles
│   ├── main.jsx             # Entry point
│   └── index.css            # Base styles
├── index.html               # HTML template
├── vite.config.js           # Vite configuration
├── package.json             # Dependencies
├── eslint.config.js         # Linting rules
├── Dockerfile               # Container build
└── nginx.conf               # Production server config
```

### File Naming Conventions
- **Components**: PascalCase (e.g., `ProposalSubmission.jsx`)
- **Styles**: Match component name (e.g., `ProposalSubmission.css`)
- **Utilities**: camelCase (e.g., `formatAddress.js`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `CONTRACT_ADDRESSES.js`)

---

## Development Workflow

### Local Development

#### 1. Setup
```bash
cd frontend
npm install
```

#### 2. Environment Configuration
Create a `.env` file (if needed):
```env
VITE_NETWORK_ID=1337
VITE_RPC_URL=http://localhost:8545
```

#### 3. Start Development Server
```bash
npm run dev
```
- Opens on `http://localhost:5173`
- Hot module replacement enabled
- Fast refresh for React components

#### 4. Code Quality
```bash
npm run lint          # Run ESLint
npm run build         # Production build test
```

### Development Best Practices

#### Component Development
1. **Start with the structure**: HTML first, then style, then logic
2. **Use functional components**: Hooks over class components
3. **Extract repeated logic**: Custom hooks for shared behavior
4. **Keep components small**: <300 lines of code
5. **Co-locate styles**: Component CSS file next to JSX file

#### State Management Pattern
```jsx
// Local component state
const [data, setData] = useState(null)
const [loading, setLoading] = useState(false)
const [error, setError] = useState(null)

// Async data fetching pattern
useEffect(() => {
  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await contractMethod()
      setData(result)
    } catch (err) {
      setError(err.message)
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }
  
  fetchData()
}, [dependency])
```

---

## Component Library

### Base Components

#### Button Component Pattern
```jsx
// Primary Action Button
<button 
  className="submit-button"
  onClick={handleSubmit}
  disabled={loading}
>
  {loading ? 'Processing...' : 'Submit'}
</button>
```

```css
.submit-button {
  padding: 0.75rem 2rem;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.submit-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(45, 122, 79, 0.4);
}

.submit-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

#### Card Component Pattern
```jsx
<div className="card">
  <div className="card-header">
    <h3>{title}</h3>
    <span className="badge">{status}</span>
  </div>
  <div className="card-body">
    {content}
  </div>
  <div className="card-actions">
    {actions}
  </div>
</div>
```

#### Form Input Pattern
```jsx
<div className="form-group">
  <label htmlFor="inputId">
    Label Text
    <span className="required">*</span>
  </label>
  <input
    id="inputId"
    type="text"
    value={value}
    onChange={(e) => setValue(e.target.value)}
    placeholder="Enter value..."
    required
    aria-describedby="inputHelp"
  />
  <small id="inputHelp" className="helper-text">
    Helpful description
  </small>
  {error && <span className="error-text">{error}</span>}
</div>
```

### Compound Components

#### Wallet Connection Component
```jsx
function WalletConnect({ onConnect, account, onDisconnect }) {
  if (account) {
    return (
      <div className="wallet-connected">
        <span className="wallet-address">
          {formatAddress(account)}
        </span>
        <button 
          onClick={onDisconnect}
          className="disconnect-button"
        >
          Disconnect
        </button>
      </div>
    )
  }
  
  return (
    <button 
      onClick={onConnect}
      className="connect-button"
    >
      Connect Wallet
    </button>
  )
}
```

#### Loading States
```jsx
function LoadingState({ message = "Loading..." }) {
  return (
    <div className="loading">
      <div className="spinner"></div>
      <p>{message}</p>
    </div>
  )
}

function EmptyState({ message, action }) {
  return (
    <div className="empty-state">
      <p>{message}</p>
      {action && <button onClick={action.handler}>{action.label}</button>}
    </div>
  )
}
```

---

## State Management

### Local Component State
Use `useState` for component-specific state:
```jsx
const [formData, setFormData] = useState({
  title: '',
  description: '',
  amount: ''
})

const handleChange = (field, value) => {
  setFormData(prev => ({ ...prev, [field]: value }))
}
```

### Derived State
Use `useMemo` for computed values:
```jsx
const totalValue = useMemo(() => {
  return proposals.reduce((sum, p) => sum + p.amount, 0)
}, [proposals])
```

### Side Effects
Use `useEffect` for data fetching and subscriptions:
```jsx
useEffect(() => {
  // Subscribe to contract events
  const filter = contract.filters.ProposalSubmitted()
  
  const handleEvent = (proposalId, proposer) => {
    console.log(`New proposal: ${proposalId}`)
    refreshProposals()
  }
  
  contract.on(filter, handleEvent)
  
  // Cleanup
  return () => {
    contract.off(filter, handleEvent)
  }
}, [contract])
```

### Props Drilling Solution
For deeply nested state, lift state up or use context:
```jsx
// Create context
const Web3Context = createContext()

// Provider
function App() {
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)
  const [account, setAccount] = useState(null)
  
  return (
    <Web3Context.Provider value={{ provider, signer, account }}>
      <AppContent />
    </Web3Context.Provider>
  )
}

// Consumer
function SomeComponent() {
  const { provider, account } = useContext(Web3Context)
  // Use values
}
```

---

## Web3 Integration

### Wallet Connection Flow

```jsx
const connectWallet = async () => {
  try {
    // Check for MetaMask
    if (!window.ethereum) {
      alert('Please install MetaMask to use this application')
      return
    }
    
    // Request connection
    const provider = new ethers.BrowserProvider(window.ethereum)
    await provider.send("eth_requestAccounts", [])
    
    // Get signer and address
    const signer = await provider.getSigner()
    const address = await signer.getAddress()
    const network = await provider.getNetwork()
    
    // Update state
    setProvider(provider)
    setSigner(signer)
    setAccount(address)
    setChainId(network.chainId)
    setConnected(true)
    
    // Setup listeners
    window.ethereum.on('accountsChanged', handleAccountsChanged)
    window.ethereum.on('chainChanged', () => window.location.reload())
    
  } catch (error) {
    console.error('Error connecting wallet:', error)
    if (error.code === 4001) {
      alert('Please approve the connection request')
    } else {
      alert('Failed to connect wallet')
    }
  }
}
```

### Contract Interaction Pattern

```jsx
// Load contract
const loadContract = async () => {
  if (!signer) return null
  
  try {
    const contractAddress = "0x..."
    const contractABI = [...] // Import from artifacts
    
    const contract = new ethers.Contract(
      contractAddress,
      contractABI,
      signer
    )
    
    return contract
  } catch (error) {
    console.error('Error loading contract:', error)
    return null
  }
}

// Read from contract
const readData = async () => {
  setLoading(true)
  try {
    const contract = await loadContract()
    const data = await contract.getData()
    setData(data)
  } catch (error) {
    setError(error.message)
  } finally {
    setLoading(false)
  }
}

// Write to contract
const submitTransaction = async (params) => {
  setLoading(true)
  try {
    const contract = await loadContract()
    
    // Estimate gas (optional)
    const gasEstimate = await contract.submitProposal.estimateGas(...params)
    
    // Send transaction
    const tx = await contract.submitProposal(...params, {
      value: ethers.parseEther("50"), // If sending ETH
      gasLimit: gasEstimate * 120n / 100n // 20% buffer
    })
    
    // Wait for confirmation
    const receipt = await tx.wait()
    
    if (receipt.status === 1) {
      alert('Transaction successful!')
      refreshData()
    } else {
      throw new Error('Transaction failed')
    }
    
  } catch (error) {
    console.error('Transaction error:', error)
    
    // Handle specific errors
    if (error.code === 'ACTION_REJECTED') {
      alert('Transaction was rejected')
    } else if (error.code === 'INSUFFICIENT_FUNDS') {
      alert('Insufficient funds for transaction')
    } else {
      alert(`Transaction failed: ${error.message}`)
    }
  } finally {
    setLoading(false)
  }
}
```

### Event Listening

```jsx
useEffect(() => {
  if (!contract) return
  
  // Create event filter
  const filter = contract.filters.ProposalSubmitted()
  
  // Event handler
  const handleProposalSubmitted = (proposalId, proposer, title) => {
    console.log(`New proposal ${proposalId}: ${title}`)
    
    // Update UI
    setNotification({
      type: 'success',
      message: `New proposal: ${title}`
    })
    
    // Refresh data
    loadProposals()
  }
  
  // Subscribe
  contract.on(filter, handleProposalSubmitted)
  
  // Cleanup
  return () => {
    contract.off(filter, handleProposalSubmitted)
  }
}, [contract])
```

### Network Detection

```jsx
useEffect(() => {
  const checkNetwork = async () => {
    if (!provider) return
    
    const network = await provider.getNetwork()
    const expectedChainId = 1337n // Hardhat local
    
    if (network.chainId !== expectedChainId) {
      alert(`Please switch to the correct network (Chain ID: ${expectedChainId})`)
      setNetworkError(true)
    } else {
      setNetworkError(false)
    }
  }
  
  checkNetwork()
}, [provider])
```

---

## Responsive Design Implementation

### Mobile-First CSS

```css
/* Base styles (mobile) */
.container {
  padding: 1rem;
  max-width: 100%;
}

.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

/* Tablet and up */
@media (min-width: 768px) {
  .container {
    padding: 2rem;
  }
  
  .grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 1.5rem;
  }
}

/* Desktop and up */
@media (min-width: 1024px) {
  .container {
    max-width: 1200px;
    margin: 0 auto;
  }
  
  .grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 2rem;
  }
}
```

### Responsive Components

```jsx
// Use window resize hook
function useWindowSize() {
  const [size, setSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  })
  
  useEffect(() => {
    const handleResize = () => {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight
      })
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  
  return size
}

// Use in component
function ResponsiveComponent() {
  const { width } = useWindowSize()
  const isMobile = width < 768
  
  return (
    <div className={isMobile ? 'mobile-layout' : 'desktop-layout'}>
      {/* Conditional rendering based on screen size */}
    </div>
  )
}
```

### Touch-Friendly Interactions

```css
/* Larger touch targets for mobile */
@media (max-width: 768px) {
  button {
    min-height: 44px;
    min-width: 44px;
    padding: 0.875rem 1.5rem;
  }
  
  .form-group input,
  .form-group textarea {
    font-size: 16px; /* Prevents zoom on iOS */
    padding: 0.875rem;
  }
}
```

---

## Performance Optimization

### Code Splitting

```jsx
// Lazy load components
import { lazy, Suspense } from 'react'

const ClearPathApp = lazy(() => import('./components/ClearPathApp'))
const FairWinsApp = lazy(() => import('./components/FairWinsApp'))

function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      {platform === 'clearpath' && <ClearPathApp />}
      {platform === 'fairwins' && <FairWinsApp />}
    </Suspense>
  )
}
```

### Memoization

```jsx
// Prevent unnecessary re-renders
const MemoizedComponent = React.memo(({ data }) => {
  return <div>{data}</div>
}, (prevProps, nextProps) => {
  // Only re-render if data changed
  return prevProps.data === nextProps.data
})

// Memoize expensive computations
const sortedProposals = useMemo(() => {
  return proposals.sort((a, b) => b.timestamp - a.timestamp)
}, [proposals])

// Memoize callbacks
const handleClick = useCallback(() => {
  doSomething(id)
}, [id])
```

### Image Optimization

```jsx
// Lazy load images
<img 
  src="/logo.png" 
  alt="Logo"
  loading="lazy"
  onError={(e) => { 
    e.target.src = '/fallback.png' 
  }}
/>
```

### Data Fetching Optimization

```jsx
// Cache data to reduce API calls
const useContractData = (contract, method, args = []) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    let isMounted = true
    const cacheKey = `${contract.address}_${method}_${args.join('_')}`
    
    // Check cache first
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) {
      setData(JSON.parse(cached))
      setLoading(false)
      return
    }
    
    // Fetch from contract
    const fetchData = async () => {
      try {
        const result = await contract[method](...args)
        if (isMounted) {
          setData(result)
          sessionStorage.setItem(cacheKey, JSON.stringify(result))
        }
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    
    fetchData()
    
    return () => { isMounted = false }
  }, [contract, method, ...args])
  
  return { data, loading }
}
```

### Bundle Size Optimization

```bash
# Analyze bundle size
npm run build
npx vite-bundle-visualizer

# Optimize imports (use named imports)
// ❌ Bad
import _ from 'lodash'

// ✅ Good
import { debounce } from 'lodash-es'
```

---

## Testing Strategy

### Manual Testing Checklist

#### Wallet Connection
- [ ] Connect wallet successfully
- [ ] Handle rejection gracefully
- [ ] Detect account changes
- [ ] Detect network changes
- [ ] Show connection status clearly

#### Forms & Interactions
- [ ] Form validation works
- [ ] Error messages are clear
- [ ] Loading states display correctly
- [ ] Success feedback appears
- [ ] Forms preserve state on error

#### Responsive Design
- [ ] Works on mobile (320px+)
- [ ] Works on tablet (768px+)
- [ ] Works on desktop (1024px+)
- [ ] Touch targets are large enough
- [ ] No horizontal scrolling

#### Accessibility
- [ ] Keyboard navigation works
- [ ] Focus indicators visible
- [ ] Screen reader compatible
- [ ] Color contrast passes WCAG AA
- [ ] Alt text for images

### Browser Testing
Test in:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Mobile Safari (iOS)
- Chrome Mobile (Android)

### Lighthouse Audits
Run Lighthouse in Chrome DevTools:
```bash
# Target scores
Performance: 90+
Accessibility: 100
Best Practices: 90+
SEO: 90+
```

---

## Deployment

### Production Build

```bash
cd frontend
npm run build
```

Outputs to `dist/` directory:
- `index.html` - Entry point
- `assets/*.js` - JavaScript bundles
- `assets/*.css` - Stylesheets
- Static assets from `public/`

### Docker Deployment

```bash
# Build image
docker build -t prediction-dao-frontend .

# Run locally
docker run -p 8080:8080 prediction-dao-frontend

# Test
curl http://localhost:8080
```

### Google Cloud Run Deployment

```bash
# Build and push
gcloud builds submit --tag gcr.io/PROJECT_ID/prediction-dao-frontend

# Deploy
gcloud run deploy prediction-dao-frontend \
  --image gcr.io/PROJECT_ID/prediction-dao-frontend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

### Environment Variables

Production configuration:
```env
VITE_NETWORK_ID=1          # Mainnet
VITE_RPC_URL=https://mainnet.infura.io/v3/YOUR_KEY
VITE_CONTRACT_ADDRESS=0x...
```

### CI/CD Pipeline

The project uses GitHub Actions for automated deployment:
- Triggered on push to `main` branch
- Runs build and tests
- Deploys to Cloud Run
- See `.github/workflows/` for configuration

---

## Troubleshooting

### Common Issues

#### "Provider not found" Error
```jsx
// Ensure MetaMask is installed
if (!window.ethereum) {
  alert('Please install MetaMask')
  return
}
```

#### Network Mismatch
```jsx
// Prompt user to switch networks
try {
  await window.ethereum.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: '0x539' }], // Hardhat = 1337 = 0x539
  })
} catch (error) {
  console.error('Failed to switch network:', error)
}
```

#### Transaction Failures
- Check gas estimates
- Verify contract addresses
- Ensure sufficient balance
- Review Solidity revert messages

#### Styling Issues
- Clear browser cache
- Check CSS specificity
- Verify class names match
- Use browser DevTools to inspect

---

## Best Practices Summary

### Do's ✅
- Use functional components with hooks
- Implement proper error handling
- Show loading states
- Validate user input
- Cache data when appropriate
- Use semantic HTML
- Follow accessibility guidelines
- Test on multiple devices
- Keep components small and focused
- Document complex logic

### Don'ts ❌
- Don't ignore errors silently
- Don't block the UI thread
- Don't use inline styles (use CSS classes)
- Don't hardcode values (use constants)
- Don't skip accessibility features
- Don't trust user input without validation
- Don't fetch data in render
- Don't mutate state directly
- Don't use class components (use functional)
- Don't skip testing

---

## Resources

### Documentation
- [React Docs](https://react.dev/)
- [Vite Docs](https://vitejs.dev/)
- [ethers.js Docs](https://docs.ethers.org/)
- [MDN Web Docs](https://developer.mozilla.org/)

### Tools
- [React DevTools](https://react.dev/learn/react-developer-tools)
- [MetaMask](https://metamask.io/)
- [Chrome Lighthouse](https://developers.google.com/web/tools/lighthouse)

### Learning
- [React Tutorial](https://react.dev/learn)
- [Web3 by Example](https://solidity-by-example.org/)
- [CSS Tricks](https://css-tricks.com/)

---

**Last Updated**: December 2024
**Version**: 1.0
**Maintainer**: ChipprRobotics Engineering Team
