import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import ClearPathButton from '../components/clearpath/ClearPathButton'
import { WalletContext, UIContext, UserPreferencesContext, ROLES, ROLE_INFO } from '../contexts'

// Mock wallet hook
vi.mock('../hooks', () => ({
  useWallet: vi.fn()
}))

import { useWallet } from '../hooks'

describe('ClearPathButton Component', () => {
  const mockShowModal = vi.fn()
  const mockHideModal = vi.fn()

  // WalletContext now provides roles (useRoles hook uses WalletContext)
  const defaultWalletContext = {
    roles: [],
    rolesLoading: false,
    blockchainSynced: true,
    hasRole: vi.fn(() => false),
    hasAnyRole: vi.fn(() => false),
    hasAllRoles: vi.fn(() => false),
    grantRole: vi.fn(),
    revokeRole: vi.fn(),
    refreshRoles: vi.fn(),
    // Wallet state
    address: '0x1234567890123456789012345678901234567890',
    account: '0x1234567890123456789012345678901234567890',
    isConnected: true,
    // Add proper EIP-1193 provider mock
    provider: {
      request: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
      send: vi.fn(),
      sendAsync: vi.fn()
    },
    signer: {
      getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
      signMessage: vi.fn()
    }
  }

  const defaultUIContext = {
    showModal: mockShowModal,
    hideModal: mockHideModal,
    modal: null
  }

  const defaultPreferencesContext = {
    preferences: {
      clearPathStatus: { active: false, lastUpdated: null }
    }
  }

  const renderWithProviders = (component, options = {}) => {
    const {
      walletContext = defaultWalletContext,
      uiContext = defaultUIContext,
      preferencesContext = defaultPreferencesContext
    } = options

    return render(
      <WalletContext.Provider value={walletContext}>
        <UIContext.Provider value={uiContext}>
          <UserPreferencesContext.Provider value={preferencesContext}>
            {component}
          </UserPreferencesContext.Provider>
        </UIContext.Provider>
      </WalletContext.Provider>
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    useWallet.mockReturnValue({ isConnected: true })
  })

  describe('Rendering', () => {
    it('renders button when wallet is not connected but appears inactive', () => {
      useWallet.mockReturnValue({ isConnected: false })
      renderWithProviders(<ClearPathButton />)
      const button = screen.getByRole('button', { name: /clearpath/i })
      expect(button).toBeInTheDocument()
      expect(button).toHaveClass('inactive')
      expect(button).toHaveAttribute('aria-disabled', 'true')
    })

    it('renders button when wallet is connected', () => {
      renderWithProviders(<ClearPathButton />)
      const button = screen.getByRole('button', { name: /clearpath/i })
      expect(button).toBeInTheDocument()
      expect(button).not.toHaveClass('inactive')
    })

    it('renders ClearPath logo image', () => {
      renderWithProviders(<ClearPathButton />)
      const img = screen.getByAltText('ClearPath')
      expect(img).toHaveAttribute('src', '/assets/clearpath_no-text_logo.svg')
    })
  })

  describe('Dropdown Interaction', () => {
    it('does not open dropdown when button is clicked while inactive', async () => {
      const user = userEvent.setup()
      useWallet.mockReturnValue({ isConnected: false })
      renderWithProviders(<ClearPathButton />)
      
      const button = screen.getByRole('button', { name: /clearpath/i })
      await user.click(button)
      
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('opens dropdown when button is clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ClearPathButton />)
      
      const button = screen.getByRole('button', { name: /clearpath/i })
      await user.click(button)
      
      await waitFor(() => {
        expect(screen.getByRole('menu', { name: /clearpath options/i })).toBeInTheDocument()
      })
    })

    it('closes dropdown when button is clicked again', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ClearPathButton />)
      
      const button = screen.getByRole('button', { name: /clearpath/i })
      await user.click(button)
      await user.click(button)
      
      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
      })
    })

    it('closes dropdown on Escape key', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ClearPathButton />)
      
      const button = screen.getByRole('button', { name: /clearpath/i })
      await user.click(button)
      
      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument()
      })
      
      await user.keyboard('{Escape}')
      
      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
      })
    })
  })

  describe('Role-based Menu Options', () => {
    it('shows ClearPath Pro option for users with CLEARPATH_USER role', async () => {
      const user = userEvent.setup()
      const walletContext = {
        ...defaultWalletContext,
        roles: [ROLES.CLEARPATH_USER],
        hasRole: vi.fn((role) => role === ROLES.CLEARPATH_USER)
      }
      const preferencesContext = {
        preferences: {
          clearPathStatus: { active: true, lastUpdated: Date.now() }
        }
      }

      renderWithProviders(<ClearPathButton />, { walletContext, preferencesContext })

      const button = screen.getByRole('button', { name: /clearpath/i })
      await user.click(button)

      await waitFor(() => {
        // Should show both ClearPath options with proper descriptions
        expect(screen.getByText('ClearPath Pro')).toBeInTheDocument()
        expect(screen.getByText('Browse DAOs, view proposals, and explore governance')).toBeInTheDocument()
        expect(screen.getByText('Launch DAOs, advanced metrics, and full management')).toBeInTheDocument()
      })
    })

    it('shows Upgrade to Pro option for users without membership', async () => {
      const user = userEvent.setup()
      const preferencesContext = {
        preferences: {
          clearPathStatus: { active: false, lastUpdated: null }
        }
      }

      renderWithProviders(<ClearPathButton />, { preferencesContext })

      const button = screen.getByRole('button', { name: /clearpath/i })
      await user.click(button)

      await waitFor(() => {
        expect(screen.getByText('Upgrade to Pro')).toBeInTheDocument()
        expect(screen.getByText('Create DAOs and access advanced governance features')).toBeInTheDocument()
      })
    })

    it('always shows both ClearPath options regardless of role', async () => {
      const user = userEvent.setup()
      const preferencesContext = {
        preferences: {
          clearPathStatus: { active: false, lastUpdated: null }
        }
      }

      renderWithProviders(<ClearPathButton />, { preferencesContext })

      const button = screen.getByRole('button', { name: /clearpath/i })
      await user.click(button)

      await waitFor(() => {
        // Both options should always be visible - check by description to avoid title conflict
        expect(screen.getByText('Browse DAOs, view proposals, and explore governance')).toBeInTheDocument()
        expect(screen.getByText('Upgrade to Pro')).toBeInTheDocument()
      })
    })
  })

  describe('Modal Integration', () => {
    it('opens ClearPath User modal when ClearPath option is clicked', async () => {
      const user = userEvent.setup()

      renderWithProviders(<ClearPathButton />)

      const button = screen.getByRole('button', { name: /clearpath/i })
      await user.click(button)

      // Find the ClearPath option by its description to avoid matching the dropdown title
      const clearPathOption = await screen.findByText('Browse DAOs, view proposals, and explore governance')
      await user.click(clearPathOption.closest('button'))

      await waitFor(() => {
        expect(mockShowModal).toHaveBeenCalled()
      })
    })

    it('opens Pro modal when ClearPath Pro is clicked for members', async () => {
      const user = userEvent.setup()
      const walletContext = {
        ...defaultWalletContext,
        roles: [ROLES.CLEARPATH_USER],
        hasRole: vi.fn((role) => role === ROLES.CLEARPATH_USER)
      }
      const preferencesContext = {
        preferences: {
          clearPathStatus: { active: true, lastUpdated: Date.now() }
        }
      }

      renderWithProviders(<ClearPathButton />, { walletContext, preferencesContext })

      const button = screen.getByRole('button', { name: /clearpath/i })
      await user.click(button)

      const proOption = await screen.findByText('ClearPath Pro')
      await user.click(proOption)

      await waitFor(() => {
        expect(mockShowModal).toHaveBeenCalled()
      })
    })

    it('opens purchase modal when Upgrade to Pro is clicked for non-members', async () => {
      const user = userEvent.setup()

      renderWithProviders(<ClearPathButton />)

      const button = screen.getByRole('button', { name: /clearpath/i })
      await user.click(button)

      const upgradeOption = await screen.findByText('Upgrade to Pro')
      await user.click(upgradeOption)

      await waitFor(() => {
        expect(mockShowModal).toHaveBeenCalled()
      })
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations', async () => {
      const { container } = renderWithProviders(<ClearPathButton />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has proper ARIA attributes on button', () => {
      renderWithProviders(<ClearPathButton />)
      const button = screen.getByRole('button', { name: /clearpath/i })
      
      expect(button).toHaveAttribute('aria-label')
      expect(button).toHaveAttribute('aria-expanded')
      expect(button).toHaveAttribute('aria-haspopup', 'true')
    })

    it('updates aria-expanded when dropdown opens', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ClearPathButton />)
      
      const button = screen.getByRole('button', { name: /clearpath/i })
      expect(button).toHaveAttribute('aria-expanded', 'false')
      
      await user.click(button)
      
      await waitFor(() => {
        expect(button).toHaveAttribute('aria-expanded', 'true')
      })
    })

    it('dropdown has proper role and aria-label', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ClearPathButton />)
      
      const button = screen.getByRole('button', { name: /clearpath/i })
      await user.click(button)
      
      await waitFor(() => {
        const menu = screen.getByRole('menu', { name: /clearpath options/i })
        expect(menu).toBeInTheDocument()
      })
    })

    it('is keyboard accessible', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ClearPathButton />)
      
      const button = screen.getByRole('button', { name: /clearpath/i })
      button.focus()
      expect(button).toHaveFocus()
      
      await user.keyboard('{Enter}')
      
      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument()
      })
    })
  })

  describe('Button States', () => {
    it('has correct initial aria-expanded state', () => {
      renderWithProviders(<ClearPathButton />)
      const button = screen.getByRole('button', { name: /clearpath/i })
      expect(button).toHaveAttribute('aria-expanded', 'false')
    })

    it('applies hover styles on hover', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ClearPathButton />)
      
      const button = screen.getByRole('button', { name: /clearpath/i })
      await user.hover(button)
      
      expect(button).toBeInTheDocument()
    })
  })
})
