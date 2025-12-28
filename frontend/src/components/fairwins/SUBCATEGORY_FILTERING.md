# Subcategory Filtering Feature

## Overview
The subcategory filtering feature enhances the category browsing experience by adding a fuzzy-searchable filter section directly under each category title. This allows users to filter and explore content within primary categories using two levels of subcategory buttons.

## Features

### Two-Level Category Hierarchy
- **Parent Categories:** Sports, Politics, Finance, Tech, Crypto, Pop Culture
- **Subcategories:** Each parent category has multiple subcategories (e.g., NFL, NBA, MLB for Sports)

### Fuzzy Search
- Powered by Fuse.js for intelligent fuzzy matching
- Searches across subcategory names and IDs
- Real-time filtering as you type
- Shows count of filtered results

### Interactive UI
- **Subcategory Buttons:** Click to toggle selection
- **Visual Feedback:** Selected subcategories show with checkmark (✓) and highlighted style
- **Clear All:** Button appears when filters are active to quickly reset
- **Search Input:** Dedicated search box for finding subcategories

### Real-Time Filtering
- Market count updates dynamically based on selected subcategories
- Markets filtered instantly when subcategories are toggled
- Smooth user experience with no page reloads

## Architecture

### Components

#### SubcategoryFilter Component
**Location:** `frontend/src/components/fairwins/SubcategoryFilter.jsx`

**Props:**
- `subcategories` (Array): Array of subcategory objects with `{ id, name, parent }`
- `selectedSubcategories` (Array): Array of currently selected subcategory IDs
- `onSubcategoryToggle` (Function): Callback when subcategory is toggled
- `categoryName` (String): Name of parent category for accessibility

**Features:**
- Fuzzy search input with real-time filtering
- Subcategory button grid with toggle functionality
- Clear All button for resetting filters
- Accessible with proper ARIA attributes
- Responsive design for mobile and desktop

#### CategoryRow Component
**Location:** `frontend/src/components/fairwins/CategoryRow.jsx`

**Enhanced with:**
- Subcategory filter section support
- Props for passing subcategory data and handlers
- Seamless integration below category title

### Configuration

#### Subcategories Configuration
**Location:** `frontend/src/config/subcategories.js`

Defines the complete subcategory hierarchy:

```javascript
export const SUBCATEGORIES = {
  sports: [
    { id: 'nfl', name: 'NFL', parent: 'sports' },
    { id: 'college-football', name: 'College Football', parent: 'sports' },
    // ... more subcategories
  ],
  politics: [ /* ... */ ],
  finance: [ /* ... */ ],
  tech: [ /* ... */ ],
  crypto: [ /* ... */ ],
  'pop-culture': [ /* ... */ ]
}
```

**Utility Functions:**
- `getSubcategoriesForCategory(parentCategory)`: Get subcategories for a specific category
- `getAllSubcategories()`: Get all subcategories flattened
- `findSubcategoryById(subcategoryId)`: Find a subcategory by its ID

### Data Model

#### Market Object Enhancement
Markets now include a `subcategory` field:

```json
{
  "id": 0,
  "proposalTitle": "NFL Super Bowl 2025: Chiefs win",
  "description": "Will the Kansas City Chiefs win the Super Bowl?",
  "category": "sports",
  "subcategory": "nfl",
  "passTokenPrice": "0.35",
  "totalLiquidity": "125000",
  // ... other fields
}
```

## Usage

### In FairWinsAppNew Component

1. **Import subcategory utilities:**
```javascript
import { getSubcategoriesForCategory } from '../../config/subcategories'
```

2. **Add state for selected subcategories:**
```javascript
const [selectedSubcategories, setSelectedSubcategories] = useState([])
```

3. **Handle subcategory toggle:**
```javascript
const handleSubcategoryToggle = useCallback((subcategoryId) => {
  setSelectedSubcategories(prev => {
    if (prev.includes(subcategoryId)) {
      return prev.filter(id => id !== subcategoryId)
    } else {
      return [...prev, subcategoryId]
    }
  })
}, [])
```

4. **Filter markets by subcategory:**
```javascript
const subcategoryFilteredMarkets = useMemo(() => {
  if (selectedSubcategories.length === 0) {
    return categoryFilteredMarkets
  }
  return categoryFilteredMarkets.filter(m => 
    selectedSubcategories.includes(m.subcategory)
  )
}, [categoryFilteredMarkets, selectedSubcategories])
```

5. **Render SubcategoryFilter component:**
```javascript
<SubcategoryFilter
  subcategories={getSubcategoriesForCategory(selectedCategory)}
  selectedSubcategories={selectedSubcategories}
  onSubcategoryToggle={handleSubcategoryToggle}
  categoryName={categoryName}
/>
```

## Styling

### CSS Classes
**Location:** `frontend/src/components/fairwins/SubcategoryFilter.css`

Key classes:
- `.subcategory-filter`: Main container
- `.subcategory-search-input`: Search input field
- `.subcategory-btn`: Individual subcategory button
- `.subcategory-btn.selected`: Selected state styling
- `.clear-filters-btn`: Clear all button

### Accessibility Features
- Proper ARIA labels and roles
- Keyboard navigation support
- Screen reader friendly
- High contrast mode support
- Reduced motion support

## Testing

### Unit Tests
**Location:** `frontend/src/test/SubcategoryFilter.test.jsx`

Tests cover:
- Rendering all subcategory buttons
- Search functionality
- Fuzzy search matching
- Button selection/deselection
- Clear All functionality
- Accessibility attributes

**Location:** `frontend/src/test/subcategories.test.js`

Tests cover:
- Configuration data integrity
- Utility function behavior
- Subcategory lookups
- Data validation

### Running Tests
```bash
cd frontend
npm test -- SubcategoryFilter.test.jsx
npm test -- subcategories.test.js
```

## Examples

### Supported Subcategories

#### Sports
- NFL, College Football, High School
- NBA, WNBA, College Basketball
- MLB, NHL
- Formula 1, NASCAR, MotoGP
- Soccer, Olympics, Fitness/Health

#### Politics
- US Elections, International Elections
- Legislation, Geopolitics, Policy

#### Finance
- Stocks, Forex, Commodities
- Interest Rates, Corporate, Economy

#### Tech
- AI/ML, Software, Hardware
- Startups, Big Tech

#### Crypto
- Bitcoin, Ethereum, DeFi
- NFTs, Altcoins

#### Pop Culture
- Movies, TV Shows, Music
- Celebrities, Awards

## Future Enhancements

### Potential Improvements
1. **Multi-level nesting:** Support for more than two levels of subcategories
2. **Preset filters:** Save commonly used filter combinations
3. **URL parameters:** Persist selected filters in URL for sharing
4. **Analytics:** Track popular subcategory combinations
5. **Auto-suggestions:** Suggest relevant subcategories based on search history
6. **Bulk operations:** Select/deselect multiple subcategories at once

### Adding New Subcategories

To add a new subcategory:

1. Edit `frontend/src/config/subcategories.js`
2. Add the subcategory to the appropriate parent category array:
```javascript
sports: [
  // ... existing subcategories
  { id: 'new-sport', name: 'New Sport', parent: 'sports' }
]
```
3. Update market data to include the new subcategory ID in the `subcategory` field
4. No code changes needed - the UI will automatically include the new subcategory

## Performance Considerations

- **Memoization:** Filtering logic is memoized to prevent unnecessary recalculations
- **Efficient search:** Fuse.js provides fast fuzzy matching even with large datasets
- **Lazy rendering:** Only visible subcategories are rendered
- **Debouncing:** Search input could be debounced for very large subcategory lists (currently not needed)

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers (iOS Safari, Chrome Mobile)
- Responsive design works on all screen sizes
- Graceful degradation for older browsers
