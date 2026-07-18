import { describe, it, expect } from 'vitest'
import { parseGatewayStatus } from '../hooks/useGatewayStatus'

describe('parseGatewayStatus', () => {
  it('returns null for non-objects', () => {
    expect(parseGatewayStatus(null)).toBeNull()
    expect(parseGatewayStatus('nope')).toBeNull()
    expect(parseGatewayStatus(undefined)).toBeNull()
  })

  it('parses a full operator-telemetry payload', () => {
    const parsed = parseGatewayStatus({
      status: 'ok',
      killSwitch: false,
      chains: {
        137: { rpc: 'up', gasWalletRunwayHrs: 72.4, paymasterDepositRunwayHrs: 120 },
        63: { rpc: 'down' },
      },
    })
    expect(parsed.ok).toBe(true)
    expect(parsed.killSwitch).toBe(false)
    expect(parsed.hasOperatorTelemetry).toBe(true)
    const polygon = parsed.chains.find((c) => c.chainId === 137)
    expect(polygon).toMatchObject({
      rpc: 'up',
      gasWalletRunwayHrs: 72.4,
      paymasterDepositRunwayHrs: 120,
    })
    const mordor = parsed.chains.find((c) => c.chainId === 63)
    expect(mordor).toMatchObject({
      rpc: 'down',
      gasWalletRunwayHrs: null,
      paymasterDepositRunwayHrs: null,
    })
  })

  it('flags the public (unauthenticated) subset — no runway fields', () => {
    const parsed = parseGatewayStatus({
      status: 'ok',
      killSwitch: false,
      chains: { 137: { rpc: 'up' } },
    })
    expect(parsed.hasOperatorTelemetry).toBe(false)
  })

  it('surfaces an active killswitch and non-ok status', () => {
    const parsed = parseGatewayStatus({ status: 'degraded', killSwitch: true, chains: {} })
    expect(parsed.ok).toBe(false)
    expect(parsed.killSwitch).toBe(true)
    expect(parsed.chains).toEqual([])
  })

  it('treats unknown rpc values as down (fail-visible)', () => {
    const parsed = parseGatewayStatus({
      status: 'ok',
      chains: { 137: { rpc: 'weird' } },
    })
    expect(parsed.chains[0].rpc).toBe('down')
  })
})
