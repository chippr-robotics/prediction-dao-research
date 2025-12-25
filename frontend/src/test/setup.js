import { expect, afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import * as matchers from 'vitest-axe/matchers'

// Extend expect with axe matchers
expect.extend(matchers)

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock window.ethereum for Web3 tests
global.window = global.window || {}
global.window.ethereum = {
  request: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  isMetaMask: true,
}

// Mock matchMedia for responsive design tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Create clipboard mock
const writeTextMock = vi.fn(() => Promise.resolve())
const readTextMock = vi.fn(() => Promise.resolve(''))

// Mock clipboard API globally
Object.defineProperty(navigator, 'clipboard', {
  writable: true,
  configurable: true,
  value: {
    writeText: writeTextMock,
    readText: readTextMock,
  },
})

// Reset clipboard mocks before each test
beforeEach(() => {
  writeTextMock.mockClear()
  readTextMock.mockClear()
})
