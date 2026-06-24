import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ContractPanel from '../ContractPanel'

// Phase 14 (P3-c, US13, T094): contract surface — metadata renders; source verification reported truthfully
// (NEVER implied "verified", only an explorer deep link); copy address/ABI fire the app notification system.

const showNotification = vi.fn()
vi.mock('../../../hooks/useUI', () => ({ useNotification: () => ({ showNotification }) }))

const copy = vi.fn().mockResolvedValue(true)
vi.mock('../../../hooks/useClipboard', () => ({ default: () => ({ copied: false, error: null, copy }) }))

vi.mock('../../../config/networks', () => ({
  getNetwork: vi.fn(() => ({ name: 'Ethereum Classic Mordor', explorer: { name: 'Blockscout', baseUrl: 'https://etc-mordor.blockscout.com' } })),
  listSupportedChainIds: () => [80002, 63, 137, 1337],
  NETWORKS: {
    80002: { name: 'Polygon Amoy' },
    63: { name: 'Ethereum Classic Mordor' },
    137: { name: 'Polygon' },
    1337: { name: 'Hardhat' },
  },
}))

// Only Mordor (63) carries a tokenFactory — the panel must not imply deployments elsewhere.
vi.mock('../../../config/contracts', () => ({
  getContractAddressForChain: (name, chainId) =>
    name === 'tokenFactory' && chainId === 63 ? '0x5bdf74Ce98D41bf35192c20B25ACd561C75CFe62' : undefined,
}))

const TOKEN = '0x00000000000000000000000000000000000000aa'
const token = {
  tokenAddress: TOKEN,
  standard: 0, // Open ERC-20
  name: 'Test Token',
  symbol: 'TKN',
  issuer: '0x00000000000000000000000000000000000000b1',
  createdAt: 1700000000,
  metadataURI: '',
}
const caps = { model: 'v2', standard: 0, decimals: 18, capped: false, cap: 0n }

describe('ContractPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders metadata and a truthful (not implied-verified) verification link', () => {
    render(<ContractPanel token={token} caps={caps} chainId={63} />)
    expect(screen.getByText('Open ERC-20')).toBeInTheDocument()
    expect(screen.getByText('Role-based (AccessControl)')).toBeInTheDocument()
    // Truthful: links to the explorer, never asserts the contract IS verified.
    expect(screen.getByText(/performed out-of-band/i)).toBeInTheDocument()
    expect(screen.queryByText(/\bverified\b/i)).not.toBeInTheDocument()
    // Blockscout selects the source tab via ?tab=contract (not the Etherscan #code fragment).
    const source = screen.getByRole('link', { name: /view source/i })
    expect(source).toHaveAttribute('href', `https://etc-mordor.blockscout.com/address/${TOKEN}?tab=contract`)
  })

  it('shows a truthful no-explorer message (and no source link) on an explorer-less network', async () => {
    const { getNetwork } = await import('../../../config/networks')
    getNetwork.mockReturnValueOnce({ name: 'Hardhat', explorer: { name: 'Local', baseUrl: '' } })
    render(<ContractPanel token={token} caps={caps} chainId={1337} />)
    expect(screen.getByText(/no block explorer configured/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /view source/i })).not.toBeInTheDocument()
  })

  it('lists only networks that actually carry a factory (Mordor) — with its address — not Polygon/Amoy', () => {
    render(<ContractPanel token={token} caps={caps} chainId={63} />)
    const card = screen.getByText('Factory deployments').closest('.tm-card')
    // The Mordor deployment ROW (short factory address) must actually render — not just the intro line.
    expect(card).toHaveTextContent('0x5bdf…Fe62')
    expect(card).not.toHaveTextContent('No factory deployments are configured.')
    expect(card).not.toHaveTextContent('Polygon Amoy')
    expect(card).not.toHaveTextContent(/Polygon\b(?! Amoy)/)
  })

  it('copies the address and the v2 role-based JSON ABI, notifying via the app system', async () => {
    const user = userEvent.setup()
    render(<ContractPanel token={token} caps={caps} chainId={63} />)

    await user.click(screen.getByRole('button', { name: /copy address/i }))
    await waitFor(() => expect(copy).toHaveBeenCalledWith(TOKEN))
    expect(showNotification).toHaveBeenCalledWith('Address copied.', 'success')

    await user.click(screen.getByRole('button', { name: /copy abi/i }))
    await waitFor(() => expect(copy).toHaveBeenCalledTimes(2))
    const fragments = JSON.parse(copy.mock.calls[1][0])
    expect(fragments.length).toBeGreaterThan(0)
    // v2 model ⇒ the role-based surface, NOT the v1 Ownable ABI.
    expect(fragments.some((f) => f.name === 'grantRole')).toBe(true)
    expect(fragments.some((f) => f.name === 'owner')).toBe(false)
    expect(showNotification).toHaveBeenLastCalledWith('ABI copied.', 'success')
  })

  it('copies the v1 Ownable ABI for an owner-managed token', async () => {
    const user = userEvent.setup()
    render(<ContractPanel token={token} caps={{ model: 'v1', standard: 0, decimals: 18 }} chainId={63} />)
    await user.click(screen.getByRole('button', { name: /copy abi/i }))
    await waitFor(() => expect(copy).toHaveBeenCalled())
    const fragments = JSON.parse(copy.mock.calls.at(-1)[0])
    expect(fragments.some((f) => f.name === 'owner')).toBe(true)
    expect(fragments.some((f) => f.name === 'grantRole')).toBe(false)
  })

  it('reports a copy failure through the notification system', async () => {
    copy.mockResolvedValueOnce(false)
    const user = userEvent.setup()
    render(<ContractPanel token={token} caps={caps} chainId={63} />)
    await user.click(screen.getByRole('button', { name: /copy address/i }))
    await waitFor(() =>
      expect(showNotification).toHaveBeenCalledWith(expect.stringMatching(/copy it manually/i), 'error')
    )
  })
})
