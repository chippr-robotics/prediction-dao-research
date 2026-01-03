import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import Dashboard from '../components/fairwins/Dashboard'
import { useWeb3 } from '../hooks/useWeb3'
import { getMockMarkets } from '../utils/mockDataLoader'

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}))

// Mock the hooks and utilities
vi.mock('../hooks/useWeb3')
vi.mock('../utils/mockDataLoader')

// Mock D3 to avoid rendering issues in test environment
vi.mock('d3', () => {
  const createChainableMock = () => {
    vi.fn(() => chainable)
    const chainable = {
      attr: vi.fn(() => chainable),
      append: vi.fn(() => chainable),
      selectAll: vi.fn(() => chainable),
      data: vi.fn(() => chainable),
      join: vi.fn(() => chainable),
      on: vi.fn(() => chainable),
      text: vi.fn(() => chainable),
      call: vi.fn(() => chainable),
      remove: vi.fn(() => chainable),
      transition: vi.fn(() => chainable),
      duration: vi.fn(() => chainable),
      select: vi.fn(() => chainable),
      style: vi.fn(() => chainable),
      datum: vi.fn(() => chainable),
      enter: vi.fn(() => chainable),
      exit: vi.fn(() => chainable),
      merge: vi.fn(() => chainable),
      classed: vi.fn(() => chainable),
      each: vi.fn(() => chainable)
    }
    return chainable
  }

  const mockAxis = () => {
    const fn = vi.fn()
    fn.ticks = vi.fn(() => fn)
    fn.tickFormat = vi.fn(() => fn)
    fn.tickSize = vi.fn(() => fn)
    return fn
  }

  const mockScale = () => {
    const scale = vi.fn((x) => x)  // Make it callable
    scale.domain = vi.fn(() => scale)
    scale.range = vi.fn(() => scale)
    scale.padding = vi.fn(() => scale)
    scale.bandwidth = vi.fn(() => 20)
    scale.call = vi.fn(() => scale)
    return scale
  }

  return {
    select: vi.fn(() => createChainableMock()),
  scaleOrdinal: vi.fn(mockScale),
  scaleLinear: vi.fn(mockScale),
  scaleTime: vi.fn(mockScale),
  scaleBand: vi.fn(mockScale),
  scaleSequential: vi.fn(() => ({
    domain: vi.fn(function() { return this }),
    interpolator: vi.fn(function() { return this })
  })),
  pie: vi.fn(() => {
    const fn = vi.fn(() => [])
    fn.value = vi.fn(() => fn)
    fn.sort = vi.fn(() => fn)
    fn.padAngle = vi.fn(() => fn)
    return fn
  }),
  arc: vi.fn(() => {
    const fn = vi.fn(() => '')
    fn.innerRadius = vi.fn(() => fn)
    fn.outerRadius = vi.fn(() => fn)
    fn.cornerRadius = vi.fn(() => fn)
    fn.startAngle = vi.fn(() => fn)
    fn.endAngle = vi.fn(() => fn)
    return fn
  }),
  stack: vi.fn(() => {
    const fn = vi.fn(() => [])
    fn.keys = vi.fn(() => fn)
    fn.offset = vi.fn(() => fn)
    return fn
  }),
  area: vi.fn(() => {
    const fn = vi.fn(() => '')
    fn.x = vi.fn(() => fn)
    fn.y0 = vi.fn(() => fn)
    fn.y1 = vi.fn(() => fn)
    fn.curve = vi.fn(() => fn)
    return fn
  }),
  line: vi.fn(() => {
    const fn = vi.fn(() => '')
    fn.x = vi.fn(() => fn)
    fn.y = vi.fn(() => fn)
    fn.curve = vi.fn(() => fn)
    return fn
  }),
  axisBottom: vi.fn(mockAxis),
  axisLeft: vi.fn(mockAxis),
  timeFormat: vi.fn(() => vi.fn()),
  extent: vi.fn(() => [0, 100]),
  min: vi.fn(() => 0),
  max: vi.fn(() => 100),
  interpolateRgbBasis: vi.fn(() => vi.fn()),
  stackOffsetWiggle: vi.fn(),
  curveBasis: vi.fn(),
  curveMonotoneX: vi.fn()
  }
})

describe('Dashboard Component', () => {
  const mockMarkets = [
    {
      id: 0,
      proposalTitle: 'Test Market 1',
      category: 'sports',
      passTokenPrice: '0.55',
      failTokenPrice: '0.45',
      totalLiquidity: '10000',
      tradingEndTime: new Date(Date.now() + 86400000).toISOString(),
      status: 'Active',
      volume24h: '1000',
      tradesCount: 50,
      uniqueTraders: 25
    },
    {
      id: 1,
      proposalTitle: 'Test Market 2',
      category: 'politics',
      passTokenPrice: '0.42',
      failTokenPrice: '0.58',
      totalLiquidity: '15000',
      tradingEndTime: new Date(Date.now() + 172800000).toISOString(),
      status: 'Active',
      volume24h: '1500',
      tradesCount: 75,
      uniqueTraders: 35
    },
    {
      id: 2,
      proposalTitle: 'Test Market 3',
      category: 'finance',
      passTokenPrice: '0.68',
      failTokenPrice: '0.32',
      totalLiquidity: '20000',
      tradingEndTime: new Date(Date.now() + 259200000).toISOString(),
      status: 'Active',
      volume24h: '2000',
      tradesCount: 100,
      uniqueTraders: 45
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Setup default mock implementations
    useWeb3.mockReturnValue({
      account: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true
    })
    
    getMockMarkets.mockReturnValue(mockMarkets)
  })

  describe('Rendering', () => {
    it('should render loading state initially', () => {
      render(<Dashboard />)
      expect(screen.getByText('Loading market data...')).toBeInTheDocument()
    })

    it('should render dashboard header after loading', async () => {
      render(<Dashboard />)
      
      await waitFor(() => {
        expect(screen.getByText('Market Overview')).toBeInTheDocument()
      })
    })

    it('should render subtitle', async () => {
      render(<Dashboard />)
      
      await waitFor(() => {
        expect(screen.getByText('Real-time insights across all prediction markets')).toBeInTheDocument()
      })
    })


  })



  describe('Chart Sections', () => {
    it('should render market distribution chart section', async () => {
      render(<Dashboard />)
      
      await waitFor(() => {
        expect(screen.getByText('Market Distribution by Category')).toBeInTheDocument()
      })
    })

    it('should render platform health section', async () => {
      render(<Dashboard />)
      
      await waitFor(() => {
        expect(screen.getByText('Platform Health')).toBeInTheDocument()
      })
    })

    it('should render category performance section', async () => {
      render(<Dashboard />)
      
      await waitFor(() => {
        expect(screen.getByText('Category Performance')).toBeInTheDocument()
      })
    })

    it('should render liquidity flow section', async () => {
      render(<Dashboard />)
      
      await waitFor(() => {
        expect(screen.getByText('Liquidity Flow')).toBeInTheDocument()
      })
    })

    it('should render trading activity section', async () => {
      render(<Dashboard />)
      
      await waitFor(() => {
        expect(screen.getByText('Trading Activity')).toBeInTheDocument()
      })
    })

    it('should render market sentiment section', async () => {
      render(<Dashboard />)
      
      await waitFor(() => {
        expect(screen.getByText('Market Sentiment')).toBeInTheDocument()
      })
    })
  })

  describe('Bottom Section', () => {
    it('should render trending markets section', async () => {
      render(<Dashboard />)
      
      await waitFor(() => {
        expect(screen.getByText(/Trending Markets/)).toBeInTheDocument()
      })
    })

    it('should render recent activity section', async () => {
      render(<Dashboard />)
      
      await waitFor(() => {
        expect(screen.getByText(/Recent Activity/)).toBeInTheDocument()
      })
    })

    it('should display View All button in trending section', async () => {
      render(<Dashboard />)
      
      await waitFor(() => {
        expect(screen.getByText('View All →')).toBeInTheDocument()
      })
    })
  })

  describe('Data Loading', () => {
    it('should call getMockMarkets on mount', async () => {
      render(<Dashboard />)
      
      await waitFor(() => {
        expect(getMockMarkets).toHaveBeenCalled()
      })
    })

    it('should handle empty markets gracefully', async () => {
      getMockMarkets.mockReturnValue([])
      
      render(<Dashboard />)
      
      await waitFor(() => {
        expect(screen.getByText('Market Overview')).toBeInTheDocument()
      })
    })

    it('should handle loading errors gracefully', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      getMockMarkets.mockImplementation(() => {
        throw new Error('Failed to load markets')
      })
      
      render(<Dashboard />)
      
      await waitFor(() => {
        expect(screen.getByText('Market Overview')).toBeInTheDocument()
      })
      
      consoleError.mockRestore()
    })
  })

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', async () => {
      render(<Dashboard />)
      
      await waitFor(() => {
        const h1 = screen.getByRole('heading', { level: 1 })
        expect(h1).toHaveTextContent('Market Overview')
      })
    })

    it('should have accessible trending market items', async () => {
      render(<Dashboard />)
      
      await waitFor(() => {
        const trendingItems = screen.queryAllByRole('button')
        expect(trendingItems.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Responsive Design', () => {
    it('should render all sections on desktop', async () => {
      render(<Dashboard />)
      
      await waitFor(() => {
        expect(screen.getByText('Market Distribution by Category')).toBeInTheDocument()
        expect(screen.getByText('Platform Health')).toBeInTheDocument()
        expect(screen.getByText('Category Performance')).toBeInTheDocument()
      })
    })
  })

  describe('Categories', () => {
    it('should initialize with predefined categories', async () => {
      render(<Dashboard />)
      
      await waitFor(() => {
        // Categories should be used in the chart rendering
        expect(getMockMarkets).toHaveBeenCalled()
      })
    })
  })

  describe('Metrics Calculation', () => {
    it('should handle markets with missing data', async () => {
      getMockMarkets.mockReturnValue([
        {
          id: 0,
          proposalTitle: 'Incomplete Market',
          category: 'sports',
          status: 'Active'
        }
      ])
      
      render(<Dashboard />)
      
      await waitFor(() => {
        expect(screen.getByText('Market Overview')).toBeInTheDocument()
      })
    })
  })
})
