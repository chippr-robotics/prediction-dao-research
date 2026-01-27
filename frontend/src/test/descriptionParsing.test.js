/**
 * @fileoverview Tests for description parsing utilities used in market cards and panels
 * Tests the functions that handle both old (concatenated) and new (separate fields) formats
 */

import { describe, it, expect } from 'vitest'

/**
 * getShortDescription - extracts text before **Description:** marker
 * Copied from ModernMarketCard.jsx for testing
 */
function getShortDescription(description) {
  if (!description) return ''

  // Find text before **Description:** marker
  const descriptionMarkerPattern = /\*\*[Dd]escription:?\*\*/
  const match = description.match(descriptionMarkerPattern)

  if (match) {
    // Return only the text before the **Description:** marker
    const beforeMarker = description.substring(0, match.index).trim()
    return beforeMarker
  }

  // If no marker found, return the full description (trimmed)
  return description.trim()
}

/**
 * parseDescription - extracts question and detailed description
 * Copied from MarketDetailsPanel.jsx for testing
 */
function parseDescription(description, resolutionCriteria) {
  // If resolutionCriteria is provided separately, use the new format
  if (resolutionCriteria) {
    return {
      question: description || '',
      detailedDescription: resolutionCriteria
    }
  }

  // Handle old concatenated format: "Question **Description:** Detailed description"
  if (description) {
    const descriptionMarkerPattern = /\*\*[Dd]escription:?\*\*:?\s*/
    const match = description.match(descriptionMarkerPattern)

    if (match) {
      const question = description.substring(0, match.index).trim()
      const detailedDescription = description.substring(match.index + match[0].length).trim()
      return { question, detailedDescription }
    }

    // No marker found, treat entire description as question
    return { question: description, detailedDescription: '' }
  }

  return { question: '', detailedDescription: '' }
}

describe('getShortDescription (ModernMarketCard)', () => {
  it('should return text before **Description:** marker', () => {
    const input = 'Will it snow in Houston before February 28th? **Description:** This market will resolve true if snow is reported by the NWS'
    const result = getShortDescription(input)
    expect(result).toBe('Will it snow in Houston before February 28th?')
  })

  it('should handle lowercase **description:**', () => {
    const input = 'Question text **description:** Detailed info'
    const result = getShortDescription(input)
    expect(result).toBe('Question text')
  })

  it('should handle **Description** without colon', () => {
    const input = 'Question text **Description** Detailed info'
    const result = getShortDescription(input)
    expect(result).toBe('Question text')
  })

  it('should return full description when no marker present', () => {
    const input = 'Simple question without marker'
    const result = getShortDescription(input)
    expect(result).toBe('Simple question without marker')
  })

  it('should return empty string for null input', () => {
    expect(getShortDescription(null)).toBe('')
  })

  it('should return empty string for undefined input', () => {
    expect(getShortDescription(undefined)).toBe('')
  })

  it('should return empty string for empty string input', () => {
    expect(getShortDescription('')).toBe('')
  })

  it('should trim whitespace from result', () => {
    const input = '  Question with spaces   **Description:** Details'
    const result = getShortDescription(input)
    expect(result).toBe('Question with spaces')
  })
})

describe('parseDescription (MarketDetailsPanel)', () => {
  describe('new format (separate resolutionCriteria field)', () => {
    it('should use separate fields when resolutionCriteria is provided', () => {
      const result = parseDescription('Short question', 'Detailed resolution criteria')
      expect(result.question).toBe('Short question')
      expect(result.detailedDescription).toBe('Detailed resolution criteria')
    })

    it('should handle empty description with resolutionCriteria', () => {
      const result = parseDescription('', 'Resolution criteria only')
      expect(result.question).toBe('')
      expect(result.detailedDescription).toBe('Resolution criteria only')
    })

    it('should handle null description with resolutionCriteria', () => {
      const result = parseDescription(null, 'Resolution criteria only')
      expect(result.question).toBe('')
      expect(result.detailedDescription).toBe('Resolution criteria only')
    })
  })

  describe('old format (concatenated with **Description:** marker)', () => {
    it('should parse concatenated description with **Description:** marker', () => {
      const input = 'Will it snow in Houston? **Description:** Market resolves true if NWS reports snow'
      const result = parseDescription(input, null)
      expect(result.question).toBe('Will it snow in Houston?')
      expect(result.detailedDescription).toBe('Market resolves true if NWS reports snow')
    })

    it('should handle lowercase **description:**', () => {
      const input = 'Question **description:** Details'
      const result = parseDescription(input, null)
      expect(result.question).toBe('Question')
      expect(result.detailedDescription).toBe('Details')
    })

    it('should handle **Description:** with extra colon after', () => {
      const input = 'Question **Description:**: Details'
      const result = parseDescription(input, null)
      expect(result.question).toBe('Question')
      expect(result.detailedDescription).toBe('Details')
    })

    it('should handle extra whitespace around marker', () => {
      const input = 'Question   **Description:**   Details with spaces'
      const result = parseDescription(input, null)
      expect(result.question).toBe('Question')
      expect(result.detailedDescription).toBe('Details with spaces')
    })
  })

  describe('no marker format', () => {
    it('should treat entire description as question when no marker', () => {
      const result = parseDescription('Simple question without marker', null)
      expect(result.question).toBe('Simple question without marker')
      expect(result.detailedDescription).toBe('')
    })

    it('should handle undefined resolutionCriteria', () => {
      const result = parseDescription('Question only', undefined)
      expect(result.question).toBe('Question only')
      expect(result.detailedDescription).toBe('')
    })
  })

  describe('edge cases', () => {
    it('should return empty strings for null/undefined inputs', () => {
      const result = parseDescription(null, null)
      expect(result.question).toBe('')
      expect(result.detailedDescription).toBe('')
    })

    it('should return empty strings for undefined inputs', () => {
      const result = parseDescription(undefined, undefined)
      expect(result.question).toBe('')
      expect(result.detailedDescription).toBe('')
    })

    it('should handle empty string description', () => {
      const result = parseDescription('', null)
      expect(result.question).toBe('')
      expect(result.detailedDescription).toBe('')
    })

    it('should prioritize resolutionCriteria over parsing concatenated format', () => {
      // If resolutionCriteria is provided, don't parse the description for markers
      const input = 'Question **Description:** Old detail'
      const result = parseDescription(input, 'New resolution criteria')
      expect(result.question).toBe('Question **Description:** Old detail')
      expect(result.detailedDescription).toBe('New resolution criteria')
    })
  })
})
