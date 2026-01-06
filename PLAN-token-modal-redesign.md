# Token Creation Modal Redesign Plan

## Executive Summary

Redesign the TokenMintBuilderModal to match the clean, modern, minimalist design patterns established in TokenManagementModal while adding full Web3 transaction integration for a seamless token creation experience.

---

## Current State Analysis

### Existing TokenMintBuilderModal Issues

1. **No Web3 Integration**: Currently just calls `onCreate` callback with form data - no actual blockchain transaction
2. **Outdated Visual Design**: Missing backdrop blur, modern animations, and minimalist styling
3. **Limited UX Feedback**: No transaction status tracking, gas estimation, or confirmation flow
4. **Basic Error Handling**: Generic error messages without recovery guidance
5. **No Wallet State Awareness**: Doesn't check wallet connection or network before allowing submission
6. **Emoji-Heavy UI**: Uses emoji icons (🪙, 💰, 🎨, 🔥) instead of clean SVG icons

### Strengths to Preserve
- Good form validation logic
- Accessible ARIA attributes
- Token type toggle pattern
- Feature checkbox pattern with descriptions
- Responsive mobile layout

---

## Design System Alignment

### Visual Standards (from TokenManagementModal)

| Aspect | Standard |
|--------|----------|
| Overlay | `rgba(0,0,0,0.5)` + `backdrop-filter: blur(4px)` |
| Modal radius | `16px` |
| Animations | `fadeIn 0.2s`, `slideUp 0.3s ease-out` |
| Header bg | `linear-gradient(135deg, #fafafa 0%, #ffffff 100%)` |
| Primary color | `#2D7A4F` (FairWins green) |
| Text primary | `#1a1a1a` |
| Text secondary | `#6b7280` |
| Border color | `#e5e7eb` or `#f0f0f0` |
| Input focus | `border: #2D7A4F` + `box-shadow: 0 0 0 3px rgba(45, 122, 79, 0.1)` |
| Buttons | `8px` radius, `0.15s` transitions |
| Font sizes | Labels: `0.85rem`, Inputs: `0.9rem`, Hints: `0.75rem` |

---

## Redesign Specification

### 1. Multi-Step Wizard Flow

Transform the single form into a guided 3-step wizard:

```
┌─────────────────────────────────────────────────────────┐
│  Step 1: Token Type    Step 2: Configuration    Step 3: Review & Deploy  │
│     ●─────────────────────○────────────────────────○     │
└─────────────────────────────────────────────────────────┘
```

**Step 1: Token Type Selection**
- Large, card-based selection (ERC-20 vs ERC-721)
- SVG icons instead of emojis
- Clear descriptions of each token type
- "Learn more" links to documentation

**Step 2: Configuration**
- Token name, symbol, initial supply (ERC-20) / base URI (ERC-721)
- Feature toggles (Burnable, Pausable, Mintable)
- Metadata URI input with IPFS/URL validation
- ETCSwap listing option with explanation

**Step 3: Review & Deploy**
- Summary of all configuration
- Gas estimation display
- Network confirmation
- Transaction preview
- Deploy button with wallet connection check

### 2. Component Structure

```
TokenCreationModal/
├── index.jsx                    # Main modal wrapper
├── TokenCreationModal.css       # Styles
├── steps/
│   ├── TokenTypeStep.jsx        # Step 1: Type selection
│   ├── ConfigurationStep.jsx    # Step 2: Form fields
│   └── ReviewStep.jsx           # Step 3: Summary & deploy
├── components/
│   ├── StepIndicator.jsx        # Progress indicator
│   ├── TokenTypeCard.jsx        # Selection card
│   ├── FeatureToggle.jsx        # Feature checkbox
│   ├── GasEstimate.jsx          # Gas estimation display
│   └── TransactionStatus.jsx    # TX status tracking
└── hooks/
    └── useTokenCreation.js      # Web3 integration logic
```

### 3. Web3 Integration Architecture

```javascript
// useTokenCreation.js hook
const useTokenCreation = () => {
  return {
    // Connection state
    isConnected,
    isCorrectNetwork,
    walletAddress,

    // Transaction state
    txState: 'idle' | 'estimating' | 'pending_signature' | 'pending_confirmation' | 'success' | 'error',
    txHash,
    txError,

    // Gas estimation
    estimatedGas,
    gasPrice,
    totalCostETC,

    // Actions
    estimateGas: (tokenConfig) => Promise<GasEstimate>,
    createToken: (tokenConfig) => Promise<{address, txHash}>,

    // Factory contract interaction
    factoryAddress,
    factoryABI
  }
}
```

### 4. Transaction Status UI

```
┌─────────────────────────────────────────────────────────┐
│                    Creating Token                        │
│                                                          │
│         ┌───────────────────────────────────┐           │
│         │  ⏳  Waiting for signature...     │           │
│         │     Please confirm in wallet      │           │
│         └───────────────────────────────────┘           │
│                                                          │
│  ─────────────────────────────────────────────────────  │
│                                                          │
│  Token: My Awesome Token (MAT)                          │
│  Type: ERC-20                                           │
│  Supply: 1,000,000                                      │
│  Features: Burnable, Pausable                           │
│                                                          │
│  Estimated Gas: 0.0035 ETC                              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Transaction States:**

| State | UI |
|-------|-----|
| `idle` | Show deploy button |
| `estimating` | "Estimating gas..." spinner |
| `pending_signature` | "Waiting for wallet signature..." |
| `pending_confirmation` | "Transaction submitted, waiting for confirmation..." with tx link |
| `success` | Green checkmark, token address, "View on Explorer" link |
| `error` | Red error message with "Try Again" button |

### 5. Form Field Enhancements

**Token Name Input**
- Character counter (max 50 characters)
- Preview of how it will appear
- Validation: required, max length

**Symbol Input**
- Auto-uppercase transformation
- Character counter (max 11)
- Preview badge showing how symbol will look
- Validation: required, alphanumeric, max length

**Initial Supply (ERC-20)**
- Number formatter with commas (1,000,000)
- Preset buttons: 1M, 10M, 100M, 1B
- Decimals selector (default 18)
- Validation: positive number

**Metadata URI**
- Input with prefix selector: `ipfs://` | `https://`
- Validate URL format
- "Upload to IPFS" button (future enhancement)
- Preview metadata if valid JSON

### 6. Feature Toggles Redesign

Replace emoji-based checkboxes with clean toggle cards:

```
┌─────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────┐ │
│ │  [Toggle]  Burnable                                 │ │
│ │            Holders can permanently destroy tokens   │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │  [Toggle]  Pausable                      ERC-20 only│ │
│ │            Owner can pause all transfers            │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │  [Toggle]  Mintable                                 │ │
│ │            Owner can mint additional tokens         │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │  [Toggle]  List on ETCSwap               ERC-20 only│ │
│ │            Auto-create liquidity pool after deploy  │ │
│ │            ⚠️ Requires additional ETC for liquidity │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 7. Review Step Design

```
┌─────────────────────────────────────────────────────────┐
│  Review Your Token                                       │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Token Details                                     │  │
│  ├───────────────────────────────────────────────────┤  │
│  │  Name           My Awesome Token                   │  │
│  │  Symbol         MAT                                │  │
│  │  Type           ERC-20                             │  │
│  │  Initial Supply 1,000,000                          │  │
│  │  Decimals       18                                 │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Features                                          │  │
│  ├───────────────────────────────────────────────────┤  │
│  │  ✓ Burnable     ✓ Pausable     ✗ Mintable        │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Deployment Cost                                   │  │
│  ├───────────────────────────────────────────────────┤  │
│  │  Estimated Gas    ~0.0035 ETC                     │  │
│  │  Network          Ethereum Classic Mainnet         │  │
│  │  Deployer         0x1234...abcd                   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ⚠️ This action is irreversible. Token parameters       │
│     cannot be changed after deployment.                  │
│                                                          │
│            [Cancel]            [Deploy Token]            │
└─────────────────────────────────────────────────────────┘
```

### 8. Success State Design

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│                    ✓ Token Created!                      │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │                                                     │  │
│  │      My Awesome Token (MAT)                        │  │
│  │                                                     │  │
│  │      Contract Address:                             │  │
│  │      0x1234567890abcdef1234567890abcdef12345678   │  │
│  │      [Copy]                                        │  │
│  │                                                     │  │
│  │      Transaction Hash:                             │  │
│  │      0xabcd...ef12  [View on Explorer ↗]          │  │
│  │                                                     │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  What's Next?                                            │
│  • Add token to your wallet                              │
│  • Create a liquidity pool                               │
│  • Manage token in Token Management                      │
│                                                          │
│      [Add to Wallet]      [Manage Tokens]      [Close]  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Visual Redesign (No Web3 Changes)
1. Update CSS to match TokenManagementModal patterns
2. Replace emoji icons with SVG icons
3. Add backdrop blur and modern animations
4. Implement step indicator UI
5. Restructure form into wizard steps
6. Add wallet connection awareness

### Phase 2: Web3 Integration
1. Create `useTokenCreation` hook
2. Integrate with TokenMintFactory contract
3. Add gas estimation
4. Implement transaction status tracking
5. Add success/error state handling

### Phase 3: Enhanced UX
1. Add "Add to Wallet" functionality
2. Transaction history integration
3. IPFS metadata upload (future)
4. ETCSwap auto-listing flow

---

## File Changes Required

### New Files
- `frontend/src/components/fairwins/TokenCreationModal/index.jsx`
- `frontend/src/components/fairwins/TokenCreationModal/TokenCreationModal.css`
- `frontend/src/components/fairwins/TokenCreationModal/steps/TokenTypeStep.jsx`
- `frontend/src/components/fairwins/TokenCreationModal/steps/ConfigurationStep.jsx`
- `frontend/src/components/fairwins/TokenCreationModal/steps/ReviewStep.jsx`
- `frontend/src/components/fairwins/TokenCreationModal/components/StepIndicator.jsx`
- `frontend/src/components/fairwins/TokenCreationModal/components/FeatureToggle.jsx`
- `frontend/src/components/fairwins/TokenCreationModal/components/GasEstimate.jsx`
- `frontend/src/components/fairwins/TokenCreationModal/components/TransactionStatus.jsx`
- `frontend/src/hooks/useTokenCreation.js`

### Modified Files
- `frontend/src/pages/TokenMintPage.jsx` - Update to use new modal
- `frontend/src/components/TokenMintButton.jsx` - Update import path

### Deprecated Files
- `frontend/src/components/fairwins/TokenMintBuilderModal.jsx` - Replace with new modal
- `frontend/src/components/fairwins/TokenMintBuilderModal.css` - Replace with new styles

---

## Accessibility Requirements

- Full keyboard navigation (Tab, Shift+Tab, Enter, Escape)
- Focus trap within modal
- ARIA labels for all interactive elements
- Screen reader announcements for transaction status changes
- Reduced motion support
- High contrast mode support
- Minimum 44px touch targets on mobile

---

## Mobile Responsiveness

- Full-screen sheet on mobile (≤600px)
- Stacked layout for step indicator
- Full-width buttons
- Touch-friendly toggle switches
- Collapsible sections for review step

---

## Dependencies

### Required Smart Contracts
- TokenMintFactory contract (for creating tokens)
- Must support: `createERC20()`, `createERC721()`

### Required Hooks/Context
- `useWeb3()` - Wallet connection, signer
- `useWallet()` - Address, connection state
- `ethers.js` - Contract interaction

### Optional Integrations
- ETCSwap Router - For auto-listing
- IPFS gateway - For metadata upload

---

## Success Metrics

1. User can create a token in under 2 minutes
2. Clear transaction status at every step
3. Zero confusion about gas costs
4. Successful token visible in Token Management immediately after creation
5. Mobile users have equivalent experience to desktop
