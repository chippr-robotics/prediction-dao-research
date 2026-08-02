/**
 * Collapsible settings section (Recovery tab UX).
 *
 * Guards the two properties the tab depends on: sections start collapsed with a
 * scannable summary, and collapsed content stays mounted but INERT — mounted so
 * the open/close animation works, inert so nothing inside is focusable or
 * announced until the member opens it.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'
import AccordionSection from '../AccordionSection'
import AccordionGroup from '../AccordionGroup'

describe('AccordionSection', () => {
  it('starts collapsed, shows the summary, and marks the region inert', () => {
    render(
      <AccordionSection id="s1" title="Data backup" summary="Last backup: never">
        <button type="button">Back up my data</button>
      </AccordionSection>
    )
    const trigger = screen.getByRole('button', { name: /data backup/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Last backup: never')).toBeInTheDocument()
    expect(document.getElementById('s1-region')).toHaveAttribute('inert')
  })

  it('expands on click, drops inert, and hides the collapsed summary', () => {
    render(
      <AccordionSection id="s1" title="Data backup" summary="Last backup: never">
        <button type="button">Back up my data</button>
      </AccordionSection>
    )
    fireEvent.click(screen.getByRole('button', { name: /data backup/i }))
    expect(screen.getByRole('button', { name: /data backup/i })).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById('s1-region')).not.toHaveAttribute('inert')
    expect(screen.queryByText('Last backup: never')).not.toBeInTheDocument()
  })

  it('opens one section at a time inside a group (and closes on a second click)', () => {
    render(
      <AccordionGroup>
        <AccordionSection id="a" title="Alpha">a-body</AccordionSection>
        <AccordionSection id="b" title="Beta">b-body</AccordionSection>
      </AccordionGroup>
    )
    const alpha = screen.getByRole('button', { name: /alpha/i })
    const beta = screen.getByRole('button', { name: /beta/i })

    fireEvent.click(alpha)
    expect(alpha).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(beta)
    expect(beta).toHaveAttribute('aria-expanded', 'true')
    expect(alpha).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(beta)
    expect(beta).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps sections independent when the group is not exclusive', () => {
    render(
      <AccordionGroup exclusive={false}>
        <AccordionSection id="a" title="Alpha">a-body</AccordionSection>
        <AccordionSection id="b" title="Beta">b-body</AccordionSection>
      </AccordionGroup>
    )
    fireEvent.click(screen.getByRole('button', { name: /alpha/i }))
    fireEvent.click(screen.getByRole('button', { name: /beta/i }))
    expect(screen.getByRole('button', { name: /alpha/i })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /beta/i })).toHaveAttribute('aria-expanded', 'true')
  })

  it('honours defaultOpenId', () => {
    render(
      <AccordionGroup defaultOpenId="b">
        <AccordionSection id="a" title="Alpha">a-body</AccordionSection>
        <AccordionSection id="b" title="Beta">b-body</AccordionSection>
      </AccordionGroup>
    )
    expect(screen.getByRole('button', { name: /beta/i })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /alpha/i })).toHaveAttribute('aria-expanded', 'false')
  })

  it('has no axe violations collapsed or expanded', async () => {
    const { container } = render(
      <AccordionSection id="s1" title="Data backup" summary="Last backup: never" badge="Action needed" badgeTone="warn">
        <button type="button">Back up my data</button>
      </AccordionSection>
    )
    expect(await axe(container)).toHaveNoViolations()
    fireEvent.click(screen.getByRole('button', { name: /data backup/i }))
    expect(await axe(container)).toHaveNoViolations()
  })

  it('does not warn about the inert prop (React 19 boolean attribute)', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<AccordionSection id="s1" title="Data backup">body</AccordionSection>)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
