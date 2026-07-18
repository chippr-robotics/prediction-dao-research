/**
 * onrampClient (spec 060) — the SPA side of the /v1/onramp/* buy-crypto proxy. Verifies the
 * two-layer availability gate (capability + gateway), gateway-unset soft-fail, success mapping,
 * and error-code propagation into OnrampUnavailable (the hide/degrade signal).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  onrampGatewayUrl,
  onrampAvailable,
  fetchOnrampOptions,
  createOnrampSession,
  OnrampUnavailable,
} from '../../lib/onramp/onrampClient'

const BASE = 'https://gw.test'
const DEST = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const jsonRes = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

beforeEach(() => {
  import.meta.env.VITE_RELAYER_URL = BASE
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete import.meta.env.VITE_RELAYER_URL
})

describe('onrampGatewayUrl / onrampAvailable', () => {
  it('reads the env and strips a trailing slash', () => {
    import.meta.env.VITE_RELAYER_URL = `${BASE}/`
    expect(onrampGatewayUrl()).toBe(BASE)
  })

  it('is available only on onramp-capable mainnets (137, 1) with a gateway configured', () => {
    expect(onrampAvailable(137)).toBe(true)
    expect(onrampAvailable(1)).toBe(true)
  })

  it('is unavailable on testnets and the ETC family even with a gateway (static capability)', () => {
    for (const chainId of [80002, 61, 63, 11155111, 1337]) {
      expect(onrampAvailable(chainId)).toBe(false)
    }
  })

  it('is unavailable everywhere when no gateway is configured (config-off => zero UI)', () => {
    delete import.meta.env.VITE_RELAYER_URL
    expect(onrampAvailable(137)).toBe(false)
    expect(onrampAvailable(1)).toBe(false)
  })
})

describe('fetchOnrampOptions', () => {
  it('returns the availability payload on success', async () => {
    fetch.mockResolvedValueOnce(jsonRes({ chainId: 137, available: true, assets: ['MATIC', 'USDC'], defaultAsset: 'USDC' }))
    const r = await fetchOnrampOptions(137)
    expect(r).toMatchObject({ available: true, defaultAsset: 'USDC' })
    expect(fetch.mock.calls[0][0]).toBe(`${BASE}/v1/onramp/options?chainId=137`)
  })

  it('maps gateway error envelopes onto OnrampUnavailable with the code', async () => {
    fetch.mockResolvedValueOnce(jsonRes({ error: { code: 'onramp_unconfigured', reason: 'off' } }, 503))
    await expect(fetchOnrampOptions(137)).rejects.toMatchObject({ name: 'OnrampUnavailable', code: 'onramp_unconfigured' })
  })

  it('soft-fails when the gateway is unconfigured', async () => {
    delete import.meta.env.VITE_RELAYER_URL
    await expect(fetchOnrampOptions(137)).rejects.toMatchObject({ code: 'unconfigured' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('maps transport failures onto network_error', async () => {
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(fetchOnrampOptions(137)).rejects.toMatchObject({ code: 'network_error' })
  })
})

describe('createOnrampSession', () => {
  it('POSTs the destination and returns the hosted URL', async () => {
    fetch.mockResolvedValueOnce(jsonRes({ url: 'https://pay.coinbase.com/buy/select-asset?sessionToken=t' }))
    const r = await createOnrampSession({ address: DEST, chainId: 137, asset: 'USDC' })
    expect(r.url).toContain('pay.coinbase.com')
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(`${BASE}/v1/onramp/session`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ address: DEST, chainId: 137, asset: 'USDC' })
  })

  it('propagates every refusal (screened, quota, killswitch) as OnrampUnavailable', async () => {
    for (const [code, status] of [
      ['screened', 403],
      ['quota_exceeded', 429],
      ['killswitch_active', 503],
      ['unsupported_asset', 400],
    ]) {
      fetch.mockResolvedValueOnce(jsonRes({ error: { code, reason: 'no' } }, status))
      await expect(createOnrampSession({ address: DEST, chainId: 137, asset: 'USDC' })).rejects.toMatchObject({ code })
    }
  })

  it('all failures are instances of OnrampUnavailable (single degrade path)', async () => {
    fetch.mockResolvedValueOnce(jsonRes({}, 500))
    await expect(createOnrampSession({ address: DEST, chainId: 137, asset: 'USDC' })).rejects.toBeInstanceOf(OnrampUnavailable)
  })
})
