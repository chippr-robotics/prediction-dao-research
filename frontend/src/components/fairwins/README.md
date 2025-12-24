# FairWins Admin Dashboard UI Components

This directory contains the redesigned FairWins prediction market UI components implementing an admin-dashboard style layout.

## Architecture Overview

The UI is built around two main views:

1. **Grid View** - Browse markets by category
2. **Focus View** - Detailed view of a single market with trading panel

## Components

### Layout Components

#### `SidebarNav.jsx`
Fixed left sidebar with category navigation.
- **Props:** `selectedCategory`, `onCategoryChange`
- **Features:** 
  - 9 categories: All, Trending, Politics, Sports, Finance, Tech, Pop Culture, Crypto, Other
  - Collapsible functionality
  - Active state highlighting
  - Responsive (mobile: slides off-canvas)

#### `HeaderBar.jsx`
Top header bar with branding and user controls.
- **Props:** `onConnect`, `onDisconnect`, `onBack`, `isConnected`, `account`
- **Features:**
  - FairWins branding with logo
  - Search input (UI ready)
  - Wallet connection status
  - Back navigation button

### Market Display Components

#### `MarketTile.jsx`
Individual market card for grid display.
- **Props:** `market`, `onClick`, `isActive`
- **Features:**
  - Category badge with icon
  - Status indicator
  - Title and description (truncated)
  - Probability bar (YES/NO)
  - Volume and closing time
  - "View Market" button
  - Hover and active states

#### `MarketGrid.jsx`
Responsive grid layout for market tiles.
- **Props:** `markets`, `onMarketClick`, `selectedMarketId`, `loading`
- **Features:**
  - Responsive columns (1-4 based on screen width)
  - Loading skeleton state
  - Empty state with message
  - Fade-in animations

#### `MarketHeroCard.jsx`
Large detailed market view with trading panel.
- **Props:** `market`, `onTrade`
- **Features:**
  - Hero header with category badge
  - Large title and description
  - 4-stat grid (Probability, Volume, 24h Change, Trades)
  - Market info (closing time, status)
  - Integrated trade panel
  - YES/NO token selection
  - Amount input
  - Privacy notice

#### `HorizontalMarketScroller.jsx`
Horizontal scrollable row of related markets.
- **Props:** `title`, `markets`, `onMarketClick`, `selectedMarketId`
- **Features:**
  - Horizontal scroll with controls
  - Left/right navigation buttons
  - Smooth scrolling
  - Uses MarketTile components
  - Responsive tile sizing

### Main Application

#### `FairWinsAppNew.jsx`
Main application component integrating all pieces.
- **Props:** `onConnect`, `onDisconnect`, `onBack`
- **Features:**
  - View mode management (grid/focus)
  - Category filtering
  - Market selection
  - State transitions
  - Related markets calculation
  - Mock data integration (ready for API)

## Data Structure

### Market Object
```javascript
{
  id: number,
  proposalTitle: string,
  description: string,
  category: string, // 'politics' | 'sports' | 'finance' | 'tech' | 'pop-culture' | 'crypto' | 'other'
  tags: string[],
  passTokenPrice: string, // e.g., '0.65'
  failTokenPrice: string, // e.g., '0.35'
  totalLiquidity: string, // e.g., '12500'
  tradingEndTime: string, // ISO 8601 timestamp
  status: string // 'Active' | 'Pending' | 'Settled'
}
```

## Styling

All components use CSS modules with a consistent design system:

### Color Palette
- **Primary Blue:** `#3B82F6`
- **Secondary Blue:** `#2563EB`
- **Success Green:** `#22c55e`
- **Danger Red:** `#ef4444`
- **Background Dark:** `var(--bg-dark)`
- **Background Light:** `var(--bg-light)`
- **Text Primary:** `var(--text-primary)`
- **Text Secondary:** `var(--text-secondary)`

### Responsive Breakpoints
- **Desktop:** > 1024px (4-column grid)
- **Tablet:** 768px - 1024px (2-3 column grid)
- **Mobile:** < 768px (1-column grid, hidden sidebar)

## State Management

The application uses local React state with the following structure:

```javascript
{
  selectedCategory: string,     // Current category filter
  markets: array,               // All markets data
  selectedMarket: object,       // Currently focused market
  loading: boolean,             // Loading state
  viewMode: string             // 'grid' | 'focus'
}
```

## Usage

### Basic Import
```javascript
import FairWinsAppNew from './components/fairwins/FairWinsAppNew'

<FairWinsAppNew 
  onConnect={handleConnect}
  onDisconnect={handleDisconnect}
  onBack={handleBack}
/>
```

### Individual Components
```javascript
import { 
  SidebarNav, 
  HeaderBar, 
  MarketGrid, 
  MarketTile 
} from './components/fairwins'
```

## Accessibility

All components include:
- ARIA labels and roles
- Keyboard navigation support
- Focus management
- Screen reader announcements
- Semantic HTML structure
- Minimum 44x44px touch targets on mobile

## Testing

Components have been manually tested for:
- ✅ Navigation and routing
- ✅ Category filtering
- ✅ Responsive behavior
- ✅ State transitions
- ✅ Build compilation
- ✅ Accessibility features

## Future Enhancements

1. **Search Functionality** - Connect search input to filtering logic
2. **Charts & Analytics** - Add probability/volume charts to hero card
3. **Real Data Integration** - Replace mock data with API calls
4. **Market Creation** - Add flow for creating new markets
5. **User Positions** - Track and display user's market positions
6. **Market Resolution** - Add workflows for settling markets

## Performance Considerations

- Components use React best practices (useCallback, useMemo where appropriate)
- CSS animations use GPU-accelerated properties
- Loading states prevent layout shift
- Image lazy loading supported
- Responsive images for logos

## Browser Support

Tested and working on:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Android)
