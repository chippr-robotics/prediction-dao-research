import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import ClearPathModal from '../components/clearpath/ClearPathModal'

// Mock hooks
vi.mock('../hooks/useWeb3', () => ({
  useEthers: vi.fn(),
  useAccount: vi.fn()
}))

vi.mock('../hooks/useUserPreferences', () => ({
  useUserPreferences: vi.fn()
}))

import { useEthers, useAccount } from '../hooks/useWeb3'
import { useUserPreferences } from '../hooks/useUserPreferences'

describe('ClearPathModal Component', () => {
  const mockOnClose = vi.fn()
  const mockProvider = {}
  const mockAccount = '0x1234567890123456789012345678901234567890'

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default mock implementations
    useEthers.mockReturnValue({ provider: mockProvider })
    useAccount.mockReturnValue({ account: mockAccount })
    useUserPreferences.mockReturnValue({
      preferences: { demoMode: true }
    })
  })

  describe('Modal Visibility', () => {
    it('should not render when isOpen is false', () => {
      const { container } = render(
        <ClearPathModal isOpen={false} onClose={mockOnClose} />
      )
      expect(container.firstChild).toBeNull()
    })

    it('should render when isOpen is true', () => {
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('should have proper ARIA attributes', () => {
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      expect(dialog).toHaveAttribute('aria-labelledby', 'clearpath-modal-title')
    })
  })

  describe('Modal Close Functionality', () => {
    it('should call onClose when close button is clicked', async () => {
      const user = userEvent.setup()
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      const closeButton = screen.getByRole('button', { name: /close modal/i })
      await user.click(closeButton)
      
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('should call onClose when escape key is pressed', async () => {
      const user = userEvent.setup()
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      await user.keyboard('{Escape}')
      
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('should call onClose when backdrop is clicked', async () => {
      const user = userEvent.setup()
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      // Click on the backdrop element directly
      const backdrop = document.querySelector('.clearpath-modal-backdrop')
      await user.click(backdrop)
      
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('should not close when clicking inside the modal', async () => {
      const user = userEvent.setup()
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      // Click on the modal content, not the backdrop
      const modalContent = document.querySelector('.clearpath-modal')
      await user.click(modalContent)
      
      expect(mockOnClose).not.toHaveBeenCalled()
    })
  })

  describe('Tab Navigation', () => {
    it('should render all tab buttons', () => {
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      expect(screen.getByRole('tab', { name: /my daos/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /browse/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /proposals/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /metrics/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /launch/i })).toBeInTheDocument()
    })

    it('should show My DAOs tab as active by default', () => {
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      const myDAOsTab = screen.getByRole('tab', { name: /my daos/i })
      expect(myDAOsTab).toHaveAttribute('aria-selected', 'true')
      expect(myDAOsTab).toHaveClass('active')
    })

    it('should switch tabs when clicked', async () => {
      const user = userEvent.setup()
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      const browseTab = screen.getByRole('tab', { name: /browse/i })
      await user.click(browseTab)
      
      await waitFor(() => {
        expect(browseTab).toHaveAttribute('aria-selected', 'true')
        expect(browseTab).toHaveClass('active')
      })
    })

    it('should respect defaultTab prop', () => {
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} defaultTab="proposals" />)
      
      const proposalsTab = screen.getByRole('tab', { name: /proposals/i })
      expect(proposalsTab).toHaveAttribute('aria-selected', 'true')
    })

    it('should show badge count for My DAOs tab when there are DAOs', async () => {
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      // Wait for demo data to load
      await waitFor(() => {
        const myDAOsTab = screen.getByRole('tab', { name: /my daos/i })
        const badge = myDAOsTab.querySelector('.cp-tab-badge')
        expect(badge).toBeInTheDocument()
        expect(badge).toHaveTextContent('3') // DEMO_USER_DAOS has 3 items
      })
    })
  })

  describe('Demo Mode', () => {
    it('should display demo badge when in demo mode', () => {
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      expect(screen.getByText('Demo')).toBeInTheDocument()
    })

    it('should load demo DAOs in demo mode', async () => {
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      await waitFor(() => {
        expect(screen.getByText('Ethereum Classic Governance')).toBeInTheDocument()
        expect(screen.getByText('DeFi Innovation Fund')).toBeInTheDocument()
        expect(screen.getByText('Research & Development DAO')).toBeInTheDocument()
      })
    })

    it('should load demo proposals when switching to proposals tab', async () => {
      const user = userEvent.setup()
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      const proposalsTab = screen.getByRole('tab', { name: /proposals/i })
      await user.click(proposalsTab)
      
      await waitFor(() => {
        expect(screen.getByText('Treasury Diversification Strategy')).toBeInTheDocument()
        expect(screen.getByText('Grant Program Q1 2026')).toBeInTheDocument()
      })
    })
  })

  describe('DAO List Interaction', () => {
    it('should display DAO list in My DAOs tab', async () => {
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      await waitFor(() => {
        expect(screen.getByText('Ethereum Classic Governance')).toBeInTheDocument()
      })
    })

    it('should show DAO details when clicking on a DAO', async () => {
      const user = userEvent.setup()
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      await waitFor(() => {
        expect(screen.getByText('Ethereum Classic Governance')).toBeInTheDocument()
      })
      
      const daoCard = screen.getByText('Ethereum Classic Governance').closest('button')
      await user.click(daoCard)
      
      await waitFor(() => {
        expect(screen.getByText(/back to list/i)).toBeInTheDocument()
      })
    })

    it('should return to list view when clicking back button', async () => {
      const user = userEvent.setup()
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      await waitFor(() => {
        expect(screen.getByText('Ethereum Classic Governance')).toBeInTheDocument()
      })
      
      const daoCard = screen.getByText('Ethereum Classic Governance').closest('button')
      await user.click(daoCard)
      
      await waitFor(() => {
        expect(screen.getByText(/back to list/i)).toBeInTheDocument()
      })
      
      const backButton = screen.getByText(/back to list/i)
      await user.click(backButton)
      
      await waitFor(() => {
        expect(screen.getByText('Ethereum Classic Governance')).toBeInTheDocument()
        expect(screen.queryByText(/back to list/i)).not.toBeInTheDocument()
      })
    })
  })

  describe('Keyboard Navigation', () => {
    it('should navigate DAO list with arrow keys', async () => {
      const user = userEvent.setup()
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      await waitFor(() => {
        expect(screen.getByText('Ethereum Classic Governance')).toBeInTheDocument()
      })
      
      const firstDAO = screen.getByText('Ethereum Classic Governance').closest('button')
      firstDAO.focus()
      
      await user.keyboard('{ArrowDown}')
      
      const secondDAO = screen.getByText('DeFi Innovation Fund').closest('button')
      expect(secondDAO).toHaveFocus()
    })

    it('should select DAO with Enter key', async () => {
      const user = userEvent.setup()
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      await waitFor(() => {
        expect(screen.getByText('Ethereum Classic Governance')).toBeInTheDocument()
      })
      
      const firstDAO = screen.getByText('Ethereum Classic Governance').closest('button')
      firstDAO.focus()
      
      await user.keyboard('{Enter}')
      
      await waitFor(() => {
        expect(screen.getByText(/back to list/i)).toBeInTheDocument()
      })
    })

    it('should select DAO with Space key', async () => {
      const user = userEvent.setup()
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      await waitFor(() => {
        expect(screen.getByText('Ethereum Classic Governance')).toBeInTheDocument()
      })
      
      const firstDAO = screen.getByText('Ethereum Classic Governance').closest('button')
      firstDAO.focus()
      
      await user.keyboard(' ')
      
      await waitFor(() => {
        expect(screen.getByText(/back to list/i)).toBeInTheDocument()
      })
    })
  })

  describe('Launch DAO Form', () => {
    it('should display Launch DAO form in launch tab', async () => {
      const user = userEvent.setup()
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      const launchTab = screen.getByRole('tab', { name: /launch/i })
      await user.click(launchTab)
      
      await waitFor(() => {
        expect(screen.getByText('Launch New DAO')).toBeInTheDocument()
        expect(screen.getByLabelText(/dao name/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/description/i)).toBeInTheDocument()
      })
    })

    it('should validate DAO name requirement', async () => {
      const user = userEvent.setup()
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      const launchTab = screen.getByRole('tab', { name: /launch/i })
      await user.click(launchTab)
      
      await waitFor(() => {
        expect(screen.getByText('Launch New DAO')).toBeInTheDocument()
      })
      
      const submitButton = screen.getByRole('button', { name: /launch dao/i })
      await user.click(submitButton)
      
      await waitFor(() => {
        expect(screen.getByText(/dao name is required/i)).toBeInTheDocument()
      })
    })

    it('should validate DAO name minimum length', async () => {
      const user = userEvent.setup()
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      const launchTab = screen.getByRole('tab', { name: /launch/i })
      await user.click(launchTab)
      
      await waitFor(() => {
        expect(screen.getByLabelText(/dao name/i)).toBeInTheDocument()
      })
      
      const nameInput = screen.getByLabelText(/dao name/i)
      await user.type(nameInput, 'AB')
      
      const submitButton = screen.getByRole('button', { name: /launch dao/i })
      await user.click(submitButton)
      
      await waitFor(() => {
        expect(screen.getByText(/name must be at least 3 characters/i)).toBeInTheDocument()
      })
    })

    it('should validate description requirement', async () => {
      const user = userEvent.setup()
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      const launchTab = screen.getByRole('tab', { name: /launch/i })
      await user.click(launchTab)
      
      await waitFor(() => {
        expect(screen.getByLabelText(/dao name/i)).toBeInTheDocument()
      })
      
      const nameInput = screen.getByLabelText(/dao name/i)
      await user.type(nameInput, 'Test DAO')
      
      const submitButton = screen.getByRole('button', { name: /launch dao/i })
      await user.click(submitButton)
      
      await waitFor(() => {
        expect(screen.getByText(/description is required/i)).toBeInTheDocument()
      })
    })

    it('should validate treasury vault address format', async () => {
      const user = userEvent.setup()
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      const launchTab = screen.getByRole('tab', { name: /launch/i })
      await user.click(launchTab)
      
      await waitFor(() => {
        expect(screen.getByLabelText(/dao name/i)).toBeInTheDocument()
      })
      
      const nameInput = screen.getByLabelText(/dao name/i)
      await user.type(nameInput, 'Test DAO')
      
      const descInput = screen.getByLabelText(/description/i)
      await user.type(descInput, 'A test DAO for testing purposes')
      
      const treasuryInput = screen.getByLabelText(/treasury vault address/i)
      await user.type(treasuryInput, 'invalid-address')
      
      const submitButton = screen.getByRole('button', { name: /launch dao/i })
      await user.click(submitButton)
      
      await waitFor(() => {
        expect(screen.getByText(/treasury vault must be a valid ethereum address/i)).toBeInTheDocument()
      })
    })

    it('should validate admin addresses format', async () => {
      const user = userEvent.setup()
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      const launchTab = screen.getByRole('tab', { name: /launch/i })
      await user.click(launchTab)
      
      await waitFor(() => {
        expect(screen.getByLabelText(/dao name/i)).toBeInTheDocument()
      })
      
      const nameInput = screen.getByLabelText(/dao name/i)
      await user.type(nameInput, 'Test DAO')
      
      const descInput = screen.getByLabelText(/description/i)
      await user.type(descInput, 'A test DAO for testing purposes')
      
      const adminsInput = screen.getByLabelText(/initial admins/i)
      await user.type(adminsInput, 'invalid-address1, invalid-address2')
      
      const submitButton = screen.getByRole('button', { name: /launch dao/i })
      await user.click(submitButton)
      
      await waitFor(() => {
        expect(screen.getByText(/all admin addresses must be valid ethereum addresses/i)).toBeInTheDocument()
      })
    })

    it('should clear field error when user starts typing', async () => {
      const user = userEvent.setup()
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      const launchTab = screen.getByRole('tab', { name: /launch/i })
      await user.click(launchTab)
      
      await waitFor(() => {
        expect(screen.getByLabelText(/dao name/i)).toBeInTheDocument()
      })
      
      const submitButton = screen.getByRole('button', { name: /launch dao/i })
      await user.click(submitButton)
      
      await waitFor(() => {
        expect(screen.getByText(/dao name is required/i)).toBeInTheDocument()
      })
      
      const nameInput = screen.getByLabelText(/dao name/i)
      await user.type(nameInput, 'Test')
      
      await waitFor(() => {
        expect(screen.queryByText(/dao name is required/i)).not.toBeInTheDocument()
      })
    })
  })

  describe('Accessibility', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <ClearPathModal isOpen={true} onClose={mockOnClose} />
      )
      
      // Wait for content to load
      await waitFor(() => {
        expect(screen.getByText('Ethereum Classic Governance')).toBeInTheDocument()
      })
      
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('should have proper ARIA labels on DAO list items', async () => {
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      await waitFor(() => {
        expect(screen.getByText('Ethereum Classic Governance')).toBeInTheDocument()
      })
      
      const daoCard = screen.getByText('Ethereum Classic Governance').closest('button')
      expect(daoCard).toHaveAttribute('aria-label')
    })

    it('should have proper ARIA labels on proposal list items', async () => {
      const user = userEvent.setup()
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      const proposalsTab = screen.getByRole('tab', { name: /proposals/i })
      await user.click(proposalsTab)
      
      await waitFor(() => {
        expect(screen.getByText('Treasury Diversification Strategy')).toBeInTheDocument()
      })
      
      const proposalCard = screen.getByText('Treasury Diversification Strategy').closest('button')
      expect(proposalCard).toHaveAttribute('aria-label')
    })
  })

  describe('Browse Tab', () => {
    it('should load browse DAOs when switching to browse tab', async () => {
      const user = userEvent.setup()
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      const browseTab = screen.getByRole('tab', { name: /browse/i })
      await user.click(browseTab)
      
      await waitFor(() => {
        expect(screen.getByText('NFT Creators Collective')).toBeInTheDocument()
        expect(screen.getByText('Infrastructure Builders Guild')).toBeInTheDocument()
      })
    })
  })

  describe('Proposal Details', () => {
    it('should show proposal details when clicking on a proposal', async () => {
      const user = userEvent.setup()
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      const proposalsTab = screen.getByRole('tab', { name: /proposals/i })
      await user.click(proposalsTab)
      
      await waitFor(() => {
        expect(screen.getByText('Treasury Diversification Strategy')).toBeInTheDocument()
      })
      
      const proposalCard = screen.getByText('Treasury Diversification Strategy').closest('button')
      await user.click(proposalCard)
      
      await waitFor(() => {
        expect(screen.getByText(/back to proposals/i)).toBeInTheDocument()
        expect(screen.getByText('Proposal to diversify 20% of treasury holdings into stable assets.')).toBeInTheDocument()
      })
    })

    it('should show vote counts in proposal details', async () => {
      const user = userEvent.setup()
      render(<ClearPathModal isOpen={true} onClose={mockOnClose} />)
      
      const proposalsTab = screen.getByRole('tab', { name: /proposals/i })
      await user.click(proposalsTab)
      
      await waitFor(() => {
        expect(screen.getByText('Treasury Diversification Strategy')).toBeInTheDocument()
      })
      
      const proposalCard = screen.getByText('Treasury Diversification Strategy').closest('button')
      await user.click(proposalCard)
      
      await waitFor(() => {
        expect(screen.getByText(/For: 847/i)).toBeInTheDocument()
        expect(screen.getByText(/Against: 234/i)).toBeInTheDocument()
      })
    })
  })
})
