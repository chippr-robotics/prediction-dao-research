import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'

// Mock ENS hooks
const mockUseEnsResolution = vi.fn()
const mockUseEnsReverseLookup = vi.fn()

vi.mock('../hooks/useEnsResolution', () => ({
  useEnsResolution: (...args) => mockUseEnsResolution(...args),
  useEnsReverseLookup: (...args) => mockUseEnsReverseLookup(...args),
}))

// Mock CSS modules
vi.mock('../components/ui/AddressInput.module.css', () => ({
  default: {
    container: 'container',
    inputWrapper: 'inputWrapper',
    input: 'input',
    inputError: 'inputError',
    inputSuccess: 'inputSuccess',
    inputLoading: 'inputLoading',
    statusContainer: 'statusContainer',
    spinner: 'spinner',
    successIcon: 'successIcon',
    ensLabel: 'ensLabel',
    resolvedHint: 'resolvedHint',
    resolvedLabel: 'resolvedLabel',
    resolvedAddress: 'resolvedAddress',
    ensNameLabel: 'ensNameLabel',
    errorMessage: 'errorMessage',
    label: 'label',
    required: 'required',
  },
}))

import AddressInput from '../components/ui/AddressInput'

describe('AddressInput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseEnsResolution.mockReturnValue({
      resolvedAddress: null,
      isLoading: false,
      error: null,
      isEns: false,
      isAddress: false,
    })
    mockUseEnsReverseLookup.mockReturnValue({
      ensName: null,
      isLoading: false,
    })
  })

  it('should render input with default placeholder', () => {
    render(<AddressInput id="addr" />)
    expect(screen.getByPlaceholderText('0x... or ENS name (e.g., vitalik.eth)')).toBeInTheDocument()
  })

  it('should render with custom placeholder', () => {
    render(<AddressInput id="addr" placeholder="Enter address" />)
    expect(screen.getByPlaceholderText('Enter address')).toBeInTheDocument()
  })

  it('should render label when provided', () => {
    render(<AddressInput id="addr" label="Recipient" />)
    expect(screen.getByText('Recipient')).toBeInTheDocument()
  })

  it('should show required indicator in label', () => {
    render(<AddressInput id="addr" label="Address" required={true} />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('should call onChange when typing', () => {
    const onChange = vi.fn()
    render(<AddressInput id="addr" onChange={onChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '0xabc' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('should show loading spinner when resolving', () => {
    mockUseEnsResolution.mockReturnValue({
      resolvedAddress: null,
      isLoading: true,
      error: null,
      isEns: true,
      isAddress: false,
    })
    render(<AddressInput id="addr" value="vitalik.eth" />)
    expect(screen.getByLabelText('Resolving...')).toBeInTheDocument()
  })

  it('should show success icon when address is resolved', () => {
    mockUseEnsResolution.mockReturnValue({
      resolvedAddress: '0x1234567890123456789012345678901234567890',
      isLoading: false,
      error: null,
      isEns: true,
      isAddress: false,
    })
    render(<AddressInput id="addr" value="vitalik.eth" />)
    expect(screen.getByLabelText('Valid address')).toBeInTheDocument()
  })

  it('should show ENS label when ENS name detected', () => {
    mockUseEnsResolution.mockReturnValue({
      resolvedAddress: '0x1234567890123456789012345678901234567890',
      isLoading: false,
      error: null,
      isEns: true,
      isAddress: false,
    })
    render(<AddressInput id="addr" value="vitalik.eth" />)
    expect(screen.getByText('ENS')).toBeInTheDocument()
  })

  it('should show resolved address preview for ENS names', () => {
    mockUseEnsResolution.mockReturnValue({
      resolvedAddress: '0x1234567890123456789012345678901234567890',
      isLoading: false,
      error: null,
      isEns: true,
      isAddress: false,
    })
    render(<AddressInput id="addr" value="vitalik.eth" />)
    expect(screen.getByText('Resolves to:')).toBeInTheDocument()
    expect(screen.getByText('0x1234...7890')).toBeInTheDocument()
  })

  it('should show ENS name for direct address input', () => {
    mockUseEnsResolution.mockReturnValue({
      resolvedAddress: '0x1234567890123456789012345678901234567890',
      isLoading: false,
      error: null,
      isEns: false,
      isAddress: true,
    })
    mockUseEnsReverseLookup.mockReturnValue({
      ensName: 'vitalik.eth',
      isLoading: false,
    })
    render(<AddressInput id="addr" value="0x1234567890123456789012345678901234567890" />)
    expect(screen.getByText('vitalik.eth')).toBeInTheDocument()
  })

  it('should show error message on resolution error', () => {
    mockUseEnsResolution.mockReturnValue({
      resolvedAddress: null,
      isLoading: false,
      error: 'ENS name not found',
      isEns: true,
      isAddress: false,
    })
    render(<AddressInput id="addr" value="invalid.eth" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('ENS name not found')).toBeInTheDocument()
  })

  it('should show external error message', () => {
    render(
      <AddressInput
        id="addr"
        value="0x123"
        error={true}
        errorMessage="Address is required"
      />
    )
    expect(screen.getByText('Address is required')).toBeInTheDocument()
  })

  it('should set aria-invalid when there is an error', () => {
    render(<AddressInput id="addr" value="bad" error={true} errorMessage="Invalid" />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('should set aria-required when required', () => {
    render(<AddressInput id="addr" required={true} />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('aria-required', 'true')
  })

  it('should be disabled when disabled prop is true', () => {
    render(<AddressInput id="addr" disabled={true} />)
    const input = screen.getByRole('textbox')
    expect(input).toBeDisabled()
  })

  it('should not show resolved address when showResolvedAddress is false', () => {
    mockUseEnsResolution.mockReturnValue({
      resolvedAddress: '0x1234567890123456789012345678901234567890',
      isLoading: false,
      error: null,
      isEns: true,
      isAddress: false,
    })
    render(<AddressInput id="addr" value="vitalik.eth" showResolvedAddress={false} />)
    expect(screen.queryByText('Resolves to:')).not.toBeInTheDocument()
  })

  it('should call onResolvedChange when resolved address changes', () => {
    const onResolvedChange = vi.fn()
    const resolved = '0x1234567890123456789012345678901234567890'
    mockUseEnsResolution.mockReturnValue({
      resolvedAddress: resolved,
      isLoading: false,
      error: null,
      isEns: true,
      isAddress: false,
    })
    render(<AddressInput id="addr" value="vitalik.eth" onResolvedChange={onResolvedChange} />)
    expect(onResolvedChange).toHaveBeenCalledWith(resolved)
  })
})
