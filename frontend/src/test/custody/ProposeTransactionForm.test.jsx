// Spec 043 (US2) — propose form: payload encoding (native + ERC-20) and submit delegation.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { parseEther, parseUnits } from 'ethers'
import ProposeTransactionForm from '../../components/custody/ProposeTransactionForm'
import { buildTransferPayload } from '../../lib/custody/transfers'

const R = '0x1111111111111111111111111111111111111111'
const TOKEN = '0x2222222222222222222222222222222222222222'

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
