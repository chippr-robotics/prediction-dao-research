/**
 * PerpsAttestation WCAG 2.1 AA audits (spec 083, SC-008) — the opening acknowledgement in the light
 * and dark themes, in the two states it is met in: freshly asked, and asked AGAIN because the
 * wording was superseded (which adds a live note above the fieldset).
 *
 * The four statements are individually labelled checkboxes inside a legended fieldset, and that is
 * exactly what these audits protect: a lumped "I agree" control or an unlabelled box would be both
 * an accessibility failure and a weaker acknowledgement.
 */
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'

import PerpsAttestation from '../../components/perps/PerpsAttestation'

function store(overrides = {}) {
  return {
    state: () => ({ attested: false, record: null, version: 1, superseded: false, reason: null }),
    record: () => ({ version: 1, items: [], at: 'now' }),
    subscribe: () => () => {},
    ...overrides,
  }
}

function renderPanel(themeClass, deps = store()) {
  return render(
    <div className={themeClass}>
      <PerpsAttestation deps={deps} venueLabel="Gains" />
    </div>,
  )
}

const superseded = store({
  state: () => ({
    attested: false,
    record: { version: 1 },
    version: 2,
    superseded: true,
    reason: 'Please confirm these again — the terms have been updated.',
  }),
})

describe('PerpsAttestation accessibility', () => {
  it('has no WCAG violations in the light theme', async () => {
    const { container } = renderPanel('theme-light platform-fairwins')
    expect(screen.getAllByRole('checkbox')).toHaveLength(4)
    expect(await axe(container)).toHaveNoViolations()
  }, 20000)

  it('has no WCAG violations in the dark theme', async () => {
    const { container } = renderPanel('theme-dark platform-fairwins')
    expect(await axe(container)).toHaveNoViolations()
  }, 20000)

  it('has no WCAG violations when a superseded record is being re-asked, in the light theme', async () => {
    const { container } = renderPanel('theme-light platform-fairwins', superseded)
    expect(screen.getByRole('note')).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  }, 20000)

  it('has no WCAG violations when a superseded record is being re-asked, in the dark theme', async () => {
    const { container } = renderPanel('theme-dark platform-fairwins', superseded)
    expect(await axe(container)).toHaveNoViolations()
  }, 20000)
})
