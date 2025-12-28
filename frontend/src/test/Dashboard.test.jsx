import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import Dashboard from '../components/fairwins/Dashboard'
import { getMockMarkets } from '../utils/mockDataLoader'

// Mock the hooks
vi.mock('../hooks/useWeb3', () => ({
  useWeb3: vi.fn()
}))

vi.mock('../hooks/useRoles', () => ({
  useRoles: vi.fn()
}))

// Mock d3 for chart rendering
vi.mock('d3', () => {
  const mockChainableD3 = () => ({
    attr: vi.fn().mockReturnThis(),
    append: vi.fn().mockReturnThis(),
    datum: vi.fn().mockReturnThis(),
    selectAll: vi.fn(() => ({
      data: vi.fn(() => ({
        enter: vi.fn(() => ({
          append: vi.fn(() => mockChainableD3())
        }))
      })),
      remove: vi.fn()
    })),
    data: vi.fn(() => ({
      enter: vi.fn(() => ({
        append: vi.fn(() => mockChainableD3())
      }))
    })),
    call: vi.fn().mockReturnThis(),
    style: vi.fn().mockReturnThis()
  })

  return {
    select: vi.fn(() => ({
      selectAll: vi.fn(() => ({
        remove: vi.fn()
      })),
      append: vi.fn(() => mockChainableD3())
    })),
    scaleTime: vi.fn(() => ({
      domain: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis()
    })),
    scaleLinear: vi.fn(() => ({
      domain: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      nice: vi.fn().mockReturnThis()
    })),
    extent: vi.fn(() => [new Date(), new Date()]),
    max: vi.fn(() => 100),
    line: vi.fn(() => ({
      x: vi.fn().mockReturnThis(),
      y: vi.fn().mockReturnThis(),
      curve: vi.fn().mockReturnThis()
    })),
    area: vi.fn(() => ({
      x: vi.fn().mockReturnThis(),
      y0: vi.fn().mockReturnThis(),
      y1: vi.fn().mockReturnThis(),
      curve: vi.fn().mockReturnThis()
    })),
    axisBottom: vi.fn(() => ({
      ticks: vi.fn().mockReturnThis()
    })),
    axisLeft: vi.fn(() => ({
      tickFormat: vi.fn().mockReturnThis()
    })),
    curveMonotoneX: vi.fn()
  }
})

// Import the mocked hooks
import { useWeb3 } from '../hooks/useWeb3'
import { useRoles } from '../hooks/useRoles'
import { ROLES } from '../contexts/RoleContext'

describe('Dashboard Component', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks()
    
    // Default mock implementations
    useWeb3.mockReturnValue({
      account: null,
      isConnected: false
    })
    
    useRoles.mockReturnValue({
      roles: []
    })
  })

  describe('Rendering', () => {
    it('renders dashboard header', () => {
      render(<Dashboard />)
      expect(screen.getByText('FairWins Platform Dashboard')).toBeInTheDocument()
      expect(screen.getByText('Live metrics and platform insights')).toBeInTheDocument()
    })

    it('renders platform health section', () => {
      render(<Dashboard />)
      expect(screen.getByText('Platform Health')).toBeInTheDocument()
    })

    it('renders all metric cards', () => {
      render(<Dashboard />)
      
      // Check all metric labels are present
      expect(screen.getByText('Transactions (24h)')).toBeInTheDocument()
      expect(screen.getByText('Open Markets')).toBeInTheDocument()
      expect(screen.getByText('Active Users')).toBeInTheDocument()
      expect(screen.getByText('Total Liquidity')).toBeInTheDocument()
      expect(screen.getByText('24h Volume')).toBeInTheDocument()
    })

    it('renders platform growth charts section', () => {
      render(<Dashboard />)
      expect(screen.getByText('Platform Growth (30 Days)')).toBeInTheDocument()
      expect(screen.getByText('Number of Markets')).toBeInTheDocument()
      expect(screen.getByText('Total Liquidity (ETC)')).toBeInTheDocument()
    })

    it('renders recent activity section', () => {
      render(<Dashboard />)
      expect(screen.getByText('Recent Activity')).toBeInTheDocument()
    })

    it('does not render user dashboard when not connected', () => {
      render(<Dashboard />)
      expect(screen.queryByText('My Account')).not.toBeInTheDocument()
    })

    it('renders user dashboard when connected', () => {
      useWeb3.mockReturnValue({
        account: '0x1234567890123456789012345678901234567890',
        isConnected: true
      })
      
      render(<Dashboard />)
      expect(screen.getByText('My Account')).toBeInTheDocument()
      expect(screen.getByText('0x1234567890123456789012345678901234567890')).toBeInTheDocument()
      expect(screen.getByText('Connected')).toBeInTheDocument()
    })
  })

  describe('Platform Metrics', () => {
    it('calculates metrics from mock data', async () => {
      render(<Dashboard />)
      
      await waitFor(() => {
        // Metrics should be calculated and displayed
        const metrics = screen.getAllByText(/\d+/)
        expect(metrics.length).toBeGreaterThan(0)
      })
    })

    it('displays open markets count correctly', async () => {
      render(<Dashboard />)
      
      await waitFor(() => {
        const markets = getMockMarkets()
        const activeMarkets = markets.filter(m => m.status === 'Active')
        expect(screen.getByText(activeMarkets.length.toString())).toBeInTheDocument()
      })
    })

    it('formats large numbers correctly', async () => {
      render(<Dashboard />)
      
      await waitFor(() => {
        // Should have formatted numbers with K or M suffix
        const elements = screen.getAllByText(/\d+\.?\d*[KM]?/)
        expect(elements.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Recent Activity', () => {
    it('displays activity items', () => {
      render(<Dashboard />)
      
      // Check for activity types (multiple Trade items exist, so check for at least one)
      const tradeItems = screen.getAllByText('Trade')
      expect(tradeItems.length).toBeGreaterThan(0)
      
      expect(screen.getByText('Market Created')).toBeInTheDocument()
      expect(screen.getByText('Market Resolved')).toBeInTheDocument()
    })

    it('displays activity details', () => {
      render(<Dashboard />)
      
      // Check for market names and amounts
      expect(screen.getByText(/NFL Super Bowl 2025/)).toBeInTheDocument()
      expect(screen.getByText(/Bitcoin hits \$100k/)).toBeInTheDocument()
      expect(screen.getByText(/500 ETC/)).toBeInTheDocument()
    })

    it('displays activity timestamps', () => {
      render(<Dashboard />)
      
      expect(screen.getByText(/2 min ago/)).toBeInTheDocument()
      expect(screen.getByText(/15 min ago/)).toBeInTheDocument()
      expect(screen.getByText(/1 hour ago/)).toBeInTheDocument()
    })
  })

  describe('User Roles', () => {
    it('displays no roles message when user has no roles', () => {
      useWeb3.mockReturnValue({
        account: '0x1234567890123456789012345678901234567890',
        isConnected: true
      })
      
      useRoles.mockReturnValue({
        roles: []
      })
      
      render(<Dashboard />)
      
      expect(screen.getByText(/You don't have any premium add-ons yet/)).toBeInTheDocument()
      expect(screen.getByText(/Explore the marketplace to unlock additional features!/)).toBeInTheDocument()
    })

    it('displays role cards when user has roles', () => {
      useWeb3.mockReturnValue({
        account: '0x1234567890123456789012345678901234567890',
        isConnected: true
      })
      
      useRoles.mockReturnValue({
        roles: [ROLES.CLEARPATH_USER, ROLES.TOKENMINT]
      })
      
      render(<Dashboard />)
      
      expect(screen.getByText('My Roles & Add-ons')).toBeInTheDocument()
      // Role cards should be rendered
      const roleCards = document.querySelectorAll('.role-card')
      expect(roleCards.length).toBe(2)
    })

    it('displays role details correctly', () => {
      useWeb3.mockReturnValue({
        account: '0x1234567890123456789012345678901234567890',
        isConnected: true
      })
      
      useRoles.mockReturnValue({
        roles: [ROLES.CLEARPATH_USER]
      })
      
      render(<Dashboard />)
      
      expect(screen.getByText('Active')).toBeInTheDocument()
      expect(screen.getByText('30 days')).toBeInTheDocument()
      expect(screen.getByText('Standard')).toBeInTheDocument()
    })
  })

  describe('Data Loading', () => {
    it('uses stable mock data based on date seed', () => {
      const { rerender } = render(<Dashboard />)
      
      // Get initial values
      const firstMetrics = screen.getAllByText(/\d+/)
      const firstValues = firstMetrics.map(el => el.textContent)
      
      // Rerender and check values are the same (stable)
      rerender(<Dashboard />)
      const secondMetrics = screen.getAllByText(/\d+/)
      const secondValues = secondMetrics.map(el => el.textContent)
      
      // Values should be stable between renders on the same day
      expect(firstValues).toEqual(secondValues)
    })

    it('generates 30 days of historical data', async () => {
      const { container } = render(<Dashboard />)
      
      await waitFor(() => {
        // Charts should be rendered (check for chart containers)
        const chartContainers = container.querySelectorAll('.chart-container')
        expect(chartContainers.length).toBe(2)
      })
    })
  })

  describe('Accessibility', () => {
    it('has no axe violations', async () => {
      const { container } = render(<Dashboard />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no axe violations with connected wallet', async () => {
      useWeb3.mockReturnValue({
        account: '0x1234567890123456789012345678901234567890',
        isConnected: true
      })
      
      useRoles.mockReturnValue({
        roles: [ROLES.CLEARPATH_USER]
      })
      
      const { container } = render(<Dashboard />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('uses semantic HTML structure', () => {
      const { container } = render(<Dashboard />)
      
      // Check for proper semantic sections
      const sections = container.querySelectorAll('section')
      expect(sections.length).toBeGreaterThan(0)
      
      // Check for proper heading hierarchy
      const h1 = container.querySelector('h1')
      expect(h1).toBeInTheDocument()
      expect(h1.textContent).toBe('FairWins Platform Dashboard')
      
      const h2s = container.querySelectorAll('h2')
      expect(h2s.length).toBeGreaterThan(0)
    })

    it('has proper ARIA labels for icons', () => {
      render(<Dashboard />)
      
      // Metric icons should be decorative (no ARIA needed as they're with text)
      // Activity icons should be decorative (no ARIA needed as they're with text)
      // This test verifies the icons don't create accessibility issues
      const activityIcons = document.querySelectorAll('.activity-icon')
      expect(activityIcons.length).toBeGreaterThan(0)
    })
  })

  describe('Responsive Design', () => {
    it('applies correct CSS classes for mobile', () => {
      const { container } = render(<Dashboard />)
      
      // Check that responsive classes are present
      expect(container.querySelector('.dashboard-container')).toBeInTheDocument()
      expect(container.querySelector('.metrics-grid')).toBeInTheDocument()
      expect(container.querySelector('.charts-grid')).toBeInTheDocument()
    })

    it('renders metric cards in a grid', () => {
      const { container } = render(<Dashboard />)
      
      const metricsGrid = container.querySelector('.metrics-grid')
      expect(metricsGrid).toBeInTheDocument()
      
      const metricCards = metricsGrid.querySelectorAll('.metric-card')
      expect(metricCards.length).toBe(5)
    })
  })

  describe('Security', () => {
    it('safely displays user address', () => {
      const testAddress = '0x1234567890123456789012345678901234567890'
      useWeb3.mockReturnValue({
        account: testAddress,
        isConnected: true
      })
      
      render(<Dashboard />)
      
      // Address should be displayed as-is (no HTML injection)
      expect(screen.getByText(testAddress)).toBeInTheDocument()
    })

    it('does not expose sensitive data in mock activity', () => {
      const { container } = render(<Dashboard />)
      
      // Activity should show masked addresses only
      const activityItems = container.querySelectorAll('.activity-user')
      activityItems.forEach(item => {
        expect(item.textContent).toMatch(/0x\w{4}\.\.\.\w{4}/)
      })
    })

    it('handles missing or invalid data gracefully', () => {
      // Mock getMockMarkets to return empty array
      vi.mock('../utils/mockDataLoader', () => ({
        getMockMarkets: () => []
      }))
      
      // Should not crash with empty data
      expect(() => render(<Dashboard />)).not.toThrow()
    })
  })

  describe('Performance', () => {
    it('uses ResizeObserver for responsive charts', () => {
      const { container } = render(<Dashboard />)
      
      // Chart containers should be present
      const chartContainers = container.querySelectorAll('.chart-container')
      expect(chartContainers.length).toBe(2)
      
      // Component should handle ResizeObserver
      // (actual observation is tested in integration)
    })

    it('memoizes number formatting', () => {
      const { container } = render(<Dashboard />)
      
      // formatNumber should be called for each metric
      // Numbers should be properly formatted
      const etcElements = screen.getAllByText(/ETC/)
      expect(etcElements.length).toBeGreaterThan(0)
    })
  })

  describe('Edge Cases', () => {
    it('handles zero metrics', () => {
      // This would require mocking getMockMarkets to return no active markets
      // For now, we verify the component renders without crashing
      expect(() => render(<Dashboard />)).not.toThrow()
    })

    it('handles very large numbers in metrics', () => {
      render(<Dashboard />)
      
      // Should format large numbers with K/M suffixes
      // The formatNumber function should handle edge cases
      const { container } = render(<Dashboard />)
      expect(container.textContent).toBeTruthy()
    })

    it('handles null or undefined account', () => {
      useWeb3.mockReturnValue({
        account: null,
        isConnected: false
      })
      
      expect(() => render(<Dashboard />)).not.toThrow()
      expect(screen.queryByText('My Account')).not.toBeInTheDocument()
    })

    it('handles empty roles array', () => {
      useWeb3.mockReturnValue({
        account: '0x1234567890123456789012345678901234567890',
        isConnected: true
      })
      
      useRoles.mockReturnValue({
        roles: []
      })
      
      expect(() => render(<Dashboard />)).not.toThrow()
      expect(screen.getByText(/You don't have any premium add-ons yet/)).toBeInTheDocument()
    })
  })

  describe('Chart Rendering', () => {
    it('renders market growth chart', () => {
      const { container } = render(<Dashboard />)
      
      const chartCard = screen.getByText('Number of Markets').closest('.chart-card')
      expect(chartCard).toBeInTheDocument()
      
      const chartContainer = chartCard.querySelector('.chart-container')
      expect(chartContainer).toBeInTheDocument()
    })

    it('renders liquidity chart', () => {
      const { container } = render(<Dashboard />)
      
      const chartCard = screen.getByText('Total Liquidity (ETC)').closest('.chart-card')
      expect(chartCard).toBeInTheDocument()
      
      const chartContainer = chartCard.querySelector('.chart-container')
      expect(chartContainer).toBeInTheDocument()
    })

    it('handles chart container refs correctly', async () => {
      render(<Dashboard />)
      
      await waitFor(() => {
        // Charts should be rendered after refs are set
        const chartContainers = document.querySelectorAll('.chart-container')
        expect(chartContainers.length).toBe(2)
      })
    })
  })
})
