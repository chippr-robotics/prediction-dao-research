import { describe, it, expect } from 'vitest'
import { ethers } from 'ethers'
import {
  ACTION_TYPE,
  newAction,
  buildDescription,
  descriptionHash,
  encodeAction,
  assemble,
  predictProposalId,
} from '../proposalEncoding'

// Spec 030 (FR-023/FR-025) — proposal encoding correctness: the riskiest part of the builder (a mis-encoded
// action executes the wrong thing). Pure unit tests.

const USDC = '0x00000000000000000000000000000000000000dc'
const TO = '0x00000000000000000000000000000000000000a1'
const usdcMeta = (addr) => (addr.toLowerCase() === USDC ? { decimals: 6, symbol: 'USDC' } : null)
const TRANSFER = new ethers.Interface(['function transfer(address to, uint256 amount)'])

describe('proposalEncoding', () => {
  it('builds the description string and a matching keccak hash', () => {
    expect(buildDescription('Title', 'Body')).toBe('# Title\n\nBody')
    expect(buildDescription('Title', '')).toBe('# Title')
    expect(buildDescription('', 'Body')).toBe('Body')
    const d = '# Title\n\nBody'
    expect(descriptionHash(d)).toBe(ethers.id(d))
  })

  it('encodes a native send (value + empty calldata)', () => {
    const a = { ...newAction(ACTION_TYPE.NATIVE), nativeTo: TO, nativeAmount: '1.5' }
    const enc = encodeAction(a, { usdcAddress: USDC, meta: usdcMeta })
    expect(enc.target).toBe(TO)
    expect(enc.value).toBe(ethers.parseEther('1.5'))
    expect(enc.calldata).toBe('0x')
  })

  it('encodes an ERC-20 transfer with value 0 and decimals-scaled amount', () => {
    const a = { ...newAction(ACTION_TYPE.TOKEN), tokenAddress: '', tokenTo: TO, tokenAmount: '100' }
    const enc = encodeAction(a, { usdcAddress: USDC, meta: usdcMeta })
    expect(enc.target).toBe(USDC) // default token = USDC
    expect(enc.value).toBe(0n) // INVARIANT: no native value on a token transfer
    const [to, amount] = TRANSFER.decodeFunctionData('transfer', enc.calldata)
    expect(to.toLowerCase()).toBe(TO) // decodeFunctionData returns a checksummed address
    expect(amount).toBe(ethers.parseUnits('100', 6)) // 6-decimals, not 18
  })

  it('marks a token action pending while its decimals are unknown', () => {
    const a = { ...newAction(ACTION_TYPE.TOKEN), tokenMode: 'other', tokenAddress: '0x00000000000000000000000000000000000000ee', tokenTo: TO, tokenAmount: '5' }
    expect(() => encodeAction(a, { usdcAddress: USDC, meta: () => null })).toThrowError(/decimals/i)
    try { encodeAction(a, { usdcAddress: USDC, meta: () => null }) } catch (e) { expect(e.pending).toBe(true) }
  })

  it('validates a custom call and rejects malformed hex', () => {
    const ok = { ...newAction(ACTION_TYPE.CUSTOM), customTarget: TO, customValue: '0', customCalldata: '0xabcd' }
    expect(encodeAction(ok, { usdcAddress: USDC, meta: usdcMeta }).calldata).toBe('0xabcd')
    const bad = { ...ok, customCalldata: '0xabc' } // odd length
    expect(() => encodeAction(bad, { usdcAddress: USDC, meta: usdcMeta })).toThrowError(/hex/i)
  })

  it('rejects invalid addresses', () => {
    const a = { ...newAction(ACTION_TYPE.NATIVE), nativeTo: 'nope', nativeAmount: '1' }
    expect(() => encodeAction(a, { usdcAddress: USDC, meta: usdcMeta })).toThrowError(/address/i)
  })

  it('assembles a multi-action proposal with equal-length arrays', () => {
    const actions = [
      { ...newAction(ACTION_TYPE.NATIVE), nativeTo: TO, nativeAmount: '1' },
      { ...newAction(ACTION_TYPE.TOKEN), tokenTo: TO, tokenAmount: '50' },
    ]
    const A = assemble({ title: 'Two payouts', body: '', actions, usdcAddress: USDC, meta: usdcMeta })
    expect(A.ok).toBe(true)
    expect(A.targets).toHaveLength(2)
    expect(A.values).toHaveLength(2)
    expect(A.calldatas).toHaveLength(2)
    expect(A.targets.length === A.values.length && A.values.length === A.calldatas.length).toBe(true)
    expect(A.descriptionHash).toBe(ethers.id('# Two payouts'))
  })

  it('blocks empty description or zero actions', () => {
    expect(assemble({ title: '', body: '', actions: [{ ...newAction(ACTION_TYPE.NATIVE), nativeTo: TO, nativeAmount: '1' }], usdcAddress: USDC, meta: usdcMeta }).ok).toBe(false)
    expect(assemble({ title: 'X', body: '', actions: [], usdcAddress: USDC, meta: usdcMeta }).ok).toBe(false)
  })

  it('predicts a stable proposalId that changes with the description', () => {
    const t = [TO]; const v = [0n]; const c = ['0x']
    const id1 = predictProposalId(t, v, c, ethers.id('# A'))
    const id2 = predictProposalId(t, v, c, ethers.id('# A'))
    const id3 = predictProposalId(t, v, c, ethers.id('# B'))
    expect(id1).toBe(id2)
    expect(id1).not.toBe(id3)
  })
})
