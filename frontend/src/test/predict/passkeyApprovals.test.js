/**
 * passkeyApprovals (spec 057, FR-019) — first-trade settlement approvals for passkey makers: reads
 * current allowances and returns ONLY the missing sendCalls-shaped approvals; an approved account
 * returns [] (no ceremony). Spender set derives from the SDK's own contract config.
 */
import { describe, it, expect } from 'vitest'
import { AbiCoder, Interface, MaxUint256 } from 'ethers'
import { missingPredictApprovals, predictSpenders } from '../../lib/predict/passkeyApprovals'

const ACCOUNT = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
const abi = AbiCoder.defaultAbiCoder()
const ERC20 = new Interface([
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
])
const CTF = new Interface([
  'function isApprovedForAll(address,address) view returns (bool)',
  'function setApprovalForAll(address,bool)',
])
const ALLOWANCE_SEL = ERC20.getFunction('allowance').selector
const APPROVED_ALL_SEL = CTF.getFunction('isApprovedForAll').selector

/** A read provider stub: answers allowance/isApprovedForAll from the given maps. */
function fakeProvider({ allowances = {}, operators = {} } = {}) {
  return {
    async call(tx) {
      const sel = tx.data.slice(0, 10)
      if (sel === ALLOWANCE_SEL) {
        const [, spender] = ERC20.decodeFunctionData('allowance', tx.data)
        return abi.encode(['uint256'], [allowances[spender] ?? 0n])
      }
      if (sel === APPROVED_ALL_SEL) {
        const [, operator] = CTF.decodeFunctionData('isApprovedForAll', tx.data)
        return abi.encode(['bool'], [Boolean(operators[operator])])
      }
      throw new Error(`unexpected call ${sel}`)
    },
  }
}

describe('predictSpenders', () => {
  it('derives the three settlement spenders from the SDK config', () => {
    const { collateral, conditionalTokens, spenders } = predictSpenders(137)
    expect(collateral).toBe('0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174')
    expect(conditionalTokens).toBe('0x4D97DCd97eC945f40cF65F87097ACe5EA0476045')
    expect(spenders).toHaveLength(3)
  })
})

describe('missingPredictApprovals', () => {
  it('a fresh account needs all six approvals (3 USDC + 3 CTF), shaped for sendCalls', async () => {
    const calls = await missingPredictApprovals({ address: ACCOUNT, chainId: 137, provider: fakeProvider() })
    expect(calls).toHaveLength(6)
    const { collateral, conditionalTokens, spenders } = predictSpenders(137)
    for (const spender of spenders) {
      expect(calls).toContainEqual(
        expect.objectContaining({ target: collateral, data: ERC20.encodeFunctionData('approve', [spender, MaxUint256]) })
      )
      expect(calls).toContainEqual(
        expect.objectContaining({ target: conditionalTokens, data: CTF.encodeFunctionData('setApprovalForAll', [spender, true]) })
      )
    }
  })

  it('a fully approved account needs nothing — no ceremony on repeat trades', async () => {
    const { spenders } = predictSpenders(137)
    const provider = fakeProvider({
      allowances: Object.fromEntries(spenders.map((s) => [s, MaxUint256])),
      operators: Object.fromEntries(spenders.map((s) => [s, true])),
    })
    await expect(missingPredictApprovals({ address: ACCOUNT, chainId: 137, provider })).resolves.toEqual([])
  })

  it('a small stale allowance is re-approved (below the unlimited floor)', async () => {
    const { spenders } = predictSpenders(137)
    const provider = fakeProvider({
      allowances: { [spenders[0]]: 1_000_000n, [spenders[1]]: MaxUint256, [spenders[2]]: MaxUint256 },
      operators: Object.fromEntries(spenders.map((s) => [s, true])),
    })
    const calls = await missingPredictApprovals({ address: ACCOUNT, chainId: 137, provider })
    expect(calls).toHaveLength(1)
    expect(calls[0].data).toBe(ERC20.encodeFunctionData('approve', [spenders[0], MaxUint256]))
  })
})
