import { describe, it, expect } from 'vitest'
import { 
  SUBCATEGORIES, 
  getSubcategoriesForCategory, 
  getAllSubcategories, 
  findSubcategoryById 
} from '../config/subcategories'

describe('subcategories configuration', () => {
  describe('SUBCATEGORIES constant', () => {
    it('should have subcategories for all main categories', () => {
      expect(SUBCATEGORIES).toHaveProperty('sports')
      expect(SUBCATEGORIES).toHaveProperty('politics')
      expect(SUBCATEGORIES).toHaveProperty('finance')
      expect(SUBCATEGORIES).toHaveProperty('tech')
      expect(SUBCATEGORIES).toHaveProperty('crypto')
      expect(SUBCATEGORIES).toHaveProperty('pop-culture')
    })

    it('should have sports subcategories including NFL, NBA, etc.', () => {
      const sportsSubcats = SUBCATEGORIES.sports
      const ids = sportsSubcats.map(s => s.id)
      
      expect(ids).toContain('nfl')
      expect(ids).toContain('nba')
      expect(ids).toContain('college-football')
      expect(ids).toContain('formula-1')
      expect(ids).toContain('nascar')
      expect(ids).toContain('motogp')
    })

    it('should have all subcategories with required fields', () => {
      Object.values(SUBCATEGORIES).flat().forEach(subcat => {
        expect(subcat).toHaveProperty('id')
        expect(subcat).toHaveProperty('name')
        expect(subcat).toHaveProperty('parent')
        expect(typeof subcat.id).toBe('string')
        expect(typeof subcat.name).toBe('string')
        expect(typeof subcat.parent).toBe('string')
      })
    })

    it('should have unique subcategory IDs', () => {
      const allSubcats = Object.values(SUBCATEGORIES).flat()
      const ids = allSubcats.map(s => s.id)
      const uniqueIds = [...new Set(ids)]
      
      expect(ids.length).toBe(uniqueIds.length)
    })
  })

  describe('getSubcategoriesForCategory', () => {
    it('should return subcategories for sports category', () => {
      const result = getSubcategoriesForCategory('sports')
      
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
      expect(result[0]).toHaveProperty('id')
      expect(result[0]).toHaveProperty('name')
      expect(result[0]).toHaveProperty('parent', 'sports')
    })

    it('should return subcategories for finance category', () => {
      const result = getSubcategoriesForCategory('finance')
      const ids = result.map(s => s.id)
      
      expect(ids).toContain('stocks')
      expect(ids).toContain('interest-rates')
      expect(ids).toContain('corporate')
    })

    it('should return empty array for unknown category', () => {
      const result = getSubcategoriesForCategory('unknown-category')
      
      expect(result).toEqual([])
    })

    it('should return empty array for null/undefined', () => {
      expect(getSubcategoriesForCategory(null)).toEqual([])
      expect(getSubcategoriesForCategory(undefined)).toEqual([])
    })
  })

  describe('getAllSubcategories', () => {
    it('should return all subcategories from all categories', () => {
      const result = getAllSubcategories()
      
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(30) // Should have many subcategories
    })

    it('should include subcategories from all categories', () => {
      const result = getAllSubcategories()
      const ids = result.map(s => s.id)
      
      // Check for subcategories from different categories
      expect(ids).toContain('nfl') // sports
      expect(ids).toContain('us-elections') // politics
      expect(ids).toContain('stocks') // finance
      expect(ids).toContain('ai') // tech
      expect(ids).toContain('bitcoin') // crypto
      expect(ids).toContain('movies') // pop-culture
    })

    it('should return flattened array with correct structure', () => {
      const result = getAllSubcategories()
      
      result.forEach(subcat => {
        expect(subcat).toHaveProperty('id')
        expect(subcat).toHaveProperty('name')
        expect(subcat).toHaveProperty('parent')
      })
    })
  })

  describe('findSubcategoryById', () => {
    it('should find subcategory by ID', () => {
      const result = findSubcategoryById('nfl')
      
      expect(result).not.toBeNull()
      expect(result.id).toBe('nfl')
      expect(result.name).toBe('NFL')
      expect(result.parent).toBe('sports')
    })

    it('should find subcategory from different category', () => {
      const result = findSubcategoryById('bitcoin')
      
      expect(result).not.toBeNull()
      expect(result.id).toBe('bitcoin')
      expect(result.name).toBe('Bitcoin')
      expect(result.parent).toBe('crypto')
    })

    it('should return null for non-existent ID', () => {
      const result = findSubcategoryById('non-existent-id')
      
      expect(result).toBeNull()
    })

    it('should return null for null/undefined ID', () => {
      expect(findSubcategoryById(null)).toBeNull()
      expect(findSubcategoryById(undefined)).toBeNull()
    })

    it('should be case sensitive', () => {
      const result = findSubcategoryById('NFL') // uppercase
      
      expect(result).toBeNull() // Should not find it since IDs are lowercase
    })
  })

  describe('subcategory data integrity', () => {
    it('should have correct parent references', () => {
      Object.entries(SUBCATEGORIES).forEach(([category, subcats]) => {
        subcats.forEach(subcat => {
          expect(subcat.parent).toBe(category)
        })
      })
    })

    it('should have at least 3 subcategories per category', () => {
      Object.entries(SUBCATEGORIES).forEach(([, subcats]) => {
        expect(subcats.length).toBeGreaterThanOrEqual(3)
      })
    })

    it('should have descriptive names for subcategories', () => {
      const allSubcats = getAllSubcategories()
      
      allSubcats.forEach(subcat => {
        expect(subcat.name.length).toBeGreaterThan(1)
        expect(subcat.name.trim()).toBe(subcat.name) // No leading/trailing whitespace
      })
    })
  })
})
