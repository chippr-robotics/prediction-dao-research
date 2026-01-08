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

// Mock fetch globally to prevent real network requests
global.fetch = vi.fn().mockImplementation(async (url, options) => {
  // Mock CoinGecko API for price conversion
  if (url.includes('coingecko.com')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        'ethereum-classic': {
          usd: 25.50
        }
      })
    }
  }
  
  // Mock any RPC endpoints
  if (url.includes('rpc') || url.includes('etccooperative')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: '2.0',
        id: 1,
        result: '0x0de0b6b3a7640000' // 1 ETC in wei
      })
    }
  }
  
  // Default mock response
  return {
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => ''
  }
})

// Mock ethers.js providers to prevent real network calls
vi.mock('ethers', async () => {
  const actual = await vi.importActual('ethers')
  
  // Create mock provider that returns valid responses
  class MockBrowserProvider {
    constructor() {}
    
    async getBalance() {
      return actual.ethers.parseEther('1.0')
    }
    
    async getNetwork() {
      return {
        chainId: 61n,
        name: 'ethereum-classic'
      }
    }
    
    async getBlockNumber() {
      return 1000000
    }
    
    getSigner() {
      return {
        getAddress: async () => '0x1234567890123456789012345678901234567890',
        signMessage: async () => '0xmocksignature'
      }
    }
  }
  
  class MockJsonRpcProvider {
    constructor() {}
    
    async getBalance() {
      return actual.ethers.parseEther('1.0')
    }
    
    async getNetwork() {
      return {
        chainId: 61n,
        name: 'ethereum-classic'
      }
    }
    
    async getBlockNumber() {
      return 1000000
    }
    
    async call() {
      // Return a mock response for contract calls (1000 tokens with 18 decimals)
      return actual.ethers.toBeHex(actual.ethers.parseEther('1000'))
    }
  }
  
  // Mock Contract class to return mock values
  class MockContract {
    constructor(address, abi, provider) {
      this.address = address
      this.abi = abi
      this.provider = provider
    }
    
    async balanceOf() {
      return actual.ethers.parseEther('1000')
    }
    
    async allowance() {
      return actual.ethers.parseEther('1000')
    }
    
    async totalSupply() {
      return actual.ethers.parseEther('1000000')
    }
    
    async hasRole() {
      return false
    }
    
    async getRoleMember() {
      return '0x0000000000000000000000000000000000000000'
    }
    
    async getRoleMemberCount() {
      return 0n
    }
  }
  
  return {
    ...actual,
    BrowserProvider: MockBrowserProvider,
    JsonRpcProvider: MockJsonRpcProvider,
    Contract: MockContract
  }
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
window.ethereum = window.ethereum || {}

// Create a mock that returns proper responses for ethers.js
const mockEthereumProvider = {
  request: vi.fn().mockImplementation(async ({ method, params }) => {
    switch (method) {
      case 'eth_requestAccounts':
      case 'eth_accounts':
        return ['0x1234567890123456789012345678901234567890']
      case 'eth_chainId':
        return '0x3d' // Chain ID 61 (ETC)
      case 'eth_getBalance':
        // Return a valid hex string for 1 ETC in wei (1e18)
        return '0x0de0b6b3a7640000'
      case 'eth_call':
        // Return a valid hex response for contract calls (simulating balance of 1000 tokens with 18 decimals)
        return '0x00000000000000000000000000000000000000000000003635c9adc5dea00000'
      case 'net_version':
        return '61'
      case 'eth_blockNumber':
        return '0x1000000'
      default:
        return '0x0'
    }
  }),
  on: vi.fn(),
  removeListener: vi.fn(),
  isMetaMask: true,
  selectedAddress: '0x1234567890123456789012345678901234567890',
  // Mock methods needed by ethers BrowserProvider
  send: vi.fn().mockImplementation(async (method, params) => {
    switch (method) {
      case 'eth_accounts':
        return ['0x1234567890123456789012345678901234567890']
      case 'eth_getBalance':
        return '0x0de0b6b3a7640000'
      case 'eth_call':
        return '0x00000000000000000000000000000000000000000000003635c9adc5dea00000'
      case 'eth_chainId':
        return '0x3d'
      case 'net_version':
        return '61'
      case 'eth_blockNumber':
        return '0x1000000'
      default:
        return '0x0'
    }
  })
}

window.ethereum = mockEthereumProvider

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
