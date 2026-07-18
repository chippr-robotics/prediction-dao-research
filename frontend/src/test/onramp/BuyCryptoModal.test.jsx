/**
 * BuyCryptoModal (spec 060) — the pre-handoff disclosure. Verifies the FR-003 summary (asset,
 * network, full destination address), the honest custody/fee disclosure (FR-004/FR-008), the
 * Continue -> mint -> window.open handoff with popup-blocked fallback, the honest failure state,
 * and settlement honesty (US3: no synthetic pending/success claim after the handoff).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BuyCryptoModal from '../../components/wallet/BuyCryptoModal'
import { fetchOnrampOptions, createOnrampSession } from '../../lib/onramp/onrampClient'

vi.mock('../../lib/onramp/onrampClient', () => ({
  fetchOnrampOptions: vi.fn(),
  createOnrampSession: vi.fn(),
}))

const DEST = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const HOSTED = 'https://pay.coinbase.com/buy/select-asset?sessionToken=tok&defaultNetwork=polygon&defaultAsset=USDC'

beforeEach(() => {
  fetchOnrampOptions.mockResolvedValue({ chainId: 137, available: true, assets: ['MATIC', 'USDC'], defaultAsset: 'USDC' })
  createOnrampSession.mockResolvedValue({ url: HOSTED })
  vi.stubGlobal('open', vi.fn(() => ({ focus: vi.fn() })))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const renderModal = (props = {}) =>
  render(<BuyCryptoModal isOpen onClose={vi.fn()} address={DEST} chainId={137} {...props} />)

describe('pre-handoff disclosure (FR-003 / FR-008)', () => {
  it('shows the full destination address, the network, and the USDC default asset', async () => {
    renderModal()
    expect(await screen.findByText(DEST)).toBeInTheDocument()
    expect(screen.getByText('Polygon')).toBeInTheDocument()
    // Multiple assets -> a selector defaulting to USDC.
    expect(screen.getByLabelText('Asset to buy')).toHaveValue('USDC')
  })

  it('disclosure states fees are Coinbase’s, FairWins adds no fee and never holds funds', async () => {
    renderModal()
    const disclosure = await screen.findByText(/FairWins adds no fee and never holds your funds/)
    expect(disclosure).toHaveTextContent(/Payment, identity checks and fees are Coinbase/)
    expect(disclosure).toHaveTextContent(/delivered by Coinbase directly to your address/)
  })

  it('renders a plain asset label (no selector) when only one asset is deliverable', async () => {
    fetchOnrampOptions.mockResolvedValue({ available: true, assets: ['USDC'], defaultAsset: 'USDC' })
    renderModal()
    expect(await screen.findByText('USDC')).toBeInTheDocument()
    expect(screen.queryByLabelText('Asset to buy')).not.toBeInTheDocument()
  })
})

describe('handoff', () => {
  it('Continue mints against the live props and opens the hosted URL in a new tab', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(await screen.findByRole('button', { name: /continue to coinbase/i }))
    await waitFor(() => {
      expect(createOnrampSession).toHaveBeenCalledWith({ address: DEST, chainId: 137, asset: 'USDC' })
      expect(window.open).toHaveBeenCalledWith(HOSTED, '_blank', 'noopener')
    })
  })

  it('a selected non-default asset is what gets minted', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.selectOptions(await screen.findByLabelText('Asset to buy'), 'MATIC')
    await user.click(screen.getByRole('button', { name: /continue to coinbase/i }))
    await waitFor(() => {
      expect(createOnrampSession).toHaveBeenCalledWith({ address: DEST, chainId: 137, asset: 'MATIC' })
    })
  })

  it('popup blocked -> the URL stays reachable as a visible link (user is never stranded)', async () => {
    window.open.mockReturnValue(null)
    const user = userEvent.setup()
    renderModal()
    await user.click(await screen.findByRole('button', { name: /continue to coinbase/i }))
    const link = await screen.findByRole('link', { name: /open coinbase to finish your purchase/i })
    expect(link).toHaveAttribute('href', HOSTED)
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('mint failure renders the honest unavailable state, not a dead retry loop', async () => {
    createOnrampSession.mockRejectedValue(new Error('quota'))
    const user = userEvent.setup()
    renderModal()
    await user.click(await screen.findByRole('button', { name: /continue to coinbase/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Nothing was charged/)
    expect(window.open).not.toHaveBeenCalled()
    // The member can still close cleanly (FR-010) — and Continue remains for a later retry.
    expect(screen.getByRole('button', { name: /continue to coinbase/i })).toBeEnabled()
  })
})

describe('settlement honesty (US3 — no fake finality)', () => {
  it('after the handoff the copy promises only chain-truth: delivery on Coinbase’s timeline', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(await screen.findByRole('button', { name: /continue to coinbase/i }))
    expect(await screen.findByText(/your balance\s+here updates once the crypto arrives on-chain/i)).toBeInTheDocument()
    // No synthetic success/pending claim anywhere: nothing says the funds are already credited.
    expect(screen.queryByText(/purchase complete|funds credited|pending balance/i)).not.toBeInTheDocument()
  })

  it('the onramp path never touches balance/portfolio state (source-level isolation)', async () => {
    // Grep-level guard: the onramp lib + modal must not import portfolio/balance stores — the
    // balance updates only through the normal chain-read path (spec US3, FR-009).
    const fs = await import('node:fs')
    const path = await import('node:path')
    const files = [
      path.resolve(__dirname, '../../lib/onramp/onrampClient.js'),
      path.resolve(__dirname, '../../components/wallet/BuyCryptoModal.jsx'),
    ]
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8')
      expect(src).not.toMatch(/lib\/portfolio|useDex|usePortfolio|balances/)
    }
  })
})

describe('dialog behavior', () => {
  it('Escape closes; nothing renders when closed', async () => {
    const onClose = vi.fn()
    const { rerender } = render(<BuyCryptoModal isOpen onClose={onClose} address={DEST} chainId={137} />)
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
    rerender(<BuyCryptoModal isOpen={false} onClose={onClose} address={DEST} chainId={137} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
