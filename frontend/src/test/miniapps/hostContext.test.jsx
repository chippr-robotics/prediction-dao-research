/**
 * Spec 073 T022 — the host context handed to a mounted mini-app
 * (`specs/073-miniapp-platform/contracts/host-context.md`).
 *
 * The tests that matter here are the ones about what the object DOESN'T do: it
 * exposes seven keys and nothing else (FR-013), it cannot be re-pointed, it
 * refuses to move value on the wrong chain or with no wallet instead of quietly
 * doing nothing, it drops the `batch`/`operation` fields that would turn a vault
 * proposal into a DELEGATECALL, and it will not carry the member out of the host.
 * Shape assertions are here to pin the contract; the refusals are the point.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'

import {
  MiniAppHostProvider,
  useMiniAppHost,
  MiniAppHostError,
  HOST_REFUSAL,
  STATE_AUDIT_WINDOW_MS,
} from '../../lib/miniapps/hostContext'
import { appStoreStorageKey, __resetMiniAppStores } from '../../lib/miniapps/store'

const ACCOUNT = '0xAbCd000000000000000000000000000000000073'
const VAULT = '0x1111111111111111111111111111111111111111'
const TARGET = '0x2222222222222222222222222222222222222222'
const APP_ID = 'demo-app'
const CHAIN = 137

// Mutable doubles for every seam the host wraps. `vi.hoisted` so the mock
// factories below (which run before this file's top-level statements) can reach
// them without a temporal-dead-zone error.
const state = vi.hoisted(() => ({
  wallet: {},
  effective: {},
  active: {},
  navigate: null,
  showNotification: null,
  provider: null,
  getReadProvider: null,
  captureTx: null,
  captureLog: null,
  captureState: null,
  screenOne: null,
}))

vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }))
vi.mock('../../hooks/useWalletManagement', () => ({ useWallet: () => state.wallet }))
vi.mock('../../hooks/useEffectiveAccount', () => ({ useEffectiveAccount: () => state.effective }))
vi.mock('../../hooks/useActiveAccount', () => ({ useActiveAccount: () => state.active }))
vi.mock('../../hooks/useUI', () => ({
  useNotification: () => ({ showNotification: state.showNotification }),
}))
vi.mock('../../utils/rpcProvider', () => ({ getReadProvider: (chainId) => state.getReadProvider(chainId) }))
// STABLE identity, like the real hook's `useCallback`. A fresh arrow per render would churn the
// host object on every render and defeat the memoization the contract promises.
const screeningApi = { screenOne: (...args) => state.screenOne(...args) }
vi.mock('../../hooks/useAddressScreening', () => ({ useAddressScreening: () => screeningApi }))
vi.mock('../../data/ledger/sources/miniAppSource', () => ({
  captureMiniAppTxSubmitted: (...args) => state.captureTx(...args),
  captureMiniAppLog: (...args) => state.captureLog(...args),
  captureMiniAppStateChange: (...args) => state.captureState(...args),
}))

/** A stand-in for the host's cached ethers provider, self-reference included. */
function fakeProvider() {
  const provider = {
    call: vi.fn(async () => '0x'),
    destroy: vi.fn(),
    removeAllListeners: vi.fn(),
    pollingInterval: 4000,
  }
  // `AbstractProvider` exposes a self-returning `provider` getter; the guard has
  // to hand back the wrapper there or it is trivially escaped.
  provider.provider = provider
  return provider
}

/** Mount the provider and capture the host object the app would receive. */
function mountHost(appId = APP_ID) {
  const ref = { current: null }
  function Probe() {
    ref.current = useMiniAppHost()
    return null
  }
  const view = render(
    <MiniAppHostProvider appId={appId}>
      <Probe />
    </MiniAppHostProvider>,
  )
  return { ref, view }
}

beforeEach(() => {
  localStorage.clear()
  __resetMiniAppStores()
  vi.clearAllMocks()
  // A CLASSIC wallet session: it has a signer, which is what makes the
  // `submitAsActive` rail usable. A passkey session (signer: null +
  // loginMethod: 'passkey') is set up per-test below.
  state.wallet = {
    chainId: CHAIN,
    isConnected: true,
    openConnectModal: vi.fn(),
    loginMethod: 'injected',
    signer: { sendTransaction: vi.fn() },
    sendCalls: vi.fn(async () => ({ txHash: '0xbatch' })),
    switchNetwork: vi.fn(async () => true),
  }
  state.effective = { address: ACCOUNT, connectedAddress: ACCOUNT, chainId: null }
  state.active = {
    isVault: false,
    isLegacy: false,
    canActAsVault: false,
    canActAsLegacy: false,
    submit: vi.fn(async () => ({ kind: 'sent', txHash: '0xdead' })),
  }
  state.navigate = vi.fn()
  state.showNotification = vi.fn()
  state.provider = fakeProvider()
  state.getReadProvider = vi.fn(() => state.provider)
  state.captureTx = vi.fn(() => 'entry-tx')
  state.captureLog = vi.fn(() => 'entry-log')
  state.captureState = vi.fn(() => 'entry-state')
  // Screening defaults to a positive 'clear'; individual tests make it restrict or fail.
  state.screenOne = vi.fn(async () => 'clear')
})

describe('the exposed surface (FR-013)', () => {
  it('exposes exactly the documented keys and nothing more', () => {
    const { ref } = mountHost()
    expect(Object.keys(ref.current).sort()).toEqual(
      // hostApi 2 added `contracts` and `network`; both hand over inert public
      // data and neither can move value or read the member's own data.
      ['appId', 'audit', 'contracts', 'navigate', 'network', 'readProvider', 'store', 'toast', 'wallet'].sort(),
    )
    expect(Object.keys(ref.current.wallet).sort()).toEqual(
      // `switchChain` (hostApi 2) is the companion to submit's WRONG_CHAIN refusal — without it an
      // app can name the problem and never offer the fix.
      ['address', 'chainId', 'connectedAddress', 'isConnected', 'requestConnect', 'submit', 'switchChain'].sort(),
    )
    expect(Object.keys(ref.current.store).sort()).toEqual(['get', 'set', 'subscribe'])
    expect(Object.keys(ref.current.audit)).toEqual(['log'])
    expect(Object.keys(ref.current.toast)).toEqual(['show'])
    expect(ref.current.appId).toBe(APP_ID)
  })

  it('is frozen all the way down, so an app cannot re-point a capability', () => {
    const { ref } = mountHost()
    const host = ref.current
    for (const target of [host, host.wallet, host.store, host.audit, host.toast]) {
      expect(Object.isFrozen(target)).toBe(true)
    }
    expect(() => {
      host.navigate = () => {}
    }).toThrow(TypeError)
    expect(() => {
      host.wallet.submit = () => {}
    }).toThrow(TypeError)
  })

  it('hands out wrappers, never the host objects behind them', () => {
    const { ref } = mountHost()
    // The router's own navigate, the notification setter and the active-account
    // submit are all host internals; only the host's wrappers may escape.
    expect(ref.current.navigate).not.toBe(state.navigate)
    expect(ref.current.wallet.submit).not.toBe(state.active.submit)
    expect(ref.current.toast.show).not.toBe(state.showNotification)
  })

  it('reports the active identity and the connected wallet separately', () => {
    state.effective = { address: VAULT, connectedAddress: ACCOUNT, chainId: CHAIN }
    const { ref } = mountHost()
    expect(ref.current.wallet.address).toBe(VAULT)
    expect(ref.current.wallet.connectedAddress).toBe(ACCOUNT)
    expect(ref.current.wallet.chainId).toBe(CHAIN)
    expect(ref.current.wallet.isConnected).toBe(true)
  })

  it('stays the same object across a re-render with unchanged inputs', () => {
    const { ref, view } = mountHost()
    const first = ref.current
    view.rerender(
      <MiniAppHostProvider appId={APP_ID}>
        <ProbeAgain hostRef={ref} />
      </MiniAppHostProvider>,
    )
    expect(ref.current).toBe(first)
  })

  it('is unreachable outside a mounted workspace', () => {
    function Orphan() {
      useMiniAppHost()
      return null
    }
    expect(() => render(<Orphan />)).toThrow(/only available inside a mounted mini-app workspace/)
  })
})

function ProbeAgain({ hostRef }) {
  hostRef.current = useMiniAppHost()
  return null
}

describe('wallet.submit refusals', () => {
  it('rejects with a typed error when no wallet is connected, and never submits', async () => {
    state.wallet = { chainId: null, isConnected: false, openConnectModal: vi.fn() }
    state.effective = { address: null, connectedAddress: null, chainId: null }
    const { ref } = mountHost()

    const error = await ref.current.wallet.submit({ to: TARGET, chainId: CHAIN }).catch((e) => e)
    expect(error).toBeInstanceOf(MiniAppHostError)
    expect(error.reason).toBe(HOST_REFUSAL.WALLET_ABSENT)
    expect(error.userMessage).toMatch(/connect your wallet/i)
    expect(state.active.submit).not.toHaveBeenCalled()
    expect(ref.current.wallet.isConnected).toBe(false)
  })

  it('rejects on the wrong network instead of sending on the connected one', async () => {
    const { ref } = mountHost()
    const error = await ref.current.wallet.submit({ to: TARGET, chainId: 1 }).catch((e) => e)
    expect(error).toBeInstanceOf(MiniAppHostError)
    expect(error.reason).toBe(HOST_REFUSAL.WRONG_CHAIN)
    expect(state.active.submit).not.toHaveBeenCalled()
  })

  it('rejects when the acting account lives on another chain', async () => {
    state.effective = { address: VAULT, connectedAddress: ACCOUNT, chainId: 1 }
    const { ref } = mountHost()
    const error = await ref.current.wallet.submit({ to: TARGET, chainId: CHAIN }).catch((e) => e)
    expect(error.reason).toBe(HOST_REFUSAL.WRONG_CHAIN)
    expect(state.active.submit).not.toHaveBeenCalled()
  })

  it('rejects a vault action while the wallet is off the vault network', async () => {
    state.effective = { address: VAULT, connectedAddress: ACCOUNT, chainId: CHAIN }
    state.active = { ...state.active, isVault: true, canActAsVault: false }
    const { ref } = mountHost()
    const error = await ref.current.wallet.submit({ to: TARGET, chainId: CHAIN }).catch((e) => e)
    expect(error.reason).toBe(HOST_REFUSAL.WRONG_CHAIN)
    expect(state.active.submit).not.toHaveBeenCalled()
  })

  it('rejects a recovered account whose key is no longer unlocked', async () => {
    state.active = { ...state.active, isLegacy: true, canActAsLegacy: false }
    const { ref } = mountHost()
    const error = await ref.current.wallet.submit({ to: TARGET, chainId: CHAIN }).catch((e) => e)
    expect(error.reason).toBe(HOST_REFUSAL.IDENTITY_LOCKED)
    expect(state.active.submit).not.toHaveBeenCalled()
  })

  it('refuses to guess the network when the app does not name one', async () => {
    const { ref } = mountHost()
    const error = await ref.current.wallet.submit({ to: TARGET }).catch((e) => e)
    expect(error.reason).toBe(HOST_REFUSAL.BAD_PAYLOAD)
    expect(state.active.submit).not.toHaveBeenCalled()
  })

  it('refuses a malformed destination, calldata or amount', async () => {
    const { ref } = mountHost()
    const bad = [
      { to: 'not-an-address', chainId: CHAIN },
      { to: TARGET, chainId: CHAIN, data: 'deadbeef' },
      { to: TARGET, chainId: CHAIN, data: '0xabc' },
      { to: TARGET, chainId: CHAIN, value: 1.5 },
      { to: TARGET, chainId: CHAIN, value: '-1' },
    ]
    for (const payload of bad) {
      const error = await ref.current.wallet.submit(payload).catch((e) => e)
      expect(error).toBeInstanceOf(MiniAppHostError)
      expect(error.reason).toBe(HOST_REFUSAL.BAD_PAYLOAD)
    }
    expect(state.active.submit).not.toHaveBeenCalled()
  })
})

describe('wallet.submit routing and audit (FR-019)', () => {
  it('rebuilds the payload, dropping the fields that would become a vault delegatecall', async () => {
    const { ref } = mountHost()
    await ref.current.wallet.submit({
      to: TARGET,
      data: '0xabcd',
      value: '1000',
      chainId: CHAIN,
      // Host-only concepts an app must never be able to reach:
      batch: [{ to: VAULT, data: '0x', value: 0n }],
      operation: 1,
    })
    expect(state.active.submit).toHaveBeenCalledTimes(1)
    expect(state.active.submit).toHaveBeenCalledWith({ to: TARGET, value: 1000n, data: '0xabcd' })
  })

  it('records the submission and returns a frozen, normalized result', async () => {
    const { ref } = mountHost()
    const result = await ref.current.wallet.submit({ to: TARGET, chainId: CHAIN })

    expect(result).toEqual({ kind: 'sent', txHash: '0xdead', safeTxHash: null })
    expect(Object.isFrozen(result)).toBe(true)
    expect(state.captureTx).toHaveBeenCalledWith(ACCOUNT, CHAIN, {
      appId: APP_ID,
      txHash: '0xdead',
      to: TARGET,
    })
  })

  /*
   * The two write rails. A passkey smart account has NO ethers signer —
   * WalletContext nulls it — and writes through `sendCalls`. Before this was
   * handled, every mini-app transaction from a passkey member died inside
   * submitAsActiveAccount on `null.sendTransaction`, reaching the app as a raw
   * TypeError with no refusal code and no member-facing sentence. The app
   * cannot fix that itself: `sendCalls` is deliberately not on the host object.
   */
  describe('passkey sessions (specs 041/050)', () => {
    const asPasskey = (over = {}) => {
      state.wallet = {
        ...state.wallet,
        loginMethod: 'passkey',
        signer: null, // WalletContext.jsx nulls signer AND provider for passkey
        ...over,
      }
    }

    it('routes a personal submit through sendCalls instead of the signer rail', async () => {
      asPasskey()
      const { ref } = mountHost()

      const result = await ref.current.wallet.submit({
        to: TARGET, data: '0xabcd', value: '1000', chainId: CHAIN,
      })

      expect(state.wallet.sendCalls).toHaveBeenCalledWith([
        { target: TARGET, data: '0xabcd', value: 1000n },
      ])
      // The signer rail must not be touched — it is the one that would throw.
      expect(state.active.submit).not.toHaveBeenCalled()
      expect(result).toEqual({ kind: 'sent', txHash: '0xbatch', safeTxHash: null })
      expect(Object.isFrozen(result)).toBe(true)
    })

    it('audits the submission exactly as the signer rail does', async () => {
      asPasskey()
      const { ref } = mountHost()
      await ref.current.wallet.submit({ to: TARGET, chainId: CHAIN })
      expect(state.captureTx).toHaveBeenCalledWith(ACCOUNT, CHAIN, {
        appId: APP_ID, txHash: '0xbatch', to: TARGET,
      })
    })

    it('takes the UserOp identifiers in decreasing order of finality', async () => {
      asPasskey({ sendCalls: vi.fn(async () => ({ userOpHash: '0xuop', intentId: '0xint' })) })
      const { ref } = mountHost()
      expect((await ref.current.wallet.submit({ to: TARGET, chainId: CHAIN })).txHash).toBe('0xuop')

      asPasskey({ sendCalls: vi.fn(async () => ({ intentId: '0xint' })) })
      const second = mountHost()
      expect((await second.ref.current.wallet.submit({ to: TARGET, chainId: CHAIN })).txHash).toBe('0xint')
    })

    it('never fabricates a hash when the rail returns none', async () => {
      asPasskey({ sendCalls: vi.fn(async () => ({})) })
      const { ref } = mountHost()
      expect((await ref.current.wallet.submit({ to: TARGET, chainId: CHAIN })).txHash).toBeNull()
    })

    it('still PROPOSES when a passkey member is acting as a vault', async () => {
      // A passkey identity operating as a Safe must produce a vault proposal,
      // not a UserOp from their own account. Rail selection must not override
      // which identity is acting.
      asPasskey()
      state.effective = { address: VAULT, connectedAddress: ACCOUNT, chainId: CHAIN }
      state.active = {
        ...state.active,
        isVault: true,
        canActAsVault: true,
        submit: vi.fn(async () => ({ kind: 'proposed', safeTxHash: '0xsafe' })),
      }
      const { ref } = mountHost()

      const result = await ref.current.wallet.submit({ to: TARGET, chainId: CHAIN })
      expect(result).toEqual({ kind: 'proposed', txHash: null, safeTxHash: '0xsafe' })
      expect(state.wallet.sendCalls).not.toHaveBeenCalled()
      expect(state.active.submit).toHaveBeenCalled()
    })

    it('audits a failed UserOp and rethrows, like the signer rail', async () => {
      asPasskey({ sendCalls: vi.fn(async () => { throw new Error('bundler rejected') }) })
      const { ref } = mountHost()

      await expect(ref.current.wallet.submit({ to: TARGET, chainId: CHAIN })).rejects.toThrow('bundler rejected')
      expect(state.captureLog).toHaveBeenCalledWith(
        ACCOUNT, CHAIN,
        expect.objectContaining({ appId: APP_ID, kind: 'host:tx_failed' }),
      )
    })

    it('refuses with a typed code when the session offers no rail at all', async () => {
      asPasskey({ sendCalls: undefined })
      const { ref } = mountHost()

      // The whole point: a typed refusal the app can branch on and the
      // workspace can explain — not a TypeError from a null dereference.
      const error = await ref.current.wallet.submit({ to: TARGET, chainId: CHAIN }).catch((e) => e)
      expect(error).toBeInstanceOf(MiniAppHostError)
      expect(error.reason).toBe(HOST_REFUSAL.NO_WRITE_RAIL)
      expect(error.userMessage).toMatch(/cannot send transactions/i)
    })

    it('refuses a classic session that has lost its signer, rather than dereferencing null', async () => {
      state.wallet = { ...state.wallet, loginMethod: 'injected', signer: null }
      const { ref } = mountHost()

      const error = await ref.current.wallet.submit({ to: TARGET, chainId: CHAIN }).catch((e) => e)
      expect(error).toBeInstanceOf(MiniAppHostError)
      expect(error.reason).toBe(HOST_REFUSAL.NO_WRITE_RAIL)
      expect(state.active.submit).not.toHaveBeenCalled()
    })
  })

  /*
   * hostApi 2. Both accessors hand over inert PUBLIC data, and both exist
   * because the alternative is worse: a package cannot bundle the host's config
   * (it reaches `virtual:tenant`, a plugin the package preset does not
   * register), and a hand-copied table frozen into immutable bytes would turn a
   * routine redeploy into a re-publish/re-review/re-approve for every app.
   */
  describe('contracts() and network() (hostApi 2)', () => {
    const withContracts = (names) => {
      const ref = { current: null }
      function Probe() { ref.current = useMiniAppHost(); return null }
      render(
        <MiniAppHostProvider appId={APP_ID} declaredContracts={names}>
          <Probe />
        </MiniAppHostProvider>,
      )
      return ref
    }

    it('resolves a declared name on a chain that has a deployment', () => {
      const { current: host } = withContracts(['miniAppRegistry'])
      // Polygon 137 carries the spec-073 registry.
      expect(host.contracts('miniAppRegistry', 137)).toMatch(/^0x[0-9a-fA-F]{40}$/)
    })

    it('returns null — not "" — for a declared name with no deployment on that chain', () => {
      const { current: host } = withContracts(['miniAppRegistry'])
      // Amoy has the key seeded but empty. '' is how the address book spells
      // absence; the contract spells it `null`, and an app must not have to
      // know both.
      expect(host.contracts('miniAppRegistry', 80002)).toBeNull()
    })

    it('THROWS for an undeclared name rather than answering null', () => {
      const { current: host } = withContracts(['miniAppRegistry'])
      const error = (() => { try { host.contracts('wagerRegistry', 137) } catch (e) { return e } })()
      expect(error).toBeInstanceOf(MiniAppHostError)
      expect(error.reason).toBe(HOST_REFUSAL.UNDECLARED_CONTRACT)
      // "you are not approved for this" must never read as "not deployed here".
      expect(host.contracts('miniAppRegistry', 80002)).toBeNull()
    })

    it('defaults to the wallet chain and never guesses another one', () => {
      const { current: host } = withContracts(['miniAppRegistry'])
      expect(host.contracts('miniAppRegistry')).toBe(host.contracts('miniAppRegistry', CHAIN))
      expect(host.contracts('miniAppRegistry', 999999)).toBeNull()
    })

    it('declares nothing by default, so the gate fails closed', () => {
      const { ref } = mountHost()
      expect(() => ref.current.contracts('miniAppRegistry', 137)).toThrow(/not declared/)
    })

    it('projects a chain descriptor, never the NETWORKS entry', () => {
      const { ref } = mountHost()
      const net = ref.current.network(137)
      expect(Object.keys(net).sort()).toEqual(
        ['chainId', 'explorer', 'isTestnet', 'name', 'nativeCurrency', 'subgraphUrl'].sort(),
      )
      expect(net.chainId).toBe(137)
      expect(net.isTestnet).toBe(false)
      // The NETWORKS entry also carries rpcUrl, dex, polymarket and passkey
      // config; handing it over would break "wrappers, never handles".
      expect(net.rpcUrl).toBeUndefined()
      expect(net.dex).toBeUndefined()
      expect(net.stablecoin).toBeUndefined()
      expect(Object.isFrozen(net)).toBe(true)
    })

    it('returns null for an unknown chain instead of falling back to the default network', () => {
      const { ref } = mountHost()
      // getNetwork() would answer with chain 137 here. An app must be able to
      // say "unknown network", and must never render one chain's explorer link
      // against another chain's data.
      expect(ref.current.network(999999)).toBeNull()
    })

    it('reports a testnet as a testnet', () => {
      const { ref } = mountHost()
      expect(ref.current.network(80002).isTestnet).toBe(true)
    })
  })

  /*
   * Screening is enforced HERE and not delegated to packages. FairWins' own contracts carry an
   * on-chain sanctions guard, but a mini-app's whole point is calling contracts FairWins did not
   * write, where none exists — and a package asked to call a screening function can simply not.
   */
  describe('sanctions screening (hostApi 2)', () => {
    it('screens the ACTING account live before touching any rail', async () => {
      state.effective = { address: VAULT, connectedAddress: ACCOUNT, chainId: null }
      const { ref } = mountHost()
      await ref.current.wallet.submit({ to: TARGET, chainId: CHAIN })

      // The acting identity, not the connected one — a vault is what moves the value.
      // `force` because a cached 'clear' would hide an account deny-listed since page load.
      expect(state.screenOne).toHaveBeenCalledWith(VAULT, CHAIN, { force: true })
    })

    it('REFUSES a restricted account with a typed error, and never submits', async () => {
      state.screenOne = vi.fn(async () => 'restricted')
      const { ref } = mountHost()

      const error = await ref.current.wallet.submit({ to: TARGET, chainId: CHAIN }).catch((e) => e)
      expect(error).toBeInstanceOf(MiniAppHostError)
      expect(error.reason).toBe(HOST_REFUSAL.SANCTIONED_ACCOUNT)
      expect(error.userMessage).toMatch(/restricted by sanctions screening/i)
      expect(state.active.submit).not.toHaveBeenCalled()
    })

    it('audits a screening refusal, so the trail shows why nothing was sent', async () => {
      state.screenOne = vi.fn(async () => 'restricted')
      const { ref } = mountHost()
      await ref.current.wallet.submit({ to: TARGET, chainId: CHAIN }).catch(() => {})

      expect(state.captureLog).toHaveBeenCalledWith(
        ACCOUNT, CHAIN,
        expect.objectContaining({ refs: expect.objectContaining({ reason: 'sanctioned_account' }) }),
      )
    })

    it('ALLOWS on an uncertain result — an unreachable screener is not a finding', async () => {
      // Treating uncertainty as a restriction would invent a compliance result the data does not
      // support, which is the same class of lie as fabricating a clear one.
      state.screenOne = vi.fn(async () => 'uncertain')
      const { ref } = mountHost()
      expect((await ref.current.wallet.submit({ to: TARGET, chainId: CHAIN })).kind).toBe('sent')
    })

    it('ALLOWS when the screener throws outright', async () => {
      state.screenOne = vi.fn(async () => { throw new Error('screening endpoint down') })
      const { ref } = mountHost()
      expect((await ref.current.wallet.submit({ to: TARGET, chainId: CHAIN })).kind).toBe('sent')
    })

    it('screens the passkey rail too — the rail is chosen after the check', async () => {
      state.screenOne = vi.fn(async () => 'restricted')
      state.wallet = { ...state.wallet, loginMethod: 'passkey', signer: null }
      const { ref } = mountHost()

      await expect(ref.current.wallet.submit({ to: TARGET, chainId: CHAIN })).rejects.toThrow(/restricted/i)
      expect(state.wallet.sendCalls).not.toHaveBeenCalled()
    })
  })

  describe('wallet.switchChain (hostApi 2)', () => {
    it('asks the wallet to move, and resolves when it does', async () => {
      const { ref } = mountHost()
      await ref.current.wallet.switchChain(63)
      expect(state.wallet.switchNetwork).toHaveBeenCalledWith(63)
    })

    it('refuses with a typed error when the member declines', async () => {
      state.wallet = {
        ...state.wallet,
        switchNetwork: vi.fn(async () => { throw new Error('Please manually switch to Mordor in your wallet') }),
      }
      const { ref } = mountHost()

      const error = await ref.current.wallet.switchChain(63).catch((e) => e)
      expect(error).toBeInstanceOf(MiniAppHostError)
      expect(error.reason).toBe(HOST_REFUSAL.SWITCH_REFUSED)
      // The wallet's own sentence is already member-facing; it is kept rather than replaced.
      expect(error.userMessage).toMatch(/manually switch to Mordor/i)
    })

    it('refuses a session that cannot switch at all', async () => {
      state.wallet = { ...state.wallet, switchNetwork: undefined }
      const { ref } = mountHost()
      const error = await ref.current.wallet.switchChain(63).catch((e) => e)
      expect(error.reason).toBe(HOST_REFUSAL.SWITCH_REFUSED)
      expect(error.userMessage).toMatch(/switch it manually/i)
    })

    it('refuses a chain id it cannot read', async () => {
      const { ref } = mountHost()
      const error = await ref.current.wallet.switchChain('not-a-chain').catch((e) => e)
      expect(error.reason).toBe(HOST_REFUSAL.BAD_PAYLOAD)
      expect(state.wallet.switchNetwork).not.toHaveBeenCalled()
    })
  })

  describe('SubmitResult.wait() (hostApi 2)', () => {
    it('resolves the receipt through the host read provider', async () => {
      state.provider.waitForTransaction = vi.fn(async () => ({ status: 1, hash: '0xdead' }))
      const { ref } = mountHost()
      const result = await ref.current.wallet.submit({ to: TARGET, chainId: CHAIN })

      expect(await result.wait()).toEqual({ status: 1, hash: '0xdead' })
      expect(state.provider.waitForTransaction).toHaveBeenCalledWith('0xdead', 1)
    })

    it('passes a confirmation count through', async () => {
      state.provider.waitForTransaction = vi.fn(async () => ({ status: 1 }))
      const { ref } = mountHost()
      const result = await ref.current.wallet.submit({ to: TARGET, chainId: CHAIN })
      await result.wait(3)
      expect(state.provider.waitForTransaction).toHaveBeenCalledWith('0xdead', 3)
    })

    it('is NON-ENUMERABLE, so the result stays a plain serialisable object', async () => {
      const { ref } = mountHost()
      const result = await ref.current.wallet.submit({ to: TARGET, chainId: CHAIN })
      expect(Object.keys(result)).toEqual(['kind', 'txHash', 'safeTxHash'])
      expect(JSON.parse(JSON.stringify(result))).toEqual({
        kind: 'sent', txHash: '0xdead', safeTxHash: null,
      })
      expect(result).toEqual({ kind: 'sent', txHash: '0xdead', safeTxHash: null })
      expect(Object.isFrozen(result)).toBe(true)
    })

    it('rejects for a vault proposal rather than waiting for a transaction that does not exist', async () => {
      state.effective = { address: VAULT, connectedAddress: ACCOUNT, chainId: CHAIN }
      state.active = {
        ...state.active,
        isVault: true,
        canActAsVault: true,
        submit: vi.fn(async () => ({ kind: 'proposed', safeTxHash: '0xsafe' })),
      }
      const { ref } = mountHost()
      const result = await ref.current.wallet.submit({ to: TARGET, chainId: CHAIN })

      await expect(result.wait()).rejects.toThrow(/no transaction to wait for/)
    })

    it('rejects when the rail reported no hash, instead of waiting on null', async () => {
      state.active.submit = vi.fn(async () => ({ kind: 'sent', txHash: null }))
      const { ref } = mountHost()
      const result = await ref.current.wallet.submit({ to: TARGET, chainId: CHAIN })
      await expect(result.wait()).rejects.toThrow(/no hash to wait for/)
    })
  })

  it('reports a vault action as proposed — not sent — and audits it under a host kind', async () => {
    state.effective = { address: VAULT, connectedAddress: ACCOUNT, chainId: CHAIN }
    state.active = {
      ...state.active,
      isVault: true,
      canActAsVault: true,
      submit: vi.fn(async () => ({ kind: 'proposed', safeTxHash: '0xsafe' })),
    }
    const { ref } = mountHost()

    const result = await ref.current.wallet.submit({ to: TARGET, chainId: CHAIN })
    expect(result).toEqual({ kind: 'proposed', txHash: null, safeTxHash: '0xsafe' })
    expect(state.captureTx).not.toHaveBeenCalled()
    expect(state.captureLog).toHaveBeenCalledWith(
      VAULT,
      CHAIN,
      expect.objectContaining({ appId: APP_ID, kind: 'host:tx_proposed', dedupeKey: '0xsafe' }),
    )
  })

  it('audits a failed submission and re-throws the original error', async () => {
    const failure = new Error('user rejected')
    state.active = { ...state.active, submit: vi.fn(async () => { throw failure }) }
    const { ref } = mountHost()

    const error = await ref.current.wallet.submit({ to: TARGET, chainId: CHAIN }).catch((e) => e)
    expect(error).toBe(failure)
    expect(state.captureLog).toHaveBeenCalledWith(
      ACCOUNT,
      CHAIN,
      expect.objectContaining({ appId: APP_ID, kind: 'host:tx_failed' }),
    )
  })

  it('never lets an audit failure break the transaction it was recording', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    state.captureTx = vi.fn(() => {
      throw new Error('ledger unavailable')
    })
    const { ref } = mountHost()
    await expect(ref.current.wallet.submit({ to: TARGET, chainId: CHAIN })).resolves.toMatchObject({
      kind: 'sent',
    })
  })

  it('opens the host connect modal for requestConnect', () => {
    const { ref } = mountHost()
    ref.current.wallet.requestConnect()
    expect(state.wallet.openConnectModal).toHaveBeenCalledTimes(1)
  })
})

describe('navigate stays inside the host', () => {
  it('refuses external and protocol-relative targets', () => {
    const { ref } = mountHost()
    const refused = [
      'https://evil.example',
      '//evil.example',
      'http://evil.example/path',
      'javascript:alert(1)',
      '/\\evil.example',
      '/wallet\n/../..//evil.example',
      'wallet?tab=apps',
    ]
    for (const target of refused) {
      let caught = null
      try {
        ref.current.navigate(target)
      } catch (error) {
        caught = error
      }
      expect(caught, `expected "${target}" to be refused`).toBeInstanceOf(MiniAppHostError)
      expect(caught.reason).toBe(HOST_REFUSAL.EXTERNAL_TARGET)
    }
    expect(state.navigate).not.toHaveBeenCalled()
  })

  it('refuses a non-string or oversized target', () => {
    const { ref } = mountHost()
    for (const target of [null, 42, {}, `/${'a'.repeat(600)}`]) {
      expect(() => ref.current.navigate(target)).toThrow(MiniAppHostError)
    }
    expect(state.navigate).not.toHaveBeenCalled()
  })

  it('allows in-app paths', () => {
    const { ref } = mountHost()
    ref.current.navigate('/wallet?tab=apps')
    expect(state.navigate).toHaveBeenCalledWith('/wallet?tab=apps')
  })
})

describe('store namespacing (FR-018)', () => {
  it('writes into the app’s own namespace, keyed by the acting identity', () => {
    const { ref } = mountHost()
    expect(ref.current.store.set('layout', { pinned: true })).toBe(true)

    const key = appStoreStorageKey(ACCOUNT, APP_ID)
    expect(localStorage.getItem(key)).toContain('pinned')
    expect(ref.current.store.get('layout')).toEqual({ pinned: true })
  })

  it('gives a second app a different namespace for the same key', () => {
    const first = mountHost('demo-app')
    first.ref.current.store.set('layout', { pinned: true })
    first.view.unmount()

    const second = mountHost('other-app')
    expect(second.ref.current.store.get('layout')).toBeNull()
    expect(localStorage.getItem(appStoreStorageKey(ACCOUNT, 'other-app'))).toBeNull()
  })
})

describe('automatic state-change audit (FR-019)', () => {
  // These entries land in the member's DURABLE, backed-up ledger, so the two
  // things worth pinning are what gets recorded (a key, never a value) and how
  // OFTEN (coarse enough that an app saving on every keystroke cannot flood it).
  const SECRET = 'a-members-private-note-that-must-never-be-audited'

  it('records a value-free entry the first time a key really changes', () => {
    const { ref } = mountHost()
    expect(ref.current.store.set('notes', { body: SECRET })).toBe(true)

    expect(state.captureState).toHaveBeenCalledTimes(1)
    expect(state.captureState).toHaveBeenCalledWith(
      ACCOUNT,
      CHAIN,
      expect.objectContaining({ appId: APP_ID, storeKey: 'notes' }),
    )
    // Not "no value field" — no value ANYWHERE in the arguments. The audit is
    // attribution; the app's data stays the app's data.
    expect(JSON.stringify(state.captureState.mock.calls)).not.toContain(SECRET)
    expect(Object.keys(state.captureState.mock.calls[0][2]).sort()).toEqual(['appId', 'at', 'storeKey'])
  })

  it('records nothing for a write that changed nothing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { ref } = mountHost()
    ref.current.store.set('notes', { body: 'first' })
    state.captureState.mockClear()

    // Same value again, an unaddressable key, and a value that cannot be stored:
    // the store reports each as `false`, and a change that did not happen must
    // not appear in a compliance trail.
    expect(ref.current.store.set('notes', { body: 'first' })).toBe(false)
    expect(ref.current.store.set('not a key!', 1)).toBe(false)
    expect(ref.current.store.set('fn', () => {})).toBe(false)
    expect(state.captureState).not.toHaveBeenCalled()
  })

  it('coalesces a burst on one key into a single entry, per key', () => {
    const { ref } = mountHost()
    // A form autosaving as the member types — the ordinary case that would
    // otherwise mint an entry per keystroke, forever, in the member's backup.
    for (let i = 0; i < 25; i += 1) ref.current.store.set('draft', { text: `${SECRET}-${i}` })
    expect(state.captureState).toHaveBeenCalledTimes(1)

    // A different key is a different fact and is recorded on its own.
    ref.current.store.set('layout', { pinned: true })
    expect(state.captureState).toHaveBeenCalledTimes(2)
    expect(state.captureState.mock.calls.map((call) => call[2].storeKey)).toEqual(['draft', 'layout'])
    expect(JSON.stringify(state.captureState.mock.calls)).not.toContain(SECRET)
  })

  it('records again once the coalescing window has passed', () => {
    const start = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start)
    const { ref } = mountHost()

    ref.current.store.set('draft', { text: 'one' })
    clock.mockReturnValue(start + STATE_AUDIT_WINDOW_MS - 1)
    ref.current.store.set('draft', { text: 'two' })
    expect(state.captureState).toHaveBeenCalledTimes(1)

    // Past the window: a genuinely separate edit is a genuinely separate entry.
    clock.mockReturnValue(start + STATE_AUDIT_WINDOW_MS)
    ref.current.store.set('draft', { text: 'three' })
    expect(state.captureState).toHaveBeenCalledTimes(2)
    expect(state.captureState.mock.calls[1][2].at).toBe(start + STATE_AUDIT_WINDOW_MS)
  })

  it('records the first change under a new identity, whatever the old window said', () => {
    const { ref, view } = mountHost()
    ref.current.store.set('draft', { text: 'as the personal wallet' })
    expect(state.captureState).toHaveBeenCalledTimes(1)

    // Acting as a vault now: a different account, a different namespace, and a
    // window that has never seen this key.
    state.effective = { address: VAULT, connectedAddress: ACCOUNT, chainId: CHAIN }
    view.rerender(
      <MiniAppHostProvider appId={APP_ID}>
        <ProbeAgain hostRef={ref} />
      </MiniAppHostProvider>,
    )
    ref.current.store.set('draft', { text: 'as the vault' })

    expect(state.captureState).toHaveBeenCalledTimes(2)
    expect(state.captureState.mock.calls[1][0]).toBe(VAULT)
  })

  it('records nothing when there is no account or network to attribute it to', () => {
    state.wallet = { chainId: null, isConnected: false, openConnectModal: vi.fn() }
    state.effective = { address: null, connectedAddress: null, chainId: null }
    const { ref } = mountHost()

    // The store still works — an app must run with no wallet connected (FR-016,
    // session-only) — there is simply nothing truthful to attribute.
    expect(ref.current.store.set('draft', { text: 'kept for the session' })).toBe(true)
    expect(ref.current.store.get('draft')).toEqual({ text: 'kept for the session' })
    expect(state.captureState).not.toHaveBeenCalled()
  })

  it('never lets an audit failure break the write it was recording', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    state.captureState = vi.fn(() => {
      throw new Error('ledger unavailable')
    })
    const { ref } = mountHost()

    expect(() => ref.current.store.set('draft', { text: 'still saved' })).not.toThrow()
    expect(ref.current.store.get('draft')).toEqual({ text: 'still saved' })
  })

  it('passes reads and subscriptions through untouched, and never audits a read', () => {
    // The audit wrapper must be invisible in every direction except the trail it
    // writes: an app that had to work around it would go looking for the raw
    // store, and a read is not an auditable event to begin with.
    const { ref } = mountHost()
    const seen = vi.fn()
    const unsubscribe = ref.current.store.subscribe(seen)

    ref.current.store.set('draft', { text: 'one' })
    expect(seen).toHaveBeenCalledTimes(1)
    state.captureState.mockClear()

    expect(ref.current.store.get('draft')).toEqual({ text: 'one' })
    expect(ref.current.store.get('missing', 'fallback')).toBe('fallback')
    expect(state.captureState).not.toHaveBeenCalled()

    unsubscribe()
    ref.current.store.set('draft', { text: 'two' })
    expect(seen).toHaveBeenCalledTimes(1)
  })
})

describe('audit.log', () => {
  it('records an app-contextual entry against the app and chain', () => {
    const { ref } = mountHost()
    ref.current.audit.log('market_viewed', { marketId: 'abc' })
    expect(state.captureLog).toHaveBeenCalledWith(ACCOUNT, CHAIN, {
      appId: APP_ID,
      kind: 'market_viewed',
      refs: { marketId: 'abc' },
    })
  })

  it('refuses the reserved host kind prefix, so an app cannot impersonate the host', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { ref } = mountHost()
    ref.current.audit.log('host:tx_proposed', { safeTxHash: '0xsafe' })
    ref.current.audit.log('Not A Kind')
    ref.current.audit.log(42)
    expect(state.captureLog).not.toHaveBeenCalled()
  })

  it('does not throw into the app that called it', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    state.captureLog = vi.fn(() => {
      throw new Error('ledger unavailable')
    })
    const { ref } = mountHost()
    expect(() => ref.current.audit.log('market_viewed')).not.toThrow()
  })
})

describe('toast.show', () => {
  it('passes a documented type through and clamps anything else to info', () => {
    const { ref } = mountHost()
    ref.current.toast.show('Saved', 'success')
    expect(state.showNotification).toHaveBeenCalledWith('Saved', 'success')

    // The type becomes a CSS class on host chrome, so an app-chosen string must
    // never reach it (FR-014).
    ref.current.toast.show('Odd', 'notification-danger evil')
    expect(state.showNotification).toHaveBeenLastCalledWith('Odd', 'info')
  })

  it('bounds the message and ignores an empty one', () => {
    const { ref } = mountHost()
    ref.current.toast.show('x'.repeat(500))
    expect(state.showNotification.mock.calls[0][0].length).toBe(200)

    state.showNotification.mockClear()
    ref.current.toast.show('')
    expect(state.showNotification).not.toHaveBeenCalled()
  })
})

describe('readProvider', () => {
  it('defaults to the wallet chain and resolves per call', () => {
    const { ref } = mountHost()
    ref.current.readProvider()
    expect(state.getReadProvider).toHaveBeenCalledWith(CHAIN)

    ref.current.readProvider(1)
    expect(state.getReadProvider).toHaveBeenLastCalledWith(1)
    // Never memoized: a member repointing an endpoint (spec 069) must be picked
    // up by the next read.
    expect(state.getReadProvider).toHaveBeenCalledTimes(2)
  })

  it('refuses a chain with no configured endpoint rather than returning nothing', () => {
    state.getReadProvider = vi.fn(() => null)
    const { ref } = mountHost()
    let caught = null
    try {
      ref.current.readProvider(999)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(MiniAppHostError)
    expect(caught.reason).toBe(HOST_REFUSAL.NO_READ_PROVIDER)
  })

  it('refuses a non-EVM network id (Bitcoin ids are strings, spec 061)', () => {
    const { ref } = mountHost()
    expect(() => ref.current.readProvider('bitcoin')).toThrow(MiniAppHostError)
    expect(state.getReadProvider).not.toHaveBeenCalled()
  })

  it('reads through, but cannot dismantle the shared provider', async () => {
    const { ref } = mountHost()
    const provider = ref.current.readProvider()

    await provider.call('0x')
    expect(state.provider.call).toHaveBeenCalledWith('0x')

    expect(() => provider.destroy()).toThrow(MiniAppHostError)
    expect(() => provider.removeAllListeners()).toThrow(MiniAppHostError)
    expect(() => {
      provider.pollingInterval = 1
    }).toThrow(MiniAppHostError)
    expect(state.provider.destroy).not.toHaveBeenCalled()
    expect(state.provider.pollingInterval).toBe(4000)
  })

  it('does not leak the raw provider through its own self-reference', () => {
    const { ref } = mountHost()
    const provider = ref.current.readProvider()
    expect(provider.provider).not.toBe(state.provider)
    expect(() => provider.provider.destroy()).toThrow(MiniAppHostError)
  })
})
