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

// Mock wagmi hooks for WalletProvider
vi.mock('wagmi', () => ({
  useAccount: vi.fn(() => ({
    address: '0x1234567890123456789012345678901234567890',
    isConnected: true
  })),
  useConnect: vi.fn(() => ({
    connect: vi.fn(),
    connectors: [{ id: 'injected', name: 'MetaMask' }]
  })),
  useDisconnect: vi.fn(() => ({
    disconnect: vi.fn()
  })),
  useChainId: vi.fn(() => 61), // ETC mainnet
  useSwitchChain: vi.fn(() => ({
    switchChain: vi.fn()
  })),
  createConfig: vi.fn(),
  http: vi.fn()
}))

// Mock wagmi connectors
vi.mock('wagmi/connectors', () => ({
  injected: vi.fn(() => ({ id: 'injected', name: 'MetaMask' })),
  walletConnect: vi.fn(() => ({ id: 'walletConnect', name: 'WalletConnect' }))
}))

// Mock window.ethereum for Web3 tests
global.window = global.window || {}

// Create a mock that returns proper responses for ethers.js
const mockEthereumProvider = {
  request: vi.fn().mockImplementation(async ({ method }) => {
    switch (method) {
      case 'eth_requestAccounts':
      case 'eth_accounts':
        return ['0x1234567890123456789012345678901234567890']
      case 'eth_chainId':
        return '0x3d' // Chain ID 61 (ETC)
      default:
        return null
    }
  }),
  on: vi.fn(),
  removeListener: vi.fn(),
  isMetaMask: true,
  selectedAddress: '0x1234567890123456789012345678901234567890',
  // Mock methods needed by ethers BrowserProvider
  send: vi.fn().mockImplementation(async (method, params) => {
    if (method === 'eth_accounts') {
      return ['0x1234567890123456789012345678901234567890']
    }
    return {}
  })
}

global.window.ethereum = mockEthereumProvider

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

// Mock HTMLCanvasElement.getContext for QR code and accessibility tests
HTMLCanvasElement.prototype.getContext = function(contextType) {
  if (contextType === '2d') {
    return {
      fillStyle: '',
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(() => ({ data: [] })),
      putImageData: vi.fn(),
      createImageData: vi.fn(() => []),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      measureText: vi.fn(() => ({ width: 0 })),
      transform: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
    }
  }
  return null
}
