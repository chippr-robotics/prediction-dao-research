/**
 * Which rail signs a custody write on THIS chain, and can it run at all?
 *
 * Custody actions used to branch straight on `loginMethod === 'passkey'`. That is the one thing
 * `WalletContext` says not to do — "`loginMethod` is INFORMATIONAL ONLY (signing ceremony
 * differs); identity, gating, and screening always key off `address` — no feature may branch on
 * it" — and it produced a real refusal: on Ethereum Classic and Mordor there is no bundler, so the
 * passkey UserOp rail cannot run, and every approve/execute/cancel died inside `sendPasskeyBatch`
 * with an error about chain support that the member never asked a question to receive.
 *
 * A wallet that holds a key does not have that problem. An injected wallet, a Ledger, or an
 * unlocked recovered key signs a Safe `approveHash` natively and pays the fee in the chain's own
 * currency, so it works on every EVM network the vault lives on — ETC included. Nothing about the
 * member's LOGIN should take that away from them.
 *
 * So the rule is: **the rail is a property of the SIGNER, not of the login.** A signer, if present,
 * is used. The passkey rail is what you fall to when there is no key in the browser, and it is
 * offered only where it can actually submit. When neither can run, the refusal NAMES the chain and
 * what would fix it — a member told "Ethereum Classic needs a wallet that can sign there" can act
 * on that; one shown `ChainNotSupportedError` cannot.
 */

import { getPasskeySupport } from '../../config/passkeySupport'

export const RAILS = Object.freeze({
  /** An ethers signer — injected wallet, hardware device, or an unlocked recovered key. */
  SIGNER: 'signer',
  /** The spec-041/050 passkey UserOp rail, via `sendCalls`. Needs a bundler on this chain. */
  PASSKEY: 'passkey',
  /** Nothing here can sign. `reason` says why, in words a member can act on. */
  NONE: 'none',
})

/**
 * @param {object} args
 * @param {number|null} args.chainId          the chain the write will land on
 * @param {object|null} args.signer           an ethers signer, if the session has one
 * @param {string|null} args.loginMethod      'passkey' | 'injected' | 'walletconnect' | null
 * @param {string|null} [args.chainName]      display name, for the refusal sentence
 * @returns {{ rail: string, available: boolean, reason: string|null }}
 */
export function resolveWriteRail({ chainId, signer, loginMethod, chainName = null }) {
  // A key in hand beats everything. Deliberately checked BEFORE `loginMethod`: a member operating
  // with a hardware wallet or a recovered account has a signer that works on chains the passkey
  // rail has never reached, and routing them by how they logged in would throw that away.
  if (signer) return { rail: RAILS.SIGNER, available: true, reason: null }

  const where = chainName || (chainId != null ? `chain ${chainId}` : 'this network')

  if (loginMethod === 'passkey') {
    const support = getPasskeySupport(chainId)
    if (support.supported) return { rail: RAILS.PASSKEY, available: true, reason: null }
    // The honest half: passkey submission is genuinely unavailable here, and the way out is a
    // wallet that holds a key. Says what to do, not merely what failed.
    return {
      rail: RAILS.PASSKEY,
      available: false,
      reason:
        `Passkey transactions are not available on ${where}. Connect a wallet that can sign there ` +
        `— a browser wallet, a hardware wallet, or a recovered account — to act on this network.`,
    }
  }

  return {
    rail: RAILS.NONE,
    available: false,
    reason: `Connect a wallet to act on ${where}.`,
  }
}

/** Throwing form, for the action callbacks. Returns the rail when it can run. */
export function requireWriteRail(args) {
  const resolved = resolveWriteRail(args)
  if (!resolved.available) throw new Error(resolved.reason)
  return resolved
}
