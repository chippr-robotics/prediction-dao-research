// Spec 043 — Safe (v1.4.1) vault create/load/read. Deploys a new Safe via SafeProxyFactory.createProxyWithNonce
// (deterministic CREATE2 address, previewable before signing), and reads live vault state (owners, threshold,
// nonce, version, native balance). No Safe Transaction Service involved. See contracts/vault-transactions.md.

import {
  AbiCoder,
  Contract,
  Interface,
  ZeroAddress,
  getAddress,
  getCreate2Address,
  keccak256,
  solidityPackedKeccak256,
} from 'ethers'
import { SAFE_ABI } from '../../abis/Safe'
import { SAFE_PROXY_FACTORY_ABI, SAFE_SETUP_ABI } from '../../abis/SafeProxyFactory'
import { getSafeContracts } from '../../config/safeContracts'
import { getProvider } from '../../utils/blockchainService'

const setupIface = new Interface(SAFE_SETUP_ABI)
const factoryIface = new Interface(SAFE_PROXY_FACTORY_ABI)

/**
 * Encode the Safe.setup initializer (no gas refunds). By default there is no setup delegatecall —
 * the encoding is byte-identical to the original policy-less initializer (spec 049 FR-010/SC-007).
 * Pass `policySetup` (`{setupTo, setupData}` from spec 049's `buildEnablePolicySetup`) to attach a
 * policy guard atomically at creation.
 */
export function buildSetupInitializer(owners, threshold, fallbackHandler, policySetup = {}) {
  const { setupTo = ZeroAddress, setupData = '0x' } = policySetup || {}
  const cleanOwners = owners.map((o) => getAddress(o))
  return setupIface.encodeFunctionData('setup', [
    cleanOwners,
    BigInt(threshold),
    getAddress(setupTo), // to (setup delegatecall target; ZeroAddress = none)
    setupData, // data (setup delegatecall payload; '0x' = none)
    getAddress(fallbackHandler),
    ZeroAddress, // paymentToken
    0n, // payment
    ZeroAddress, // paymentReceiver
  ])
}

/** Validate owners + threshold (FR-005). Throws with a user-facing message on invalid input. */
export function validateVaultConfig(owners, threshold) {
  const seen = new Set()
  for (const o of owners) {
    let a
    try {
      a = getAddress(o)
    } catch {
      throw new Error(`Invalid owner address: ${o}`)
    }
    if (seen.has(a)) throw new Error(`Duplicate owner: ${a}`)
    seen.add(a)
  }
  if (owners.length === 0) throw new Error('At least one owner is required')
  const t = Number(threshold)
  if (!Number.isInteger(t) || t < 1) throw new Error('Threshold must be at least 1')
  if (t > owners.length) throw new Error('Threshold cannot exceed the number of owners')
}

/**
 * Pure CREATE2 computation matching SafeProxyFactory.createProxyWithNonce:
 * salt = keccak256(keccak256(initializer) ‖ saltNonce); initCode = proxyCreationCode ‖ abi.encode(singleton).
 * Separated out so it is deterministically unit-testable without a provider.
 * @returns {string} checksummed predicted address
 */
export function computeVaultAddress({ proxyFactory, singleton, initializer, saltNonce, creationCode }) {
  const salt = solidityPackedKeccak256(['bytes32', 'uint256'], [keccak256(initializer), BigInt(saltNonce)])
  // SafeProxyFactory appends the singleton to the proxy creation code as a single 32-byte word
  // (abi.encodePacked(creationCode, uint256(uint160(singleton)))). Encoding the address here yields the same
  // 32-byte left-padded word, so the CREATE2 preimage matches the on-chain factory exactly.
  const deploymentData =
    creationCode + AbiCoder.defaultAbiCoder().encode(['address'], [getAddress(singleton)]).slice(2)
  return getCreate2Address(getAddress(proxyFactory), salt, keccak256(deploymentData))
}

/**
 * Predict the CREATE2 address of a Safe created with createProxyWithNonce (reads proxyCreationCode on-chain).
 * @returns {Promise<string>} checksummed predicted address
 */
export async function predictVaultAddress({ chainId, initializer, saltNonce, provider }) {
  const safe = getSafeContracts(chainId)
  if (!safe) throw new Error(`Custody is not available on chain ${chainId}`)
  const reader = provider || getProvider(chainId)
  const factory = new Contract(safe.proxyFactory, SAFE_PROXY_FACTORY_ABI, reader)
  const creationCode = await factory.proxyCreationCode()
  return computeVaultAddress({
    proxyFactory: safe.proxyFactory,
    singleton: safe.singletonL2,
    initializer,
    saltNonce,
    creationCode,
  })
}

/**
 * Pure: build the createProxyWithNonce calldata for a new vault (no provider, no predicted address).
 * `policySetup` ({setupTo, setupData}, optional) attaches a policy guard at creation (spec 049 US1).
 * @returns {{ to:string, data:string, value:bigint, initializer:string }}
 */
export function buildCreateVaultCalldata({ chainId, owners, threshold, saltNonce, policySetup }) {
  validateVaultConfig(owners, threshold)
  const safe = getSafeContracts(chainId)
  if (!safe) throw new Error(`Custody is not available on chain ${chainId}`)
  const initializer = buildSetupInitializer(owners, threshold, safe.fallbackHandler, policySetup)
  const data = factoryIface.encodeFunctionData('createProxyWithNonce', [
    getAddress(safe.singletonL2),
    initializer,
    BigInt(saltNonce),
  ])
  return { to: getAddress(safe.proxyFactory), data, value: 0n, initializer }
}

/**
 * Build the createProxyWithNonce transaction plus the deterministic predicted address (reads
 * proxyCreationCode on-chain via `provider`).
 * @returns {{ to:string, data:string, value:bigint, predictedAddress:string }}
 */
export async function buildCreateVaultTx({ chainId, owners, threshold, saltNonce, policySetup, provider }) {
  const { to, data, value, initializer } = buildCreateVaultCalldata({ chainId, owners, threshold, saltNonce, policySetup })
  const predictedAddress = await predictVaultAddress({ chainId, initializer, saltNonce, provider })
  return { to, data, value, predictedAddress }
}

/**
 * Deploy a new vault. Sends createProxyWithNonce with `signer` and returns the deployed proxy address parsed
 * from the ProxyCreation event (falling back to the predicted address).
 */
export async function createVault({ signer, chainId, owners, threshold, saltNonce, policySetup }) {
  const tx = await buildCreateVaultTx({ chainId, owners, threshold, saltNonce, policySetup, provider: signer.provider })
  const sent = await signer.sendTransaction({ to: tx.to, data: tx.data, value: tx.value })
  const receipt = await sent.wait()
  let deployed = tx.predictedAddress
  for (const log of receipt.logs || []) {
    try {
      const parsed = factoryIface.parseLog(log)
      if (parsed?.name === 'ProxyCreation') {
        deployed = getAddress(parsed.args.proxy)
        break
      }
    } catch {
      /* not a factory log */
    }
  }
  return { address: deployed, txHash: sent.hash, predictedAddress: tx.predictedAddress }
}

/**
 * Load a vault's live on-chain state. Returns null-ish shape only when the address is not a Safe.
 * @returns {Promise<{address,chainId,owners,threshold,nonce,version,isSafe:boolean}>}
 */
export async function loadVault(address, chainId, provider) {
  const addr = getAddress(address)
  const reader = provider || getProvider(chainId)
  const code = await reader.getCode(addr)
  if (!code || code === '0x') {
    return { address: addr, chainId: Number(chainId), isSafe: false, reason: 'no-contract' }
  }
  const safe = new Contract(addr, SAFE_ABI, reader)
  try {
    const [owners, threshold, nonce] = await Promise.all([
      safe.getOwners(),
      safe.getThreshold(),
      safe.nonce(),
    ])
    let version = ''
    try {
      version = await safe.VERSION()
    } catch {
      /* older/foreign Safe without VERSION() */
    }
    if (!owners.length || threshold === 0n) {
      return { address: addr, chainId: Number(chainId), isSafe: false, reason: 'not-a-safe' }
    }
    return {
      address: addr,
      chainId: Number(chainId),
      isSafe: true,
      owners: owners.map((o) => getAddress(o)),
      threshold: Number(threshold),
      nonce: Number(nonce),
      version,
    }
  } catch {
    return { address: addr, chainId: Number(chainId), isSafe: false, reason: 'not-a-safe' }
  }
}

/** Read a vault's native-asset balance (token balances are layered in by the vault detail hook). */
export async function readVaultNativeBalance(address, chainId, provider) {
  const reader = provider || getProvider(chainId)
  return reader.getBalance(getAddress(address))
}

/** Whether a connected address is one of a loaded vault's owners (determines owner vs view-only). */
export function isVaultOwner(vault, account) {
  if (!vault?.isSafe || !account) return false
  const a = getAddress(account)
  return (vault.owners || []).some((o) => getAddress(o) === a)
}
