import { useState, useEffect } from 'react'
import './SearchBar.css'

function SearchBar({ 
  value = '', 
  onChange, 
  placeholder = 'Search...', 
  ariaLabel = 'Search',
  className = ''
}) {
  const [localValue, setLocalValue] = useState(value)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  const handleChange = (e) => {
    const newValue = e.target.value
    setLocalValue(newValue)
    if (onChange) {
      onChange(newValue)
    }
  }

  return (
    <div className={`search-bar ${className}`}>
      <span className="search-icon" aria-hidden="true">🔍</span>
      <input
        type="search"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        className="search-input"
        aria-label={ariaLabel}
      />
    </div>
  )
}

export default SearchBar
