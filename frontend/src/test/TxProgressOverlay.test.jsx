/**
 * txProgressBus + TxProgressOverlay — the global passkey signature→confirmation
 * progress surface (spec 041 FR-017). The bus maps engine LIFECYCLE events to
 * user-facing phases; the overlay renders them and never claims "confirmed"
 * before on-chain inclusion.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import {
  beginTx,
  publishLifecycle,
  failTx,
  getSnapshot,
  __resetTxProgress,
  PHASE,
} from '../lib/passkey/txProgressBus'
import TxProgressOverlay from '../components/wallet/TxProgressOverlay'

describe('txProgressBus lifecycle mapping', () => {
  beforeEach(() => __resetTxProgress())

  it('beginTx starts in PREPARING and is active', () => {
    beginTx({ chainId: 137 })
    expect(getSnapshot()).toMatchObject({ active: true, phase: PHASE.PREPARING, chainId: 137 })
  })

  it('maps draft→signing, submitted→confirming, included→confirmed(txHash)', () => {
    beginTx({ chainId: 137 })
    publishLifecycle({ state: 'draft', route: 'userop', sponsored: true })
    expect(getSnapshot()).toMatchObject({ phase: PHASE.SIGNING, route: 'userop', sponsored: true })

    publishLifecycle({ state: 'submitted', userOpHash: '0xuo', sponsored: true })
    expect(getSnapshot()).toMatchObject({ phase: PHASE.CONFIRMING, userOpHash: '0xuo' })

    publishLifecycle({ state: 'included', txHash: '0xabc' })
    expect(getSnapshot()).toMatchObject({ phase: PHASE.CONFIRMED, txHash: '0xabc' })
  })

  it('maps failed→failed(reason) and stalled→stalled', () => {
    beginTx({ chainId: 137 })
    publishLifecycle({ state: 'failed', reason: 'reverted' })
    expect(getSnapshot()).toMatchObject({ phase: PHASE.FAILED, reason: 'reverted' })

    __resetTxProgress()
    beginTx({ chainId: 137 })
    publishLifecycle({ state: 'stalled', lastKnown: { userOpHash: '0xuo' } })
    expect(getSnapshot()).toMatchObject({ phase: PHASE.STALLED, userOpHash: '0xuo' })
  })

  it('ignores updates when no batch is active', () => {
    publishLifecycle({ state: 'submitted', userOpHash: '0xuo' })
    expect(getSnapshot()).toBeNull()
  })

  it('failTx forces the failed terminal', () => {
    beginTx({ chainId: 137 })
    failTx('boom')
    expect(getSnapshot()).toMatchObject({ phase: PHASE.FAILED, reason: 'boom' })
  })
})

describe('TxProgressOverlay rendering', () => {
  beforeEach(() => __resetTxProgress())
  afterEach(() => cleanup())

  it('renders nothing when idle', () => {
    const { container } = render(<TxProgressOverlay />)
    expect(container.querySelector('.txp-card')).toBeNull()
  })

  it('shows the passkey prompt copy while signing, then an explorer link when confirmed', () => {
    render(<TxProgressOverlay />)
    act(() => {
      beginTx({ chainId: 137 })
      publishLifecycle({ state: 'draft', route: 'userop', sponsored: true })
    })
    expect(screen.getByText('Confirm with your passkey')).toBeInTheDocument()
    expect(screen.getByText('Gas sponsored')).toBeInTheDocument()

    act(() => publishLifecycle({ state: 'included', txHash: '0x' + 'a'.repeat(64) }))
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /view on explorer/i })
    expect(link).toHaveAttribute('href', expect.stringContaining('/tx/0x' + 'a'.repeat(64)))
  })

  it('surfaces the stall guidance and stays until dismissed', () => {
    render(<TxProgressOverlay />)
    act(() => {
      beginTx({ chainId: 137 })
      publishLifecycle({ state: 'stalled', lastKnown: {} })
    })
    expect(screen.getByText('Taking longer than usual')).toBeInTheDocument()
    act(() => screen.getByLabelText('Dismiss').click())
    expect(screen.queryByText('Taking longer than usual')).toBeNull()
  })
})
