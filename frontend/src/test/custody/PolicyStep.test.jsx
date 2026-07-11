// Spec 049 (US1) — policy step: skip-by-default (FR-010), rule entry emitting a valid
// configureRules config, entry-time validation (FR-015), strictness warnings, network gating
// (FR-013), and axe cleanliness. Chain 1337 carries the synced policy engine addresses;
// 80002 does not (the unsupported case).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { parseEther, parseUnits } from 'ethers'
import PolicyStep from '../../components/custody/PolicyStep'
import { summarizePolicyConfig } from '../../lib/custody/policySummary'
import { NATIVE_ASSET, validatePolicyConfig } from '../../lib/custody/policy'
import { getContractAddressForChain } from '../../config/contracts'

const CHAIN = 1337 // policy engine synced
const UNSUPPORTED_CHAIN = 80002
const RECIPIENT = '0x1111111111111111111111111111111111111111'

const lastChange = (onChange) => onChange.mock.calls[onChange.mock.calls.length - 1][0]

function enableRules() {
  fireEvent.click(screen.getByLabelText(/set spending rules/i))
}

describe('PolicyStep', () => {
  it('defaults to "No policy (skip)" and emits null (FR-010)', () => {
    const onChange = vi.fn()
    render(<PolicyStep chainId={CHAIN} value={null} onChange={onChange} />)
    expect(screen.getByLabelText(/no policy \(skip\)/i)).toBeChecked()
    expect(screen.queryByLabelText(/per-transaction limit/i)).not.toBeInTheDocument()
    expect(onChange).toHaveBeenCalledWith(null)
    expect(lastChange(onChange)).toBeNull()
  })

  it('emits a valid config once rules are entered (US1)', () => {
    const onChange = vi.fn()
    render(<PolicyStep chainId={CHAIN} value={null} onChange={onChange} />)
    enableRules()
    fireEvent.change(screen.getByLabelText(/per-transaction limit \(ETH\)/i), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText(/24-hour limit \(ETH\)/i), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText(/delay between outgoing transactions/i), { target: { value: '86400' } })
    fireEvent.click(screen.getByLabelText(/only allow transfers to approved recipients/i))
    fireEvent.change(screen.getByLabelText(/allowed recipient 1/i), { target: { value: RECIPIENT } })

    const config = lastChange(onChange)
    expect(config.invalid).toBeUndefined()
    expect(() => validatePolicyConfig(config)).not.toThrow()
    expect(config.limits).toEqual([
      { asset: NATIVE_ASSET, perTxLimit: parseEther('1'), windowLimit: parseEther('5') },
    ])
    expect(config.cooldown).toBe(86400)
    expect(config.allowlistEnabled).toBe(true)
    expect(config.allowlistAdd).toEqual([RECIPIENT])
  })

  it('includes stable-token limits when the chain has a payment token', () => {
    const onChange = vi.fn()
    render(<PolicyStep chainId={CHAIN} value={null} onChange={onChange} />)
    enableRules()
    fireEvent.change(screen.getByLabelText(/per-transaction limit \(stable token\)/i), { target: { value: '250' } })
    const config = lastChange(onChange)
    expect(config.invalid).toBeUndefined()
    expect(config.limits).toEqual([
      {
        asset: getContractAddressForChain('paymentToken', CHAIN),
        perTxLimit: parseUnits('250', 6),
        windowLimit: 0n,
      },
    ])
  })

  it('shows the live plain-language summary with the 24-hour-window disclosure (US1-AS1)', () => {
    render(<PolicyStep chainId={CHAIN} value={null} onChange={vi.fn()} />)
    enableRules()
    fireEvent.change(screen.getByLabelText(/per-transaction limit \(ETH\)/i), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText(/24-hour limit \(ETH\)/i), { target: { value: '5' } })
    expect(screen.getByRole('status')).toHaveTextContent('Max 1.0 ETH per transaction')
    expect(screen.getByRole('status')).toHaveTextContent(
      'the window opens with the first spend and resets 24 hours later',
    )
  })

  it('renders inline validation errors and emits an invalid marker (FR-015)', () => {
    const onChange = vi.fn()
    render(<PolicyStep chainId={CHAIN} value={null} onChange={onChange} />)
    enableRules()
    fireEvent.change(screen.getByLabelText(/per-transaction limit \(ETH\)/i), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(/24-hour limit \(ETH\)/i), { target: { value: '5' } })
    expect(screen.getByRole('alert')).toHaveTextContent(/never be reached/i)
    expect(lastChange(onChange)).toMatchObject({ invalid: true })
  })

  it('rejects an allowlist with no recipients (accidental deny-all)', () => {
    const onChange = vi.fn()
    render(<PolicyStep chainId={CHAIN} value={null} onChange={onChange} />)
    enableRules()
    fireEvent.click(screen.getByLabelText(/only allow transfers to approved recipients/i))
    expect(screen.getByRole('alert')).toHaveTextContent(/at least one recipient/i)
    expect(lastChange(onChange)).toMatchObject({ invalid: true })
  })

  it('warns (without blocking) on an unusually strict cooldown (FR-015)', () => {
    const onChange = vi.fn()
    render(<PolicyStep chainId={CHAIN} value={null} onChange={onChange} />)
    enableRules()
    fireEvent.change(screen.getByLabelText(/delay between outgoing transactions/i), { target: { value: 'custom' } })
    fireEvent.change(screen.getByLabelText(/custom delay \(seconds\)/i), { target: { value: String(31 * 24 * 3600) } })
    expect(screen.getByText(/unusually strict/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    const config = lastChange(onChange)
    expect(config.invalid).toBeUndefined()
    expect(config.cooldown).toBe(31 * 24 * 3600)
  })

  it('renders the unsupported state and forces the skip path on networks without the engine (FR-013)', () => {
    const onChange = vi.fn()
    render(<PolicyStep chainId={UNSUPPORTED_CHAIN} value={null} onChange={onChange} />)
    expect(screen.getByRole('status')).toHaveTextContent(/aren't available on this network yet/i)
    expect(screen.queryByLabelText(/set spending rules/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/per-transaction limit/i)).not.toBeInTheDocument()
    expect(lastChange(onChange)).toBeNull()
  })

  it('summarizePolicyConfig returns nothing for skipped or invalid configs', () => {
    expect(summarizePolicyConfig(null)).toEqual([])
    expect(summarizePolicyConfig({ invalid: true, error: 'x' })).toEqual([])
  })

  it('has no axe violations (skip, configured, and unsupported states)', async () => {
    const { container, unmount } = render(<PolicyStep chainId={CHAIN} value={null} onChange={vi.fn()} />)
    expect(await axe(container)).toHaveNoViolations()
    enableRules()
    fireEvent.click(screen.getByLabelText(/only allow transfers to approved recipients/i))
    fireEvent.change(screen.getByLabelText(/delay between outgoing transactions/i), { target: { value: 'custom' } })
    expect(await axe(container)).toHaveNoViolations()
    unmount()
    const { container: unsupported } = render(
      <PolicyStep chainId={UNSUPPORTED_CHAIN} value={null} onChange={vi.fn()} />,
    )
    expect(await axe(unsupported)).toHaveNoViolations()
  })
})
