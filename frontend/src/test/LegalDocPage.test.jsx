import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { TermsPage } from '../pages/legal/LegalDocPage'

/**
 * Spec 010 (FR-003): the in-app Terms document carries an Account Moderation
 * section reachable via the #account-moderation anchor, and renderMarkdown
 * assigns a slug id to every heading (enables /terms#... deep links).
 */
describe('LegalDocPage heading anchors (Spec 010 — FR-003)', () => {
  it('renders an Account Moderation heading with id="account-moderation"', () => {
    const { container } = render(<TermsPage />)
    const el = container.querySelector('#account-moderation')
    expect(el).toBeTruthy()
    expect(el.textContent).toMatch(/Account Moderation/i)
    expect(/^H[1-6]$/.test(el.tagName)).toBe(true)
  })

  it('assigns a slug id to every heading in the document body', () => {
    const { container } = render(<TermsPage />)
    const headings = container.querySelectorAll(
      '.legal-doc-body h2, .legal-doc-body h3, .legal-doc-body h4, .legal-doc-body h5, .legal-doc-body h6',
    )
    expect(headings.length).toBeGreaterThan(0)
    headings.forEach((h) => expect(h.id).toMatch(/^[a-z0-9-]+$/))
  })
})
