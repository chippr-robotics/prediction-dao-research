# Mock Data Management Guide

## Overview

All mock/dummy data used in the frontend application is centralized in `/src/mock-data.json`. This file is loaded at application startup and provides consistent test data across all components.

## File Structure

The `mock-data.json` file contains the following sections:

- **proposals**: Mock DAO proposal data
- **markets**: Mock prediction market data
- **positions**: Mock user position data  
- **welfareMetrics**: Mock welfare metric data

## Using Mock Data

Import the mock data loader utilities in your components:

```javascript
import { 
  getMockMarkets, 
  getMockProposals, 
  getMockPositions, 
  getMockWelfareMetrics 
} from './utils/mockDataLoader'

// In your component
const markets = getMockMarkets()
const proposals = getMockProposals()
```

### Available Functions

- `getMockMarkets()` - Returns all markets
- `getMockMarketsByCategory(category)` - Returns markets for a specific category
- `getMockMarketById(id)` - Returns a single market by ID
- `getMockProposals()` - Returns all proposals
- `getMockPositions()` - Returns all user positions
- `getMockWelfareMetrics()` - Returns all welfare metrics
- `getMockCategories()` - Returns list of unique market categories
- `getMockMarketsByCorrelationGroup(groupId)` - Returns markets in a correlation group

## Relative Time Format

Mock data uses a special `RELATIVE:` format for dates to ensure they're always relative to the current time:

- `"RELATIVE:45d"` - 45 days from now
- `"RELATIVE:-2d"` - 2 days ago

This format is automatically converted to ISO date strings by the mock data loader.

## Adding New Mock Data

To add new mock data:

1. Edit `/src/mock-data.json`
2. Add your data to the appropriate section (proposals, markets, positions, welfareMetrics)
3. Use the `RELATIVE:` format for any timestamps
4. Ensure unique IDs within each section

Example:

```json
{
  "id": 50,
  "proposalTitle": "New Market Title",
  "description": "Market description",
  "category": "sports",
  "passTokenPrice": "0.55",
  "failTokenPrice": "0.45",
  "totalLiquidity": "10000",
  "tradingEndTime": "RELATIVE:30d",
  "status": "Active"
}
```

## Updating Mock Data

1. Locate the entry in `/src/mock-data.json`
2. Modify the fields as needed
3. Changes will be reflected on the next app reload

## Production Considerations

**Important**: Mock data is for development and testing only. In production:

- Replace `getMockMarkets()` calls with actual blockchain contract calls
- Replace `getMockProposals()` calls with API/contract queries
- Replace `getMockPositions()` calls with user-specific data fetching
- Replace `getMockWelfareMetrics()` calls with actual metric registry queries

Each component that uses mock data includes comments indicating where production contract calls should replace the mock data loaders.

## Data Generators

Some components use data generator functions for visualization purposes:

- `MarketHeroCard.jsx`: Generates price history charts, activity heatmaps, holder distribution
- `CorrelatedMarketsView.jsx`: Generates timeline data for correlated markets

These generators create synthetic visualization data based on current market state and are acceptable to keep as functions rather than static data.

## Component Usage

### Components Using Centralized Mock Data

- `ProposalList.jsx` - Uses `getMockProposals()`
- `FairWinsAppNew.jsx` - Uses `getMockMarkets()`
- `MyPositions.jsx` - Uses `getMockPositions()`
- `MarketTrading.jsx` - Uses `getMockMarkets()`
- `WelfareMetrics.jsx` - Uses `getMockWelfareMetrics()`

### Transition to Production

When deploying to production:

1. Set environment variable to disable mock data
2. Replace mock data calls with smart contract interactions
3. Implement proper error handling for contract calls
4. Add loading states for async data fetching

Example transition:

```javascript
// Development
const markets = getMockMarkets()

// Production
const markets = await contract.getAllMarkets()
```

## Testing

Mock data is designed to provide comprehensive test coverage:

- Multiple market categories (sports, politics, finance, tech, crypto, pop-culture)
- Correlated market groups (e.g., presidential election candidates)
- Various market states (Active, Reviewing, Settled)
- Different price points and liquidity levels
- Historical positions with gains and losses

## Maintenance

- Review and update mock data quarterly to keep examples relevant
- Ensure correlation groups remain logically consistent
- Verify all relative timestamps are reasonable
- Test edge cases (very high/low prices, near-expiry markets)

## Best Practices

1. **Never commit real user data** to mock-data.json
2. **Use realistic but fictional data** (e.g., "Candidate A" instead of real politician names for sensitive topics)
3. **Keep IDs unique** within each data section
4. **Document any new mock data fields** in this guide
5. **Use RELATIVE: format** for all timestamps to avoid stale dates
6. **Test with various data scenarios** before committing changes

## Troubleshooting

### Mock data not loading

- Check that `/src/mock-data.json` exists and is valid JSON
- Verify import path in `mockDataLoader.js`
- Check browser console for JSON parsing errors

### Dates not updating

- Ensure you're using `RELATIVE:` format, not hardcoded ISO strings
- Check that `processRelativeTimes()` is being called in the loader

### Component not finding data

- Verify the component is importing from `'./utils/mockDataLoader'`
- Check that the correct getter function is being used
- Ensure the data section exists in `mock-data.json`

## Future Enhancements

Potential improvements to the mock data system:

- Environment-specific mock data files (dev, staging, test)
- Mock data versioning/snapshots for testing
- Automated mock data generation scripts
- Mock data validation schema
- Integration with testing frameworks
