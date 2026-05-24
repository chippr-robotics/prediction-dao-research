/**
 * Tests for HelperText component.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import HelperText from '../../../components/ui/HelperText'

describe('HelperText', () => {
  it('renders children', () => {
    render(<HelperText>Some help text</HelperText>)
    expect(screen.getByText('Some help text')).toBeTruthy()
  })

  it('renders as <small> element', () => {
    const { container } = render(<HelperText>Text</HelperText>)
    expect(container.querySelector('small')).toBeTruthy()
  })

  it('applies helper variant by default', () => {
    const { container } = render(<HelperText>Text</HelperText>)
    const el = container.querySelector('small')
    expect(el.className).toContain('helper-text')
  })

  it('applies error variant', () => {
    const { container } = render(<HelperText variant="error">Error!</HelperText>)
    const el = container.querySelector('small')
    expect(el.className).toContain('helper-text')
  })

  it('accepts id prop for aria-describedby', () => {
    const { container } = render(<HelperText id="email-help">Help</HelperText>)
    const el = container.querySelector('#email-help')
    expect(el).toBeTruthy()
  })

  it('applies additional className', () => {
    const { container } = render(<HelperText className="extra">Text</HelperText>)
    const el = container.querySelector('small')
    expect(el.className).toContain('extra')
  })

  it('passes through extra props', () => {
    render(<HelperText role="alert" aria-live="assertive">Error</HelperText>)
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})
