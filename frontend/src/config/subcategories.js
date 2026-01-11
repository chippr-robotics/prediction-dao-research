/**
 * Subcategory Configuration
 * Defines the two-level subcategory structure for each parent category
 */

export const SUBCATEGORIES = {
  sports: [
    { id: 'nfl', name: 'NFL', parent: 'sports' },
    { id: 'college-football', name: 'College Football', parent: 'sports' },
    { id: 'high-school-football', name: 'High School', parent: 'sports' },
    { id: 'soccer', name: 'Soccer', parent: 'sports' },
    { id: 'nba', name: 'NBA', parent: 'sports' },
    { id: 'wnba', name: 'WNBA', parent: 'sports' },
    { id: 'college-basketball', name: 'College Basketball', parent: 'sports' },
    { id: 'mlb', name: 'MLB', parent: 'sports' },
    { id: 'nhl', name: 'NHL', parent: 'sports' },
    { id: 'formula-1', name: 'Formula 1', parent: 'sports' },
    { id: 'nascar', name: 'NASCAR', parent: 'sports' },
    { id: 'motogp', name: 'MotoGP', parent: 'sports' },
    { id: 'olympics', name: 'Olympics', parent: 'sports' },
    { id: 'fitness', name: 'Fitness/Health', parent: 'sports' }
  ],
  politics: [
    { id: 'us-elections', name: 'US Elections', parent: 'politics' },
    { id: 'international-elections', name: 'International Elections', parent: 'politics' },
    { id: 'legislation', name: 'Legislation', parent: 'politics' },
    { id: 'geopolitics', name: 'Geopolitics', parent: 'politics' },
    { id: 'policy', name: 'Policy', parent: 'politics' }
  ],
  finance: [
    { id: 'stocks', name: 'Stocks', parent: 'finance' },
    { id: 'forex', name: 'Forex', parent: 'finance' },
    { id: 'commodities', name: 'Commodities', parent: 'finance' },
    { id: 'interest-rates', name: 'Interest Rates', parent: 'finance' },
    { id: 'corporate', name: 'Corporate', parent: 'finance' },
    { id: 'economy', name: 'Economy', parent: 'finance' }
  ],
  tech: [
    { id: 'ai', name: 'AI/ML', parent: 'tech' },
    { id: 'software', name: 'Software', parent: 'tech' },
    { id: 'hardware', name: 'Hardware', parent: 'tech' },
    { id: 'startups', name: 'Startups', parent: 'tech' },
    { id: 'big-tech', name: 'Big Tech', parent: 'tech' }
  ],
  crypto: [
    { id: 'bitcoin', name: 'Bitcoin', parent: 'crypto' },
    { id: 'ethereum', name: 'Ethereum', parent: 'crypto' },
    { id: 'defi', name: 'DeFi', parent: 'crypto' },
    { id: 'nft', name: 'NFTs', parent: 'crypto' },
    { id: 'altcoins', name: 'Altcoins', parent: 'crypto' }
  ],
  'pop-culture': [
    { id: 'movies', name: 'Movies', parent: 'pop-culture' },
    { id: 'tv-shows', name: 'TV Shows', parent: 'pop-culture' },
    { id: 'music', name: 'Music', parent: 'pop-culture' },
    { id: 'celebrities', name: 'Celebrities', parent: 'pop-culture' },
    { id: 'awards', name: 'Awards', parent: 'pop-culture' }
  ],
  weather: [
    { id: 'temperature', name: 'Temperature', parent: 'weather' },
    { id: 'precipitation', name: 'Precipitation', parent: 'weather' },
    { id: 'storms', name: 'Storms & Hurricanes', parent: 'weather' },
    { id: 'snowfall', name: 'Snowfall', parent: 'weather' },
    { id: 'drought', name: 'Drought', parent: 'weather' },
    { id: 'records', name: 'Weather Records', parent: 'weather' },
    { id: 'seasonal', name: 'Seasonal Forecasts', parent: 'weather' }
  ]
}

/**
 * Get subcategories for a specific parent category
 * @param {string} parentCategory - The parent category ID
 * @returns {Array} Array of subcategory objects
 */
export function getSubcategoriesForCategory(parentCategory) {
  return SUBCATEGORIES[parentCategory] || []
}

/**
 * Get all subcategories flattened
 * @returns {Array} Array of all subcategory objects
 */
export function getAllSubcategories() {
  return Object.values(SUBCATEGORIES).flat()
}

/**
 * Find subcategory by ID
 * @param {string} subcategoryId - The subcategory ID to find
 * @returns {Object|null} Subcategory object or null if not found
 */
export function findSubcategoryById(subcategoryId) {
  const allSubcategories = getAllSubcategories()
  return allSubcategories.find(sub => sub.id === subcategoryId) || null
}
