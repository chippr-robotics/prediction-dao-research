import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import SidebarNav from '../components/fairwins/SidebarNav'
import { useIsMobile } from '../hooks/useMediaQuery'

// Mock the useIsMobile hook
vi.mock('../hooks/useMediaQuery', () => ({
  useIsMobile: vi.fn(() => false) // Default to desktop
}))

describe('SidebarNav Component', () => {
  const mockOnCategoryChange = vi.fn()

  beforeEach(() => {
    mockOnCategoryChange.mockClear()
  })

  describe('Rendering', () => {
    it('renders sidebar navigation', () => {
      render(<SidebarNav onCategoryChange={mockOnCategoryChange} />)
      // aside element has complementary role by default
      expect(screen.getByRole('complementary', { name: /navigation/i })).toBeInTheDocument()
    })

    it('renders toggle button', () => {
      render(<SidebarNav onCategoryChange={mockOnCategoryChange} />)
      expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument()
    })

    it('renders the My Wagers category button', () => {
      render(<SidebarNav onCategoryChange={mockOnCategoryChange} />)
      const categoryButtons = screen.getAllByRole('button')
      // Should have toggle button + 1 category button (My Wagers / dashboard)
      expect(categoryButtons.length).toBe(2)
    })

    it('starts in collapsed state by default', () => {
      render(<SidebarNav onCategoryChange={mockOnCategoryChange} />)
      const toggleButton = screen.getByRole('button', { name: /expand sidebar/i })
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false')
    })
  })

  describe('Toggle Functionality', () => {
    it('expands sidebar when toggle button is clicked', async () => {
      const user = userEvent.setup()
      render(<SidebarNav onCategoryChange={mockOnCategoryChange} />)

      const toggleButton = screen.getByRole('button', { name: /expand sidebar/i })
      await user.click(toggleButton)

      expect(screen.getByRole('button', { name: /collapse sidebar/i })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /navigation/i })).toBeInTheDocument()
    })

    it('collapses sidebar when toggle button is clicked again', async () => {
      const user = userEvent.setup()
      render(<SidebarNav onCategoryChange={mockOnCategoryChange} />)

      const expandButton = screen.getByRole('button', { name: /expand sidebar/i })
      await user.click(expandButton)

      const collapseButton = screen.getByRole('button', { name: /collapse sidebar/i })
      await user.click(collapseButton)

      expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: /navigation/i })).not.toBeInTheDocument()
    })

    it('toggle button is keyboard accessible', async () => {
      const user = userEvent.setup()
      render(<SidebarNav onCategoryChange={mockOnCategoryChange} />)

      const toggleButton = screen.getByRole('button', { name: /expand sidebar/i })
      toggleButton.focus()
      expect(toggleButton).toHaveFocus()

      await user.keyboard('{Enter}')
      expect(screen.getByRole('button', { name: /collapse sidebar/i })).toBeInTheDocument()
    })

    it('toggle button responds to Space key', async () => {
      const user = userEvent.setup()
      render(<SidebarNav onCategoryChange={mockOnCategoryChange} />)

      const toggleButton = screen.getByRole('button', { name: /expand sidebar/i })
      toggleButton.focus()

      await user.keyboard(' ')
      expect(screen.getByRole('button', { name: /collapse sidebar/i })).toBeInTheDocument()
    })
  })

  describe('Category Selection', () => {
    it('calls onCategoryChange when My Wagers is clicked', async () => {
      const user = userEvent.setup()
      render(<SidebarNav onCategoryChange={mockOnCategoryChange} />)

      const dashboardButton = screen.getByRole('button', { name: /view my wagers/i })
      await user.click(dashboardButton)

      expect(mockOnCategoryChange).toHaveBeenCalledWith('dashboard')
    })

    it('highlights selected category', () => {
      render(<SidebarNav selectedCategory="dashboard" onCategoryChange={mockOnCategoryChange} />)

      const dashboardButton = screen.getByRole('button', { name: /view my wagers/i })
      expect(dashboardButton).toHaveAttribute('aria-current', 'page')
    })

    it('category buttons are keyboard accessible', async () => {
      const user = userEvent.setup()
      render(<SidebarNav onCategoryChange={mockOnCategoryChange} />)

      const dashboardButton = screen.getByRole('button', { name: /view my wagers/i })
      dashboardButton.focus()

      await user.keyboard('{Enter}')
      expect(mockOnCategoryChange).toHaveBeenCalledWith('dashboard')
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations in collapsed state', async () => {
      const { container } = render(<SidebarNav onCategoryChange={mockOnCategoryChange} />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations in expanded state', async () => {
      const user = userEvent.setup()
      const { container } = render(<SidebarNav onCategoryChange={mockOnCategoryChange} />)

      const toggleButton = screen.getByRole('button', { name: /expand sidebar/i })
      await user.click(toggleButton)

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('provides tooltips for collapsed category items', () => {
      render(<SidebarNav onCategoryChange={mockOnCategoryChange} />)

      const dashboardButton = screen.getByRole('button', { name: /view my wagers/i })
      expect(dashboardButton).toHaveAttribute('title', 'My Wagers')
    })

    it('toggle button has proper ARIA attributes', () => {
      render(<SidebarNav onCategoryChange={mockOnCategoryChange} />)

      const toggleButton = screen.getByRole('button', { name: /expand sidebar/i })
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false')
      expect(toggleButton).toHaveAttribute('aria-label', 'Expand sidebar')
    })
  })

  describe('State Management', () => {
    it('does not expand on mouse hover', async () => {
      const user = userEvent.setup()
      const { container } = render(<SidebarNav onCategoryChange={mockOnCategoryChange} />)

      const sidebar = container.querySelector('aside')
      await user.hover(sidebar)

      // Sidebar should remain collapsed
      expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: /navigation/i })).not.toBeInTheDocument()
    })

    it('maintains expanded state after category selection', async () => {
      const user = userEvent.setup()
      render(<SidebarNav onCategoryChange={mockOnCategoryChange} />)

      // Expand sidebar
      const toggleButton = screen.getByRole('button', { name: /expand sidebar/i })
      await user.click(toggleButton)

      // Select a category
      const dashboardButton = screen.getByRole('button', { name: /view my wagers/i })
      await user.click(dashboardButton)

      // Sidebar should still be expanded
      expect(screen.getByRole('button', { name: /collapse sidebar/i })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /navigation/i })).toBeInTheDocument()
    })
  })

  describe('Mobile Rendering', () => {
    it('returns null on mobile (no bottom nav)', () => {
      vi.mocked(useIsMobile).mockReturnValue(true)

      const { container } = render(<SidebarNav onCategoryChange={mockOnCategoryChange} />)
      expect(container.innerHTML).toBe('')

      // Reset to desktop
      vi.mocked(useIsMobile).mockReturnValue(false)
    })
  })
})
