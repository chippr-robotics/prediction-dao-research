/**
 * Member API test helpers (spec 095) — real EIP-712 signatures, a membership-aware mock provider.
 *
 * Deliberately a SEPARATE file from helpers.js: nothing here is needed by any existing suite, and
 * the intent/pool helpers there are load-bearing for the money-path tests.
 *
 * The tokens these build are signed with a real `ethers.Wallet` against the real
 * `@fairwins/intent-types` tables, so a test that passes here proves the gateway accepts what the
 * SPA will actually produce — a hand-rolled fixture would only prove the gateway agrees with the
 * test file.
 */
import { ethers } from 'ethers'
import { MEMBER_API_DOMAIN, MEMBER_API_GRANT_TYPES, MEMBER_API_REVOCATION_TYPES, canonicalScopeString } from '@fairwins/intent-types'
import { TEST_NOW, wallet } from './helpers.js'

const abi = ethers.AbiCoder.defaultAbiCoder()

/** `MembershipManager.getMembership(address,bytes32)` — the tier + expiry read. */
export const GET_MEMBERSHIP_SELECTOR = ethers.id('getMembership(address,bytes32)').slice(0, 10)

export const ALL_SCOPES_V1 = [
  'assistant:chat',
  'build:intents',
  'read:fees',
  'read:membership',
  'read:profile',
  'read:wagers',
]

export const KEY_ID = '0x' + '11'.repeat(32)

const b64url = (input) =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/**
 * A read provider that answers the three calls the member API makes, routed BY SELECTOR so each can
 * fail independently — which is the whole point: "membership unreadable" and "screening
 * unavailable" are different states and must be provokable separately.
 *
 * @param {{
 *   tier?: number, membershipExpiresAt?: number, membershipError?: boolean,
 *   allowed?: boolean, screenError?: boolean,
 *   erc1271?: Record<string, 'magic'|'wrong'|'revert'|'empty'>,
 * }} [opts]
 */
export function memberApiProvider({
  tier = 3,
  membershipExpiresAt = TEST_NOW + 30 * 86_400,
  membershipError = false,
  allowed = true,
  screenError = false,
  erc1271 = {},
  blockNumber = 1,
  balanceWei = 10n ** 18n,
} = {}) {
  return {
    async call(tx) {
      const data = String(tx?.data ?? '')
      if (data.startsWith(GET_MEMBERSHIP_SELECTOR)) {
        if (membershipError) throw new Error('rpc unreachable')
        return abi.encode(['tuple(uint8,uint64,uint32,uint32,uint64)'], [[tier, membershipExpiresAt, 0, 0, 0]])
      }
      if (data.startsWith('0x1626ba7e')) {
        const mode = erc1271[String(tx.to).toLowerCase()]
        if (mode === 'magic') return '0x1626ba7e' + '0'.repeat(56)
        if (mode === 'wrong') return '0xdeadbeef' + '0'.repeat(56)
        if (mode === 'revert') throw new Error('execution reverted')
        return '0x' // codeless account: it did not endorse the bytes
      }
      // Everything else is the sanctions guard's isAllowed(address).
      if (screenError) throw new Error('rpc unreachable')
      return abi.encode(['bool'], [allowed])
    },
    async estimateGas() {
      return 100_000n
    },
    async getFeeData() {
      return { gasPrice: 30_000_000_000n, maxFeePerGas: 30_000_000_000n }
    },
    async getBlockNumber() {
      if (screenError) throw new Error('rpc unreachable')
      return blockNumber
    },
    async getBalance() {
      return balanceWei
    },
  }
}

/** The same provider on every enabled chain (reads here only ever touch the reference chain). */
export function memberApiProviders(config, opts = {}) {
  const provider = memberApiProvider(opts)
  const providers = {}
  for (const id of config.enabledChainIds) providers[id] = provider
  return providers
}

/**
 * Build a real member-signed capability token.
 *
 * @param {{
 *   signer?: ethers.Wallet, account?: string, keyId?: string, scopes?: string[],
 *   issuedAt?: number, expiresAt?: number, label?: string|null,
 *   grantOverrides?: object,   // corrupt the WIRE grant after signing (to prove verification bites)
 *   signature?: string,        // substitute a signature outright
 * }} [opts]
 */
export async function memberToken({
  signer = wallet,
  account,
  keyId = KEY_ID,
  scopes = ALL_SCOPES_V1,
  issuedAt = TEST_NOW - 60,
  expiresAt = TEST_NOW + 7 * 86_400,
  label = 'test key',
  grantOverrides = {},
  signature,
} = {}) {
  const acct = account ?? signer.address
  const grant = { v: 1, account: acct, keyId, scopes, issuedAt, expiresAt, ...(label == null ? {} : { label }) }
  const message = { account: acct, keyId, scopes: canonicalScopeString(scopes), issuedAt, expiresAt }
  const sig = signature ?? (await signer.signTypedData({ ...MEMBER_API_DOMAIN }, MEMBER_API_GRANT_TYPES, message))
  const wire = { ...grant, ...grantOverrides }
  return `fw1.${b64url(JSON.stringify(wire))}.${b64url(ethers.getBytes(sig))}`
}

/** A `POST /v1/member/keys/revoke` body, signed for real. */
export async function revocationBody({ signer = wallet, account, keyId = KEY_ID, revokedAt = TEST_NOW } = {}) {
  const revocation = { account: account ?? signer.address, keyId, revokedAt }
  const signature = await signer.signTypedData({ ...MEMBER_API_DOMAIN }, MEMBER_API_REVOCATION_TYPES, revocation)
  return { revocation, signature }
}

/** Env that turns the module on with deterministic, test-sized knobs. */
export const MEMBER_API_ENV = {
  MEMBER_API_ENABLED: 'true',
}
