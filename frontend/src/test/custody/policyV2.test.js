import { describe, it, expect } from 'vitest'
import { Interface, ZeroAddress, getAddress, parseEther } from 'ethers'
import {
  ANY_ASSET,
  analyzeShadowing,
  buildAdoptV2Txs,
  buildRulesChangeTx,
  buildSetGuardV2Tx,
  classifyPayload,
  classifyPolicyProposalV2,
  decodePolicyErrorV2,
  describeRulesV2,
  encodeSetRules,
  findBrokenRules,
  fromV1Policy,
  getPolicyEngineV2Addresses,
  isPolicyV2Supported,
  matchPreview,
  ruleNumber,
  scopeEquals,
  validateRulesConfig,
} from '../../lib/custody/policyV2'
import { FIRST_MATCH_SCENARIOS } from '../fixtures/policyScenarios'
import { SAFE_POLICY_GUARD_V2_ABI } from '../../abis/SafePolicyGuardV2'
import { getContractAddressForChain } from '../../config/contracts'

// Spec 068 (T009/T010) — ordered policy client library. Chain 1337 is the fully-wired local chain
// (both safePolicyGuardV2 and policyGuardSetup recorded); 63 has custody but no V2 engine yet; 1 is
// not a custody chain at all. The match-preview tests use the SAME scenarios as the Solidity suite
// so the client twin cannot drift from enforcement.

const CHAIN = 1337
const NATIVE = ZeroAddress
const ONE = 10n ** 18n
const A = getAddress('0x1111111111111111111111111111111111111111')
const B = getAddress('0x2222222222222222222222222222222222222222')
const C = getAddress('0x3333333333333333333333333333333333333333')
const TOKEN = getAddress('0x00000000000000000000000000000000000c0ffe')
const DEST = getAddress('0x4444444444444444444444444444444444444444')
const OTHER = getAddress('0x5555555555555555555555555555555555555555')
/** Resolve the shared scenarios' symbolic destinations against this suite's addresses. */
const addressFor = (name) => (name === 'payee' ? DEST : OTHER)

const erc20 = new Interface([
  'function transfer(address to, uint256 amount)',
  'function transferFrom(address from, address to, uint256 amount)',
  'function approve(address spender, uint256 amount)',
])

const rule = (over = {}) => ({
  asset: ANY_ASSET,
  perTxLimit: 0n,
  windowLimit: 0n,
  approvalsRequired: 0,
  banded: false,
  approvers: [],
  targets: [],
  ...over,
})

describe('policyV2 — engine availability', () => {
  it('resolves the engine only where both contracts are deployed', () => {
    expect(isPolicyV2Supported(CHAIN)).toBe(true)
    expect(getPolicyEngineV2Addresses(CHAIN).guard).toBe(
      getAddress(getContractAddressForChain('safePolicyGuardV2', CHAIN)),
    )
    expect(isPolicyV2Supported(1)).toBe(false)
    expect(getPolicyEngineV2Addresses(1)).toBeNull()
  })
})

describe('policyV2 — validation', () => {
  it('normalizes "all approvers" and rejects incoherent rules', () => {
    const [normalized] = validateRulesConfig([rule({ approvers: [A, B] })], 0)
    expect(normalized.approvalsRequired).toBe(2)

    expect(() => validateRulesConfig([rule({ approvalsRequired: 1 })], 0)).toThrow(/name the approvers/i)
    expect(() => validateRulesConfig([rule({ approvers: [A], approvalsRequired: 2 })], 0)).toThrow(/more approvals/i)
    expect(() => validateRulesConfig([rule({ banded: true })], 0)).toThrow(/amount limit/i)
    expect(() => validateRulesConfig([rule({ approvers: [A, A] })], 0)).toThrow(/twice/i)
    expect(() => validateRulesConfig([rule({ targets: [DEST, DEST] })], 0)).toThrow(/twice/i)
    expect(() => validateRulesConfig([rule()], 400 * 24 * 3600)).toThrow(/365 days/i)
  })

  it('enforces approver-must-be-owner at composition time (FR-010)', () => {
    expect(() => validateRulesConfig([rule({ approvers: [C] })], 0, { owners: [A, B] })).toThrow(/not an owner/i)
    expect(() => validateRulesConfig([rule({ approvers: [A] })], 0, { owners: [A, B] })).not.toThrow()
  })

  it('keeps daily limits off any-asset rules, where the counter would be meaningless', () => {
    expect(() => validateRulesConfig([rule({ windowLimit: ONE })], 0)).toThrow(/specific asset/i)
    expect(() => validateRulesConfig([rule({ asset: NATIVE, windowLimit: ONE })], 0)).not.toThrow()
  })

  it('flags rules naming someone who is no longer an owner', () => {
    const rules = [rule({ approvers: [A, B] }), rule({ approvers: [A] })]
    expect(findBrokenRules(rules, [A, B])).toEqual([])
    expect(findBrokenRules(rules, [A])).toEqual([{ index: 0, missing: [B] }])
  })
})

describe('policyV2 — shadowing', () => {
  it('flags a rule an earlier identical-scope rule already swallows', () => {
    const rules = [rule({ asset: NATIVE, perTxLimit: ONE }), rule({ asset: NATIVE, perTxLimit: 5n * ONE })]
    expect(analyzeShadowing(rules)).toEqual([{ index: 1, shadowedBy: 0 }])
  })

  it('does not flag a same-scope ALTERNATIVE (the a + b / c pattern)', () => {
    // 001 needs two approvals, 002 needs one — 002 is reachable whenever 001's approvers fall short.
    const rules = [
      rule({ asset: NATIVE, perTxLimit: ONE, approvers: [A, B], approvalsRequired: 2 }),
      rule({ asset: NATIVE, perTxLimit: ONE, approvers: [C], approvalsRequired: 1 }),
    ]
    expect(analyzeShadowing(rules)).toEqual([])
  })

  it('does not flag rules with different scope', () => {
    const rules = [rule({ asset: NATIVE }), rule({ asset: TOKEN })]
    expect(analyzeShadowing(rules)).toEqual([])
  })

  it('compares scope on asset, band and destinations', () => {
    expect(scopeEquals(rule({ asset: NATIVE }), rule({ asset: NATIVE }))).toBe(true)
    expect(scopeEquals(rule({ asset: NATIVE }), rule({ asset: TOKEN }))).toBe(false)
    expect(
      scopeEquals(rule({ perTxLimit: ONE, banded: true }), rule({ perTxLimit: 2n * ONE, banded: true })),
    ).toBe(false)
    expect(scopeEquals(rule({ targets: [DEST] }), rule({ targets: [OTHER] }))).toBe(false)
  })
})

describe('policyV2 — match preview (mirrors on-chain first-match-governs)', () => {
  it('classifies ERC-20 payloads like the guard does', () => {
    const t = classifyPayload({ to: TOKEN, data: erc20.encodeFunctionData('transfer', [DEST, ONE]) })
    expect(t).toMatchObject({ isTokenAction: true, tokenAsset: TOKEN, tokenRecipient: DEST, tokenAmount: ONE })

    const tf = classifyPayload({ to: TOKEN, data: erc20.encodeFunctionData('transferFrom', [A, DEST, 2n * ONE]) })
    expect(tf).toMatchObject({ tokenRecipient: DEST, tokenAmount: 2n * ONE })

    expect(classifyPayload({ to: DEST, data: '0x' }).isTokenAction).toBe(false)
  })

  /*
   * The SHARED scenarios (src/test/fixtures/policyScenarios.js), which the Solidity suite drives
   * against the real guard in test/custody/PolicyScenarioParity.test.js and the full-tier Cypress
   * spec composes in the UI. These cases used to be hand-copied here, so a divergence between the
   * preview and enforcement would have shown up as two green suites disagreeing about what a vault
   * does — which is exactly the drift this twin is supposed to be checked against.
   *
   * The preview reports WHICH rule decides, not whether the transaction passes: a rule that matches
   * and then refuses on its limit is still that rule governing. So `matched` is asserted as
   * "some rule owns this payload" (`ruleIndex !== null`), and the verdict itself is what the
   * contract test and the chain-judged Cypress test assert.
   */
  describe.each(FIRST_MATCH_SCENARIOS)('$id — $summary', (scenario) => {
    const rules = scenario.rules.map((r) =>
      rule({
        asset: r.asset === 'native' ? NATIVE : ANY_ASSET,
        perTxLimit: parseEther(r.perTx ?? '0'),
        banded: r.banded ?? false,
        targets: (r.targets ?? []).map(addressFor),
      }),
    )

    it.each(scenario.attempts)('$amount to $to is decided by rule $ruleIndex', (attempt) => {
      expect(matchPreview(rules, { to: addressFor(attempt.to), value: parseEther(attempt.amount) }))
        .toMatchObject({ matched: attempt.ruleIndex !== null, ruleIndex: attempt.ruleIndex })
    })
  })

  it('routes mixed native+token payloads to any-asset rules only', () => {
    const data = erc20.encodeFunctionData('transfer', [DEST, ONE])
    expect(matchPreview([rule({ asset: NATIVE }), rule({ asset: TOKEN })], { to: TOKEN, value: 5n, data }).matched)
      .toBe(false)
    expect(matchPreview([rule({ asset: NATIVE }), rule({ asset: ANY_ASSET })], { to: TOKEN, value: 5n, data }))
      .toMatchObject({ matched: true, ruleIndex: 1 })
  })

  it('gates destinations by decoded beneficiary and call target', () => {
    const rules = [rule({ targets: [DEST] })]
    expect(matchPreview(rules, { to: TOKEN, data: erc20.encodeFunctionData('transfer', [DEST, ONE]) }).matched).toBe(true)
    expect(matchPreview(rules, { to: TOKEN, data: erc20.encodeFunctionData('transfer', [OTHER, ONE]) }).matched).toBe(false)
    expect(matchPreview(rules, { to: OTHER, data: '0xdeadbeef' }).matched).toBe(false)
  })

  it('falls through to a same-scope alternative when approvers fall short', () => {
    const rules = [
      rule({ asset: NATIVE, perTxLimit: 10n * ONE, approvers: [A, B], approvalsRequired: 2 }),
      rule({ asset: NATIVE, perTxLimit: 10n * ONE, approvers: [C], approvalsRequired: 1 }),
    ]
    // A + B → rule 001
    expect(matchPreview(rules, { to: DEST, value: ONE }, { approvedBy: [A, B] }).ruleIndex).toBe(0)
    // C alone → 001's approvers unmet, same-scope alternative 002 governs
    expect(matchPreview(rules, { to: DEST, value: ONE }, { approvedBy: [C] }).ruleIndex).toBe(1)
    // A alone → neither; the FIRST failure is reported
    const res = matchPreview(rules, { to: DEST, value: ONE }, { approvedBy: [A] })
    expect(res.approverFailure).toMatchObject({ index: 0, have: 1, need: 2 })
  })

  it('does not fall through across differing scope', () => {
    const rules = [
      rule({ asset: NATIVE, approvers: [A, B], approvalsRequired: 2 }),
      rule({ asset: NATIVE, targets: [DEST], approvers: [C], approvalsRequired: 1 }),
    ]
    const res = matchPreview(rules, { to: DEST, value: ONE }, { approvedBy: [C] })
    expect(res.approverFailure).toMatchObject({ index: 0 })
  })
})

describe('policyV2 — encoding and transactions', () => {
  it('encodes setRules so the contract ABI decodes it back unchanged', () => {
    const rules = validateRulesConfig(
      [rule({ asset: NATIVE, perTxLimit: ONE, approvers: [A, B], targets: [DEST] })],
      3600,
    )
    const data = encodeSetRules(rules, 3600)
    const decoded = new Interface(SAFE_POLICY_GUARD_V2_ABI).decodeFunctionData('setRules', data)
    expect(decoded[0][0][0]).toBe(NATIVE)
    expect(decoded[0][0][1]).toBe(ONE)
    expect(decoded[0][0][3]).toBe(2n) // approvalsRequired normalized to "all"
    expect([...decoded[0][0][5]]).toEqual([A, B])
    expect([...decoded[0][0][6]]).toEqual([DEST])
    expect(decoded[1]).toBe(3600n)
  })

  it('targets the guard for rule changes and the vault for guard activation', () => {
    const engine = getPolicyEngineV2Addresses(CHAIN)
    const vault = getAddress('0x6666666666666666666666666666666666666666')
    const change = buildRulesChangeTx(CHAIN, validateRulesConfig([rule({ asset: NATIVE })], 0), 0)
    expect(change.to).toBe(engine.guard)

    const setGuard = buildSetGuardV2Tx(vault, CHAIN)
    expect(setGuard.to).toBe(vault)
    expect(setGuard.data.slice(0, 10)).toBe('0xe19a9dd9') // setGuard(address)
    expect(setGuard.data.toLowerCase()).toContain(engine.guard.slice(2).toLowerCase())
  })

  it('orders the adopt flow rules-first so the policy is live the moment the guard is', () => {
    const vault = getAddress('0x6666666666666666666666666666666666666666')
    const [first, second] = buildAdoptV2Txs(vault, CHAIN, validateRulesConfig([rule({ asset: NATIVE })], 0), 0)
    expect(first.to).toBe(getPolicyEngineV2Addresses(CHAIN).guard)
    expect(second.to).toBe(vault)
  })

  it('refuses to build changes on a chain without the engine', () => {
    expect(() => buildRulesChangeTx(1, [], 0)).toThrow(/not available on this network/i)
  })
})

describe('policyV2 — proposal classification', () => {
  const vault = getAddress('0x6666666666666666666666666666666666666666')

  it('decodes a setRules proposal into rules', () => {
    const rules = validateRulesConfig([rule({ asset: NATIVE, perTxLimit: ONE, approvers: [A] })], 0)
    const tx = buildRulesChangeTx(CHAIN, rules, 0)
    const classified = classifyPolicyProposalV2({ to: tx.to, data: tx.data }, CHAIN, vault)
    expect(classified.kind).toBe('set-rules')
    expect(classified.rules[0]).toMatchObject({ asset: NATIVE, perTxLimit: ONE, approvers: [A] })
  })

  it('recognizes adoption and detachment', () => {
    const adopt = buildSetGuardV2Tx(vault, CHAIN)
    expect(classifyPolicyProposalV2({ to: adopt.to, data: adopt.data }, CHAIN, vault).kind).toBe('adopt-v2')
    const detach = buildSetGuardV2Tx(vault, CHAIN, { detach: true })
    expect(classifyPolicyProposalV2({ to: detach.to, data: detach.data }, CHAIN, vault).kind).toBe('remove-guard')
  })

  it('ignores unrelated proposals without throwing', () => {
    expect(classifyPolicyProposalV2({ to: DEST, data: '0xdeadbeef' }, CHAIN, vault)).toBeNull()
    expect(classifyPolicyProposalV2(null, CHAIN, vault)).toBeNull()
  })
})

describe('policyV2 — error decoding', () => {
  const iface = new Interface(SAFE_POLICY_GUARD_V2_ABI)

  it('names the display rule number for every rule-scoped error (SC-003)', () => {
    const approvers = decodePolicyErrorV2(iface.encodeErrorResult('RuleApproversMissing', [0, 1, 2]))
    expect(approvers).toMatchObject({ rule: 0, code: 'approvers' })
    expect(approvers.message).toContain('Rule 001')

    const perTx = decodePolicyErrorV2(iface.encodeErrorResult('RulePerTxExceeded', [1, NATIVE, ONE, 1n]))
    expect(perTx.message).toContain('Rule 002')

    const window = decodePolicyErrorV2(iface.encodeErrorResult('RuleWindowExceeded', [2, NATIVE, ONE, 1n]))
    expect(window.message).toContain('Rule 003')
  })

  it('explains a no-match denial in plain language', () => {
    const res = decodePolicyErrorV2(iface.encodeErrorResult('NoRuleMatches', []))
    expect(res.code).toBe('no-rule')
    expect(res.message).toMatch(/no rule/i)
  })

  it('returns null for data it does not recognize', () => {
    expect(decodePolicyErrorV2('0x')).toBeNull()
    expect(decodePolicyErrorV2('0xdeadbeef')).toBeNull()
    expect(decodePolicyErrorV2(null)).toBeNull()
  })
})

describe('policyV2 — description and v1 migration', () => {
  it('numbers rules from 001 and describes them in plain language', () => {
    expect(ruleNumber(0)).toBe('001')
    expect(ruleNumber(11)).toBe('012')

    const rules = validateRulesConfig(
      [rule({ asset: NATIVE, perTxLimit: ONE, approvers: [A, B] }), rule({ asset: NATIVE, perTxLimit: ONE, approvers: [C] })],
      3600,
    )
    const lines = describeRulesV2(rules, 3600, { names: { [A]: 'Alice', [B]: 'Bob', [C]: 'Charlie' } })
    expect(lines[0].number).toBe('001')
    expect(lines[0].text).toContain('Alice and Bob must all approve')
    expect(lines[1].text).toContain('Charlie')
    expect(lines[2].text).toMatch(/1 hour/)
  })

  it('describes K-of-N sets as "any N of"', () => {
    const rules = validateRulesConfig([rule({ asset: NATIVE, perTxLimit: ONE, approvers: [A, B], approvalsRequired: 1 })], 0)
    expect(describeRulesV2(rules, 0, { names: { [A]: 'Alice', [B]: 'Bob' } })[0].text).toContain('any 1 of Alice, Bob')
  })

  it('maps a v1 policy into an equivalent ordered rule set (FR-020)', () => {
    const v1 = {
      cooldown: 3600,
      allowlistEnabled: true,
      allowlist: [DEST],
      assetRules: [{ asset: NATIVE, perTxLimit: ONE, windowLimit: 2n * ONE }],
    }
    const { rules, cooldown } = fromV1Policy(v1)
    expect(cooldown).toBe(3600)
    expect(rules).toHaveLength(1)
    expect(rules[0]).toMatchObject({ asset: NATIVE, perTxLimit: ONE, windowLimit: 2n * ONE, targets: [DEST] })
    // The mapped set must survive validation unchanged.
    expect(() => validateRulesConfig(rules, cooldown)).not.toThrow()
  })

  it('gives an allowlist-only v1 policy a catch-all rule so V2 does not deny everything', () => {
    const { rules } = fromV1Policy({ cooldown: 0, allowlistEnabled: true, allowlist: [DEST], assetRules: [] })
    expect(rules).toHaveLength(1)
    expect(rules[0]).toMatchObject({ asset: ANY_ASSET, targets: [DEST] })
  })
})
