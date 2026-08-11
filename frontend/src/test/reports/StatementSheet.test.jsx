/**
 * StatementSheet — the generate-a-statement bottom sheet (issue #1026 follow-up).
 *
 * What is pinned here is the bargain the redesign makes: the common case is one
 * tap because a usable default is already selected, and nothing that changes
 * what the FIGURES cover is hidden to achieve that. A sheet that quietly
 * narrowed a statement would be a worse form than the one it replaced.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import StatementSheet from '../../components/wallet/reporting/StatementSheet'
import { STATEMENT_TYPES, SECTION_DEFS } from '../../data/reports/statement/reportTypes'
import { PERIOD_KINDS } from '../../utils/reportPeriods'

const NOW = Date.UTC(2026, 6, 20)

function setup(props = {}) {
  const onGenerate = vi.fn()
  const onClose = vi.fn()
  render(
    <StatementSheet
      onGenerate={onGenerate}
      onClose={onClose}
      nowMs={NOW}
      networkName="Polygon"
      account="0x7A16fF8270133F063aAb6C9977183D9e72835428"
      {...props}
    />,
  )
  return { onGenerate, onClose }
}

const generateBtn = () => screen.getByRole('button', { name: /generate statement/i })

describe('smart defaults', () => {
  // The whole point of the redesign: open, tap once, done.
  it('arrives with a complete account statement for the current month selected', () => {
    const { onGenerate } = setup()
    fireEvent.click(generateBtn())
    expect(onGenerate).toHaveBeenCalledWith({
      format: 'pdf',
      period: { kind: PERIOD_KINDS.CURRENT_MONTH },
      statement: {
        type: STATEMENT_TYPES.FULL,
        classes: null,
        sections: expect.objectContaining({ summary: true, register: true, failed: true }),
      },
    })
  })

  it('shows the resolved period, not the name of a preset', () => {
    setup()
    expect(screen.getByText(/covers current month \(jul 2026\)/i)).toBeInTheDocument()
  })

  it('folds the section toggles away but reports how many are included', () => {
    setup()
    expect(screen.getByText('All included')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /transaction register/i })).not.toBeInTheDocument()
  })
})

describe('choosing what the statement covers', () => {
  it('describes only the selected type, not all five at once', () => {
    setup()
    expect(screen.getByText(/every activity type on this network/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Wagering' }))
    expect(screen.getByText(/wagers and wager pools only/i)).toBeInTheDocument()
    expect(screen.queryByText(/every activity type on this network/i)).not.toBeInTheDocument()
  })

  // The scope control is never hidden, because it changes the totals.
  it('warns that a narrowed type leaves activity out of every figure', () => {
    setup()
    expect(screen.queryByText(/other activity in the period is left out/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Earnings' }))
    expect(screen.getByText(/other activity in the period is left out/i)).toBeInTheDocument()
  })

  it('passes the preset scope through as the type, never a class list', () => {
    const { onGenerate } = setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Wagering' }))
    fireEvent.click(generateBtn())
    expect(onGenerate.mock.calls[0][0].statement).toMatchObject({
      type: STATEMENT_TYPES.WAGERS,
      classes: null,
    })
  })

  it('reveals the activity picker only for a custom statement', () => {
    setup()
    expect(screen.queryByRole('button', { name: /wager pool/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Custom' }))
    expect(screen.getByRole('button', { name: /wager pool/i })).toBeInTheDocument()
  })

  // A statement of nothing is never what a member meant.
  it('says an empty custom selection will cover everything', () => {
    setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Custom' }))
    expect(screen.getByText(/nothing selected yet/i)).toBeInTheDocument()
  })

  it('drops hand-picked classes when leaving the custom type', () => {
    const { onGenerate } = setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Custom' }))
    fireEvent.click(screen.getByRole('button', { name: /^wager$/i }))
    fireEvent.click(screen.getByRole('radio', { name: 'Account' }))
    fireEvent.click(generateBtn())
    expect(onGenerate.mock.calls[0][0].statement.classes).toBeNull()
  })
})

describe('choosing the period', () => {
  it('switches preset with one tap', () => {
    const { onGenerate } = setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Last quarter' }))
    fireEvent.click(generateBtn())
    expect(onGenerate.mock.calls[0][0].period).toEqual({ kind: PERIOD_KINDS.LAST_QUARTER })
  })

  it('reveals date inputs for a custom range and refuses to generate until valid', () => {
    const { onGenerate } = setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Custom range' }))
    expect(screen.getByLabelText('Custom start date')).toBeInTheDocument()
    expect(generateBtn()).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Custom start date'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText('Custom end date'), { target: { value: '2026-03-31' } })
    expect(generateBtn()).not.toBeDisabled()

    fireEvent.click(generateBtn())
    expect(onGenerate.mock.calls[0][0].period).toMatchObject({ kind: PERIOD_KINDS.CUSTOM })
  })

  it('explains why an incomplete range cannot generate', () => {
    setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Custom range' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/choose a start and end date/i)
  })
})

describe('sections', () => {
  it('toggles one section without touching the others', () => {
    const { onGenerate } = setup()
    fireEvent.click(screen.getByRole('button', { name: /sections/i }))
    fireEvent.click(screen.getByRole('button', { name: /charts/i }))
    fireEvent.click(generateBtn())
    const { sections } = onGenerate.mock.calls[0][0].statement
    expect(sections.charts).toBe(false)
    expect(sections.register).toBe(true)
  })

  it('reports how many sections survive once some are off', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /sections/i }))
    fireEvent.click(screen.getByRole('button', { name: /charts/i }))
    expect(screen.getByText(`${SECTION_DEFS.length - 1} of ${SECTION_DEFS.length}`)).toBeInTheDocument()
  })
})

describe('the sheet itself', () => {
  it('offers the CSV as a separate action, tagged as the full record', () => {
    const { onGenerate } = setup()
    fireEvent.click(screen.getByRole('button', { name: /csv/i }))
    expect(onGenerate.mock.calls[0][0].format).toBe('csv')
  })

  it('closes on escape and on the scrim', () => {
    const { onClose } = setup()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /close statement options/i }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('is a modal dialog with an accessible name', () => {
    setup()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByText('New statement')).toBeInTheDocument()
  })

  // A failure rendered on the page behind the scrim is a failure nobody reads.
  it('shows a generation failure inside the sheet', () => {
    setup({ error: 'Could not reach the network.' })
    expect(screen.getByRole('alert')).toHaveTextContent(/could not reach the network/i)
  })

  it('cannot be fired twice while a statement is being built', () => {
    const { onGenerate } = setup({ busy: true })
    const busyBtn = screen.getByRole('button', { name: /generating/i })
    expect(busyBtn).toBeDisabled()
    fireEvent.click(busyBtn)
    expect(onGenerate).not.toHaveBeenCalled()
  })
})
