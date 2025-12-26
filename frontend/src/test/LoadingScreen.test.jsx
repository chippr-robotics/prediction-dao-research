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
      expect(screen.getByText(/loading/i)).toBeInTheDocument()
    })

    it('renders with custom text', () => {
      render(<LoadingScreen visible={true} text="Fetching data" />)
      expect(screen.getByText(/fetching data/i)).toBeInTheDocument()
    })

    it('hides when visible is false', () => {
      render(<LoadingScreen visible={false} />)
      const loadingElement = screen.getByRole('status')
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
    it('renders clover with four leaves', () => {
      const { container } = render(<LoadingScreen visible={true} />)
      const leaves = container.querySelectorAll('.clover-leaf')
      expect(leaves).toHaveLength(4)
    })

    it('renders checkmark path', () => {
      const { container } = render(<LoadingScreen visible={true} />)
      const checkmark = container.querySelector('.checkmark')
      expect(checkmark).toBeInTheDocument()
    })

    it('renders SVG with proper viewBox', () => {
      const { container } = render(<LoadingScreen visible={true} />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('viewBox', '0 0 120 120')
    })
  })

  describe('Animation Callbacks', () => {
    it('calls onAnimationComplete after animation duration', async () => {
      const onAnimationComplete = vi.fn()
      render(<LoadingScreen visible={true} onAnimationComplete={onAnimationComplete} />)
      
      // Fast-forward time past animation duration (2000ms)
      vi.advanceTimersByTime(2000)
      
      await waitFor(() => {
        expect(onAnimationComplete).toHaveBeenCalledTimes(1)
      })
    })

    it('does not call onAnimationComplete when not provided', () => {
      const { container } = render(<LoadingScreen visible={true} />)
      
      vi.advanceTimersByTime(2000)
      
      // Should not throw error
      expect(container.querySelector('[role="status"]')).toBeInTheDocument()
    })

    it('adds animated class after initial animation', async () => {
      const { container } = render(<LoadingScreen visible={true} />)
      
      const logoContainer = container.querySelector('.logo-container')
      expect(logoContainer.className).not.toContain('animated')
      
      vi.advanceTimersByTime(2000)
      
      await waitFor(() => {
        expect(logoContainer.className).toContain('animated')
      })
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
      render(<LoadingScreen visible={false} />)
      const loadingElement = screen.getByRole('status')
      
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
      const { container } = render(<LoadingScreen visible={true} />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
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

    it('resets animation state when becoming visible again', () => {
      const { rerender, container } = render(<LoadingScreen visible={true} />)
      
      vi.advanceTimersByTime(2000)
      
      const logoContainer = container.querySelector('.logo-container')
      expect(logoContainer.className).toContain('animated')
      
      rerender(<LoadingScreen visible={false} />)
      
      // Animation state should reset
      expect(logoContainer.className).not.toContain('animated')
    })
  })

  describe('Text Display', () => {
    it('hides text when text prop is empty', () => {
      const { container } = render(<LoadingScreen visible={true} text="" />)
      const textElement = container.querySelector('.loading-text')
      expect(textElement).not.toBeInTheDocument()
    })

    it('shows loading dots animation', () => {
      const { container } = render(<LoadingScreen visible={true} />)
      const dots = container.querySelector('.loading-dots')
      expect(dots).toBeInTheDocument()
      expect(dots).toHaveAttribute('aria-hidden', 'true')
    })
  })
})
