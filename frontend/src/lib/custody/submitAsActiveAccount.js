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
 */
export function buildActiveAccountSafeTx({ to, value = 0n, data = '0x', operation = 0, batch }, { nonce, multiSendCallOnly }) {
  if (Array.isArray(batch) && batch.length > 0) {
    const ms = encodeMultiSend(multiSendCallOnly, batch)
    return buildSafeTx({ to: ms.to, value: ms.value, data: ms.data, operation: ms.operation, nonce })
  }
  return buildSafeTx({ to, value, data, operation, nonce })
}

/**
 * @param {{to?:string,value?:bigint,data?:string,operation?:number,batch?:Array}} payload
 * @param {object} ctx — { mode:'personal'|'vault', signer, ... vault fields when mode==='vault' }
 * @returns {Promise<{kind:'sent',txHash:string}|{kind:'proposed',safeTxHash:string}>}
 */
export async function submitAsActiveAccount(payload, ctx) {
  if (ctx.mode === 'vault') {
    const { vaultAddress, chainId, hubAddress, signer, safeContracts } = ctx
    if (!hubAddress) throw new Error('Custody proposals are not configured on this network')
    if (!safeContracts) throw new Error('Custody is not available on this network')
    const safe = new Contract(vaultAddress, SAFE_ABI, signer)
    const nonce = await safe.nonce()
    const safeTx = buildActiveAccountSafeTx(payload, { nonce, multiSendCallOnly: safeContracts.multiSendCallOnly })
    const safeTxHash = computeSafeTxHash(vaultAddress, chainId, safeTx)
    await emitProposal({ hubAddress, safe: vaultAddress, safeTx, safeTxHash, signer })
    const approveTx = await safe.approveHash(safeTxHash)
    await approveTx.wait()
    return { kind: 'proposed', safeTxHash }
  }
  // personal mode — unchanged single-signer behaviour
  const sent = await ctx.signer.sendTransaction({
    to: payload.to,
    value: payload.value ?? 0n,
    data: payload.data ?? '0x',
  })
  return { kind: 'sent', txHash: sent.hash ?? sent }
}
