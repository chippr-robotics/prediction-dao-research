import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useClipboard } from '../hooks/useClipboard'

// Spec 011 — shared clipboard hook contract (contracts/address-qr-ui-contract.md,
// H1–H3). setup.js installs a global succeeding clipboard mock; every test here
// overrides navigator.clipboard explicitly (analysis finding U2) so both the
// success and the failure paths are really exercised.

function defineClipboard(value) {
  Object.defineProperty(navigator, 'clipboard', {
    writable: true,
    configurable: true,
    value,
  })
}

describe('useClipboard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('H1: sets copied on success and auto-resets after 2000 ms', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    defineClipboard({ writeText })

    const { result } = renderHook(() => useClipboard())
    expect(result.current.copied).toBe(false)

    let outcome
    await act(async () => {
      outcome = await result.current.copy('payload')
    })
    expect(outcome).toBe(true)
    expect(writeText).toHaveBeenCalledWith('payload')
    expect(result.current.copied).toBe(true)
    expect(result.current.error).toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(1999)
    })
    expect(result.current.copied).toBe(true)
    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.copied).toBe(false)
  })

  it('H2: a rejected write sets a non-empty error, resolves false, never throws', async () => {
    defineClipboard({
      writeText: vi.fn(() => Promise.reject(new Error('NotAllowedError'))),
    })

    const { result } = renderHook(() => useClipboard())
    let outcome
    await act(async () => {
      outcome = await result.current.copy('payload')
    })
    expect(outcome).toBe(false)
    expect(result.current.copied).toBe(false)
    expect(result.current.error).toBeTruthy()
  })

  it('H2: an absent clipboard API sets a non-empty error, resolves false, never throws', async () => {
    defineClipboard(undefined)

    const { result } = renderHook(() => useClipboard())
    let outcome
    await act(async () => {
      outcome = await result.current.copy('payload')
    })
    expect(outcome).toBe(false)
    expect(result.current.copied).toBe(false)
    expect(result.current.error).toBeTruthy()
  })

  it('H2: a synchronously-throwing writeText is also caught', async () => {
    defineClipboard({
      writeText: vi.fn(() => {
        throw new Error('boom')
      }),
    })

    const { result } = renderHook(() => useClipboard())
    let outcome
    await act(async () => {
      outcome = await result.current.copy('payload')
    })
    expect(outcome).toBe(false)
    expect(result.current.error).toBeTruthy()
  })

  it('H3: a new copy() clears prior error and copied state', async () => {
    // First call fails…
    defineClipboard({
      writeText: vi.fn(() => Promise.reject(new Error('denied'))),
    })
    const { result } = renderHook(() => useClipboard())
    await act(async () => {
      await result.current.copy('first')
    })
    expect(result.current.error).toBeTruthy()

    // …second call succeeds and must clear the stale error.
    defineClipboard({ writeText: vi.fn(() => Promise.resolve()) })
    await act(async () => {
      await result.current.copy('second')
    })
    expect(result.current.error).toBeNull()
    expect(result.current.copied).toBe(true)
  })
})
