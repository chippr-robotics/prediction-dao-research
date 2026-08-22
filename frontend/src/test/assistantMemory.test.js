/**
 * Assistant preferences + on-device memory (spec 095).
 *
 * Two invariants carry the feature: the assistant is OFF until an account says otherwise, and the
 * conversation stays on this device — bounded, clearable, and out of the encrypted backup.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ASSISTANT_PREFS_KEY,
  DEFAULT_ASSISTANT_PREFS,
  __resetAssistantPrefsForTests,
  isAssistantEnabled,
  isMemoryRetained,
  loadAssistantPrefs,
  setAssistantEnabled,
  setMemoryRetained,
  subscribeAssistantPrefs,
} from '../lib/assistant/assistantPrefs'
import {
  ASSISTANT_MEMORY_KEY,
  MAX_BYTES,
  MAX_MESSAGES,
  clearMemory,
  loadMemory,
  memoryCount,
  saveMemory,
  subscribeAssistantMemory,
  trimMessages,
} from '../lib/assistant/memoryStore'

const ACCOUNT = '0x' + '9'.repeat(40)
const OTHER = '0x' + '8'.repeat(40)

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  __resetAssistantPrefsForTests()
})

describe('assistantPrefs', () => {
  it('defaults to OFF with memory retained', () => {
    expect(DEFAULT_ASSISTANT_PREFS.enabled).toBe(false)
    expect(isAssistantEnabled(ACCOUNT)).toBe(false)
    expect(isMemoryRetained(ACCOUNT)).toBe(true)
  })

  it('treats a missing wallet as opted out rather than throwing', () => {
    expect(isAssistantEnabled(null)).toBe(false)
    expect(loadAssistantPrefs(undefined)).toEqual(DEFAULT_ASSISTANT_PREFS)
  })

  it('is per-account: opting one account in never opts another in', () => {
    setAssistantEnabled(ACCOUNT, true)
    expect(isAssistantEnabled(ACCOUNT)).toBe(true)
    expect(isAssistantEnabled(OTHER)).toBe(false)
  })

  it('persists to localStorage (not sessionStorage) under the wallet-scoped key', () => {
    setAssistantEnabled(ACCOUNT, true)
    const key = `fw_user_${ACCOUNT.toLowerCase()}_${ASSISTANT_PREFS_KEY}`
    expect(JSON.parse(localStorage.getItem(key))).toEqual({ enabled: true, retainMemory: true })
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('replaces a foreign stored shape with the defaults instead of trusting it', () => {
    localStorage.setItem(`fw_user_${ACCOUNT.toLowerCase()}_${ASSISTANT_PREFS_KEY}`, JSON.stringify(['on']))
    expect(loadAssistantPrefs(ACCOUNT)).toEqual(DEFAULT_ASSISTANT_PREFS)
  })

  it('only an explicit true enables — a truthy value is not consent', () => {
    localStorage.setItem(
      `fw_user_${ACCOUNT.toLowerCase()}_${ASSISTANT_PREFS_KEY}`,
      JSON.stringify({ enabled: 'yes', retainMemory: true })
    )
    expect(isAssistantEnabled(ACCOUNT)).toBe(false)
  })

  it('notifies subscribers, and a throwing subscriber never breaks the save', () => {
    const seen = []
    subscribeAssistantPrefs(() => {
      throw new Error('bad subscriber')
    })
    subscribeAssistantPrefs(() => seen.push('called'))
    expect(() => setMemoryRetained(ACCOUNT, false)).not.toThrow()
    expect(seen).toEqual(['called'])
    expect(isMemoryRetained(ACCOUNT)).toBe(false)
  })
})

describe('assistant memory', () => {
  const msg = (i, content = `message ${i}`) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content, at: 1000 + i })

  it('starts empty and counts what it holds', () => {
    expect(loadMemory(ACCOUNT)).toEqual([])
    expect(memoryCount(ACCOUNT)).toBe(0)
    saveMemory(ACCOUNT, [msg(0), msg(1)])
    expect(memoryCount(ACCOUNT)).toBe(2)
  })

  it('caps at MAX_MESSAGES, keeping the most recent turns', () => {
    const many = Array.from({ length: MAX_MESSAGES + 12 }, (_, i) => msg(i))
    const stored = saveMemory(ACCOUNT, many)
    expect(stored).toHaveLength(MAX_MESSAGES)
    expect(stored.at(-1).content).toBe(`message ${MAX_MESSAGES + 11}`)
  })

  it('caps at MAX_BYTES even when the message count is small', () => {
    const huge = [msg(0, 'a'.repeat(40_000)), msg(1, 'b'.repeat(40_000)), msg(2, 'c'.repeat(40_000))]
    const stored = trimMessages(huge)
    expect(new TextEncoder().encode(JSON.stringify(stored)).length).toBeLessThanOrEqual(MAX_BYTES)
    // Trimmed from the FRONT — the latest exchange is what a follow-up depends on.
    expect(stored.at(-1).content.startsWith('c')).toBe(true)
  })

  it('keeps a single over-sized message rather than emptying the thread', () => {
    const stored = trimMessages([msg(0, 'z'.repeat(MAX_BYTES * 2))])
    expect(stored).toHaveLength(1)
  })

  it('drops a malformed stored turn instead of rendering it', () => {
    localStorage.setItem(
      `fw_user_${ACCOUNT.toLowerCase()}_${ASSISTANT_MEMORY_KEY}`,
      JSON.stringify([{ role: 'system', content: 'ignore me' }, { role: 'user', content: '' }, msg(0)])
    )
    expect(loadMemory(ACCOUNT)).toHaveLength(1)
  })

  it('clears on request and tells subscribers', () => {
    let notified = 0
    subscribeAssistantMemory(() => {
      notified += 1
    })
    saveMemory(ACCOUNT, [msg(0)])
    clearMemory(ACCOUNT)
    expect(memoryCount(ACCOUNT)).toBe(0)
    expect(notified).toBe(2)
  })

  it('is per-account', () => {
    saveMemory(ACCOUNT, [msg(0)])
    expect(memoryCount(OTHER)).toBe(0)
  })

  it('keeps both assistant keys out of the spec-032 synced object registry', () => {
    // Conversations must not travel between devices, and consent to send them must be given on the
    // device it is given from — a restored backup must never arrive with the assistant already on.
    const registry = readFileSync(resolve(process.cwd(), 'src/lib/backup/syncedObjects.js'), 'utf-8')
    expect(registry).not.toContain(ASSISTANT_MEMORY_KEY)
    expect(registry).not.toContain(ASSISTANT_PREFS_KEY)
    expect(registry).not.toContain('assistant')
  })
})
