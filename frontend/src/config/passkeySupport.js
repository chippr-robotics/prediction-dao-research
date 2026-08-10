/**
 * The single answer to "can a member use a passkey account on this chain?" (spec 041 FR-004/FR-022).
 *
 * Passkey support is not one fact, it is two, and they live in different files:
 *
 *   1. **Submission config** — `NETWORKS[chainId].passkey`, built from `VITE_BUNDLER_URLS_<NET>`
 *      at build time. Without a bundler nothing will relay the UserOp.
 *   2. **The deployed account stack** — `entryPoint` + `accountFactory` for that chain, synced
 *      into `config/contracts.js` from `deployments/`. Without the factory there is no account to
 *      create and `deriveAddress` has nothing to call.
 *
 * Either half alone is a lie. A bundler URL with no factory renders a passkey login button that
 * fails at account creation; a deployed factory with no bundler renders one that fails at submit.
 * `capabilities.passkeyAccounts` can only see half of it — `networks.js` deliberately does not
 * import `contracts.js` (that direction is the import cycle) — so this module exists to join them,
 * and UI surfaces MUST gate on `isPasskeySupported` rather than on the capability flag.
 *
 * `smartAccount.js#requirePasskeySupport` performs the same check at the transaction boundary and
 * throws `ChainNotSupportedError`. That stays: this module keeps the UI honest, that one keeps a
 * misconfiguration from ever reaching a signature.
 *
 * Turning a new network on is therefore a two-step ops change with NO code change:
 *   1. `npx hardhat run scripts/deploy/deploy-account-stack.js --network <net>` then
 *      `npm run sync:frontend-contracts -- --network <net> --chainId <id>`
 *   2. set `VITE_BUNDLER_URLS_<NET>` (and optionally `VITE_SPONSOR_PAYMASTER_<NET>`) and rebuild
 * `node scripts/ops/verify-passkey-support.js` reports where each network stands.
 */

import { getContractAddressForChain } from './contracts'
import { getNetwork, NETWORKS } from './networks'
import { isBitcoinNetworkId } from './bitcoinNetworks'

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const ZERO = '0x0000000000000000000000000000000000000000'

function deployedAddress(chainId, name) {
  try {
    const addr = getContractAddressForChain(name, chainId)
    return typeof addr === 'string' && ADDRESS_RE.test(addr) && addr !== ZERO ? addr : null
  } catch {
    return null
  }
}

/**
 * Full support detail for a chain, including WHY it is unsupported so callers can say something
 * truthful instead of a generic "not available".
 *
 * @param {number|string} chainId
 * @returns {{ supported: boolean, reason: string|null, bundlerConfigured: boolean,
 *             stackDeployed: boolean, entryPoint: string|null, accountFactory: string|null,
 *             sponsored: boolean }}
 */
export function getPasskeySupport(chainId) {
  const none = {
    supported: false,
    bundlerConfigured: false,
    stackDeployed: false,
    entryPoint: null,
    accountFactory: null,
    sponsored: false,
  }

  // Boundary type guard (spec 061): non-EVM string ids must never reach getNetwork /
  // getContractAddressForChain, whose fallbacks would answer for the DEFAULT network.
  if (isBitcoinNetworkId(chainId)) {
    return { ...none, reason: 'Passkey accounts are an EVM feature; this network is not EVM.' }
  }

  // getNetwork falls back to the default network for an unknown id, which would let an
  // unsupported chain inherit Polygon's answer. Check membership explicitly.
  if (chainId == null || !NETWORKS[chainId]) {
    return { ...none, reason: 'Not available on this network' }
  }

  const net = getNetwork(chainId)
  const entryPoint = deployedAddress(chainId, 'entryPoint')
  const accountFactory = deployedAddress(chainId, 'accountFactory')
  const stackDeployed = Boolean(entryPoint && accountFactory)
  const bundlerConfigured = Boolean(net?.capabilities?.passkeyAccounts)
  const sponsored = Boolean(net?.passkey?.sponsorPaymasterUrl)

  if (!stackDeployed && !bundlerConfigured) {
    return { ...none, reason: 'Not available on this network', entryPoint, accountFactory }
  }
  if (!stackDeployed) {
    return {
      supported: false,
      reason: 'Passkey accounts are not deployed on this network yet',
      bundlerConfigured,
      stackDeployed,
      entryPoint,
      accountFactory,
      sponsored,
    }
  }
  if (!bundlerConfigured) {
    return {
      supported: false,
      reason: 'Passkey transactions are not enabled on this network yet',
      bundlerConfigured,
      stackDeployed,
      entryPoint,
      accountFactory,
      sponsored,
    }
  }
  return {
    supported: true,
    reason: null,
    bundlerConfigured,
    stackDeployed,
    entryPoint,
    accountFactory,
    sponsored,
  }
}

/** Boolean form of {@link getPasskeySupport} — the gate every UI surface should use. */
export function isPasskeySupported(chainId) {
  return getPasskeySupport(chainId).supported
}

/**
 * Every chain where a member can use a passkey account today, mainnets first (mirrors how the
 * network switcher orders things, so production reads before test networks).
 */
export function getPasskeyNetworks() {
  return Object.values(NETWORKS)
    .filter((n) => isPasskeySupported(n.chainId))
    .sort((a, b) => Number(a.isTestnet) - Number(b.isTestnet) || a.chainId - b.chainId)
}

export default isPasskeySupported
