import { describe, it, expect, vi } from 'vitest'

import { CONSOLE_KEY, readConsoleSettings, writeBaseUrl } from '../consoleStore'
import { makeStore } from './_host'

// Spec 095 — the app's one store key. The load-bearing property is what is NOT here: a token never
// reaches the store, so there is no code path in this module that could put one there.

describe('readConsoleSettings', () => {
  it('reads a saved base URL', () => {
    const store = makeStore({ [CONSOLE_KEY]: { baseUrl: 'https://gw.example' } })
    expect(readConsoleSettings(store)).toEqual({ baseUrl: 'https://gw.example' })
  })

  it('reports an empty base URL for an absent record rather than inventing a default', () => {
    expect(readConsoleSettings(makeStore())).toEqual({ baseUrl: '' })
  })

  it('survives a malformed record', () => {
    expect(readConsoleSettings(makeStore({ [CONSOLE_KEY]: 'not-an-object' }))).toEqual({ baseUrl: '' })
    expect(readConsoleSettings(makeStore({ [CONSOLE_KEY]: { baseUrl: 42 } }))).toEqual({ baseUrl: '' })
  })

  it('survives an absent store', () => {
    expect(readConsoleSettings(null)).toEqual({ baseUrl: '' })
  })
})

describe('writeBaseUrl', () => {
  it('writes under the single declared key', () => {
    const store = makeStore()
    expect(writeBaseUrl(store, 'https://gw.example')).toBe(true)
    expect(store.set).toHaveBeenCalledWith(CONSOLE_KEY, { baseUrl: 'https://gw.example' })
  })

  it('preserves other fields a later version may have written', () => {
    const store = makeStore({ [CONSOLE_KEY]: { baseUrl: 'https://old.example', somethingElse: 1 } })
    writeBaseUrl(store, 'https://new.example')
    expect(store.set).toHaveBeenCalledWith(CONSOLE_KEY, { baseUrl: 'https://new.example', somethingElse: 1 })
  })

  it('reports a refused write instead of claiming success — the host store reports, never throws', () => {
    const store = { ...makeStore(), set: vi.fn(() => false) }
    expect(writeBaseUrl(store, 'https://gw.example')).toBe(false)
  })
})
