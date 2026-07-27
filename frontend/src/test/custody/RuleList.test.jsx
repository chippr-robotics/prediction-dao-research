// Spec 068 (US2/US4, T020+T030) — the ordered rule list: numbering, warnings, and reordering.
// Reordering is driven through the KEYBOARD controls here, both because that is the accessible
// path FR-016 requires and because jsdom cannot faithfully simulate HTML5 drag (same convention as
// src/test/PoolParticipants.test.jsx).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'
import RuleList from '../../components/custody/RuleList'

const rules = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
const descriptions = [
  { text: 'Alice and Bob must all approve, for the network coin' },
  { text: 'Charlie must approve, for the network coin' },
  { text: 'the vault’s usual approvals are enough, for any asset' },
]

describe('RuleList', () => {
  it('numbers rules from 001 in enforcement order', () => {
    render(<RuleList rules={rules} descriptions={descriptions} />)
    expect(screen.getByText('001')).toBeInTheDocument()
    expect(screen.getByText('002')).toBeInTheDocument()
    expect(screen.getByText('003')).toBeInTheDocument()
    expect(screen.getByText(/Alice and Bob must all approve/)).toBeInTheDocument()
  })

  it('renders an honest empty state that says silence is denial', () => {
    render(<RuleList rules={[]} />)
    expect(screen.getByRole('status')).toHaveTextContent(/allows nothing until a rule is added/i)
  })

  it('leaves legacy rules unnumbered so they do not imply an order they lack (FR-020)', () => {
    render(<RuleList rules={rules} descriptions={descriptions} legacy />)
    expect(screen.queryByText('001')).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: /legacy rules/i })).toBeInTheDocument()
  })

  it('hides reorder controls when the list is not editable', () => {
    render(<RuleList rules={rules} descriptions={descriptions} onReorder={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /move rule/i })).not.toBeInTheDocument()
  })

  it('reorders with keyboard-operable move controls (FR-016)', () => {
    const onReorder = vi.fn()
    render(<RuleList rules={rules} descriptions={descriptions} editable onReorder={onReorder} />)

    fireEvent.click(screen.getByRole('button', { name: /move rule 003 up/i }))
    expect(onReorder).toHaveBeenCalledWith([rules[0], rules[2], rules[1]])

    fireEvent.click(screen.getByRole('button', { name: /move rule 001 down/i }))
    expect(onReorder).toHaveBeenLastCalledWith([rules[1], rules[0], rules[2]])
  })

  it('disables the move controls at the ends of the list', () => {
    render(<RuleList rules={rules} descriptions={descriptions} editable onReorder={vi.fn()} />)
    expect(screen.getByRole('button', { name: /move rule 001 up/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /move rule 003 down/i })).toBeDisabled()
  })

  it('marks rows draggable only when editable', () => {
    const { rerender, container } = render(<RuleList rules={rules} descriptions={descriptions} />)
    expect(container.querySelector('li[draggable="true"]')).toBeNull()
    rerender(<RuleList rules={rules} descriptions={descriptions} editable onReorder={vi.fn()} />)
    expect(container.querySelectorAll('li[draggable="true"]')).toHaveLength(3)
  })

  it('warns about a rule an earlier rule already swallows (FR-015)', () => {
    render(<RuleList rules={rules} descriptions={descriptions} shadowed={[{ index: 1, shadowedBy: 0 }]} />)
    expect(screen.getByRole('status')).toHaveTextContent(/Rule 001 already covers everything this rule covers/i)
  })

  it('flags a rule naming someone who is no longer an owner (FR-010)', () => {
    render(
      <RuleList
        rules={rules}
        descriptions={descriptions}
        broken={[{ index: 0, missing: ['0x2222222222222222222222222222222222222222'] }]}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/no longer an owner/i)
    expect(screen.getByRole('alert')).toHaveTextContent(/cannot execute until the policy is amended/i)
  })

  it('offers edit and remove per rule when editable', () => {
    const onEdit = vi.fn()
    const onRemove = vi.fn()
    render(<RuleList rules={rules} descriptions={descriptions} editable onEdit={onEdit} onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: /edit rule 002/i }))
    expect(onEdit).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: /remove rule 003/i }))
    expect(onRemove).toHaveBeenCalledWith(2)
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <RuleList rules={rules} descriptions={descriptions} editable onReorder={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
