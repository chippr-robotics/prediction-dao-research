// Spec 043 (US2) — propose form: payload encoding (native + ERC-20) and submit delegation.
// Spec 049 (US4, FR-012) — pre-flight policy preview: a violation warning renders (naming the
// rule) without blocking submission, clears when the draft becomes compliant, and never appears
// for vaults without a managed policy. The policy lib is mocked (tests run on a network without
// the engine).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { parseEther, parseUnits } from 'ethers'

const getPolicyStatus = vi.fn()
const previewPolicy = vi.fn()
vi.mock('../../lib/custody/policy', () => ({
  getPolicyStatus: (...a) => getPolicyStatus(...a),
  previewPolicy: (...a) => previewPolicy(...a),
}))

import ProposeTransactionForm from '../../components/custody/ProposeTransactionForm'
import { buildTransferPayload } from '../../lib/custody/transfers'

const R = '0x1111111111111111111111111111111111111111'
const TOKEN = '0x2222222222222222222222222222222222222222'
const VAULT = { isSafe: true, address: '0x3333333333333333333333333333333333333333', chainId: 1337, owner: true }

beforeEach(() => {
  getPolicyStatus.mockReset()
  previewPolicy.mockReset()
})

describe('buildTransferPayload', () => {
  it('encodes a native transfer', () => {
    const p = buildTransferPayload({ recipient: R, amount: '1.5' })
    expect(p.value).toBe(parseEther('1.5'))
    expect(p.data).toBe('0x')
    expect(p.to.toLowerCase()).toBe(R)
  })

  it('encodes an ERC-20 transfer (to = token, value 0, transfer calldata)', () => {
    const p = buildTransferPayload({ recipient: R, amount: '2', tokenAddress: TOKEN, decimals: 6 })
    expect(p.to.toLowerCase()).toBe(TOKEN)
    expect(p.value).toBe(0n)
    expect(p.data.startsWith('0xa9059cbb')).toBe(true) // transfer(address,uint256)
    // amount (2 * 10^6 = 0x1e8480) is the last 32-byte word of the calldata
    expect(p.data.endsWith(parseUnits('2', 6).toString(16).padStart(64, '0'))).toBe(true)
  })
})

describe('ProposeTransactionForm', () => {
  it('submits a native transfer payload', async () => {
    const onPropose = vi.fn().mockResolvedValue({})
    render(<ProposeTransactionForm onPropose={onPropose} />)
    fireEvent.change(screen.getByLabelText(/recipient/i), { target: { value: R } })
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '0.25' } })
    fireEvent.click(screen.getByRole('button', { name: /propose transfer/i }))
    await waitFor(() => expect(onPropose).toHaveBeenCalled())
    expect(onPropose.mock.calls[0][0].value).toBe(parseEther('0.25'))
  })

  it('blocks submit until recipient and amount are provided and has no axe violations', async () => {
    const { container } = render(<ProposeTransactionForm onPropose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /propose transfer/i })).toBeDisabled()
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('ProposeTransactionForm — policy pre-flight (spec 049)', () => {
  it('shows the violated rule as a warning WITHOUT blocking submission', async () => {
    getPolicyStatus.mockResolvedValue('managed')
    previewPolicy.mockResolvedValue({
      ok: false,
      violation: { rule: 'allowlist', message: `Recipient 0x1111…1111 is not on the vault's allowlist`, args: {} },
    })
    const onPropose = vi.fn().mockResolvedValue({})
    render(<ProposeTransactionForm vault={VAULT} onPropose={onPropose} />)

    fireEvent.change(screen.getByLabelText(/recipient/i), { target: { value: R } })
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '1' } })

    const warning = await screen.findByRole('alert')
    expect(warning).toHaveTextContent(/recipient allowlist/i) // names the rule
    expect(warning).toHaveTextContent(/is not on the vault's allowlist/i)
    expect(warning).toHaveTextContent(/will block it at execution/i)

    // Submission is NOT blocked — the chain enforces (US4).
    const submitButton = screen.getByRole('button', { name: /propose transfer/i })
    expect(submitButton).toBeEnabled()
    fireEvent.click(submitButton)
    await waitFor(() => expect(onPropose).toHaveBeenCalled())
  })

  it('clears the warning when the draft becomes compliant', async () => {
    getPolicyStatus.mockResolvedValue('managed')
    previewPolicy
      .mockResolvedValueOnce({
        ok: false,
        violation: { rule: 'perTxLimit', message: 'Exceeds the per-transaction limit', args: {} },
      })
      .mockResolvedValue({ ok: true })
    render(<ProposeTransactionForm vault={VAULT} onPropose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/recipient/i), { target: { value: R } })
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '100' } })
    expect(await screen.findByRole('alert')).toHaveTextContent(/per-transaction limit/i)

    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '1' } })
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('never previews or warns for a vault without a managed policy', async () => {
    getPolicyStatus.mockResolvedValue('none')
    render(<ProposeTransactionForm vault={VAULT} onPropose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/recipient/i), { target: { value: R } })
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '1' } })

    await waitFor(() => expect(getPolicyStatus).toHaveBeenCalled())
    // Give the debounce window time to elapse; no preview may fire for a policy-less vault.
    await new Promise((r) => setTimeout(r, 350))
    expect(previewPolicy).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('stays silent when no vault context is provided (personal / legacy usage)', async () => {
    render(<ProposeTransactionForm onPropose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/recipient/i), { target: { value: R } })
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '1' } })
    await new Promise((r) => setTimeout(r, 300))
    expect(getPolicyStatus).not.toHaveBeenCalled()
    expect(previewPolicy).not.toHaveBeenCalled()
  })
})
