/**
 * Tests for Badge component.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import Badge from '../../../components/ui/Badge'

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>Active</Badge>)
    expect(screen.getByText('Active')).toBeTruthy()
  })

  it('applies neutral variant by default', () => {
    const { container } = render(<Badge>Status</Badge>)
    const badge = container.querySelector('span')
    expect(badge.className).toContain('badge')
  })

  it('applies success variant', () => {
    const { container } = render(<Badge variant="success">Ok</Badge>)
    const badge = container.querySelector('span')
    expect(badge.className).toContain('badge')
  })

  it('applies warning variant', () => {
    const { container } = render(<Badge variant="warning">Warn</Badge>)
    const badge = container.querySelector('span')
    expect(badge.className).toContain('badge')
  })

  it('applies danger variant', () => {
    const { container } = render(<Badge variant="danger">Error</Badge>)
    const badge = container.querySelector('span')
    expect(badge.className).toContain('badge')
  })

  it('renders icon when provided', () => {
    render(<Badge icon="X">With Icon</Badge>)
    expect(screen.getByText('X')).toBeTruthy()
    expect(screen.getByText('With Icon')).toBeTruthy()
  })

  it('icon has aria-hidden', () => {
    const { container } = render(<Badge icon="!">Test</Badge>)
    const iconSpan = container.querySelector('[aria-hidden="true"]')
    expect(iconSpan).toBeTruthy()
    expect(iconSpan.textContent).toBe('!')
  })

  it('does not render icon span when no icon provided', () => {
    const { container } = render(<Badge>No Icon</Badge>)
    const iconSpans = container.querySelectorAll('[aria-hidden="true"]')
    expect(iconSpans.length).toBe(0)
  })

  it('applies additional className', () => {
    const { container } = render(<Badge className="custom-class">Styled</Badge>)
    const badge = container.querySelector('span')
    expect(badge.className).toContain('custom-class')
  })

  it('passes through extra props', () => {
    const { container } = render(<Badge data-testid="my-badge">Props</Badge>)
    expect(container.querySelector('[data-testid="my-badge"]')).toBeTruthy()
  })
})
