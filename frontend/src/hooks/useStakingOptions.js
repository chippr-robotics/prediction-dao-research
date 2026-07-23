/**
 * useStakingOptions (spec 065, US1) — the curated staking options across every
 * staking-enabled network (chain 1 at launch), normalized into one list. Like
 * the Earn lending list, network selection is transparent: each option carries
 * its chainId and the UI badges it; submitting handles any network switch.
 *
 * Options come from config (Lido + sPOL liquid, plus the curated validator
 * allowlist for delegated). Live enrichment — Lido APR, sPOL rate/TVL/fee,
 * validator commission/status — is best-effort and degrades to null ("—")
 * without hiding the option (constitution III). The Polygon staking API only
 * decorates allowlisted validators; it never expands the list (FR-008).
 *
 * Status: 'loading' | 'ready' | 'unavailable'. A hard failure to build the base
 * list is 'unavailable' (staking disabled) — never stale numbers as truth.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NETWORKS, getStakingNetworks } from '../config/networks'
import { POL_TOKEN_L1 } from '../config/staking'
import { makeReadProvider } from '../utils/rpcProvider'
import { fetchLidoApr, readLidoPosition } from '../lib/staking/lidoStaking'
import { readSpolTvl, readSpolRewardFee } from '../lib/staking/spolStaking'
import { fetchValidatorDecoration, unbondingLabel, readStakeManagerTiming } from '../lib/staking/polygonDelegation'

/** Build the immediate (config-only) option list for one staking network. */
export function buildBaseOptions(chainId, config) {
  const options = []
  for (const liquid of config.liquid || []) {
    options.push({
      id: `liquid:${liquid.kind}`,
      chainId,
      model: 'liquid',
      providerKind: liquid.kind,
      asset: liquid.asset,
      provider: liquid.provider,
      lstSymbol: liquid.lstSymbol,
      instantExit: Boolean(liquid.unbonding?.instantExit),
      contracts: liquid.contracts,
      referral: liquid.referral,
      unbondingLabel: liquid.unbonding?.kind === 'queue' ? null : '~2–4 days',
      rewardRateApr: null,
      totalStaked: { raw: null, usd: null },
      commissionPct: null,
      validatorName: null,
    })
  }
  const del = config.delegated
  if (del) {
    for (const v of del.validators || []) {
      options.push({
        id: `delegated:${v.validatorId}`,
        chainId,
        model: 'delegated',
        providerKind: 'validator-share',
        asset: del.asset,
        provider: del.provider,
        validatorId: v.validatorId,
        validatorName: v.name,
        validatorShare: v.validatorShare,
        stakeManager: del.stakeManager,
        lstSymbol: null,
        instantExit: false,
        unbondingLabel: null,
        rewardRateApr: null,
        totalStaked: { raw: null, usd: null },
        commissionPct: null,
      })
    }
  }
  return options
}

export function useStakingOptions() {
  const stakingChainIds = useMemo(() => getStakingNetworks().map((net) => net.chainId), [])

  const [options, setOptions] = useState([])
  const [status, setStatus] = useState('loading')
  const reqIdRef = useRef(0)

  const load = useCallback(async () => {
    if (stakingChainIds.length === 0) {
      setOptions([])
      setStatus('unavailable')
      return
    }
    const reqId = ++reqIdRef.current
    setStatus('loading')
    try {
      const all = []
      for (const chainId of stakingChainIds) {
        const config = NETWORKS[chainId].staking
        const base = buildBaseOptions(chainId, config)
        let provider
        try {
          provider = makeReadProvider(NETWORKS[chainId].rpcUrl, chainId)
        } catch {
          provider = null
        }

        // Best-effort enrichment — every call degrades to null on failure.
        const lidoApr = await fetchLidoApr(config.liquid?.find((l) => l.kind === 'lido')?.aprApi)
        const spol = config.liquid?.find((l) => l.kind === 'spol')
        let spolTvl = null
        let spolFeeBps = null
        if (spol && provider) {
          spolTvl = await readSpolTvl({ provider, contracts: spol.contracts })
          spolFeeBps = await readSpolRewardFee({ provider, contracts: spol.contracts })
        }
        let decoration = new Map()
        let unbondLabel = null
        if (config.delegated && provider) {
          decoration = await fetchValidatorDecoration(
            config.delegated.stakingApi,
            (config.delegated.validators || []).map((v) => v.validatorId),
          )
          try {
            const timing = await readStakeManagerTiming({ stakeManager: config.delegated.stakeManager, provider })
            unbondLabel = unbondingLabel(timing.withdrawalDelay)
          } catch {
            unbondLabel = null
          }
        }

        for (const opt of base) {
          if (opt.providerKind === 'lido') opt.rewardRateApr = lidoApr
          if (opt.providerKind === 'spol') {
            opt.totalStaked = { raw: spolTvl, usd: null }
            opt.rewardFeeBps = spolFeeBps
            opt.unbondingLabel = unbondLabel || opt.unbondingLabel
          }
          if (opt.providerKind === 'validator-share') {
            const d = decoration.get(opt.validatorId)
            if (d) {
              opt.commissionPct = d.commissionPct
              opt.totalStaked = { raw: d.totalStakedRaw, usd: null }
              opt.status = d.status
              opt.delegationEnabled = d.delegationEnabled
            }
            opt.unbondingLabel = unbondLabel || '~2–4 days'
          }
        }
        all.push(...base)
      }
      if (reqId !== reqIdRef.current) return
      setOptions(all)
      setStatus('ready')
    } catch {
      if (reqId !== reqIdRef.current) return
      setOptions([])
      setStatus('unavailable')
    }
  }, [stakingChainIds])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return useMemo(() => ({ options, status, refresh: load }), [options, status, load])
}

export { POL_TOKEN_L1, readLidoPosition }
export default useStakingOptions
