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
