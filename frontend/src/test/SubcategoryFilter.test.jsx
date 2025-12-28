import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import SubcategoryFilter from '../components/fairwins/SubcategoryFilter'

describe('SubcategoryFilter', () => {
  const mockSubcategories = [
    { id: 'nfl', name: 'NFL', parent: 'sports' },
    { id: 'nba', name: 'NBA', parent: 'sports' },
    { id: 'mlb', name: 'MLB', parent: 'sports' },
    { id: 'nhl', name: 'NHL', parent: 'sports' },
    { id: 'soccer', name: 'Soccer', parent: 'sports' }
  ]

  it('should render all subcategory buttons', () => {
    render(
      <SubcategoryFilter
        subcategories={mockSubcategories}
        selectedSubcategories={[]}
        onSubcategoryToggle={vi.fn()}
        categoryName="Sports"
      />
    )

    expect(screen.getByText('NFL')).toBeInTheDocument()
    expect(screen.getByText('NBA')).toBeInTheDocument()
    expect(screen.getByText('MLB')).toBeInTheDocument()
    expect(screen.getByText('NHL')).toBeInTheDocument()
    expect(screen.getByText('Soccer')).toBeInTheDocument()
  })

  it('should render search input', () => {
    render(
      <SubcategoryFilter
        subcategories={mockSubcategories}
        selectedSubcategories={[]}
        onSubcategoryToggle={vi.fn()}
        categoryName="Sports"
      />
    )

    const searchInput = screen.getByPlaceholderText('Search subcategories...')
    expect(searchInput).toBeInTheDocument()
  })

  it('should filter subcategories based on search query', () => {
    render(
      <SubcategoryFilter
        subcategories={mockSubcategories}
        selectedSubcategories={[]}
        onSubcategoryToggle={vi.fn()}
        categoryName="Sports"
      />
    )

    const searchInput = screen.getByPlaceholderText('Search subcategories...')
    fireEvent.change(searchInput, { target: { value: 'NBA' } })

    // NBA should be visible
    expect(screen.getByText('NBA')).toBeInTheDocument()
    
    // Others should not be visible
    expect(screen.queryByText('MLB')).not.toBeInTheDocument()
    expect(screen.queryByText('NHL')).not.toBeInTheDocument()
  })

  it('should perform fuzzy search', () => {
    render(
      <SubcategoryFilter
        subcategories={mockSubcategories}
        selectedSubcategories={[]}
        onSubcategoryToggle={vi.fn()}
        categoryName="Sports"
      />
    )

    const searchInput = screen.getByPlaceholderText('Search subcategories...')
    // Search with slight typo
    fireEvent.change(searchInput, { target: { value: 'socr' } })

    // Soccer should still be found with fuzzy matching
    expect(screen.getByText('Soccer')).toBeInTheDocument()
  })

  it('should show "no subcategories found" message when search has no results', () => {
    render(
      <SubcategoryFilter
        subcategories={mockSubcategories}
        selectedSubcategories={[]}
        onSubcategoryToggle={vi.fn()}
        categoryName="Sports"
      />
    )

    const searchInput = screen.getByPlaceholderText('Search subcategories...')
    fireEvent.change(searchInput, { target: { value: 'xyz123' } })

    expect(screen.getByText(/No subcategories found for "xyz123"/i)).toBeInTheDocument()
  })

  it('should call onSubcategoryToggle when button is clicked', () => {
    const mockToggle = vi.fn()
    render(
      <SubcategoryFilter
        subcategories={mockSubcategories}
        selectedSubcategories={[]}
        onSubcategoryToggle={mockToggle}
        categoryName="Sports"
      />
    )

    const nflButton = screen.getByText('NFL')
    fireEvent.click(nflButton)

    expect(mockToggle).toHaveBeenCalledWith('nfl')
  })

  it('should show selected state for subcategories', () => {
    render(
      <SubcategoryFilter
        subcategories={mockSubcategories}
        selectedSubcategories={['nfl', 'nba']}
        onSubcategoryToggle={vi.fn()}
        categoryName="Sports"
      />
    )

    const nflButton = screen.getByText('NFL').closest('button')
    const nbaButton = screen.getByText('NBA').closest('button')
    const mlbButton = screen.getByText('MLB').closest('button')

    expect(nflButton).toHaveClass('selected')
    expect(nbaButton).toHaveClass('selected')
    expect(mlbButton).not.toHaveClass('selected')
  })

  it('should show "Clear All" button when filters are active', () => {
    render(
      <SubcategoryFilter
        subcategories={mockSubcategories}
        selectedSubcategories={['nfl', 'nba']}
        onSubcategoryToggle={vi.fn()}
        categoryName="Sports"
      />
    )

    expect(screen.getByText('Clear All (2)')).toBeInTheDocument()
  })

  it('should not show "Clear All" button when no filters are active', () => {
    render(
      <SubcategoryFilter
        subcategories={mockSubcategories}
        selectedSubcategories={[]}
        onSubcategoryToggle={vi.fn()}
        categoryName="Sports"
      />
    )

    expect(screen.queryByText(/Clear All/)).not.toBeInTheDocument()
  })

  it('should call toggle for all selected subcategories when "Clear All" is clicked', () => {
    const mockToggle = vi.fn()
    render(
      <SubcategoryFilter
        subcategories={mockSubcategories}
        selectedSubcategories={['nfl', 'nba']}
        onSubcategoryToggle={mockToggle}
        categoryName="Sports"
      />
    )

    const clearButton = screen.getByText('Clear All (2)')
    fireEvent.click(clearButton)

    expect(mockToggle).toHaveBeenCalledTimes(2)
    expect(mockToggle).toHaveBeenCalledWith('nfl')
    expect(mockToggle).toHaveBeenCalledWith('nba')
  })

  it('should show count of filtered subcategories when searching', () => {
    render(
      <SubcategoryFilter
        subcategories={mockSubcategories}
        selectedSubcategories={[]}
        onSubcategoryToggle={vi.fn()}
        categoryName="Sports"
      />
    )

    const searchInput = screen.getByPlaceholderText('Search subcategories...')
    fireEvent.change(searchInput, { target: { value: 'N' } })

    // Should show count
    expect(screen.getByText(/Showing \d+ of 5 subcategories/)).toBeInTheDocument()
  })

  it('should not render when subcategories array is empty', () => {
    const { container } = render(
      <SubcategoryFilter
        subcategories={[]}
        selectedSubcategories={[]}
        onSubcategoryToggle={vi.fn()}
        categoryName="Sports"
      />
    )

    expect(container.firstChild).toBeNull()
  })

  it('should have proper ARIA attributes', () => {
    render(
      <SubcategoryFilter
        subcategories={mockSubcategories}
        selectedSubcategories={['nfl']}
        onSubcategoryToggle={vi.fn()}
        categoryName="Sports"
      />
    )

    const nflButton = screen.getByText('NFL').closest('button')
    expect(nflButton).toHaveAttribute('aria-pressed', 'true')
    expect(nflButton).toHaveAttribute('aria-label', 'Filter by NFL')

    const searchInput = screen.getByPlaceholderText('Search subcategories...')
    expect(searchInput).toHaveAttribute('aria-label', 'Search Sports subcategories')
  })
})
