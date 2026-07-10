// Spec 043 (US6 / spec 031) — custodySource snapshot-diff: baseline on first sight, "approval-needed"
// (actionable) when a pending proposal newly needs the member, "executed" and "governance-changed" on diff,
// and a no-op until the hub is configured. The chain reads (readVaultProposalState) are mocked — the source's
// diff logic is the unit under test.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const H1 = '0x' + '11'.repeat(32)
const OWNER = '0x00000000000000000000000000000000000000a1'
const VAULT = '0x1111111111111111111111111111111111111111'

const readState = vi.fn()
const refs = vi.fn()
const policyCount = vi.fn()

vi.mock('../../utils/blockchainService', () => ({ getProvider: () => ({}) }))
vi.mock('../../config/safeContracts', () => ({ getSafeContracts: () => ({ multiSendCallOnly: VAULT }) }))
vi.mock('../../config/contracts', () => ({
  getContractAddressForChain: () => '0x000000000000000000000000000000000000abcd',
  getDeploymentBlockForChain: () => 100,
}))
vi.mock('../../lib/custody/vaultReferences', () => ({ loadVaultReferences: (...a) => refs(...a) }))
vi.mock('../../lib/custody/vaultProposalReads', () => ({ readVaultProposalState: (...a) => readState(...a) }))
vi.mock('../../lib/custody/policyEvents', () => ({ readPolicyEventCount: (...a) => policyCount(...a) }))

import { custodySource } from '../../data/notifications/sources/custodySource'

const NOW = 1_700_000_000_000
const base = { owners: [OWNER], threshold: 1, nonce: 5, proposals: [] }
const pendingNeedingMe = {
  ...base,
  proposals: [{ safeTxHash: H1, status: 'pending', approvers: [], nonce: 5 }],
}

beforeEach(() => {
  refs.mockReturnValue([{ chainId: 63, address: VAULT, label: 'Coop', role: 'owner' }])
  readState.mockReset()
  policyCount.mockReset()
  policyCount.mockResolvedValue(0)
})

const sid = `custody:${VAULT}`

describe('custodySource', () => {
  it('is a no-op with no vaults', async () => {
    refs.mockReturnValue([])
    const out = await custodySource.detect({ account: OWNER, chainId: 63, nowMs: NOW, prior: {} })
    expect(out.entries).toEqual([])
    expect(out.currentIds).toEqual([])
  })

  it('sets a baseline on first sight without emitting', async () => {
    readState.mockResolvedValue(pendingNeedingMe)
    const out = await custodySource.detect({ account: OWNER, chainId: 63, nowMs: NOW, prior: {} })
    expect(out.entries).toEqual([]) // first sight = baseline
    expect(out.nextSnapshots[sid].needMe).toEqual([H1.toLowerCase()])
    expect(out.actionNeededById[sid]).toBe('approve') // still flags action-needed for the badge
  })

  it('emits approval-needed when a new pending proposal needs the member', async () => {
    readState.mockResolvedValue(pendingNeedingMe)
    const prior = { snapshots: { [sid]: { needMe: [], executedCount: 0, govKey: '1:1' } } }
    const out = await custodySource.detect({ account: OWNER, chainId: 63, nowMs: NOW, prior })
    const e = out.entries.find((x) => x.type === 'approval-needed')
    expect(e).toBeTruthy()
    expect(e.actionable).toBe(true)
    expect(e.link).toEqual({ to: '/wallet', state: { tab: 'custody', vault: VAULT } })
  })

  it('emits executed and governance-changed on diff', async () => {
    readState.mockResolvedValue({
      owners: [OWNER, '0x00000000000000000000000000000000000000b2'],
      threshold: 2,
      nonce: 6,
      proposals: [{ safeTxHash: H1, status: 'executed', approvers: [OWNER], nonce: 5 }],
    })
    const prior = { snapshots: { [sid]: { needMe: [], executedCount: 0, govKey: '1:1' } } }
    const out = await custodySource.detect({ account: OWNER, chainId: 63, nowMs: NOW, prior })
    expect(out.entries.map((e) => e.type).sort()).toEqual(['executed', 'governance-changed'])
  })

  it('degrades to ok:false when the only vault read fails', async () => {
    readState.mockRejectedValue(new Error('rpc down'))
    const out = await custodySource.detect({ account: OWNER, chainId: 63, nowMs: NOW, prior: {} })
    expect(out.ok).toBe(false)
  })

  // Spec 049 (FR-016) — guard rule events join the same snapshot-diff.
  it('baselines the policy event count on first sight without emitting', async () => {
    readState.mockResolvedValue(base)
    policyCount.mockResolvedValue(3)
    const out = await custodySource.detect({ account: OWNER, chainId: 63, nowMs: NOW, prior: {} })
    expect(out.entries).toEqual([])
    expect(out.nextSnapshots[sid].policyEventCount).toBe(3)
  })

  it('emits policy-changed when new guard events appear for a member vault', async () => {
    readState.mockResolvedValue(base)
    policyCount.mockResolvedValue(4)
    const prior = { snapshots: { [sid]: { needMe: [], executedCount: 0, govKey: '1:1', policyEventCount: 2 } } }
    const out = await custodySource.detect({ account: OWNER, chainId: 63, nowMs: NOW, prior })
    const e = out.entries.find((x) => x.type === 'policy-changed')
    expect(e).toBeTruthy()
    expect(e.domain).toBe('custody')
    expect(e.message).toMatch(/policy rules on “Coop” changed/i)
    expect(out.nextSnapshots[sid].policyEventCount).toBe(4)
  })

  it('keeps the prior policy baseline when the guard read fails (no false diff later)', async () => {
    readState.mockResolvedValue(base)
    policyCount.mockRejectedValue(new Error('rpc down'))
    const prior = { snapshots: { [sid]: { needMe: [], executedCount: 0, govKey: '1:1', policyEventCount: 2 } } }
    const out = await custodySource.detect({ account: OWNER, chainId: 63, nowMs: NOW, prior })
    expect(out.entries.find((x) => x.type === 'policy-changed')).toBeFalsy()
    expect(out.nextSnapshots[sid].policyEventCount).toBe(2)
  })
})
