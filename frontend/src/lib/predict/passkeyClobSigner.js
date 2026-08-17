/**
 * Passkey CLOB signer (spec 057, FR-019) — adapts the spec-041 passkey smart account to the signer
 * duck type `@polymarket/clob-client` accepts (`getAddress()` + `_signTypedData(domain, types, value)`,
 * its "ethers signer" branch). Every signature the SDK asks for — the L1 ClobAuth attestation that
 * mints the member's API creds AND each CTF Exchange order — comes back as the account's ERC-1271
 * envelope: digest → account.replaySafeHash → one WebAuthn ceremony → SignatureWrapper bytes.
 *
 * The envelope construction lives ONCE, in `lib/passkey/intentSigner.js` (the spec-035 intent signer);
 * this module only resolves the credential + owner slot and re-shapes the interface. The CLOB
 * validates these bytes by asking the account itself (`isValidSignature`, signatureType 3 POLY_1271),
 * so maker == signer == funder == the passkey account, and the API key is registered against the
 * account address — never a separate EOA.
 *
 * Requires the account to be DEPLOYED on Polygon: `replaySafeHash` is read from the contract, and the
 * CLOB's ERC-1271 check needs code at the maker address. The first-trade approvals batch
 * (`passkeyApprovals.js`, routed through WalletContext.sendCalls) deploys the account as a side effect
 * of its first UserOp (spec 041 FR-007), so the trade flow orders approvals before credential minting.
 */

import { passkeyIntentSigner } from '../passkey/intentSigner'
import { knownCredentials, isTransactComplete } from '../passkey/credentials'
import { resolveOwnerIndex, CredentialRecordIncomplete } from '../passkey/smartAccount'

/**
 * Build the clob-client signer for a passkey session.
 *
 * @param {object} opts
 *   chainId       137 — Predict is Polygon-only (FR-021)
 *   address       the passkey smart-account address (maker/signer/funder)
 *   credentialId  the session credential (connectors/passkey readSession) — pins the ceremony
 *   deps          injectable knownCredentials / resolveOwnerIndex / passkeyIntentSigner for tests
 * @returns {Promise<{ getAddress: () => Promise<string>, _signTypedData: Function }>}
 */
export async function makePasskeyClobSigner({ chainId, address, credentialId, deps = {} }) {
  // Same credential resolution as the batch executor (sendBatch.js): pin to the session credential,
  // fall back to the address match for older sessions, and refuse incomplete records BEFORE any
  // ceremony with an actionable message.
  const book = (deps.knownCredentials ?? knownCredentials)(deps.storage)
  const credential =
    (credentialId && book.find((c) => c.credentialId === credentialId)) ||
    book.find((c) => c.address?.toLowerCase() === address?.toLowerCase())
  if (!credential) {
    throw new Error('No passkey credential is linked to this account on this browser — sign in again.')
  }
  if (!isTransactComplete(credential)) throw new CredentialRecordIncomplete()

  // The credential's REAL owner slot (spec 045 FR-009) — accounts that added controllers sign with
  // the correct index; counterfactual/unreadable accounts fall back to 0.
  const ownerIndex = await (deps.resolveOwnerIndex ?? resolveOwnerIndex)({
    chainId,
    accountAddress: address,
    credential,
    deps,
  })

  const inner = (deps.passkeyIntentSigner ?? passkeyIntentSigner)({
    chainId,
    address,
    credentialId: credential.credentialId,
    ownerIndex,
    deps,
  })

  return {
    getAddress: () => inner.getAddress(),
    // clob-client's ethers-signer branch: `_signTypedData(domain, types, value)`. The types map
    // arrives WITHOUT EIP712Domain (ethers convention), exactly what TypedDataEncoder.hash expects.
    _signTypedData: (domain, types, value) => inner.signTypedData(domain, types, value),
  }
}
