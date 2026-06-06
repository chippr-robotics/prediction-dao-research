import { describe, it, expect, vi, afterEach } from 'vitest'

// The exposed-oracle set is computed at module load from VITE_ORACLE_MODELS, so we
// stub the env + reset modules + dynamically import to test each setting.
async function loadWagerDefaults(setting) {
  vi.resetModules()
  vi.unstubAllEnvs()
  if (setting !== undefined) vi.stubEnv('VITE_ORACLE_MODELS', setting)
  return import('../constants/wagerDefaults.js')
}

describe('oracle model exposure (VITE_ORACLE_MODELS)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('default (unset) exposes ONLY Polymarket — no Chainlink/UMA selectable (SC-001)', async () => {
    const m = await loadWagerDefaults(undefined)
    expect(m.EXPOSED_ORACLE_RESOLUTION_TYPES).toEqual([m.ResolutionType.Polymarket])
    expect(m.isOracleModelExposed(m.ResolutionType.Polymarket)).toBe(true)
    expect(m.isOracleModelExposed(m.ResolutionType.ChainlinkDataFeed)).toBe(false)
    expect(m.isOracleModelExposed(m.ResolutionType.ChainlinkFunctions)).toBe(false)
    expect(m.isOracleModelExposed(m.ResolutionType.UMA)).toBe(false)
    expect(m.SHOW_ALL_ORACLE_MODELS).toBe(false)
  })

  it("'polymarket-only' exposes ONLY Polymarket", async () => {
    const m = await loadWagerDefaults('polymarket-only')
    expect(m.EXPOSED_ORACLE_RESOLUTION_TYPES).toEqual([m.ResolutionType.Polymarket])
    expect(m.SHOW_ALL_ORACLE_MODELS).toBe(false)
  })

  it("'all' restores every oracle model — reversible (SC-004)", async () => {
    const m = await loadWagerDefaults('all')
    expect(m.EXPOSED_ORACLE_RESOLUTION_TYPES).toEqual([
      m.ResolutionType.Polymarket,
      m.ResolutionType.ChainlinkDataFeed,
      m.ResolutionType.ChainlinkFunctions,
      m.ResolutionType.UMA,
    ])
    expect(m.isOracleModelExposed(m.ResolutionType.UMA)).toBe(true)
    expect(m.SHOW_ALL_ORACLE_MODELS).toBe(true)
  })

  it('Polymarket is never hidden, even with an unknown setting value', async () => {
    const m = await loadWagerDefaults('garbage-value')
    expect(m.EXPOSED_ORACLE_RESOLUTION_TYPES).toEqual([m.ResolutionType.Polymarket])
  })

  it('display labels are preserved for hidden models — existing wagers still render/settle (SC-005/FR-006)', async () => {
    const m = await loadWagerDefaults('polymarket-only')
    // Display names + the oracle-type set are NOT filtered, so a Chainlink/UMA wager
    // still labels and is recognized as an oracle wager.
    expect(m.ResolutionTypeNames[m.ResolutionType.ChainlinkDataFeed]).toBeTruthy()
    expect(m.ResolutionTypeNames[m.ResolutionType.UMA]).toBe('UMA Optimistic Oracle')
    expect(m.ORACLE_RESOLUTION_TYPES.has(m.ResolutionType.UMA)).toBe(true)
  })
})
