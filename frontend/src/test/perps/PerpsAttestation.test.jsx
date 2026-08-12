/**
 * PerpsAttestation (spec 083, T051, FR-015) — the acknowledgement that gates OPENING.
 *
 * What these assert:
 *
 *   - the items are DISCRETE and NONE arrive pre-ticked — a pre-ticked acknowledgement is not one,
 *     and one lumped "I agree" box is not four statements;
 *   - each required subject is actually present: jurisdiction, that leverage can lose the whole
 *     stake, no circumvention, and the venue's own terms;
 *   - a partial tick-set cannot be recorded, however the confirm control is reached;
 *   - a SUPERSEDED record asks again, and says why;
 *   - it exposes nothing an exit could read as permission, and gates nothing but opening;
 *   - a storage refusal is disclosed rather than claimed as saved.
 *
 * The store is injected throughout, so none of this touches `localStorage`.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import PerpsAttestation from '../../components/perps/PerpsAttestation'
import componentSource from '../../components/perps/PerpsAttestation.jsx?raw'
import {
  PERPS_ATTESTATION_ITEMS,
  initialAttestationState,
  isAttestationComplete,
} from '../../lib/perps/attestation'

function store(overrides = {}) {
  return {
    state: () => ({ attested: false, record: null, version: 1, superseded: false, reason: null }),
    record: vi.fn((items, version) => (isAttestationComplete(items) ? { version, items, at: 'now' } : null)),
    subscribe: () => () => {},
    ...overrides,
  }
}

function renderPanel(deps = store(), props = {}) {
  const view = render(<PerpsAttestation deps={deps} {...props} />)
  return { ...view, deps }
}

const confirm = () => screen.getByRole('button', { name: 'I confirm all of the above' })

/* --------------------------------------------------------------------------------------------- *
 * Nothing is pre-ticked, and the items are discrete
 * --------------------------------------------------------------------------------------------- */

describe('the acknowledgement itself', () => {
  it('renders one box per statement, none of them ticked', () => {
    renderPanel()
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(PERPS_ATTESTATION_ITEMS.length)
    expect(boxes).toHaveLength(4)
    for (const box of boxes) expect(box).not.toBeChecked()
  })

  it('takes its default from the store, so “nothing pre-ticked” is not this component’s opinion', () => {
    expect(Object.values(initialAttestationState())).toEqual([false, false, false, false])
  })

  it('names each subject the requirement calls for', () => {
    renderPanel()
    expect(screen.getByText(/allowed to trade perpetual futures where I live/)).toBeInTheDocument()
    expect(screen.getByText(/leverage can lose my entire stake/)).toBeInTheDocument()
    expect(screen.getByText(/not using a VPN, proxy/)).toBeInTheDocument()
    expect(screen.getByText(/under that venue’s own terms/)).toBeInTheDocument()
  })

  it('states the plain risk before asking for anything', () => {
    renderPanel()
    expect(screen.getByText(/Leverage multiplies losses as well as gains/)).toBeInTheDocument()
    expect(screen.getByText(/Only trade with money you can afford to lose/)).toBeInTheDocument()
  })

  it('names the venue the member is about to trade on, when it is known', () => {
    renderPanel(store(), { venueLabel: 'Gains' })
    expect(screen.getByText(/You are about to trade on Gains, under Gains’s own terms/)).toBeInTheDocument()
    expect(screen.getByText(/FairWins does not hold your position/)).toBeInTheDocument()
  })
})

/* --------------------------------------------------------------------------------------------- *
 * A partial acknowledgement is not one
 * --------------------------------------------------------------------------------------------- */

describe('completeness', () => {
  it('keeps the confirmation disabled until every statement is ticked, and counts what is left', () => {
    renderPanel()
    expect(confirm()).toBeDisabled()
    expect(screen.getByText(/None of these are ticked for you/)).toBeInTheDocument()

    const boxes = screen.getAllByRole('checkbox')
    fireEvent.click(boxes[0])
    expect(confirm()).toBeDisabled()
    expect(screen.getByText('3 still to confirm.')).toBeInTheDocument()

    for (const box of boxes.slice(1)) fireEvent.click(box)
    expect(confirm()).toBeEnabled()
  })

  it('un-ticking a statement takes the confirmation away again', () => {
    renderPanel()
    const boxes = screen.getAllByRole('checkbox')
    for (const box of boxes) fireEvent.click(box)
    expect(confirm()).toBeEnabled()

    fireEvent.click(boxes[2])
    expect(confirm()).toBeDisabled()
    expect(boxes[2]).not.toBeChecked()
  })

  it('refuses a partial tick-set even when the control is reached anyway', () => {
    const deps = store()
    renderPanel(deps)
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    // Reached by keyboard, or by a fast double tap: the store refuses, and so does this.
    fireEvent.click(confirm())
    expect(deps.record).not.toHaveBeenCalled()
  })

  it('records the acknowledgement and tells the caller, once every statement is ticked', () => {
    const onAcknowledged = vi.fn()
    const deps = store()
    renderPanel(deps, { onAcknowledged })

    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box)
    fireEvent.click(confirm())

    expect(deps.record).toHaveBeenCalledTimes(1)
    const [items, version] = deps.record.mock.calls[0]
    expect(isAttestationComplete(items)).toBe(true)
    expect(version).toBe(1)
    expect(onAcknowledged).toHaveBeenCalledTimes(1)
  })

  it('says so plainly when the record could not be written, rather than claiming it was', () => {
    const onAcknowledged = vi.fn()
    const deps = store({ record: () => null })
    renderPanel(deps, { onAcknowledged })

    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box)
    fireEvent.click(confirm())

    expect(screen.getByRole('alert')).toHaveTextContent(/could not be recorded just now/)
    expect(onAcknowledged).not.toHaveBeenCalled()
  })

  it('discloses that the record is device-only and may be asked for again', () => {
    renderPanel()
    expect(screen.getByText(/kept on this device only/)).toBeInTheDocument()
    expect(screen.getByText(/you will be asked again next time/)).toBeInTheDocument()
  })
})

/* --------------------------------------------------------------------------------------------- *
 * Versioning
 * --------------------------------------------------------------------------------------------- */

describe('versioning', () => {
  it('renders nothing at all once the current wording is acknowledged', () => {
    const { container } = renderPanel(
      store({ state: () => ({ attested: true, record: {}, version: 1, superseded: false, reason: null }) }),
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('asks again for a SUPERSEDED record, and says why rather than silently re-asking', () => {
    renderPanel(
      store({
        state: () => ({
          attested: false,
          record: { version: 1 },
          version: 2,
          superseded: true,
          reason: 'Please confirm these again — the terms have been updated.',
        }),
      }),
    )
    expect(screen.getByRole('note')).toHaveTextContent(/the terms have been updated/)
    expect(screen.getAllByRole('checkbox')).toHaveLength(4)
    for (const box of screen.getAllByRole('checkbox')) expect(box).not.toBeChecked()
  })

  it('records against the version it was asked for, not the build’s', () => {
    const deps = store()
    renderPanel(deps, { version: 7 })
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box)
    fireEvent.click(confirm())
    expect(deps.record.mock.calls[0][1]).toBe(7)
  })

  it('treats an unreadable verdict as NOT attested — never as permission', () => {
    renderPanel(
      store({
        state: () => {
          throw new Error('storage exploded')
        },
      }),
    )
    expect(screen.getAllByRole('checkbox')).toHaveLength(4)
  })
})

/* --------------------------------------------------------------------------------------------- *
 * It gates opening, and nothing else
 * --------------------------------------------------------------------------------------------- */

describe('what it cannot become', () => {
  it('exposes no prop or callback an exit could read as permission', () => {
    // The component's props are the whole of its API. None of them is about closing, reducing,
    // cancelling or recovering — there is nothing here for an exit path to call.
    for (const word of ['close', 'reduce', 'cancel', 'recover', 'canManage', 'isBlocked']) {
      expect(componentSource.toLowerCase()).not.toContain(`${word.toLowerCase()}position`)
    }
    expect(componentSource).not.toMatch(/onClose\b/)
  })

  it('derives no completeness of its own — the store owns what counts as attested', () => {
    expect(componentSource).toMatch(/isAttestationComplete/)
    expect(componentSource).toMatch(/missingAttestationItems/)
    // No hand-rolled "every item is true" loop that could drift from the store's answer.
    expect(componentSource).not.toMatch(/Object\.values\([^)]*\)\.every/)
  })

  it('writes only through the store, which refuses a partial record itself', () => {
    // Comments legitimately NAME the storage; it is the code that must never touch it directly.
    const code = componentSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
    expect(code).not.toMatch(/localStorage/)
    expect(code).toMatch(/recordAttestation/)
  })
})
