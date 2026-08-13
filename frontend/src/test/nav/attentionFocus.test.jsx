import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import AttentionFocus from '../../components/nav/AttentionFocus'
import { ATTENTION_CLASS, FLASH_MS, WAIT_MS, flashAttention } from '../../lib/nav/attention'

/*
 * The arrival cue. A search result deep-links with `?focus=<id>`; whatever carries the matching
 * `data-attention` marker flashes once so the member can see the thing they searched for on a
 * screen they may never have opened.
 *
 * The properties that matter are all about NOT lying: it waits for a target that mounts late
 * rather than missing it, it gives up quietly when there is no target rather than hanging, and
 * consuming the parameter must not cancel the very highlight it just started.
 */

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="loc">{location.pathname}{location.search}{location.hash}</div>
}

const marked = (id) => {
  const el = document.createElement('div')
  el.setAttribute('data-attention', id)
  el.scrollIntoView = vi.fn()
  document.body.appendChild(el)
  return el
}

describe('flashAttention', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
  })
  afterEach(() => vi.useRealTimers())

  it('highlights a target that is already on screen, then lets go', () => {
    const el = marked('earn-lend')
    flashAttention('earn-lend')

    expect(el.classList.contains(ATTENTION_CLASS)).toBe(true)
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })

    act(() => vi.advanceTimersByTime(FLASH_MS + 10))
    expect(el.classList.contains(ATTENTION_CLASS)).toBe(false)
  })

  it('waits for a target that mounts after the route change', () => {
    flashAttention('earn-stake')
    act(() => vi.advanceTimersByTime(200))

    const el = marked('earn-stake')
    act(() => vi.advanceTimersByTime(200))
    expect(el.classList.contains(ATTENTION_CLASS)).toBe(true)
  })

  it('gives up quietly when the surface carries no marker', () => {
    expect(() => {
      flashAttention('no-such-destination')
      act(() => vi.advanceTimersByTime(WAIT_MS * 2))
    }).not.toThrow()
    // And it really stopped: a target appearing long afterwards is not retro-flashed.
    const late = marked('no-such-destination')
    act(() => vi.advanceTimersByTime(500))
    expect(late.classList.contains(ATTENTION_CLASS)).toBe(false)
  })

  it('treats a junk id as "no target" rather than throwing', () => {
    // The id comes off a URL parameter, so it is arbitrary text. Interpolating it into a selector
    // would turn a quote or a newline into an exception on a page that is otherwise fine.
    const el = marked('earn-lend')
    for (const junk of ['"] , *', 'a\nb', '::before', '[', 'earn-lend"]']) {
      expect(() => flashAttention(junk)).not.toThrow()
    }
    act(() => vi.advanceTimersByTime(WAIT_MS * 2))
    expect(el.classList.contains(ATTENTION_CLASS)).toBe(false)
  })

  it('drops the highlight when cancelled mid-flash', () => {
    const el = marked('trade-perps')
    const cancel = flashAttention('trade-perps')
    cancel()
    expect(el.classList.contains(ATTENTION_CLASS)).toBe(false)
  })
})

describe('AttentionFocus', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('flashes the marked element and strips the parameter, keeping the rest of the URL', () => {
    const el = marked('legacy-recovery')
    render(
      <MemoryRouter initialEntries={['/wallet?tab=security&focus=legacy-recovery#legacy-recovery']}>
        <AttentionFocus />
        <LocationProbe />
      </MemoryRouter>
    )

    // Consuming the parameter re-runs the effect — the highlight must survive that.
    expect(el.classList.contains(ATTENTION_CLASS)).toBe(true)
    expect(screen.getByTestId('loc')).toHaveTextContent('/wallet?tab=security#legacy-recovery')
    expect(screen.getByTestId('loc').textContent).not.toContain('focus=')
  })

  it('does nothing at all on a route with no focus parameter', () => {
    const el = marked('earn-lend')
    render(
      <MemoryRouter initialEntries={['/wallet?tab=earn&view=lend']}>
        <AttentionFocus />
        <LocationProbe />
      </MemoryRouter>
    )
    expect(el.classList.contains(ATTENTION_CLASS)).toBe(false)
    expect(screen.getByTestId('loc')).toHaveTextContent('/wallet?tab=earn&view=lend')
  })
})
