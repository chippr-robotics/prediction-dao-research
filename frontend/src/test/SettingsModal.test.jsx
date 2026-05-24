import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import SettingsModal from '../components/ui/SettingsModal'

// Mock hooks
const mockUseTheme = vi.fn()
const mockUsePrice = vi.fn()
const mockUseChainTokens = vi.fn()

vi.mock('../hooks/useTheme', () => ({
  useTheme: (...args) => mockUseTheme(...args),
}))

vi.mock('../contexts/PriceContext', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    usePrice: (...args) => mockUsePrice(...args),
  }
})

vi.mock('../hooks/useChainTokens', () => ({
  useChainTokens: (...args) => mockUseChainTokens(...args),
}))

describe('SettingsModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    isConnected: false,
    account: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseTheme.mockReturnValue({
      mode: 'dark',
      toggleMode: vi.fn(),
      isDark: true,
    })
    mockUsePrice.mockReturnValue({
      showUsd: true,
      toggleCurrency: vi.fn(),
    })
    mockUseChainTokens.mockReturnValue({ native: 'MATIC' })
  })

  it('should render nothing when isOpen is false', () => {
    const { container } = render(<SettingsModal {...defaultProps} isOpen={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('should render settings title when open', () => {
    render(<SettingsModal {...defaultProps} />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('should render with dialog role', () => {
    render(<SettingsModal {...defaultProps} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('should call onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<SettingsModal {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close settings'))
    expect(onClose).toHaveBeenCalled()
  })

  it('should call onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(<SettingsModal {...defaultProps} onClose={onClose} />)
    const overlay = container.querySelector('.settings-modal-overlay')
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalled()
  })

  it('should NOT close when clicking inside modal content', () => {
    const onClose = vi.fn()
    const { container } = render(<SettingsModal {...defaultProps} onClose={onClose} />)
    const content = container.querySelector('.settings-modal-content')
    fireEvent.click(content)
    expect(onClose).not.toHaveBeenCalled()
  })

  // Theme section
  it('should render theme section', () => {
    render(<SettingsModal {...defaultProps} />)
    expect(screen.getByText('Appearance')).toBeInTheDocument()
    expect(screen.getByText('Theme')).toBeInTheDocument()
  })

  it('should call toggleMode when theme toggle is clicked', () => {
    const toggleMode = vi.fn()
    mockUseTheme.mockReturnValue({ mode: 'dark', toggleMode, isDark: true })
    render(<SettingsModal {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Switch to light mode'))
    expect(toggleMode).toHaveBeenCalled()
  })

  it('should show correct theme label based on mode', () => {
    mockUseTheme.mockReturnValue({ mode: 'light', toggleMode: vi.fn(), isDark: false })
    render(<SettingsModal {...defaultProps} />)
    expect(screen.getByText('Light')).toBeInTheDocument()
  })

  // Currency section
  it('should render currency section', () => {
    render(<SettingsModal {...defaultProps} />)
    expect(screen.getByText('Display Currency')).toBeInTheDocument()
    expect(screen.getByText('Currency')).toBeInTheDocument()
  })

  it('should call toggleCurrency when currency toggle is clicked', () => {
    const toggleCurrency = vi.fn()
    mockUsePrice.mockReturnValue({ showUsd: true, toggleCurrency })
    render(<SettingsModal {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Switch to MATIC display'))
    expect(toggleCurrency).toHaveBeenCalled()
  })

  // Wallet section - not connected
  it('should show connect button when not connected', () => {
    render(<SettingsModal {...defaultProps} isConnected={false} />)
    expect(screen.getByText('Not Connected')).toBeInTheDocument()
    expect(screen.getByLabelText('Connect wallet')).toBeInTheDocument()
  })

  it('should call onConnect when connect button is clicked', async () => {
    const onConnect = vi.fn().mockResolvedValue(undefined)
    render(<SettingsModal {...defaultProps} isConnected={false} onConnect={onConnect} />)
    fireEvent.click(screen.getByLabelText('Connect wallet'))
    expect(onConnect).toHaveBeenCalled()
  })

  // Wallet section - connected
  it('should show shortened address when connected', () => {
    render(
      <SettingsModal
        {...defaultProps}
        isConnected={true}
        account="0x1234567890123456789012345678901234567890"
      />
    )
    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('0x1234...7890')).toBeInTheDocument()
  })

  it('should call onDisconnect and onClose when disconnect is clicked', () => {
    const onDisconnect = vi.fn()
    const onClose = vi.fn()
    render(
      <SettingsModal
        {...defaultProps}
        isConnected={true}
        account="0x1234567890123456789012345678901234567890"
        onDisconnect={onDisconnect}
        onClose={onClose}
      />
    )
    fireEvent.click(screen.getByLabelText('Disconnect wallet'))
    expect(onDisconnect).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('should use MATIC as default when native symbol is empty', () => {
    mockUseChainTokens.mockReturnValue({ native: '' })
    render(<SettingsModal {...defaultProps} />)
    // The currency toggle label text should contain MATIC
    expect(screen.getByText(/MATIC/)).toBeInTheDocument()
  })
})
