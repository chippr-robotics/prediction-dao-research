import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import LoadingScreen from '../components/ui/LoadingScreen'

describe('LoadingScreen Component', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Rendering', () => {
    it('renders loading screen when visible', () => {
      render(<LoadingScreen visible={true} />)
      const loadingElement = screen.getByRole('status')
      expect(loadingElement).toBeInTheDocument()
      expect(loadingElement).toHaveAttribute('aria-busy', 'true')
    })

    it('renders with default loading text', () => {
      render(<LoadingScreen visible={true} />)
      expect(screen.getAllByText(/loading/i).length).toBeGreaterThan(0)
    })

    it('renders with custom text', () => {
      render(<LoadingScreen visible={true} text="Fetching data" />)
      expect(screen.getAllByText(/fetching data/i).length).toBeGreaterThan(0)
    })

    it('hides when visible is false', () => {
      const { container } = render(<LoadingScreen visible={false} />)
      const loadingElement = container.querySelector('[role="status"]')
      expect(loadingElement).toHaveAttribute('aria-hidden', 'true')
    })

    it('renders with small size variant', () => {
      const { container } = render(<LoadingScreen visible={true} size="small" />)
      const loadingScreen = container.querySelector('[role="status"]')
      expect(loadingScreen.className).toContain('small')
    })

    it('renders with large size variant', () => {
      const { container } = render(<LoadingScreen visible={true} size="large" />)
      const loadingScreen = container.querySelector('[role="status"]')
      expect(loadingScreen.className).toContain('large')
    })

    it('renders as inline when inline prop is true', () => {
      const { container } = render(<LoadingScreen visible={true} inline />)
      const loadingScreen = container.querySelector('[role="status"]')
      expect(loadingScreen.className).toContain('inline')
    })

    it('applies custom className', () => {
      const { container } = render(<LoadingScreen visible={true} className="custom-class" />)
      const loadingScreen = container.querySelector('[role="status"]')
      expect(loadingScreen.className).toContain('custom-class')
    })
  })

  describe('SVG Animation Elements', () => {
    it('renders logo image', () => {
      const { container } = render(<LoadingScreen visible={true} />)
      const logo = container.querySelector('img')
      expect(logo).toBeTruthy()
      expect(logo).toHaveAttribute('src', '/assets/fairwins_no-text_logo.svg')
    })

    it('logo has proper alt attribute for accessibility', () => {
      const { container } = render(<LoadingScreen visible={true} />)
      const logo = container.querySelector('img')
      expect(logo).toHaveAttribute('alt', '')
      expect(logo).toHaveAttribute('aria-hidden', 'true')
    })
  })

  describe('Animation Callbacks', () => {
    it('calls onAnimationComplete after animation duration', async () => {
      const onAnimationComplete = vi.fn()
      render(<LoadingScreen visible={true} onAnimationComplete={onAnimationComplete} />)
      
      // Fast-forward time and run all pending timers
      await vi.runAllTimersAsync()
      
      expect(onAnimationComplete).toHaveBeenCalled()
    })

    it('does not call onAnimationComplete when not provided', async () => {
      const { container } = render(<LoadingScreen visible={true} />)
      
      await vi.runAllTimersAsync()
      
      // Should not throw error
      expect(container.querySelector('[role="status"]')).toBeInTheDocument()
    })

    it('updates component state after initial animation', async () => {
      const { container } = render(<LoadingScreen visible={true} />)
      
      // Component should be rendered
      expect(container.querySelector('[role="status"]')).toBeInTheDocument()
      
      await vi.runAllTimersAsync()
      
      // Component should still be rendered after animation
      expect(container.querySelector('[role="status"]')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('has proper ARIA attributes when visible', () => {
      render(<LoadingScreen visible={true} />)
      const loadingElement = screen.getByRole('status')
      
      expect(loadingElement).toHaveAttribute('aria-live', 'polite')
      expect(loadingElement).toHaveAttribute('aria-busy', 'true')
      expect(loadingElement).toHaveAttribute('aria-hidden', 'false')
    })

    it('has proper ARIA attributes when hidden', () => {
      const { container } = render(<LoadingScreen visible={false} />)
      const loadingElement = container.querySelector('[role="status"]')
      
      expect(loadingElement).toHaveAttribute('aria-hidden', 'true')
    })

    it('includes screen reader text', () => {
      render(<LoadingScreen visible={true} text="Loading data" />)
      const srText = screen.getAllByText(/loading data/i)
      expect(srText.length).toBeGreaterThan(0)
    })

    it('has proper aria-label', () => {
      render(<LoadingScreen visible={true} text="Loading" />)
      const loadingElement = screen.getByRole('status')
      expect(loadingElement).toHaveAttribute('aria-label', 'Loading...')
    })

    it('marks SVG as decorative with aria-hidden', () => {
      const { container } = render(<LoadingScreen visible={true} />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('aria-hidden', 'true')
    })

    it('passes axe accessibility tests', async () => {
      // Use real timers for this test as axe doesn't work well with fake timers
      vi.useRealTimers()
      
      const { container } = render(<LoadingScreen visible={true} />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
      
      // Restore fake timers for other tests
      vi.useFakeTimers()
    })
  })

  describe('Visibility Toggle', () => {
    it('updates aria-busy when visibility changes', () => {
      const { rerender } = render(<LoadingScreen visible={true} />)
      const loadingElement = screen.getByRole('status')
      
      expect(loadingElement).toHaveAttribute('aria-busy', 'true')
      
      rerender(<LoadingScreen visible={false} />)
      expect(loadingElement).toHaveAttribute('aria-busy', 'false')
    })

    it('maintains proper rendering when visibility toggles', async () => {
      const { rerender, container } = render(<LoadingScreen visible={true} />)
      
      await vi.runAllTimersAsync()
      
      expect(container.querySelector('[role="status"]')).toBeInTheDocument()
      
      rerender(<LoadingScreen visible={false} />)
      
      // Component should still be present but marked as hidden
      const element = container.querySelector('[role="status"]')
      expect(element).toHaveAttribute('aria-hidden', 'true')
    })
  })

  describe('Text Display', () => {
    it('hides text when text prop is empty', () => {
      const { container } = render(<LoadingScreen visible={true} text="" />)
      const textElement = container.querySelector('div[class*="loading-text"]')
      expect(textElement).not.toBeInTheDocument()
    })

    it('shows loading dots animation', () => {
      const { container } = render(<LoadingScreen visible={true} />)
      const dots = container.querySelector('span[class*="loading-dots"]')
      expect(dots).toBeTruthy()
      expect(dots).toHaveAttribute('aria-hidden', 'true')
    })
  })
})
