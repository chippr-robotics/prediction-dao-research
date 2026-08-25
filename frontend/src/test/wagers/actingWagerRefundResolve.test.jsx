/**
 * claimRefund (list row) and resolve (declareWinner) and the account switcher (spec 088 FR-002).
 *
 * Both `MyMarketsModal.handleClaimRefund` and `ResolutionModal.handleSubmit` branched on the vault
 * identity only, so a member acting as a recovered or hardware account signed with the CONNECTED
 * wallet while the switcher showed another account. Resolution additionally checks `actor` against
 * the wager's creator/opponent/arbitrator on-chain, so a misattributed signature there reverts
 * NotAuthorized — the same class of bug the claim path already had (spec 088 FR-002) — and refund
 * is routed the same way for the same reason: never silently sign as the connected wallet under an
 * acting label, whatever the contract's own authorization shape turns out to be.
 *
 * Both are SINGLE calls, so the assertion is about the seam rather than a batch: each goes to
 * `submitAsActive` as `{ to: registry, data: <fn>(...) }`, and neither the relayed intent nor the
 * passkey UserOp — the two connected-wallet rails — is touched.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const CONNECTED = '0x1111111111111111111111111111111111111111'
const ACTING = '0x2222222222222222222222222222222222222222'
const OPPONENT = '0x3333333333333333333333333333333333333333'
const REGISTRY = '0x4444444444444444444444444444444444444444'

// ---- the acting identity, driven per test -------------------------------------------
let activeAccount
const submitAsActive = vi.fn(async () => ({ kind: 'sent', txHash: '0xACTING' }))
const personal = () => ({
  identity: { mode: 'personal' },
  isVault: false, isLegacy: false, isHardware: false,
  canActAsVault: false, canActAsLegacy: false, canActAsHardware: false,
  submit: submitAsActive,
})
const actingAs = (mode) => ({
  identity: { mode, address: ACTING, label: 'Acting account' },
  isVault: false,
  isLegacy: mode === 'legacy',
  isHardware: mode === 'hardware',
  canActAsVault: false, canActAsLegacy: mode === 'legacy', canActAsHardware: mode === 'hardware',
  submit: submitAsActive,
})
vi.mock('../../hooks/useActiveAccount', () => ({
  useActiveAccount: () => activeAccount,
  default: () => activeAccount,
}))

// ---- the connected wallet's own rails, each a spy the tests assert was never used --------
const sendCalls = vi.fn(async () => ({ txHash: '0xUSEROP' }))
const gaslessRun = vi.fn(async () => ({ txHash: '0xRELAYED' }))
vi.mock('../../lib/relay/useGaslessWrite', () => ({
  useGaslessWrite: () => ({ run: (...a) => gaslessRun(...a), status: 'idle' }),
}))

// ---- ethers: real everywhere except the Contract factory — only the resolve path's
// `getWager` read and the `interface.encodeFunctionData` calls touch it. -----------------
const getWagerRead = vi.fn(async () => ({ creator: CONNECTED, opponent: OPPONENT }))
function makeContract(address, _abi, runner) {
  const iface = {
    encodeFunctionData: (fn, args) =>
      `0xENC:${fn}:${JSON.stringify(args, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}`,
  }
  return {
    interface: iface,
    runner,
    address,
    getWager: (...a) => getWagerRead(...a),
    declareWinner: vi.fn(async () => ({ hash: '0xSIGNER-WRITE', wait: async () => ({ status: 1, logs: [] }) })),
    declareDraw: vi.fn(async () => ({ hash: '0xSIGNER-DRAW', wait: async () => ({ status: 1, logs: [] }) })),
    claimRefund: vi.fn(async () => ({ hash: '0xSIGNER-REFUND', wait: async () => ({ hash: '0xSIGNER-REFUND' }) })),
  }
}
vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal()
  const Contract = function (address, abi, runner) { return makeContract(address, abi, runner) }
  return { ...actual, Contract, ethers: { ...actual.ethers, Contract } }
})

vi.mock('../../hooks', () => ({
  useWallet: () => ({ isConnected: true, account: CONNECTED, address: CONNECTED, chainId: 137 }),
  useWeb3: () => ({
    signer: { id: 'connected-signer' },
    isCorrectNetwork: true,
    switchNetwork: vi.fn(),
    sendCalls,
    loginMethod: 'injected',
    chainId: 137,
    provider: { id: 'connected-provider' },
  }),
}))

// ---- data hooks the modal mounts, reduced to the empty/no-op shapes ------------------
const refreshFriendMarkets = vi.fn()
vi.mock('../../contexts/FriendMarketsContext.js', () => ({
  useFriendMarkets: () => ({
    dismissedIds: new Set(),
    dismissMarket: vi.fn(),
    dismissMarkets: vi.fn(),
    refresh: refreshFriendMarkets,
  }),
}))
vi.mock('../../hooks/useIpfs', () => ({ useLazyIpfsEnvelope: (m) => ({ markets: m, fetchEnvelope: vi.fn() }) }))
vi.mock('../../hooks/useEncryption', () => ({
  useLazyMarketDecryption: (m) => ({
    markets: m,
    decryptMarket: vi.fn(),
    setDecryptedMetadata: vi.fn(),
    isMarketDecrypting: () => false,
  }),
  useEncryption: () => ({ canUserDecrypt: () => false, isInitialized: false, isInitializing: false, initializeKeys: vi.fn(), decryptMetadata: vi.fn() }),
}))
vi.mock('../../hooks/useWagerActivity', () => ({ useWagerActivityOptional: () => ({ markWagerRead: vi.fn() }) }))
vi.mock('../../hooks/useOpenChallengeCodeVault', () => ({
  useOpenChallengeCodeVault: () => ({ canUse: false, hasBackup: false, recoverCodes: vi.fn(), saveCode: vi.fn() }),
}))
vi.mock('../../hooks/useOpponentName', () => ({ useOpponentName: () => ({ displayName: null }) }))
vi.mock('../../data/notifications/drawProposalScan', () => ({ fetchDrawProposals: async () => [] }))
vi.mock('../../config/contracts', () => ({
  getContractAddress: () => REGISTRY,
  getContractAddressForChain: () => REGISTRY,
}))
vi.mock('../../utils/feeOverrides', () => ({ getFeeOverrides: async () => ({}) }))

// ---- children, stubbed to the one control under test --------------------------------
vi.mock('../../components/fairwins/WagerTable', () => ({
  default: ({ markets = [], onClaim, onRefund, onResolve }) => (
    <div>
      {markets.map((m) => (
        <div key={m.id}>
          {onClaim && <button onClick={() => onClaim(m)}>{`claim-${m.id}`}</button>}
          {onRefund && <button onClick={() => onRefund(m)}>{`refund-${m.id}`}</button>}
          {onResolve && <button onClick={() => onResolve(m)}>{`resolve-${m.id}`}</button>}
        </div>
      ))}
    </div>
  ),
}))
vi.mock('../../components/fairwins/MyPoolsSection', () => ({ default: () => null }))
vi.mock('../../components/fairwins/MarketAcceptanceModal', () => ({ default: () => null }))
vi.mock('../../components/fairwins/OpenChallengeDecryptModal', () => ({ default: () => null }))
vi.mock('../../components/fairwins/ResolveButtonWithCountdown', () => ({ default: () => null }))
vi.mock('../../components/fairwins/OpponentName', () => ({ default: () => null }))

import MyMarketsModal from '../../components/fairwins/MyMarketsModal'

beforeEach(() => {
  activeAccount = personal()
  submitAsActive.mockClear()
  sendCalls.mockClear()
  gaslessRun.mockClear()
  getWagerRead.mockClear()
  refreshFriendMarkets.mockClear()
})

// =====================================================================================
describe('claimRefund (list row) while acting as a recovered / hardware account (spec 088 FR-002)', () => {
  // Participant, past its resolve window — the "Refund" affordance's refundable case.
  const market = {
    id: 'w-refund',
    wagerId: '11',
    chainId: 137,
    creator: OPPONENT,
    opponent: CONNECTED,
    participants: [OPPONENT, CONNECTED],
    status: 'active',
    endDate: new Date(Date.now() - 3_600_000).toISOString(),
    acceptanceDeadline: Date.now() - 7_200_000,
    stakeTokenSymbol: 'USDC',
    description: 'A wager past its resolve window',
  }

  const refund = async () => {
    const user = userEvent.setup()
    render(<MyMarketsModal isOpen onClose={vi.fn()} friendMarkets={[market]} />)
    await user.click(await screen.findByRole('button', { name: 'refund-w-refund' }))
  }

  it.each(['legacy', 'hardware'])('reclaims through the acting seam, addressed to the registry (%s)', async (mode) => {
    activeAccount = actingAs(mode)
    await refund()

    await waitFor(() => expect(submitAsActive).toHaveBeenCalledTimes(1))
    const [payload] = submitAsActive.mock.calls[0]
    expect(payload.to).toBe(REGISTRY)
    expect(payload.batch).toBeUndefined() // a refund is one call, not a batch
    expect(payload.data).toMatch(/^0x/)
  })

  it.each(['legacy', 'hardware'])('never reclaims on the connected wallet’s rails (%s)', async (mode) => {
    activeAccount = actingAs(mode)
    await refund()

    await waitFor(() => expect(submitAsActive).toHaveBeenCalled())
    expect(gaslessRun).not.toHaveBeenCalled()
    expect(sendCalls).not.toHaveBeenCalled()
  })

  it('leaves the personal member on the gasless rail, unchanged', async () => {
    activeAccount = personal()
    await refund()

    await waitFor(() => expect(gaslessRun).toHaveBeenCalledTimes(1))
    expect(submitAsActive).not.toHaveBeenCalled()
  })
})

// =====================================================================================
describe('resolve (declareWinner) while acting as a recovered / hardware account (spec 088 FR-002)', () => {
  const market = {
    id: 'w-resolve',
    wagerId: '12',
    chainId: 137,
    creator: CONNECTED,
    opponent: OPPONENT,
    participants: [CONNECTED, OPPONENT],
    resolutionType: 0, // Either
    status: 'active',
    endDate: new Date(Date.now() + 86_400_000).toISOString(),
    acceptanceDeadline: Date.now() - 3_600_000,
    stakeTokenSymbol: 'USDC',
    description: 'A wager ready to resolve',
  }

  const openResolutionAndConfirm = async () => {
    const user = userEvent.setup()
    render(<MyMarketsModal isOpen onClose={vi.fn()} friendMarkets={[market]} />)
    await user.click(await screen.findByRole('tab', { name: /Created/i }))
    await user.click(await screen.findByRole('button', { name: 'resolve-w-resolve' }))
    await user.click(await screen.findByRole('button', { name: /Creator wins/i }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: /Confirm Resolution/i }))
  }

  it.each(['legacy', 'hardware'])('resolves through the acting seam, addressed to the registry (%s)', async (mode) => {
    activeAccount = actingAs(mode)
    await openResolutionAndConfirm()

    await waitFor(() => expect(submitAsActive).toHaveBeenCalledTimes(1))
    const [payload] = submitAsActive.mock.calls[0]
    expect(payload.to).toBe(REGISTRY)
    expect(payload.batch).toBeUndefined() // a resolution is one call, not a batch
    expect(payload.data).toMatch(/^0x/)
  })

  it.each(['legacy', 'hardware'])('never resolves on the connected wallet’s rails (%s)', async (mode) => {
    activeAccount = actingAs(mode)
    await openResolutionAndConfirm()

    await waitFor(() => expect(submitAsActive).toHaveBeenCalled())
    expect(gaslessRun).not.toHaveBeenCalled()
    expect(sendCalls).not.toHaveBeenCalled()
  })

  it('leaves the personal member on the gasless rail, unchanged', async () => {
    activeAccount = personal()
    await openResolutionAndConfirm()

    await waitFor(() => expect(gaslessRun).toHaveBeenCalledTimes(1))
    expect(submitAsActive).not.toHaveBeenCalled()
  })
})
