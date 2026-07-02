import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import PoolLeaderboard from '../components/pools/PoolLeaderboard'

// T049 [US4] — live leaderboard: standings shown by nickname, sorted, with an explicit non-final/off-chain
// marker; creator can edit scores / eliminate / add; members see read-only (spec 034 FR-029/030/031).

const entries = [
  { id: 'a', nickname: 'Prismatic Fox', score: 3, eliminated: false },
  { id: 'b', nickname: 'Thunder Eagle', score: 7, eliminated: false },
  { id: 'c', nickname: 'Velvet Otter', score: 1, eliminated: true },
]

describe('PoolLeaderboard (US4)', () => {
  it('shows standings sorted by score, by nickname, with a non-final marker', () => {
    render(<PoolLeaderboard entries={entries} />)
    expect(screen.getByRole('note')).toHaveTextContent(/not a final, settled on-chain result/i)
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).getByText('Thunder Eagle')).toBeInTheDocument() // 7 — highest first
    expect(within(rows[1]).getByText('Prismatic Fox')).toBeInTheDocument() // 3
    expect(within(rows[2]).getByText(/Velvet Otter/)).toBeInTheDocument() // 1 — last
    expect(within(screen.getByTestId('lb-row-c')).getByText(/\(out\)/)).toBeInTheDocument()
  })

  it('is read-only for members (no score inputs or controls)', () => {
    render(<PoolLeaderboard entries={entries} isCreator={false} />)
    expect(screen.queryByLabelText(/score for/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /eliminate/i })).toBeNull()
    expect(screen.queryByLabelText(/add player/i)).toBeNull()
  })

  it('lets the creator change scores, eliminate, and add players', () => {
    const onScoreChange = vi.fn()
    const onToggleEliminate = vi.fn()
    const onAddPlayer = vi.fn()
    render(
      <PoolLeaderboard
        entries={entries}
        isCreator
        onScoreChange={onScoreChange}
        onToggleEliminate={onToggleEliminate}
        onAddPlayer={onAddPlayer}
      />
    )
    fireEvent.change(screen.getByLabelText('Score for Thunder Eagle'), { target: { value: '9' } })
    expect(onScoreChange).toHaveBeenCalledWith('b', 9)

    fireEvent.click(within(screen.getByTestId('lb-row-a')).getByRole('button', { name: /eliminate/i }))
    expect(onToggleEliminate).toHaveBeenCalledWith('a')

    fireEvent.change(screen.getByLabelText(/add player/i), { target: { value: 'Cobalt Lynx' } })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    expect(onAddPlayer).toHaveBeenCalledWith('Cobalt Lynx')
  })

  it('tells the creator standings auto-fill and tucks manual entry behind a disclosure', () => {
    render(<PoolLeaderboard entries={[]} isCreator />)
    expect(screen.getByText(/fill in automatically as members join/i)).toBeInTheDocument()
    // Manual add still exists as an edge-case tool, but collapsed behind a <details> disclosure.
    const details = screen.getByText(/add a player manually/i).closest('details')
    expect(details).not.toBeNull()
    expect(details.open).toBe(false)
  })

  it('hides the interim marker and editing when final', () => {
    render(<PoolLeaderboard entries={entries} isCreator isFinal />)
    expect(screen.queryByRole('note')).toBeNull()
    expect(screen.queryByLabelText(/score for/i)).toBeNull()
  })
})
