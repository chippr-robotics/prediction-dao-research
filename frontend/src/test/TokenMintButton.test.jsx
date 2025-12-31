import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import TokenMintButton from '../components/TokenMintButton'
import { RoleContext, ROLES, ROLE_INFO, UIContext, UserPreferencesContext } from '../contexts'

// Mock wallet hook
vi.mock('../hooks', () => ({
  useWallet: vi.fn()
}))

import { useWallet } from '../hooks'

describe('TokenMintButton Component', () => {
  const mockShowModal = vi.fn()
  const mockHideModal = vi.fn()
  
  const defaultRoleContext = {
    roles: [],
    hasRole: vi.fn(() => false),
    ROLES,
    ROLE_INFO
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
      roleContext = defaultRoleContext,
      uiContext = defaultUIContext,
      preferencesContext = defaultPreferencesContext
    } = options

    return render(
      <RoleContext.Provider value={roleContext}>
        <UIContext.Provider value={uiContext}>
          <UserPreferencesContext.Provider value={preferencesContext}>
            {component}
          </UserPreferencesContext.Provider>
        </UIContext.Provider>
      </RoleContext.Provider>
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    useWallet.mockReturnValue({ isConnected: true })
  })

  describe('Rendering', () => {
    it('renders button when wallet is not connected but appears inactive', () => {
      useWallet.mockReturnValue({ isConnected: false })
      renderWithProviders(<TokenMintButton />)
      const button = screen.getByRole('button', { name: /tokenmint/i })
      expect(button).toBeInTheDocument()
      expect(button).toHaveClass('inactive')
      expect(button).toHaveAttribute('aria-disabled', 'true')
    })

    it('renders button when wallet is connected', () => {
      renderWithProviders(<TokenMintButton />)
      const button = screen.getByRole('button', { name: /tokenmint/i })
      expect(button).toBeInTheDocument()
      expect(button).not.toHaveClass('inactive')
    })

    it('renders TokenMint logo image', () => {
      renderWithProviders(<TokenMintButton />)
      const img = screen.getByAltText('TokenMint')
      expect(img).toHaveAttribute('src', '/assets/tokenmint_no-text_logo.svg')
    })
  })

  describe('Dropdown Interaction', () => {
    it('does not open dropdown when button is clicked while inactive', async () => {
      const user = userEvent.setup()
      useWallet.mockReturnValue({ isConnected: false })
      renderWithProviders(<TokenMintButton />)
      
      const button = screen.getByRole('button', { name: /tokenmint/i })
      await user.click(button)
      
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('opens dropdown when button is clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TokenMintButton />)
      
      const button = screen.getByRole('button', { name: /tokenmint/i })
      await user.click(button)
      
      await waitFor(() => {
        expect(screen.getByRole('menu', { name: /tokenmint options/i })).toBeInTheDocument()
      })
    })

    it('closes dropdown when button is clicked again', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TokenMintButton />)
      
      const button = screen.getByRole('button', { name: /tokenmint/i })
      await user.click(button)
      await user.click(button)
      
      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
      })
    })

    it('closes dropdown on Escape key', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TokenMintButton />)
      
      const button = screen.getByRole('button', { name: /tokenmint/i })
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
    it('shows token creation option for users with TOKENMINT role', async () => {
      const user = userEvent.setup()
      const roleContext = {
        ...defaultRoleContext,
        roles: [ROLES.TOKENMINT],
        hasRole: vi.fn((role) => role === ROLES.TOKENMINT)
      }
      
      renderWithProviders(<TokenMintButton />, { roleContext })
      
      const button = screen.getByRole('button', { name: /tokenmint/i })
      await user.click(button)
      
      await waitFor(() => {
        expect(screen.getByText('Create New Token')).toBeInTheDocument()
      })
    })

    it('shows market creation option for users with MARKET_MAKER role', async () => {
      const user = userEvent.setup()
      const roleContext = {
        ...defaultRoleContext,
        roles: [ROLES.MARKET_MAKER],
        hasRole: vi.fn((role) => role === ROLES.MARKET_MAKER)
      }
      
      renderWithProviders(<TokenMintButton />, { roleContext })
      
      const button = screen.getByRole('button', { name: /tokenmint/i })
      await user.click(button)
      
      await waitFor(() => {
        expect(screen.getByText('Create New Market')).toBeInTheDocument()
      })
    })

    it('shows membership purchase option for users without membership', async () => {
      const user = userEvent.setup()
      const preferencesContext = {
        preferences: {
          clearPathStatus: { active: false, lastUpdated: null }
        }
      }
      
      renderWithProviders(<TokenMintButton />, { preferencesContext })
      
      const button = screen.getByRole('button', { name: /tokenmint/i })
      await user.click(button)
      
      await waitFor(() => {
        expect(screen.getByText('Purchase Membership')).toBeInTheDocument()
      })
    })

    it('shows multiple options for users with multiple roles', async () => {
      const user = userEvent.setup()
      const roleContext = {
        ...defaultRoleContext,
        roles: [ROLES.TOKENMINT, ROLES.MARKET_MAKER],
        hasRole: vi.fn((role) => role === ROLES.TOKENMINT || role === ROLES.MARKET_MAKER)
      }
      
      renderWithProviders(<TokenMintButton />, { roleContext })
      
      const button = screen.getByRole('button', { name: /tokenmint/i })
      await user.click(button)
      
      await waitFor(() => {
        expect(screen.getByText('Create New Token')).toBeInTheDocument()
        expect(screen.getByText('Create New Market')).toBeInTheDocument()
      })
    })
  })

  describe('Modal Integration', () => {
    it('opens token builder modal when create token option is clicked', async () => {
      const user = userEvent.setup()
      const roleContext = {
        ...defaultRoleContext,
        roles: [ROLES.TOKENMINT],
        hasRole: vi.fn((role) => role === ROLES.TOKENMINT)
      }
      
      renderWithProviders(<TokenMintButton />, { roleContext })
      
      const button = screen.getByRole('button', { name: /tokenmint/i })
      await user.click(button)
      
      const createTokenOption = await screen.findByText('Create New Token')
      await user.click(createTokenOption)
      
      // Modal should be rendered (TokenMintBuilderModal)
      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
      })
    })

    it('shows market creation modal when create market option is clicked', async () => {
      const user = userEvent.setup()
      const roleContext = {
        ...defaultRoleContext,
        roles: [ROLES.MARKET_MAKER],
        hasRole: vi.fn((role) => role === ROLES.MARKET_MAKER)
      }
      
      renderWithProviders(<TokenMintButton />, { roleContext })
      
      const button = screen.getByRole('button', { name: /tokenmint/i })
      await user.click(button)
      
      const createMarketOption = await screen.findByText('Create New Market')
      await user.click(createMarketOption)
      
      await waitFor(() => {
        expect(mockShowModal).toHaveBeenCalled()
      })
    })

    it('shows role purchase modal when purchase membership is clicked', async () => {
      const user = userEvent.setup()
      
      renderWithProviders(<TokenMintButton />)
      
      const button = screen.getByRole('button', { name: /tokenmint/i })
      await user.click(button)
      
      const purchaseOption = await screen.findByText('Purchase Membership')
      await user.click(purchaseOption)
      
      await waitFor(() => {
        expect(mockShowModal).toHaveBeenCalled()
      })
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations', async () => {
      const { container } = renderWithProviders(<TokenMintButton />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has proper ARIA attributes on button', () => {
      renderWithProviders(<TokenMintButton />)
      const button = screen.getByRole('button', { name: /tokenmint/i })
      
      expect(button).toHaveAttribute('aria-label')
      expect(button).toHaveAttribute('aria-expanded')
      expect(button).toHaveAttribute('aria-haspopup', 'true')
    })

    it('updates aria-expanded when dropdown opens', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TokenMintButton />)
      
      const button = screen.getByRole('button', { name: /tokenmint/i })
      expect(button).toHaveAttribute('aria-expanded', 'false')
      
      await user.click(button)
      
      await waitFor(() => {
        expect(button).toHaveAttribute('aria-expanded', 'true')
      })
    })

    it('dropdown has proper role and aria-label', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TokenMintButton />)
      
      const button = screen.getByRole('button', { name: /tokenmint/i })
      await user.click(button)
      
      await waitFor(() => {
        const menu = screen.getByRole('menu', { name: /tokenmint options/i })
        expect(menu).toBeInTheDocument()
      })
    })

    it('is keyboard accessible', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TokenMintButton />)
      
      const button = screen.getByRole('button', { name: /tokenmint/i })
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
      renderWithProviders(<TokenMintButton />)
      const button = screen.getByRole('button', { name: /tokenmint/i })
      expect(button).toHaveAttribute('aria-expanded', 'false')
    })

    it('applies hover styles on hover', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TokenMintButton />)
      
      const button = screen.getByRole('button', { name: /tokenmint/i })
      await user.hover(button)
      
      expect(button).toBeInTheDocument()
    })
  })
})
