import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import OracleAdaptersTab from '../components/admin/OracleAdaptersTab'

// Mock ethers so the component never makes real RPC calls. We intercept
// `new ethers.Contract(addr, abi, signerOrProvider).<fn>(...)` by returning
// stub instances with the methods the tab calls.

const { dataFeedStub, functionsStub, umaStub, txReceipt } = vi.hoisted(() => {
  const txReceipt = { wait: vi.fn().mockResolvedValue({ status: 1 }) }
  return {
    txReceipt,
    dataFeedStub: {
      owner: vi.fn().mockResolvedValue('0x52502d049571C7893447b86c4d8B38e6184bF6e1'),
      setFeedAllowed: vi.fn().mockResolvedValue(txReceipt),
      registerCondition: vi.fn().mockResolvedValue(txReceipt),
      linkMarket: vi.fn().mockResolvedValue(txReceipt),
    },
    functionsStub: {
      owner: vi.fn().mockResolvedValue('0x52502d049571C7893447b86c4d8B38e6184bF6e1'),
      registerCondition: vi.fn().mockResolvedValue(txReceipt),
      linkMarket: vi.fn().mockResolvedValue(txReceipt),
    },
    umaStub: {
      owner: vi.fn().mockResolvedValue('0x52502d049571C7893447b86c4d8B38e6184bF6e1'),
      registerCondition: vi.fn().mockResolvedValue(txReceipt),
      linkMarket: vi.fn().mockResolvedValue(txReceipt),
    },
  }
})

vi.mock('ethers', async () => {
  const real = await vi.importActual('ethers')
  const stubs = {
    '0x7ae8220Dc02D0504EDCBa2C1B1AbA579AA3F0f23': dataFeedStub,
    '0x074fC18C1E322a7537b53B8B2Bf0762629E3b532': functionsStub,
    '0xcEa9b4A01CcD3aA6545ea834a268C69e7eEfee88': umaStub,
  }
  // `new ethers.Contract(addr, ...)` requires a constructor; use a real
  // function expression so the `new` invocation returns the right stub.
  function FakeContract(addr) {
    return stubs[addr] || {}
  }
  return {
    ...real,
    ethers: {
      ...real.ethers,
      Contract: FakeContract,
      isAddress: (s) => /^0x[a-fA-F0-9]{40}$/.test(String(s || '').trim()),
      toUtf8Bytes: real.ethers.toUtf8Bytes,
    },
  }
})

const adminAccount = '0x52502d049571C7893447b86c4d8B38e6184bF6e1'

const defaultProps = {
  signer: { provider: {} },  // truthy is enough; ethers.Contract is mocked
  account: adminAccount,
  contracts: {
    chainlinkDataFeedAdapter: '0x7ae8220Dc02D0504EDCBa2C1B1AbA579AA3F0f23',
    chainlinkFunctionsAdapter: '0x074fC18C1E322a7537b53B8B2Bf0762629E3b532',
    umaAdapter: '0xcEa9b4A01CcD3aA6545ea834a268C69e7eEfee88',
  },
  runTx: vi.fn((fn) => fn()),
  pendingTx: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  // Suppress jsdom alert() bubbles in the validation tests.
  vi.spyOn(window, 'alert').mockImplementation(() => {})
})

describe('OracleAdaptersTab', () => {
  it('renders the three adapter sub-tabs', () => {
    render(<OracleAdaptersTab {...defaultProps} />)
    expect(screen.getByRole('tab', { name: /chainlink data feed/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /chainlink functions/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /uma optimistic oracle/i })).toBeInTheDocument()
  })

  it('shows the owner banner with "(you)" when account === adapter.owner()', async () => {
    render(<OracleAdaptersTab {...defaultProps} />)
    await waitFor(() => {
      // Owner read populates async; once it resolves the (you) hint appears.
      expect(screen.getByText(/\(you\)/i)).toBeInTheDocument()
    })
  })

  it('warns when the connected account is NOT the adapter owner', async () => {
    dataFeedStub.owner.mockResolvedValueOnce('0x9999999999999999999999999999999999999999')
    render(
      <OracleAdaptersTab
        {...defaultProps}
        account="0x1111111111111111111111111111111111111111"
      />
    )
    await waitFor(() => {
      expect(screen.getByText(/NOT you/i)).toBeInTheDocument()
    })
  })

  it('Chainlink Data Feed: setFeedAllowed validates input + calls the adapter', async () => {
    render(<OracleAdaptersTab {...defaultProps} />)

    // Empty form → alert, no tx
    await userEvent.click(screen.getByRole('button', { name: /setFeedAllowed/i }))
    expect(dataFeedStub.setFeedAllowed).not.toHaveBeenCalled()

    // Valid feed → calls the contract
    const feedInput = screen.getByPlaceholderText(/Chainlink AggregatorV3/i)
    await userEvent.type(feedInput, '0xF0d50568e3A7e8259E16663972b11910F89BD8e7')
    await userEvent.click(screen.getByRole('button', { name: /setFeedAllowed/i }))

    expect(defaultProps.runTx).toHaveBeenCalled()
    expect(dataFeedStub.setFeedAllowed).toHaveBeenCalledWith(
      '0xF0d50568e3A7e8259E16663972b11910F89BD8e7',
      true
    )
  })

  it('Chainlink Data Feed: registerCondition forwards the full arg tuple', async () => {
    render(<OracleAdaptersTab {...defaultProps} />)

    const cidInput     = screen.getAllByPlaceholderText(/0x \+ 64 hex chars/i)[0]
    const feedInput    = screen.getAllByPlaceholderText(/must be allowlisted/i)[0]
    const thresholdIn  = screen.getAllByPlaceholderText(/8-dec/i)[0]
    const deadlineIn   = document.querySelector('input[type="datetime-local"]')

    const futureDate = new Date(Date.now() + 7 * 24 * 3600 * 1000)
    const isoLocal = futureDate.toISOString().slice(0, 16)

    await userEvent.type(cidInput, '0x' + 'a'.repeat(64))
    await userEvent.type(feedInput, '0xF0d50568e3A7e8259E16663972b11910F89BD8e7')
    await userEvent.type(thresholdIn, '300000000000')
    fireEvent.change(deadlineIn, { target: { value: isoLocal } })

    await userEvent.click(screen.getByRole('button', { name: /^registerCondition$/i }))

    expect(dataFeedStub.registerCondition).toHaveBeenCalledTimes(1)
    const [conditionId, feed, threshold, op, deadline] = dataFeedStub.registerCondition.mock.calls[0]
    expect(conditionId).toBe('0x' + 'a'.repeat(64))
    expect(feed).toBe('0xF0d50568e3A7e8259E16663972b11910F89BD8e7')
    expect(threshold).toBe(300000000000n)  // BigInt
    expect(op).toBe(0)  // default = GT
    expect(typeof deadline).toBe('bigint')
    expect(Number(deadline)).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('Chainlink Data Feed: linkMarket validates ids and bytes32', async () => {
    render(<OracleAdaptersTab {...defaultProps} />)

    // The third "0x + 64 hex chars" placeholder belongs to the linkMarket form.
    const linkCidInput = screen.getAllByPlaceholderText(/0x \+ 64 hex chars/i)[1]
    const wagerIdInputs = screen.getAllByRole('spinbutton')  // type=number inputs
    const wagerIdInput = wagerIdInputs[wagerIdInputs.length - 1]

    await userEvent.type(wagerIdInput, '42')
    await userEvent.type(linkCidInput, '0x' + 'b'.repeat(64))
    await userEvent.click(screen.getByRole('button', { name: /^linkMarket$/i }))

    expect(dataFeedStub.linkMarket).toHaveBeenCalledTimes(1)
    expect(dataFeedStub.linkMarket).toHaveBeenCalledWith(42n, '0x' + 'b'.repeat(64))
  })

  it('UMA: registerCondition converts the claim text to UTF-8 bytes', async () => {
    render(<OracleAdaptersTab {...defaultProps} />)

    // Switch to UMA sub-tab.
    await userEvent.click(screen.getByRole('tab', { name: /uma optimistic oracle/i }))

    // The register-condition form is the first "0x + 64 hex chars" cid input.
    const cidInput = screen.getAllByPlaceholderText(/0x \+ 64 hex chars/i)[0]
    const bondAddrInput = screen.getByPlaceholderText(/0x.*e\.g\. USDC/i)
    const claimArea = screen.getByPlaceholderText(/Plain-English claim/i)
    const numberInputs = screen.getAllByRole('spinbutton')
    const [bondAmtInput, livenessInput] = numberInputs

    await userEvent.type(cidInput, '0x' + 'c'.repeat(64))
    await userEvent.type(bondAddrInput, '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582')
    await userEvent.type(bondAmtInput, '5000000')   // 5 USDC (6-dec raw)
    await userEvent.clear(livenessInput)
    await userEvent.type(livenessInput, '7200')
    await userEvent.type(claimArea, 'ETH closes above 3000 on 2026-12-31')

    await userEvent.click(screen.getByRole('button', { name: /^registerCondition$/i }))

    expect(umaStub.registerCondition).toHaveBeenCalledTimes(1)
    const [conditionId, claimBytes, bondCurrency, bondAmount, liveness] =
      umaStub.registerCondition.mock.calls[0]
    expect(conditionId).toBe('0x' + 'c'.repeat(64))
    // claimBytes should be a Uint8Array of the UTF-8 encoded text.
    expect(claimBytes).toBeInstanceOf(Uint8Array)
    expect(new TextDecoder().decode(claimBytes)).toBe('ETH closes above 3000 on 2026-12-31')
    expect(bondCurrency).toBe('0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582')
    expect(bondAmount).toBe(5000000n)
    expect(liveness).toBe(7200n)
  })

  it('Chainlink Functions: registerCondition forwards CBOR + numeric args', async () => {
    render(<OracleAdaptersTab {...defaultProps} />)
    await userEvent.click(screen.getByRole('tab', { name: /chainlink functions/i }))

    const cidInput        = screen.getAllByPlaceholderText(/0x \+ 64 hex chars/i)[0]
    const sourceHashInput = screen.getAllByPlaceholderText(/keccak256 of JS source/i)[0]
    const donIdInput      = screen.getAllByPlaceholderText(/0x66756e/i)[0]
    const encodedInput    = screen.getByPlaceholderText(/CBOR-encoded Functions request/i)
    const numberInputs    = screen.getAllByRole('spinbutton')

    const subscriptionInput = numberInputs[0]
    const gasLimitInput     = numberInputs[1]

    await userEvent.type(cidInput, '0x' + 'd'.repeat(64))
    await userEvent.type(sourceHashInput, '0x' + 'e'.repeat(64))
    await userEvent.type(donIdInput,
      '0x66756e2d706f6c79676f6e2d616d6f792d310000000000000000000000000000')
    await userEvent.type(subscriptionInput, '42')
    await userEvent.clear(gasLimitInput)
    await userEvent.type(gasLimitInput, '300000')
    await userEvent.clear(encodedInput)
    await userEvent.type(encodedInput, '0xdeadbeef')

    await userEvent.click(screen.getByRole('button', { name: /^registerCondition$/i }))

    expect(functionsStub.registerCondition).toHaveBeenCalledTimes(1)
    const [conditionId, encodedRequest, sourceHash, subscriptionId, gasLimit, donId] =
      functionsStub.registerCondition.mock.calls[0]
    expect(conditionId).toBe('0x' + 'd'.repeat(64))
    expect(encodedRequest).toBe('0xdeadbeef')
    expect(sourceHash).toBe('0x' + 'e'.repeat(64))
    expect(subscriptionId).toBe(42n)
    expect(gasLimit).toBe(300000)
    expect(donId).toBe('0x66756e2d706f6c79676f6e2d616d6f792d310000000000000000000000000000')
  })

  it('disables all submit buttons when pendingTx is true', () => {
    render(<OracleAdaptersTab {...defaultProps} pendingTx />)
    const buttons = screen.getAllByRole('button').filter(b => /setFeedAllowed|registerCondition|linkMarket/.test(b.textContent))
    expect(buttons.length).toBeGreaterThan(0)
    for (const b of buttons) expect(b).toBeDisabled()
  })
})
