# Demo Mode Toggle Feature

## Overview
This feature adds a toggle in the user menu that allows users to switch between mock data (Demo Mode) and real blockchain data (Live Mode). By default, the application starts in Demo Mode for testing and demonstrations.

## User Interface

### Location
The demo toggle is located in the **User Management Modal** under the **Profile tab** in the "Data Source" section.

### How to Access
1. Click the user avatar button in the top-right corner of the application
2. Navigate to the "Profile" tab (default tab when connected)
3. Scroll to the "Data Source" section

### UI Elements
- **Status Badge**: Shows current mode with color-coded visual indicator
  - "Demo Mode" - Purple gradient badge
  - "Live Mode" - Pink/red gradient badge
- **Toggle Button**: "Switch to Live/Demo Mode" button to change modes
- **Description Text**: Explains what each mode means and what to expect

## Technical Implementation

### Architecture

#### 1. User Preferences (Storage Layer)
- **File**: `frontend/src/utils/userStorage.js`
- **Functions**:
  - `getDemoMode(walletAddress)` - Retrieves saved preference (default: true)
  - `updateDemoMode(walletAddress, enabled)` - Saves preference to localStorage
- **Storage Key**: `fw_user_{walletAddress}_demo_mode`

#### 2. State Management (Context Layer)
- **File**: `frontend/src/contexts/UserPreferencesContext.jsx`
- **State**: `demoMode` (boolean) added to preferences object
- **Functions**:
  - `setDemoMode(enabled)` - Updates demo mode state and persists to storage
- **Default**: `true` (Demo Mode enabled)

#### 3. Data Fetching (Abstraction Layer)
- **File**: `frontend/src/utils/dataFetcher.js`
- **Functions**: All data fetching functions that switch between mock and real data
  - `fetchMarkets(demoMode, contracts)`
  - `fetchMarketsByCategory(demoMode, category, contracts)`
  - `fetchMarketById(demoMode, id, contracts)`
  - `fetchProposals(demoMode, contracts)`
  - `fetchPositions(demoMode, userAddress, contracts)`
  - `fetchWelfareMetrics(demoMode, contracts)`
  - And more...

#### 4. React Hook (Component Layer)
- **File**: `frontend/src/hooks/useDataFetcher.js`
- **Hook**: `useDataFetcher()`
- **Returns**: Object with data fetching functions that automatically respect demo mode
- **Usage**:
  ```javascript
  const { getMarkets, getProposals, demoMode } = useDataFetcher()
  const markets = await getMarkets() // Returns mock or real data based on preference
  ```

### Updated Components
All components that previously used `getMockMarkets()` or `getMockProposals()` directly now use `useDataFetcher()`:

1. **Dashboard** (`frontend/src/components/fairwins/Dashboard.jsx`)
2. **MarketPage** (`frontend/src/pages/MarketPage.jsx`)
3. **CorrelatedMarketsPage** (`frontend/src/pages/CorrelatedMarketsPage.jsx`)
4. **MarketTrading** (`frontend/src/components/MarketTrading.jsx`)
5. **ProposalList** (`frontend/src/components/ProposalList.jsx`)
6. **FairWinsAppNew** (`frontend/src/components/fairwins/FairWinsAppNew.jsx`)

### Data Flow

```
User toggles Demo Mode
    ↓
UserManagementModal calls setDemoMode()
    ↓
UserPreferencesContext updates state and localStorage
    ↓
Components using useDataFetcher() automatically re-fetch data
    ↓
dataFetcher.js routes to mock or real data source
    ↓
UI updates with new data
```

## Default Behavior

- **Initial State**: Demo Mode (enabled)
- **Without Wallet**: Demo mode preference not saved (uses default)
- **With Wallet**: Demo mode preference saved per wallet address
- **Live Mode Fallback**: Currently falls back to mock data with console warning (blockchain integration pending)

## Future Blockchain Integration

The data fetcher is designed to make blockchain integration seamless:

1. Implement contract interaction functions in `dataFetcher.js`
2. Remove fallback to mock data in Live Mode
3. Pass contract instances through the `contracts` parameter
4. No changes needed to components using `useDataFetcher()`

### Example Integration:
```javascript
// In dataFetcher.js
export async function fetchMarkets(demoMode, contracts = null) {
  if (demoMode) {
    return getMockMarkets()
  }
  
  // Real blockchain data fetching
  if (!contracts?.marketFactory) {
    throw new Error('Market factory contract not available')
  }
  
  const marketCount = await contracts.marketFactory.getMarketCount()
  const markets = []
  for (let i = 0; i < marketCount; i++) {
    const market = await contracts.marketFactory.getMarket(i)
    markets.push(market)
  }
  return markets
}
```

## Benefits

1. **Safe Testing**: Default to mock data prevents accidental real transactions
2. **Easy Demos**: Switch to Demo Mode for presentations and testing
3. **Seamless Transition**: Toggle between environments without code changes
4. **User Control**: Each user can choose their preferred mode
5. **Persistent**: Preference saved per wallet, remembered across sessions
6. **Centralized**: Single point of control for all data fetching
7. **Future-Ready**: Architecture supports easy blockchain integration

## Screenshots

When not connected:
![User Management Modal - Not Connected](https://github.com/user-attachments/assets/f8ce8c71-4701-4383-b452-3275764e9731)

When connected, the Profile tab shows the "Data Source" section with:
- Current mode badge (Demo Mode/Live Mode)
- Toggle button
- Descriptive explanation of current mode

## Testing

To test the feature:

1. Build and run the frontend: `cd frontend && npm run dev`
2. Navigate to the application
3. Open the user management modal (click user avatar)
4. Without connecting a wallet, you'll see the connect prompt
5. With a connected wallet, you'll see the Profile tab with the Data Source section
6. Toggle between Demo and Live modes
7. Observe that:
   - The badge updates
   - The description changes
   - Components re-fetch data (currently still shows mock data in both modes as blockchain integration is pending)
   - The preference persists on page reload
