/**
 * Per-chain read providers with ordered failover (FR-007: >=2 independent endpoints, no single
 * provider is a hard dependency). The gateway only READS (sanctions screen, gas estimate,
 * health probe, balance) — all writes go through the engine, which has its own rpc_urls failover.
 *
 * ETC/Mordor (61/63): batchMaxCount: 1 — their Caddy-fronted endpoints return batch responses
 * ethers v6 cannot decode (mirrors frontend/src/utils/rpcProvider.js NO_BATCH_CHAIN_IDS).
 */
import { ethers } from 'ethers'

function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * A minimal failover wrapper exposing only the read methods the gateway uses.
 * Tries endpoints in configured order; first success wins; throws the last error if all fail.
 */
export function makeFailoverProvider(chainCfg, { timeoutMs = 4000 } = {}) {
  const inner = chainCfg.rpcUrls.map(
    (url) =>
      new ethers.JsonRpcProvider(url, chainCfg.chainId, {
        staticNetwork: ethers.Network.from(chainCfg.chainId),
        ...(chainCfg.noBatch ? { batchMaxCount: 1 } : {}),
      })
  )

  async function attempt(fnName, args) {
    let lastErr
    for (const provider of inner) {
      try {
        return await withTimeout(provider[fnName](...args), timeoutMs, `${fnName}@chain${chainCfg.chainId}`)
      } catch (e) {
        lastErr = e
      }
    }
    throw lastErr ?? new Error(`no RPC endpoints configured for chain ${chainCfg.chainId}`)
  }

  return {
    chainId: chainCfg.chainId,
    call: (tx) => attempt('call', [tx]),
    estimateGas: (tx) => attempt('estimateGas', [tx]),
    getFeeData: () => attempt('getFeeData', []),
    getBalance: (address) => attempt('getBalance', [address]),
    getBlockNumber: () => attempt('getBlockNumber', []),
  }
}

/** Build the default provider map { chainId -> failover provider }. Injectable in tests. */
export function buildProviders(config) {
  const providers = {}
  for (const chainId of config.enabledChainIds) {
    providers[chainId] = makeFailoverProvider(config.chains[chainId], { timeoutMs: config.rpcTimeoutMs })
  }
  return providers
}
