/**
 * Mock Data Loader
 * 
 * This module provides utilities for loading and processing mock data from a central JSON file.
 * All mock data should be loaded through this module to ensure consistency across the application.
 * 
 * Usage:
 * ```javascript
 * import { getMockMarkets, getMockProposals, getMockPositions, getMockWelfareMetrics } from './utils/mockDataLoader'
 * 
 * const markets = getMockMarkets()
 * const proposals = getMockProposals()
 * ```
 */

import mockDataRaw from '../mock-data.json'

/**
 * Processes relative time strings (e.g., "RELATIVE:45d" or "RELATIVE:-2d") into ISO date strings
 * @param {string} timeStr - The time string to process
 * @returns {string} ISO date string
 */
function processRelativeTime(timeStr) {
  if (typeof timeStr !== 'string' || !timeStr.startsWith('RELATIVE:')) {
    return timeStr
  }
  
  const match = timeStr.match(/RELATIVE:(-?\d+)d/)
  if (!match) {
    return timeStr
  }
  
  const days = parseInt(match[1], 10)
  
  // Validate days is within reasonable range to prevent extreme dates
  if (days < -365 || days > 730) {
    console.warn(`Relative time days value ${days} is outside reasonable range (-365 to 730). Using clamped value.`)
    const clampedDays = Math.max(-365, Math.min(730, days))
    const date = new Date()
    date.setDate(date.getDate() + clampedDays)
    return date.toISOString()
  }
  
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

/**
 * Processes an object recursively, converting all relative time strings to ISO dates
 * @param {any} obj - The object to process
 * @returns {any} The processed object
 */
function processRelativeTimes(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => processRelativeTimes(item))
  }
  
  const processed = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && value.startsWith('RELATIVE:')) {
      processed[key] = processRelativeTime(value)
    } else if (typeof value === 'object') {
      processed[key] = processRelativeTimes(value)
    } else {
      processed[key] = value
    }
  }
  
  return processed
}

// Process the raw mock data once at module load time
const mockData = processRelativeTimes(mockDataRaw)

/**
 * Transforms flat correlation data to nested structure expected by components
 * Converts: { correlationGroupId, correlationGroupName }
 * To: { correlationGroup: { groupId, groupName, ... } }
 * @param {Object} market - Market object with potential flat correlation data
 * @returns {Object} Market with nested correlationGroup structure
 */
function transformCorrelationData(market) {
  if (market.correlationGroupId && !market.correlationGroup) {
    return {
      ...market,
      correlationGroup: {
        groupId: market.correlationGroupId,
        groupName: market.correlationGroupName || market.correlationGroupId,
        groupDescription: '',
        category: market.category || 'other',
        creator: null,
        active: true
      }
    }
  }
  return market
}

/**
 * Gets all mock markets
 * @returns {Array} Array of market objects
 */
export function getMockMarkets() {
  const markets = mockData.markets || []
  return markets.map(transformCorrelationData)
}

/**
 * Gets mock markets filtered by category
 * @param {string} category - The category to filter by
 * @returns {Array} Array of market objects
 */
export function getMockMarketsByCategory(category) {
  const markets = getMockMarkets()
  return markets.filter(market => market.category === category)
}

/**
 * Gets a single mock market by ID
 * @param {number} id - The market ID
 * @returns {Object|null} The market object or null if not found
 */
export function getMockMarketById(id) {
  const markets = getMockMarkets()
  return markets.find(market => market.id === id) || null
}

/**
 * Gets all mock proposals
 * @returns {Array} Array of proposal objects
 */
export function getMockProposals() {
  return mockData.proposals || []
}

/**
 * Gets all mock positions
 * @returns {Array} Array of position objects
 */
export function getMockPositions() {
  return mockData.positions || []
}

/**
 * Gets all mock welfare metrics
 * @returns {Array} Array of welfare metric objects
 */
export function getMockWelfareMetrics() {
  return mockData.welfareMetrics || []
}

/**
 * Gets all unique categories from markets
 * @returns {Array} Array of unique category strings
 */
export function getMockCategories() {
  const markets = getMockMarkets()
  const categories = new Set(markets.map(m => m.category))
  return Array.from(categories).sort()
}

/**
 * Gets markets by correlation group
 * @param {string} correlationGroupId - The correlation group ID
 * @returns {Array} Array of market objects in the same correlation group
 */
export function getMockMarketsByCorrelationGroup(correlationGroupId) {
  const markets = getMockMarkets()
  return markets.filter(market => market.correlationGroupId === correlationGroupId)
}
