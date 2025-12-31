import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import ClearPathButton from '../components/clearpath/ClearPathButton'
import { RoleContext, ROLES, ROLE_INFO } from '../contexts/RoleContext'
import { UIContext } from '../contexts/UIContext'
import { UserPreferencesContext } from '../contexts/UserPreferencesContext'

// Mock wallet hook
vi.mock('../hooks', () => ({
  useWallet: vi.fn()
}))

import { useWallet } from '../hooks'

describe('ClearPathButton Component', () => {
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
    it('does not render when wallet is not connected', () => {
      useWallet.mockReturnValue({ isConnected: false })
      const { container } = renderWithProviders(<ClearPathButton />)
      expect(container.firstChild).toBeNull()
    })

    it('renders button when wallet is connected', () => {
      renderWithProviders(<ClearPathButton />)
      const button = screen.getByRole('button', { name: /clearpath/i })
      expect(button).toBeInTheDocument()
    })

    it('renders ClearPath logo image', () => {
      renderWithProviders(<ClearPathButton />)
      const img = screen.getByAltText('ClearPath')
      expect(img).toHaveAttribute('src', '/assets/clearpath_no-text_logo.svg')
    })
  })

  describe('Dropdown Interaction', () => {
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
    it('shows governance options for users with CLEARPATH_USER role', async () => {
      const user = userEvent.setup()
      const roleContext = {
        ...defaultRoleContext,
        roles: [ROLES.CLEARPATH_USER],
        hasRole: vi.fn((role) => role === ROLES.CLEARPATH_USER)
      }
      const preferencesContext = {
        preferences: {
          clearPathStatus: { active: true, lastUpdated: Date.now() }
        }
      }
      
      renderWithProviders(<ClearPathButton />, { roleContext, preferencesContext })
      
      const button = screen.getByRole('button', { name: /clearpath/i })
      await user.click(button)
      
      await waitFor(() => {
        expect(screen.getByText('Governance Dashboard')).toBeInTheDocument()
        expect(screen.getByText('My DAOs')).toBeInTheDocument()
        expect(screen.getByText('Proposals')).toBeInTheDocument()
      })
    })

    it('shows membership purchase option for users without membership', async () => {
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
        expect(screen.getByText('Purchase ClearPath Membership')).toBeInTheDocument()
      })
    })

    it('does not show governance options for users without role', async () => {
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
        expect(screen.queryByText('Governance Dashboard')).not.toBeInTheDocument()
        expect(screen.queryByText('My DAOs')).not.toBeInTheDocument()
        expect(screen.queryByText('Proposals')).not.toBeInTheDocument()
      })
    })
  })

  describe('Modal Integration', () => {
    it('opens governance modal when governance dashboard option is clicked', async () => {
      const user = userEvent.setup()
      const roleContext = {
        ...defaultRoleContext,
        roles: [ROLES.CLEARPATH_USER],
        hasRole: vi.fn((role) => role === ROLES.CLEARPATH_USER)
      }
      const preferencesContext = {
        preferences: {
          clearPathStatus: { active: true, lastUpdated: Date.now() }
        }
      }
      
      renderWithProviders(<ClearPathButton />, { roleContext, preferencesContext })
      
      const button = screen.getByRole('button', { name: /clearpath/i })
      await user.click(button)
      
      const governanceOption = await screen.findByText('Governance Dashboard')
      await user.click(governanceOption)
      
      await waitFor(() => {
        expect(mockShowModal).toHaveBeenCalled()
      })
    })

    it('shows role purchase modal when purchase membership is clicked', async () => {
      const user = userEvent.setup()
      
      renderWithProviders(<ClearPathButton />)
      
      const button = screen.getByRole('button', { name: /clearpath/i })
      await user.click(button)
      
      const purchaseOption = await screen.findByText('Purchase ClearPath Membership')
      await user.click(purchaseOption)
      
      await waitFor(() => {
        expect(mockShowModal).toHaveBeenCalled()
      })
    })

    it('opens DAO modal when My DAOs option is clicked', async () => {
      const user = userEvent.setup()
      const roleContext = {
        ...defaultRoleContext,
        roles: [ROLES.CLEARPATH_USER],
        hasRole: vi.fn((role) => role === ROLES.CLEARPATH_USER)
      }
      const preferencesContext = {
        preferences: {
          clearPathStatus: { active: true, lastUpdated: Date.now() }
        }
      }
      
      renderWithProviders(<ClearPathButton />, { roleContext, preferencesContext })
      
      const button = screen.getByRole('button', { name: /clearpath/i })
      await user.click(button)
      
      const daosOption = await screen.findByText('My DAOs')
      await user.click(daosOption)
      
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
