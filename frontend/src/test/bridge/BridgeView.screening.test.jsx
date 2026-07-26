/**
 * BridgeView — sanctions screening and the restricted-account policy
 * (spec 067, US3 — T116/T120/T154/T155; FR-032/FR-033, SC-013).
 *
 * Four things this suite exists to keep true:
 *
 *   1. A DENY-LISTED WALLET IS REFUSED BEFORE ANY SIGNATURE. Not warned, not left with a
 *      live confirm control — refused, with nothing sent.
 *   2. THE REFUSAL BITES AT SUBMISSION, NOT ONLY AT DISPLAY. The interesting case is the
 *      wallet that screened CLEAR when the quote was priced and was listed a moment later:
 *      the tap on "Bridge" must re-read the verdict past the cache and stop there. A screen
 *      that only ran at render would sign that transfer.
 *   3. AN UNSCREENABLE WALLET IS NOT A FLAGGED ONE. The SanctionsGuard is not deployed on
 *      every bridgeable network, so 'uncertain' is disclosed and blocks nothing. Treating it
 *      as flagged would refuse every member on those networks on no evidence at all.
 *   4. A RESTRICTED MEMBER STILL SEES EVERYTHING (FR-033). New value in is refused; the
 *      surface, the quote, and — stated in the refusal itself — the transfers already on
 *      their way are not withheld. Refusing new money is correct; hiding existing money is
 *      not.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { ZeroAddress } from 'ethers'

// ---- seams -------------------------------------------------------------------------
const walletState = { address: '0x1111111111111111111111111111111111111111', chainId: 137 }
let selectableOptions = []
const sendOnChain = vi.fn()
const canTransactOn = vi.fn(() => true)

vi.mock('../../hooks/useWalletManagement', () => ({ useWallet: () => walletState }))
vi.mock('../../hooks/useSelectableAssets', () => ({
  useSelectableAssets: () => ({ options: selectableOptions, defaultKey: null, isGasless: () => false }),
}))
vi.mock('../../hooks/usePortfolio', () => ({ default: () => ({ holdings: [], status: 'ready' }) }))
vi.mock('../../hooks/useEarnSend', () => ({
  useEarnSend: () => ({
    sendOnChain,
    canTransactOn,
    cannotTransactReason: (id) => `Passkey accounts can't send transactions on chain ${id} yet.`,
    isPasskey: false,
  }),
}))

/**
 * The ONE screening path, mocked at the hook the whole platform screens through. `verdict`
 * is mutable so a test can list the wallet BETWEEN the quote and the tap — which is the
 * timing FR-032 is about.
 */
let verdict = 'clear'
const screenOne = vi.fn(async () => verdict)
vi.mock('../../hooks/useAddressScreening', () => ({
  useAddressScreening: () => ({
    screenOne: (...args) => screenOne(...args),
    getStatus: () => 'clear',
    screen: vi.fn(),
    anyRestricted: () => false,
  }),
}))

const readBridgeRouterConfig = vi.fn()
const readBridgeRoute = vi.fn()
const buildBridgeCalls = vi.fn(() => ({ calls: [{ target: '0xrouter', data: '0x', value: 0n }], requiresApproval: false }))
vi.mock('../../lib/bridge/bridgeRouter', () => ({
  readBridgeRouterConfig: (...args) => readBridgeRouterConfig(...args),
  readBridgeRoute: (...args) => readBridgeRoute(...args),
  buildBridgeCalls: (...args) => buildBridgeCalls(...args),
}))

const fetchBridgeQuote = vi.fn()
vi.mock('../../lib/bridge/acrossQuotes', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, fetchBridgeQuote: (...args) => fetchBridgeQuote(...args) }
})

const getTransactionReceipt = vi.fn()
vi.mock('../../utils/rpcProvider', () => ({
  makeReadProvider: () => ({ getTransactionReceipt: (...args) => getTransactionReceipt(...args) }),
}))

const captureBridgeSubmission = vi.fn(() => 'entry-1')
vi.mock('../../data/ledger/sources/bridgeLedgerSource', async (importOriginal) => ({
  ...(await importOriginal()),
  captureBridgeSubmission: (...args) => captureBridgeSubmission(...args),
}))

import BridgeView from '../../components/wallet/BridgeView'
import { buildBridgeQuote } from '../../lib/bridge/acrossQuotes'

// ---- fixtures ----------------------------------------------------------------------
const USDC = {
  137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
}
const GATEWAY = 'https://relay.example.test'

const usdcOption = (chainId, networkName) => ({
  key: `${chainId}:${USDC[chainId].toLowerCase()}`,
  chainId,
  kind: 'erc20',
  address: USDC[chainId],
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  networkName,
  balance: 250,
})

const route = (destinationChainId) => ({
  routeId: `0xroute-${destinationChainId}`,
  inputToken: USDC[137],
  outputToken: USDC[destinationChainId],
  destinationChainId,
  maxAmount: 0n,
  expectedFillSeconds: 180,
  enabled: true,
  nativeInput: false,
})

const routerConfig = (routes) => ({
  routerAddress: '0x000000000000000000000000000000000000dEaD',
  spokePool: '0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096',
  feeRouter: ZeroAddress,
  sanctionsGuard: ZeroAddress,
  bridgeTransferServiceId: '0x00',
  maxFeeBps: 250,
  paused: false,
  routes,
  routesComplete: true,
})

function makeQuote() {
  const gross = 100_000_000n
  const totalRelayFee = 1_500_000n
  return buildBridgeQuote({
    suggested: {
      totalRelayFee: { total: totalRelayFee.toString() },
      outputAmount: (gross - totalRelayFee).toString(),
      relayerGasFee: { total: '500000' },
      lpFee: { total: '600000' },
      relayerCapitalFee: { total: '400000' },
      quoteTimestamp: String(Math.floor(Date.now() / 1000)),
      fillDeadline: String(Math.floor(Date.now() / 1000) + 3600),
      exclusivityDeadline: '0',
      exclusiveRelayer: ZeroAddress,
      estimatedFillSeconds: 180,
    },
    inputAmount: gross,
    feeAmount: 0n,
    platformFeeBps: 0,
    tokenSymbol: 'USDC',
    decimals: 6,
    originChainId: 137,
    destinationChainId: 42161,
    inputToken: USDC[137],
    outputToken: USDC[42161],
    fetchedAt: Date.now(),
    destinationNativeBalance: null,
  })
}

/** Render, wait for the router read, enter an amount, and wait for a priced quote. */
async function renderWithQuote(user) {
  const result = render(<BridgeView />)
  await screen.findByText(/Route availability as of/i)
  await user.type(screen.getByLabelText(/^Amount/), '100')
  await screen.findByRole('region', { name: /What this transfer costs/i })
  return result
}

const confirmButton = () => screen.getByRole('button', { name: /Bridge USDC/i })

beforeEach(() => {
  vi.stubEnv('VITE_RELAYER_URL', GATEWAY)
  verdict = 'clear'
  screenOne.mockClear()
  walletState.address = '0x1111111111111111111111111111111111111111'
  walletState.chainId = 137
  selectableOptions = [usdcOption(137, 'Polygon'), usdcOption(42161, 'Arbitrum One')]
  sendOnChain.mockReset().mockResolvedValue({ txHash: '0xabc' })
  canTransactOn.mockReset().mockReturnValue(true)
  readBridgeRouterConfig.mockReset().mockResolvedValue(routerConfig([route(42161)]))
  readBridgeRoute.mockReset().mockResolvedValue(route(42161))
  buildBridgeCalls.mockClear()
  fetchBridgeQuote.mockReset().mockResolvedValue(makeQuote())
  getTransactionReceipt.mockReset().mockResolvedValue({ logs: [] })
  captureBridgeSubmission.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// =====================================================================================
describe('BridgeView — screening the acting wallet (T116/T120, FR-032)', () => {
  it('screens the ACTING wallet against the SOURCE network, not the wallet’s current one', async () => {
    const user = userEvent.setup()
    walletState.chainId = 42161 // the wallet is elsewhere; the switch happens at signing
    await renderWithQuote(user)

    await waitFor(() => expect(screenOne).toHaveBeenCalled())
    const [address, chainId] = screenOne.mock.calls[0]
    expect(address).toBe(walletState.address)
    // 137 is where the value leaves from. Screening 42161 would read the wrong guard.
    expect(chainId).toBe(137)
  })

  it('refuses a deny-listed wallet before any signature is possible', async () => {
    verdict = 'restricted'
    const user = userEvent.setup()
    await renderWithQuote(user)

    expect(await screen.findByTestId('bridge-screening-refusal')).toBeInTheDocument()
    expect(confirmButton()).toBeDisabled()
    expect(sendOnChain).not.toHaveBeenCalled()
    expect(buildBridgeCalls).not.toHaveBeenCalled()
  })

  it('refuses a wallet listed BETWEEN the quote and the tap (SC-013 — submission, not display)', async () => {
    const user = userEvent.setup()
    await renderWithQuote(user) // priced while clear…
    expect(confirmButton()).toBeEnabled()

    verdict = 'restricted' // …and listed a moment later, with the control already live
    await user.click(confirmButton())

    expect(await screen.findByTestId('bridge-screening-refusal')).toBeInTheDocument()
    // Nothing was built and nothing was signed.
    expect(buildBridgeCalls).not.toHaveBeenCalled()
    expect(sendOnChain).not.toHaveBeenCalled()
    expect(captureBridgeSubmission).not.toHaveBeenCalled()
  })

  it('re-reads the verdict live at submission rather than trusting the cached one', async () => {
    const user = userEvent.setup()
    await renderWithQuote(user)
    screenOne.mockClear()

    await user.click(confirmButton())

    await waitFor(() => expect(screenOne).toHaveBeenCalled())
    const [, chainId, options] = screenOne.mock.calls[0]
    expect(chainId).toBe(137)
    // Forced: a cached 'clear' from the quote is exactly what must not be reused here.
    expect(options).toMatchObject({ force: true })
  })

  it('treats an unscreenable wallet as an unknown, never as a flagged one', async () => {
    verdict = 'uncertain'
    const user = userEvent.setup()
    await renderWithQuote(user)

    expect(await screen.findByTestId('bridge-screening-unavailable')).toBeInTheDocument()
    expect(screen.queryByTestId('bridge-screening-refusal')).not.toBeInTheDocument()
    expect(confirmButton()).toBeEnabled()

    await user.click(confirmButton())
    await waitFor(() => expect(sendOnChain).toHaveBeenCalled())
  })
})

// =====================================================================================
describe('BridgeView — the restricted-account policy (T154/T155, FR-033)', () => {
  it('withholds the confirm control only: the surface itself stays fully visible', async () => {
    verdict = 'restricted'
    const user = userEvent.setup()
    await renderWithQuote(user)

    await screen.findByTestId('bridge-screening-refusal')
    // Everything a member needs in order to SEE where they stand is still here.
    expect(screen.getByRole('button', { name: 'Asset to send' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Destination network' })).toBeEnabled()
    expect(screen.getByLabelText(/^Amount/)).toBeEnabled()
    expect(screen.getByRole('region', { name: /What this transfer costs/i })).toBeInTheDocument()
    // …and only the value-in step is refused.
    expect(confirmButton()).toBeDisabled()
  })

  it('says plainly that transfers already on their way are unaffected', async () => {
    verdict = 'restricted'
    const user = userEvent.setup()
    await renderWithQuote(user)

    const refusal = await screen.findByTestId('bridge-screening-refusal')
    expect(refusal).toHaveTextContent(/nothing has been sent/i)
    expect(refusal).toHaveTextContent(/already on their way are unaffected/i)
  })
})

// =====================================================================================
// Accessibility of the screening states (SC-014).
//
// The refusal and the unavailable notice are UI that only a screened-out member ever
// sees, so the surface's existing axe pass — which renders the ordinary, clear-verdict
// state — never reaches them. They are also the states where getting it wrong matters
// most: a member who cannot bridge is being told why, and told that their in-flight
// transfers are safe. That reassurance is worthless if a screen reader skips it, so the
// roles are asserted as rendered rather than merely present in the source.
// =====================================================================================
describe('BridgeView — screening states are accessible', () => {
  it('has no axe violations while refusing a restricted wallet', async () => {
    verdict = 'restricted'
    const user = userEvent.setup()
    const { container } = await renderWithQuote(user)
    await screen.findByTestId('bridge-screening-refusal')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations while disclosing an unscreenable wallet', async () => {
    verdict = 'uncertain'
    const user = userEvent.setup()
    const { container } = await renderWithQuote(user)
    await screen.findByTestId('bridge-screening-unavailable')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('announces the refusal assertively and the unknown passively', async () => {
    verdict = 'restricted'
    const user = userEvent.setup()
    const { unmount } = await renderWithQuote(user)
    expect(await screen.findByTestId('bridge-screening-refusal')).toHaveAttribute('role', 'alert')
    unmount()

    verdict = 'uncertain'
    await renderWithQuote(userEvent.setup())
    expect(await screen.findByTestId('bridge-screening-unavailable')).toHaveAttribute('role', 'note')
  })
})
