import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PwaUpdateNotification from '../PwaUpdateNotification'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => navigateMock }
})

let updateReady = false
vi.mock('../../../hooks/usePwaUpdate', () => ({
  usePwaUpdate: () => ({ updateReady, applyUpdate: vi.fn(), checkForUpdate: vi.fn() }),
}))

function renderToast() {
  return render(
    <MemoryRouter>
      <PwaUpdateNotification />
    </MemoryRouter>
  )
}

describe('PwaUpdateNotification', () => {
  beforeEach(() => {
    navigateMock.mockClear()
    updateReady = false
  })

  it('renders nothing when no update is ready', () => {
    renderToast()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the toast when an update is ready', () => {
    updateReady = true
    renderToast()
    expect(screen.getByText('Update available')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View update' })).toBeInTheDocument()
  })

  it('routes to the Software Update section in Preferences on click', () => {
    updateReady = true
    renderToast()
    fireEvent.click(screen.getByRole('button', { name: 'View update' }))
    expect(navigateMock).toHaveBeenCalledWith('/wallet?tab=preferences#pwa-update')
    // Dismissed after navigating.
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('can be dismissed', () => {
    updateReady = true
    renderToast()
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
