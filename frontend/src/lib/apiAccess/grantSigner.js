/**
 * Typed-data signing seam for the member API (spec 095) — mirrors `lib/collectibles/orderSigner.js`.
 *
 * Two account kinds sign a capability grant, and they sign it differently:
 *
 *   · A CLASSIC wallet has an ethers signer and produces an ECDSA signature the gateway recovers.
 *   · A PASSKEY smart account has no key at all. `passkeyIntentSigner` computes the same EIP-712
 *     digest, wraps it in the account's `replaySafeHash`, runs the WebAuthn ceremony, and returns
 *     the ERC-1271 envelope. The gateway's second verification leg asks the ACCOUNT whether it
 *     stands behind the bytes (`isValidSignature`), which is the only thing that can answer for a
 *     contract account.
 *
 * The ERC-1271 leg runs on the MEMBERSHIP REFERENCE CHAIN, because that is the one chain the
 * gateway reads for this token (the grant itself is chain-agnostic — it authorises reads that span
 * the build cohort). So the passkey adapter is pinned to the same chain, not to whatever chain the
 * wallet happens to be on: a signature produced against a different account deployment would verify
 * nowhere and the member would see their own key refused.
 *
 * The returned handle is deliberately shaped like `resolveOrderSigner`'s: `canSign` plus a `reason`
 * when it is false, so a surface renders an honest sentence instead of a dead disabled button.
 */
import { membershipChainId } from '../../config/networks'

/**
 * @param {object} args
 * @param {string} args.loginMethod       'passkey' | anything else
 * @param {object|null} args.signer       ethers signer, for classic sessions
 * @param {string|null} args.address
 * @param {number} [args.chainId]         override for the ERC-1271 chain (defaults to the
 *                                        membership reference chain, which is what the gateway reads)
 * @param {string} [args.credentialId]    passkey credential to pin the ceremony to; read from the
 *                                        session when absent
 * @param {Function} [args.makePasskeySigner] test seam; otherwise the passkey adapter is imported
 *                                        LAZILY, at ceremony time — it pulls in viem's
 *                                        account-abstraction module, which a classic wallet on the
 *                                        Settings tab has no reason to load
 * @returns {{canSign: boolean, kind: 'eoa'|'passkey'|'none', address?: string, reason?: string,
 *            sign?: (domain: object, types: object, message: object) => Promise<string>}}
 */
export function resolveGrantSigner({
  loginMethod,
  signer,
  address,
  chainId,
  credentialId,
  makePasskeySigner,
}) {
  if (!address) {
    return { canSign: false, kind: 'none', reason: 'Connect a wallet to create an API key.' }
  }

  if (loginMethod === 'passkey') {
    const referenceChain = chainId != null ? Number(chainId) : Number(membershipChainId())
    return {
      canSign: true,
      kind: 'passkey',
      address,
      async sign(domain, types, message) {
        // Read the credential lazily, at ceremony time, exactly as `sendCalls` does — the session is
        // the authority on which passkey this member signed in with, and pinning to it is what keeps
        // a different passkey that happens to share the address book out of the ceremony.
        let id = credentialId
        if (!id) {
          const { readSession } = await import('../../connectors/passkey')
          id = readSession()?.credentialId
        }
        const make = makePasskeySigner || (await import('../passkey/intentSigner')).passkeyIntentSigner
        const ps = make({ chainId: referenceChain, address, credentialId: id })
        return ps.signTypedData(domain, types, message)
      },
    }
  }

  if (!signer) {
    return { canSign: false, kind: 'eoa', reason: 'Connect a wallet to create an API key.' }
  }
  return {
    canSign: true,
    kind: 'eoa',
    address,
    sign: (domain, types, message) => signer.signTypedData(domain, types, message),
  }
}
