import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DistributePanel from '../DistributePanel'
import { parseDistribution } from '../distributeUtils'

// Phase 12 (P3-a, US11, T086): batch distribute / airdrop UI — preview math, MAX_BATCH surfacing (no silent
// truncation), and the real batchMint/batchTransfer call.

const A = (n) => '0x' + String(n).padStart(40, '0')

describe('parseDistribution', () => {
  it('parses valid lines and flags invalid address/amount', () => {
    const { rows, errors } = parseDistribution(`${A(1)}, 1000\n${A(2)} 2500\nnotanaddr, 5\n${A(3)}, 0`)
    expect(rows).toEqual([{ addr: A(1), amount: '1000' }, { addr: A(2), amount: '2500' }])
    expect(errors).toHaveLength(2) // bad address + zero amount
  })
})

describe('DistributePanel', () => {
  const caps = { decimals: 18 }
  let run
  beforeEach(() => { run = vi.fn().mockResolvedValue(undefined) })

  it('previews recipient count + total and submits batchMint', async () => {
    const user = userEvent.setup()
    render(<DistributePanel caps={caps} run={run} busy={false} canMint />)
    await user.type(screen.getByLabelText(/recipients and amounts/i), `${A(1)}, 1000\n${A(2)}, 2500`)
    // preview: 2 recipients, total 3,500
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3,500')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /mint & distribute/i }))
    await waitFor(() => expect(run).toHaveBeenCalledWith('Batch mint', expect.any(Function)))
  })

  it('surfaces the MAX_BATCH limit without truncating (no submit)', async () => {
    const user = userEvent.setup()
    render(<DistributePanel caps={caps} run={run} busy={false} canMint />)
    const lines = Array.from({ length: 201 }, (_, i) => `${A(i + 1)}, 1`).join('\n')
    // paste is faster than typing 201 lines
    await user.click(screen.getByLabelText(/recipients and amounts/i))
    await user.paste(lines)
    expect(await screen.findByText(/exceeds the per-transaction limit of 200/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mint & distribute/i })).toBeDisabled()
    expect(run).not.toHaveBeenCalled()
  })

  it('mint disabled without the minter role; transfer mode allowed', async () => {
    const user = userEvent.setup()
    render(<DistributePanel caps={caps} run={run} busy={false} canMint={false} />)
    await user.type(screen.getByLabelText(/recipients and amounts/i), `${A(1)}, 1000`)
    expect(screen.getByRole('button', { name: /mint & distribute/i })).toBeDisabled()
    expect(screen.getByText(/minting requires the minter role/i)).toBeInTheDocument()
    await user.click(screen.getByLabelText(/transfer from my balance/i))
    expect(screen.getByRole('button', { name: /^distribute$/i })).toBeEnabled()
  })
})
