import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ContractPanel from '../ContractPanel'
import { hostRef, resetHost } from './_host'

// Phase 14 (P3-c, US13, T094): contract surface — metadata renders; source verification reported truthfully
// (NEVER implied "verified", only an explorer deep link); copy address/ABI fire the app notification system.

const showNotification = vi.fn()

const copy = vi.fn().mockResolvedValue(true)
vi.mock('@fairwins/miniapp-sdk', () => ({ useMiniAppHost: () => hostRef.current }))
vi.mock('../useClipboard', () => ({ default: () => ({ copied: false, error: null, copy }) }))


// Deployment resolution is the HOST's now: `_host.jsx` answers `contracts('tokenFactory', …)`
// per chain and throws for any name outside the manifest allowlist, exactly as the real host does.

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
  beforeEach(() => {
  vi.clearAllMocks()
  resetHost({ toast: { show: showNotification } })
})

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
    // The host answers with the descriptor; an explorer-less chain is one whose `explorer` is null.
    resetHost({ network: () => ({ chainId: 1337, name: 'Hardhat', isTestnet: true, nativeCurrency: { symbol: 'ETH', decimals: 18 }, explorer: null, subgraphUrl: null }) })
    render(<ContractPanel token={token} caps={caps} chainId={1337} />)
    expect(screen.getByText(/no block explorer configured/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /view source/i })).not.toBeInTheDocument()
  })

  /*
   * SCOPED TO THE ACTIVE CHAIN as of the mini-app conversion (spec 073 T026). The host-native panel
   * listed the factory across every supported network; rebuilding that needs a chain roster, and the
   * only way to give a package one is a new host capability granted permanently to EVERY package,
   * including third-party. That was proposed and declined for one informational card. These tests
   * pin the reduction so it stays a decision rather than drifting back by accident.
   */
  it('shows the factory for the ACTIVE chain, with its address', () => {
    render(<ContractPanel token={token} caps={caps} chainId={63} />)
    const card = screen.getByText('Factory deployment').closest('.tm-card')
    expect(card).toHaveTextContent('0x5bdf…Fe62')
    expect(card).toHaveTextContent('Mordor')
    expect(card).not.toHaveTextContent('No factory is deployed on this network.')
  })

  it('does not name any other network — the roster is not reachable from a package', () => {
    render(<ContractPanel token={token} caps={caps} chainId={63} />)
    const card = screen.getByText('Factory deployment').closest('.tm-card')
    expect(card).not.toHaveTextContent('Polygon')
    expect(card).not.toHaveTextContent('Amoy')
  })

  it('says so plainly when no factory is deployed on the active chain', () => {
    // `host.contracts()` returns null for a DECLARED name with no deployment — an absence, not an error.
    resetHost({ contracts: () => null })
    render(<ContractPanel token={token} caps={caps} chainId={1337} />)
    expect(screen.getByText('No factory is deployed on this network.')).toBeInTheDocument()
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
