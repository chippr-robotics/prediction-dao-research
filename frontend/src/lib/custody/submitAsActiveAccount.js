// Spec 043 (US3) — the single seam every money-moving flow routes its final {to,value,data} through. In
// personal mode it sends normally; in vault mode it turns the action into a threshold-gated vault proposal
// (emit preimage to the hub + record the proposer's on-chain approval) and returns a pending proposal instead
// of executing. Not-yet-approved actions therefore live only in the vault queue (FR-022b).

import { Contract } from 'ethers'
import { SAFE_ABI } from '../../abis/Safe'
import { buildSafeTx, computeSafeTxHash, encodeMultiSend } from './vaultTransaction'
import { emitProposal } from './proposalHub'

/**
 * Pure: turn an action payload into the SafeTx to propose. A `batch` (array of {to,value,data}) is wrapped in
 * a MultiSendCallOnly delegatecall (e.g. approve + action); otherwise the single call is used directly.
 *
 * Issue #1368 — a ONE-leg batch is emitted as that leg's plain CALL. Wrapping a single call in
 * MultiSend produced an identical on-chain effect through a delegatecall, which both policy guards
 * deny for a vault with an active policy (`SafePolicyGuardV2._preCheck`). Nothing is gained by the
 * wrapper and a guarded vault is refused at execution for no reason.
 *
 * An explicit `payload.nonce` overrides the vault's current nonce, so a batch that has to be split
 * into N proposals can be queued at CONSECUTIVE nonces. Same-nonce proposals are mutually
 * exclusive on a Safe — executing one invalidates the others — so a split without this would leave
 * exactly one of N payments executable.
 */
export function buildActiveAccountSafeTx(
  { to, value = 0n, data = '0x', operation = 0, batch, nonce: nonceOverride },
  { nonce, multiSendCallOnly },
) {
  const at = nonceOverride ?? nonce
  if (Array.isArray(batch) && batch.length === 1) {
    const only = batch[0]
    return buildSafeTx({ to: only.to, value: only.value ?? 0n, data: only.data ?? '0x', operation: 0, nonce: at })
  }
  if (Array.isArray(batch) && batch.length > 0) {
    const ms = encodeMultiSend(multiSendCallOnly, batch)
    return buildSafeTx({ to: ms.to, value: ms.value, data: ms.data, operation: ms.operation, nonce: at })
  }
  return buildSafeTx({ to, value, data, operation, nonce: at })
}

/**
 * @param {{to?:string,value?:bigint,data?:string,operation?:number,batch?:Array}} payload
 * @param {object} ctx — { mode:'personal'|'vault', signer, ... vault fields when mode==='vault' }
 * @returns {Promise<{kind:'sent',txHash:string}|{kind:'proposed',safeTxHash:string}>}
 */
export async function submitAsActiveAccount(payload, ctx) {
  if (ctx.mode === 'vault') {
    const { vaultAddress, chainId, hubAddress, signer, provider, safeContracts } = ctx
    if (!hubAddress) throw new Error('Custody proposals are not configured on this network')
    if (!safeContracts) throw new Error('Custody is not available on this network')
    // Guard against a wrong-network footgun: the hash is chain-scoped and approveHash lands on whatever chain
    // the signer is connected to, so refuse unless the signer/provider is actually on the vault's chain.
    const netSource = provider || signer?.provider
    if (netSource?.getNetwork) {
      const net = await netSource.getNetwork()
      if (Number(net.chainId) !== Number(chainId)) {
        throw new Error("Wallet is not connected to the vault's network")
      }
    }
    const safe = new Contract(vaultAddress, SAFE_ABI, signer)
    // An explicit nonce queues an ordered follow-up (issue #1368's split shape); otherwise the
    // vault's current nonce is read, exactly as before.
    const nonce = payload.nonce ?? (await safe.nonce())
    const safeTx = buildActiveAccountSafeTx(payload, { nonce, multiSendCallOnly: safeContracts.multiSendCallOnly })
    const safeTxHash = computeSafeTxHash(vaultAddress, chainId, safeTx)
    await emitProposal({ hubAddress, safe: vaultAddress, safeTx, safeTxHash, signer })
    const approveTx = await safe.approveHash(safeTxHash)
    await approveTx.wait()
    return { kind: 'proposed', safeTxHash, nonce: Number(nonce) }
  }
  // Single-signer mode (personal wallet, or a recovered legacy account whose
  // unlocked signer is passed in). A `batch` (e.g. [approve, swap]) is sent as
  // SEQUENTIAL signed transactions, each awaited to inclusion so ordering holds
  // (the approve must be mined before the swap that relies on the allowance).
  // An EOA cannot atomically batch, so this is the honest equivalent.
  if (Array.isArray(payload.batch) && payload.batch.length > 0) {
    let lastHash = null
    for (const call of payload.batch) {
      const tx = await ctx.signer.sendTransaction({
        to: call.to,
        value: call.value ?? 0n,
        data: call.data ?? '0x',
      })
      if (tx?.wait) await tx.wait()
      lastHash = tx?.hash ?? tx
    }
    return { kind: 'sent', txHash: lastHash }
  }
  const sent = await ctx.signer.sendTransaction({
    to: payload.to,
    value: payload.value ?? 0n,
    data: payload.data ?? '0x',
  })
  return { kind: 'sent', txHash: sent.hash ?? sent }
}
