/**
 * Assistant transport (spec 095) — the session grant and the chat call.
 *
 * The state machine is the feature. An assistant that answers when its backend did not is the one
 * failure this surface cannot have, so every non-2xx path is asserted to THROW with a named state
 * rather than resolve with anything a bubble could render.
 *
 * The second assertion that matters: the session token exists only in module memory. It is checked
 * against raw localStorage AND sessionStorage after a successful authorization.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ethers } from 'ethers'
import {
  ASSISTANT_SESSION_SCOPES,
  AssistantError,
  __resetAssistantSessionForTests,
  authorizeSession,
  clearSession,
  hasSession,
  sendChat,
  sessionExpiresAt,
} from '../lib/assistant/assistantClient'

const BASE = 'https://relay.example'

let wallet
const signWith = (w) => (domain, types, message) => w.signTypedData(domain, types, message)

function response(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name] ?? null },
    json: async () => body,
  }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  __resetAssistantSessionForTests()
// Fixed key (Wallet.createRandom's mnemonic path hits an ethers/jsdom crypto quirk under vitest).
  wallet = new ethers.Wallet('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
  global.fetch = vi.fn()
})

async function authorize() {
  return authorizeSession({ account: wallet.address, sign: signWith(wallet), now: Math.floor(Date.now() / 1000) })
}

describe('session', () => {
  it('asks for the conversational scope plus reads, and nothing that writes', () => {
    expect(ASSISTANT_SESSION_SCOPES).toContain('assistant:chat')
    for (const scope of ASSISTANT_SESSION_SCOPES) expect(scope.startsWith('write:')).toBe(false)
  })

  it('authorizes for 24 hours and holds the token in memory only', async () => {
    expect(hasSession(wallet.address)).toBe(false)
    const { expiresAt, scopes } = await authorize()

    expect(hasSession(wallet.address)).toBe(true)
    expect(sessionExpiresAt(wallet.address)).toBe(expiresAt)
    expect(scopes).toEqual([...ASSISTANT_SESSION_SCOPES].sort())
    expect(expiresAt - Math.floor(Date.now() / 1000)).toBeGreaterThan(86_000)

    // Nowhere on disk. Scan every storage entry rather than a key we happen to know.
    const dump = [localStorage, sessionStorage]
      .flatMap((store) => Object.keys(store).map((k) => store.getItem(k)))
      .join('|')
    expect(dump).not.toContain('fw1.')
  })

  it('is per-account, and clearing drops it', async () => {
    await authorize()
    expect(hasSession('0x' + '7'.repeat(40))).toBe(false)
    clearSession()
    expect(hasSession(wallet.address)).toBe(false)
    expect(sessionExpiresAt(wallet.address)).toBeNull()
  })

  it('refuses to authorize an account that cannot sign', async () => {
    await expect(authorizeSession({ account: wallet.address, sign: null })).rejects.toBeInstanceOf(AssistantError)
  })
})

describe('sendChat', () => {
  it('reports "unset" when no gateway is configured, without calling fetch', async () => {
    await authorize()
    await expect(
      sendChat({ account: wallet.address, messages: [{ role: 'user', content: 'hi' }], baseUrl: '' })
    ).rejects.toMatchObject({ state: 'unset' })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('reports "unauthorized" before any request when there is no session', async () => {
    await expect(
      sendChat({ account: wallet.address, messages: [{ role: 'user', content: 'hi' }], baseUrl: BASE })
    ).rejects.toMatchObject({ state: 'unauthorized' })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('sends the bearer token in a header and returns the reply', async () => {
    await authorize()
    global.fetch.mockResolvedValue(
      response(200, { reply: 'Earn lives at /wallet?tab=earn', model: 'claude-sonnet-5', usage: { inputTokens: 9, outputTokens: 4 } })
    )

    const result = await sendChat({
      account: wallet.address,
      messages: [{ role: 'user', content: 'where is earn?' }],
      surface: '/app',
      baseUrl: BASE,
    })

    expect(result.reply).toContain('/wallet?tab=earn')
    expect(result.usage).toEqual({ inputTokens: 9, outputTokens: 4 })

    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe(`${BASE}/v1/member/assistant/chat`)
    // The credential rides in a HEADER — never in the URL.
    expect(options.headers.Authorization).toMatch(/^Bearer fw1\./)
    expect(url).not.toContain('fw1.')
    expect(JSON.parse(options.body)).toEqual({
      messages: [{ role: 'user', content: 'where is earn?' }],
      surface: '/app',
    })
  })

  it('maps 503 assistant_unconfigured to "unconfigured"', async () => {
    await authorize()
    global.fetch.mockResolvedValue(
      response(503, { error: { code: 'assistant_unconfigured', reason: 'the assistant is not enabled on this gateway' } })
    )
    await expect(
      sendChat({ account: wallet.address, messages: [{ role: 'user', content: 'hi' }], baseUrl: BASE })
    ).rejects.toMatchObject({ state: 'unconfigured', code: 'assistant_unconfigured' })
  })

  it('maps 503 assistant_unavailable to "unavailable" — briefly broken, not turned off', async () => {
    await authorize()
    global.fetch.mockResolvedValue(response(503, { error: { code: 'assistant_unavailable', reason: 'try again shortly' } }))
    await expect(
      sendChat({ account: wallet.address, messages: [{ role: 'user', content: 'hi' }], baseUrl: BASE })
    ).rejects.toMatchObject({ state: 'unavailable' })
  })

  it('maps 429 to "quota" and carries Retry-After', async () => {
    await authorize()
    global.fetch.mockResolvedValue(
      response(429, { error: { code: 'quota_exceeded', reason: 'slow down' } }, { 'Retry-After': '30' })
    )
    await expect(
      sendChat({ account: wallet.address, messages: [{ role: 'user', content: 'hi' }], baseUrl: BASE })
    ).rejects.toMatchObject({ state: 'quota', retryAfterSeconds: 30 })
  })

  it('maps 401 to "unauthorized" and drops the dead session', async () => {
    await authorize()
    global.fetch.mockResolvedValue(response(401, { error: { code: 'token_expired', reason: 'expired' } }))
    await expect(
      sendChat({ account: wallet.address, messages: [{ role: 'user', content: 'hi' }], baseUrl: BASE })
    ).rejects.toMatchObject({ state: 'unauthorized' })
    // Retrying with a credential that will keep failing is not a retry.
    expect(hasSession(wallet.address)).toBe(false)
  })

  it('maps a transport failure to "unreachable" — never a fabricated reply', async () => {
    await authorize()
    global.fetch.mockRejectedValue(new Error('connection refused'))
    await expect(
      sendChat({ account: wallet.address, messages: [{ role: 'user', content: 'hi' }], baseUrl: BASE })
    ).rejects.toMatchObject({ state: 'unreachable' })
  })

  it('treats an empty body as no answer, not as an empty answer', async () => {
    await authorize()
    global.fetch.mockResolvedValue(response(200, { reply: '' }))
    await expect(
      sendChat({ account: wallet.address, messages: [{ role: 'user', content: 'hi' }], baseUrl: BASE })
    ).rejects.toMatchObject({ state: 'unavailable', code: 'empty_reply' })
  })
})
