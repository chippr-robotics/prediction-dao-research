import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../contexts/ThemeContext'
import { useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useTheme } from '../hooks/useTheme'

// Component that mimics the theme detection logic from App.jsx
function TestComponent() {
  const { setThemePlatform } = useTheme()
  const location = useLocation()

  useEffect(() => {
    if (location.pathname.includes('/clearpath')) {
      setThemePlatform('clearpath')
    } else {
      setThemePlatform('fairwins')
    }
  }, [location.pathname, setThemePlatform])

  return <div data-testid="test-component">Test Component</div>
}

describe('App Route Detection', () => {
  beforeEach(() => {
    // Clear any existing classes
    document.documentElement.className = ''
    localStorage.clear()
  })

  const renderWithRoute = (path) => {
    window.history.pushState({}, 'Test page', path)
    return render(
      <Router>
        <ThemeProvider>
          <Routes>
            <Route path="*" element={<TestComponent />} />
          </Routes>
        </ThemeProvider>
      </Router>
    )
  }

  const expectFairWinsTheme = async () => {
    await waitFor(() => {
      expect(document.documentElement.classList.contains('platform-fairwins')).toBe(true)
      expect(document.documentElement.classList.contains('platform-clearpath')).toBe(false)
    }, { timeout: 3000 })
  }

  const expectClearPathTheme = async () => {
    await waitFor(() => {
      expect(document.documentElement.classList.contains('platform-clearpath')).toBe(true)
      expect(document.documentElement.classList.contains('platform-fairwins')).toBe(false)
    }, { timeout: 3000 })
  }

  it('should set FairWins theme for root path /', async () => {
    renderWithRoute('/')
    await expectFairWinsTheme()
  })

  it('should set FairWins theme for /app route', async () => {
    renderWithRoute('/app')
    await expectFairWinsTheme()
  })

  it('should set FairWins theme for /main route', async () => {
    renderWithRoute('/main')
    await expectFairWinsTheme()
  })

  it('should set FairWins theme for /fairwins route', async () => {
    renderWithRoute('/fairwins')
    await expectFairWinsTheme()
  })

  it('should set ClearPath theme for /clearpath route', async () => {
    renderWithRoute('/clearpath')
    await expectClearPathTheme()
  })

  it('should set FairWins theme for unknown routes', async () => {
    renderWithRoute('/unknown-route')
    await expectFairWinsTheme()
  })

  it('should set FairWins theme for /select route', async () => {
    renderWithRoute('/select')
    await expectFairWinsTheme()
  })
})
