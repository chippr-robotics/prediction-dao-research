/**
 * Shared signed-message fixtures (Protect ▸ Verify).
 *
 * ONE source for every suite that needs a real signature — the lib tests, the component tests and
 * the Playwright capture harness (`scripts/ui/capture-verify.mjs`) all import from here. A
 * hand-pasted signature hex drifts from the message it was made for the moment either is edited,
 * and a verification suite whose fixture has drifted passes for the wrong reason.
 *
 * The signatures are COMPUTED here from a well-known test key rather than pasted, so the message
 * and its signature cannot disagree. Hardhat account #0 — a published key, never funded, never
 * used for anything but tests.
 *
 * Node-resolvable on purpose (no extensionless app imports, no vite-only syntax) so the capture
 * script can import it directly — see the spec-075 rule about shared code and plain Node.
 */

import { ethers } from 'ethers'

/** Hardhat account #0. PUBLIC test key — deliberately not a secret, never to be funded. */
export const SIGNER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
export const SIGNER_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

/** A second party, for the "signed by somebody else" case. */
export const OTHER_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

/** A passkey smart account (spec 041) — signs via ERC-1271, so it is checked on ONE chain. */
export const CONTRACT_ACCOUNT = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
export const CONTRACT_ACCOUNT_CHAIN_ID = 137

const wallet = new ethers.Wallet(SIGNER_KEY)

/** The plain case: a challenge somebody asked the member to sign, verbatim. */
export const MESSAGE = 'FairWins verification: I control this account.\nNonce: 8f31c0'

/** Whitespace and Unicode survive the round trip — the regression that proves nothing normalizes. */
export const AWKWARD_MESSAGE = '  leading and trailing space  \n\ttabbed — ünïcode ✓\n'

export const SIGNATURE = wallet.signingKey.sign(ethers.hashMessage(MESSAGE)).serialized
export const AWKWARD_SIGNATURE = wallet.signingKey.sign(ethers.hashMessage(AWKWARD_MESSAGE)).serialized

/**
 * Opaque contract-account signature bytes. NOT ECDSA and NOT 65 bytes — verification must fall
 * through to the on-chain leg rather than trying (and failing) to recover an address from it.
 */
export const ERC1271_SIGNATURE = `0x${'ab'.repeat(200)}`

/** A well-formed EIP-191 document, as the Sign panel emits it. */
export const EIP191_DOCUMENT = {
  format: 'fairwins-signed-message/1',
  address: SIGNER_ADDRESS,
  chainId: 137,
  scheme: 'eip191',
  message: MESSAGE,
  signature: SIGNATURE,
  signedAt: '2026-08-13T12:00:00.000Z',
}

/** The contract-account counterpart — the chain is load-bearing here, not provenance. */
export const ERC1271_DOCUMENT = {
  format: 'fairwins-signed-message/1',
  address: CONTRACT_ACCOUNT,
  chainId: CONTRACT_ACCOUNT_CHAIN_ID,
  scheme: 'erc1271',
  message: MESSAGE,
  signature: ERC1271_SIGNATURE,
  signedAt: '2026-08-13T12:05:00.000Z',
}

export const EIP191_DOCUMENT_JSON = JSON.stringify(EIP191_DOCUMENT, null, 2)
export const ERC1271_DOCUMENT_JSON = JSON.stringify(ERC1271_DOCUMENT, null, 2)

/**
 * Minimal provider stub for the ERC-1271 leg.
 *
 * @param {object} opts
 *   code      what `getCode` returns ('0x' = a plain account)
 *   answer    'magic' | 'wrong' | 'empty' — what isValidSignature returns
 *   failCode  getCode rejects (an unreachable node)
 *   failCall  call rejects (a revert, or an unreachable node)
 */
export function stubProvider({ code = '0x60006000', answer = 'magic', failCode = false, failCall = false } = {}) {
  return {
    async getCode() {
      if (failCode) throw new Error('network unreachable')
      return code
    },
    async call() {
      if (failCall) throw new Error('execution reverted')
      if (answer === 'empty') return '0x'
      if (answer === 'wrong') return `0xffffffff${'0'.repeat(56)}`
      return `0x1626ba7e${'0'.repeat(56)}`
    },
  }
}
