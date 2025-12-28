import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import SearchBar from '../components/ui/SearchBar'

describe('SearchBar', () => {
  it('should render with placeholder text', () => {
    render(<SearchBar placeholder="Search markets..." />)
    
    const input = screen.getByPlaceholderText('Search markets...')
    expect(input).toBeInTheDocument()
  })

  it('should display the provided value', () => {
    render(<SearchBar value="test query" />)
    
    const input = screen.getByRole('searchbox')
    expect(input).toHaveValue('test query')
  })

  it('should call onChange when typing', () => {
    const handleChange = vi.fn()
    render(<SearchBar onChange={handleChange} />)
    
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: 'new search' } })
    
    expect(handleChange).toHaveBeenCalledWith('new search')
  })

  it('should show clear button when value is not empty', () => {
    render(<SearchBar value="test" />)
    
    const clearButton = screen.getByLabelText('Clear search')
    expect(clearButton).toBeInTheDocument()
  })

  it('should not show clear button when value is empty', () => {
    render(<SearchBar value="" />)
    
    const clearButton = screen.queryByLabelText('Clear search')
    expect(clearButton).not.toBeInTheDocument()
  })

  it('should call onClear and onChange when clear button is clicked', () => {
    const handleChange = vi.fn()
    const handleClear = vi.fn()
    render(
      <SearchBar 
        value="test" 
        onChange={handleChange}
        onClear={handleClear}
      />
    )
    
    const clearButton = screen.getByLabelText('Clear search')
    fireEvent.click(clearButton)
    
    expect(handleClear).toHaveBeenCalled()
    expect(handleChange).toHaveBeenCalledWith('')
  })

  it('should have correct aria-label', () => {
    render(<SearchBar ariaLabel="Search for markets" />)
    
    const input = screen.getByLabelText('Search for markets')
    expect(input).toBeInTheDocument()
  })

  it('should apply custom className', () => {
    const { container } = render(<SearchBar className="custom-class" />)
    
    const searchBar = container.querySelector('.search-bar')
    expect(searchBar).toHaveClass('custom-class')
  })

  it('should show search icon', () => {
    const { container } = render(<SearchBar />)
    
    const icon = container.querySelector('.search-icon')
    expect(icon).toBeInTheDocument()
    expect(icon).toHaveTextContent('🔍')
  })
})
