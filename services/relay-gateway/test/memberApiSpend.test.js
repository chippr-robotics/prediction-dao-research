/**
 * Assistant SPEND ceilings — the controls that bound money rather than traffic (spec 095 hardening).
 *
 * The defect these cover: `POST /v1/member/assistant/chat` logged `inputTokens`/`outputTokens` into
 * the audit event and then did nothing with them. Nothing accumulated a spend figure and nothing
 * capped one, so the only ceiling on the bearer rail was the request quota (120 per account per
 * minute, 600 per gateway) — and the only control an operator had was `ASSISTANT_ENABLED=false`, a
 * full kill. At Sonnet-5 rates against the 32 kB body cap that is on the order of $295/hr for one
 * member and $1,476/hr for the gateway.
 *
 * Three things are asserted, and each fails on the pre-fix code:
 *   · a per-account and a gateway-wide TOKEN budget, refused with their own error code;
 *   · a tighter REQUEST class for model calls than for reads;
 *   · a hard cap on ASSISTANT_MAX_TOKENS, enforced at boot.
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { ethers } from 'ethers'
import { createApp } from '../src/server.js'
import { createTokenBudget } from '../src/policy/quotas.js'
import { maxTurnTokens } from '../src/memberApi/assistant.js'
import { testConfig, mockEngine, ORIGIN_SECRET, TEST_NOW } from './helpers.js'
import { MEMBER_API_ENV, memberApiProviders, memberToken } from './memberApiHelpers.js'

/** A second member, so the GATEWAY-wide budget can be told apart from one account's. */
const otherWallet = new ethers.Wallet('0x' + '5c'.repeat(32))

const ASSISTANT_ENV = { ...MEMBER_API_ENV, ASSISTANT_ENABLED: 'true', ANTHROPIC_API_KEY: 'sk-test' }

/**
 * A model upstream whose reported usage the test chooses. `usage: null` reproduces a provider that
 * answered without counts — the case where a spent amount is genuinely UNKNOWN.
 */
function mockAssistant({ inputTokens = 120, outputTokens = 30, usage = 'report' } = {}) {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url: String(url), init })
    return {
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: 'text', text: 'Wagers live under Transfer.' }],
        model: 'claude-sonnet-5',
        stop_reason: 'end_turn',
        ...(usage === 'report' ? { usage: { input_tokens: inputTokens, output_tokens: outputTokens } } : {}),
      }),
    }
  }
  impl.calls = calls
  return impl
}

function build({ env = {}, memberApiFetch = mockAssistant(), auditLines = [] } = {}) {
  const config = testConfig({ ...ASSISTANT_ENV, ...env })
  config.feeRouter = { ...config.feeRouter, address: null }
  const { app } = createApp(config, {
    providers: memberApiProviders(config),
    engineClient: mockEngine(),
    now: () => TEST_NOW,
    auditSink: (line) => auditLines.push(line),
    memberApiFetch,
  })
  return { app, config, memberApiFetch, auditLines }
}

const chat = (app, token) =>
  request(app)
    .post('/v1/member/assistant/chat')
    .set('X-Origin-Auth', ORIGIN_SECRET)
    .set('Authorization', `Bearer ${token}`)
    .send({ messages: [{ role: 'user', content: 'where are my wagers?' }] })

// One maximal turn at the default 1024-token reply ceiling. Boot refuses a budget under this, so
// every budget below is expressed relative to it rather than as a bare number.
const ONE_TURN = maxTurnTokens(1024)
/** The smallest budget boot will accept, plus a little room. */
const BUDGET = ONE_TURN + 1_000
/** What the mocked provider says one turn actually cost — more than the whole budget. */
const BILLED = { inputTokens: 20_000, outputTokens: 4_000 }

// ---- the token budget ---------------------------------------------------------------------------

describe('the assistant has a per-account TOKEN budget', () => {
  it('refuses the next turn once the account has spent its window, with its own error code', async () => {
    // The first turn is billed 24,000 tokens by the provider, which is most of the budget; the
    // second cannot fit its reservation and is refused.
    // PRE-FIX: nothing accumulated the counts, so this answered 200 forever.
    const fetchImpl = mockAssistant(BILLED)
    const { app } = build({
      env: { ASSISTANT_TOKEN_BUDGET_PER_ACCOUNT: String(BUDGET), ASSISTANT_TOKEN_BUDGET_GLOBAL: String(BUDGET * 4) },
      memberApiFetch: fetchImpl,
    })
    const token = await memberToken()

    const first = await chat(app, token)
    expect(first.status).toBe(200)
    expect(first.body.usage).toEqual({ inputTokens: 20_000, outputTokens: 4_000 })

    const second = await chat(app, token)
    expect(second.status).toBe(429)
    expect(second.body.error.code).toBe('assistant_budget_exhausted')
    expect(second.headers['retry-after']).toBeDefined()
    // A specific refusal, never a generic 500 and never a shortened answer: the provider was not
    // called a second time at all.
    expect(fetchImpl.calls).toHaveLength(1)
  })

  it('never answers a refusal as a truncated reply', async () => {
    const { app } = build({
      env: { ASSISTANT_TOKEN_BUDGET_PER_ACCOUNT: String(BUDGET), ASSISTANT_TOKEN_BUDGET_GLOBAL: String(BUDGET * 4) },
      memberApiFetch: mockAssistant(BILLED),
    })
    const token = await memberToken()
    await chat(app, token)

    const refused = await chat(app, token)
    expect(refused.body.reply).toBeUndefined()
    expect(refused.body.error.reason).toMatch(/budget/i)
  })

  it('records the refusal in the audit trail as counts, never content', async () => {
    const auditLines = []
    const { app } = build({
      env: { ASSISTANT_TOKEN_BUDGET_PER_ACCOUNT: String(BUDGET), ASSISTANT_TOKEN_BUDGET_GLOBAL: String(BUDGET * 4) },
      memberApiFetch: mockAssistant(BILLED),
      auditLines,
    })
    const token = await memberToken()
    await chat(app, token)
    await chat(app, token)

    const joined = auditLines.join('\n')
    expect(joined).toContain('budget_exhausted')
    expect(joined).not.toContain('where are my wagers?')
  })

  it('has a gateway-wide budget as well, and names which one bit', async () => {
    // Account A spends most of the GATEWAY's budget; account B is refused even though B has spent
    // nothing of their own. PRE-FIX: no budget of either kind, so B answered 200.
    const { app } = build({
      env: {
        ASSISTANT_TOKEN_BUDGET_PER_ACCOUNT: String(BUDGET),
        ASSISTANT_TOKEN_BUDGET_GLOBAL: String(BUDGET),
      },
      memberApiFetch: mockAssistant(BILLED),
    })

    expect((await chat(app, await memberToken())).status).toBe(200)

    const other = await memberToken({ signer: otherWallet })
    const refused = await chat(app, other)
    expect(refused.status).toBe(429)
    expect(refused.body.error.code).toBe('assistant_budget_exhausted')
    // The reason distinguishes "you" from "this gateway" — an agent backs off differently.
    expect(refused.body.error.reason).toMatch(/gateway/i)
  })

  it('still runs the budget down when the provider reports no counts at all', async () => {
    // An unknown cost is never a zero cost: a turn whose usage the provider omitted keeps its
    // pre-flight reservation rather than collapsing to nothing. Otherwise a provider that stopped
    // reporting counts would silently make the whole ceiling free.
    // PRE-FIX: no budget existed, so no number of turns was ever refused.
    const { app } = build({
      env: {
        ASSISTANT_MAX_TOKENS: '4096',
        ASSISTANT_TOKEN_BUDGET_PER_ACCOUNT: String(maxTurnTokens(4096)),
        ASSISTANT_TOKEN_BUDGET_GLOBAL: String(maxTurnTokens(4096)),
        ASSISTANT_QUOTA_PER_ACCOUNT: '50',
        ASSISTANT_QUOTA_GLOBAL: '50',
      },
      memberApiFetch: mockAssistant({ usage: 'none' }),
    })
    const token = await memberToken()

    let refused = null
    for (let i = 0; i < 20 && !refused; i++) {
      const res = await chat(app, token)
      if (res.status !== 200) refused = res
    }
    expect(refused).not.toBeNull()
    expect(refused.status).toBe(429)
    expect(refused.body.error.code).toBe('assistant_budget_exhausted')
  })

  it('does not charge a member for an assistant that is switched off', async () => {
    // 503 assistant_unconfigured costs nothing upstream, so it must cost nothing from the budget.
    const { app } = build({ env: { ASSISTANT_ENABLED: 'false' } })
    const token = await memberToken()
    const res = await chat(app, token)
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('assistant_unconfigured')
  })
})

// ---- the request class --------------------------------------------------------------------------

describe('model calls are a tighter request class than reads', () => {
  it('limits chats well below the module’s general read quota', async () => {
    // PRE-FIX: the assistant shared the general 120/min, so the third turn answered 200.
    const { app } = build({ env: { ASSISTANT_QUOTA_PER_ACCOUNT: '2' } })
    const token = await memberToken()
    expect((await chat(app, token)).status).toBe(200)
    expect((await chat(app, token)).status).toBe(200)

    const limited = await chat(app, token)
    expect(limited.status).toBe(429)
    expect(limited.body.error.code).toBe('quota_exceeded')
    expect(limited.body.error.reason).toMatch(/assistant/i)
  })

  it('leaves the member’s ordinary reads working when their chat allowance is spent', async () => {
    // The whole point of a separate class: an agent that over-chats keeps its data access.
    const { app } = build({ env: { ASSISTANT_QUOTA_PER_ACCOUNT: '1' } })
    const token = await memberToken()
    await chat(app, token)
    expect((await chat(app, token)).status).toBe(429)

    const me = await request(app)
      .get('/v1/member/me')
      .set('X-Origin-Auth', ORIGIN_SECRET)
      .set('Authorization', `Bearer ${token}`)
    expect(me.status).toBe(200)
  })
})

// ---- boot-time validation -----------------------------------------------------------------------

describe('boot refuses a spend configuration that is not a ceiling', () => {
  it('caps ASSISTANT_MAX_TOKENS in code, not in the env file', () => {
    // PRE-FIX: validated only as `>= 1`, so a fat-fingered 1000000 booted happily and multiplied
    // the cost of every single turn.
    expect(() => testConfig({ ...ASSISTANT_ENV, ASSISTANT_MAX_TOKENS: '1000000' })).toThrow(/ASSISTANT_MAX_TOKENS=1000000/)
    expect(() => testConfig({ ...ASSISTANT_ENV, ASSISTANT_MAX_TOKENS: '4096' })).not.toThrow()
    expect(() => testConfig({ ...ASSISTANT_ENV, ASSISTANT_MAX_TOKENS: '4097' })).toThrow(/between 1 and 4096/)
  })

  it('rejects a budget below one maximal turn, because that is a size limit not a budget', () => {
    expect(() => testConfig({ ...ASSISTANT_ENV, ASSISTANT_TOKEN_BUDGET_PER_ACCOUNT: '100' })).toThrow(
      /ASSISTANT_TOKEN_BUDGET_PER_ACCOUNT=100/
    )
  })

  it('rejects a gateway budget below one member’s, which would make the labels untrue', () => {
    expect(() =>
      testConfig({ ...ASSISTANT_ENV, ASSISTANT_TOKEN_BUDGET_PER_ACCOUNT: '400000', ASSISTANT_TOKEN_BUDGET_GLOBAL: '100000' })
    ).toThrow(/ASSISTANT_TOKEN_BUDGET_GLOBAL=100000/)
  })

  it('rejects an assistant request quota of 0 — off is a 503, not an unclearable 429', () => {
    expect(() => testConfig({ ...ASSISTANT_ENV, ASSISTANT_QUOTA_PER_ACCOUNT: '0' })).toThrow(/ASSISTANT_QUOTA_PER_ACCOUNT=0/)
  })

  it('validates none of it while the assistant is off, like every other optional block', () => {
    expect(() => testConfig({ ...MEMBER_API_ENV, ASSISTANT_MAX_TOKENS: '1000000' })).not.toThrow()
  })
})

// ---- the accumulator itself ---------------------------------------------------------------------

describe('createTokenBudget', () => {
  const budget = (over = {}) => {
    let t = 1_000_000
    return {
      clock: { advance: (ms) => (t += ms) },
      b: createTokenBudget({ perAccountPerWindow: 1000, globalPerWindow: 5000, windowMs: 60_000, now: () => t, ...over }),
    }
  }

  it('settles a reservation down to the measured usage', () => {
    const { b } = budget()
    const r = b.reserve('0xabc', 900)
    expect(r.allowed).toBe(true)
    r.settle(100)
    expect(b.spentFor('0xabc')).toBe(100)
    // The freed headroom is genuinely available again.
    expect(b.reserve('0xabc', 900).allowed).toBe(true)
  })

  it('keeps the reservation when the provider reported NO usage — unknown is never zero', () => {
    const { b } = budget()
    b.reserve('0xabc', 900).settle(null)
    expect(b.spentFor('0xabc')).toBe(900)
    expect(b.reserve('0xabc', 900).allowed).toBe(false)
  })

  it('does not let two in-flight turns spend the same headroom', () => {
    // Both reserve before either settles — which is exactly the race an accumulate-afterwards
    // design cannot see.
    const { b } = budget()
    expect(b.reserve('0xabc', 600).allowed).toBe(true)
    expect(b.reserve('0xabc', 600).allowed).toBe(false)
  })

  it('names the scope that bit', () => {
    const { b } = budget()
    const mine = b.reserve('0xabc', 1000)
    mine.settle(1000)
    expect(b.reserve('0xabc', 10)).toMatchObject({ allowed: false, scope: 'account', spentTokens: 1000, budgetTokens: 1000 })

    for (const who of ['0xb', '0xc', '0xd', '0xe']) b.reserve(who, 1000).settle(1000)
    expect(b.reserve('0xf', 10)).toMatchObject({ allowed: false, scope: 'global', budgetTokens: 5000 })
  })

  it('rolls the window forward', () => {
    const { clock, b } = budget()
    b.reserve('0xabc', 1000).settle(1000)
    expect(b.reserve('0xabc', 10).allowed).toBe(false)

    clock.advance(60_001)
    expect(b.spentFor('0xabc')).toBe(0)
    expect(b.reserve('0xabc', 10).allowed).toBe(true)
  })

  it('offers a retry-after that reflects the oldest live charge', () => {
    const { clock, b } = budget()
    b.reserve('0xabc', 1000).settle(1000)
    clock.advance(30_000)
    const refused = b.reserve('0xabc', 10)
    expect(refused.allowed).toBe(false)
    expect(refused.retryAfterSec).toBe(30)
  })
})
