/**
 * Tier-2 group-pool intent tests (spec 035/036, factory-forwarder).
 *
 * Covers the pool-specific machinery layered onto signIntent:
 *  - the three-place byte-identical typehash rule (client structs == on-chain typehashes, CLAUDE.md);
 *  - the domain/target SPLIT: the six actor twins sign under the CLONE's domain but target the factory,
 *    createPool signs under the FACTORY's domain;
 *  - pool join (authOnly): no intent struct, the EIP-3009 authorization is the whole intent and its
 *    `to` is the clone (not the factory).
 */
import { describe, it, expect } from 'vitest'
import { ethers } from 'ethers'
import { signIntent } from '../intentClient'
import { INTENT_TYPES, wagerPoolDomain, wagerPoolFactoryDomain } from '../intentTypes'

const FACTORY = ethers.getAddress('0x' + 'fa'.repeat(20))
const POOL = ethers.getAddress('0x' + 'c1'.repeat(20))

/** EIP-712 encodeType for a flat struct (no nested custom types) — the on-chain typehash preimage. */
const encodeType = (name, fields) => `${name}(${fields.map((f) => `${f.type} ${f.name}`).join(',')})`

// The canonical typehash strings from contracts/pools/WagerPool.sol + WagerPoolFactory.sol. If a client
// struct drifts from these, relays silently fail signature recovery — so pin them here.
const CONTRACT_TYPEHASHES = {
  ApproveOutcome: 'ApproveOutcome(address member,bytes32 proposalId,bytes32 nonce,uint256 validAfter,uint256 validBefore)',
  ClaimShare: 'ClaimShare(address winner,uint256 index,address recipient,bytes32 nonce,uint256 validAfter,uint256 validBefore)',
  ProposeOutcome: 'ProposeOutcome(address creator,bytes32 proposalId,bytes32 nonce,uint256 validAfter,uint256 validBefore)',
  CloseJoining: 'CloseJoining(address creator,bytes32 nonce,uint256 validAfter,uint256 validBefore)',
  Cancel: 'Cancel(address creator,bytes32 nonce,uint256 validAfter,uint256 validBefore)',
  Refund: 'Refund(address member,bytes32 nonce,uint256 validAfter,uint256 validBefore)',
  CreatePool:
    'CreatePool(address creator,address token,uint256 buyIn,uint32 maxMembers,uint16 thresholdBips,uint64 acceptDeadline,uint64 resolveDeadline,bytes32 nonce,uint256 validAfter,uint256 validBefore)',
}

function makeSigner(address = '0x00000000000000000000000000000000000000bb') {
  const calls = []
  return {
    calls,
    getAddress: async () => address,
    signTypedData: async (domain, types, message) => {
      calls.push({ domain, types, message })
      return '0x' + '11'.repeat(32) + '22'.repeat(32) + '1b'
    },
  }
}

describe('Tier-2 pool intents', () => {
  describe('three-place typehash parity (client == contract)', () => {
    for (const [name, expected] of Object.entries(CONTRACT_TYPEHASHES)) {
      it(`${name} struct matches the on-chain typehash`, () => {
        expect(INTENT_TYPES[name]).toBeDefined()
        expect(encodeType(name, INTENT_TYPES[name])).toBe(expected)
      })
    }
  })

  describe('domain/target split', () => {
    it('poolApprove — signs under the CLONE domain, targets the FACTORY', async () => {
      const signer = makeSigner()
      const proposalId = '0x' + 'ab'.repeat(32)
      const intent = await signIntent({
        signer,
        chainId: 137,
        action: 'poolApprove',
        targetContract: FACTORY,
        params: { pool: POOL, proposalId },
        nowSeconds: 1_000_000,
      })
      // Body targets the factory (the pinned + whitelisted address).
      expect(intent.targetContract).toBe(FACTORY)
      expect(intent.intentClass).toBe('signer-attributed')
      expect(intent.params.pool).toBe(POOL)
      expect(intent.params.proposalId).toBe(proposalId)
      // ...but the single wallet prompt is under the CLONE's domain.
      expect(signer.calls).toHaveLength(1)
      expect(signer.calls[0].domain).toEqual(wagerPoolDomain(137, POOL))
      expect(Object.keys(signer.calls[0].types)).toEqual(['ApproveOutcome'])
      expect(signer.calls[0].message.member).toBe(await signer.getAddress())
    })

    it('poolCreate — signs under the FACTORY domain (no clone exists yet)', async () => {
      const signer = makeSigner()
      const intent = await signIntent({
        signer,
        chainId: 137,
        action: 'poolCreate',
        targetContract: FACTORY,
        params: {
          token: '0x0000000000000000000000000000000000000dead',
          buyIn: 10_000_000n,
          maxMembers: 5,
          thresholdBips: 6000,
          acceptDeadline: 2_000_000,
          resolveDeadline: 3_000_000,
        },
        nowSeconds: 1_000_000,
      })
      expect(intent.targetContract).toBe(FACTORY)
      expect(signer.calls[0].domain).toEqual(wagerPoolFactoryDomain(137, FACTORY))
      expect(signer.calls[0].message.creator).toBe(await signer.getAddress())
      expect(intent.params.buyIn).toBe('10000000') // JSON-safe
    })
  })

  describe('pool join (authOnly)', () => {
    it('carries only the EIP-3009 authorization (to = clone), no intent struct', async () => {
      const signer = makeSigner()
      const intent = await signIntent({
        signer,
        chainId: 137,
        action: 'poolJoin',
        targetContract: FACTORY,
        params: { pool: POOL },
        payment: { value: 10_000_000n },
        nowSeconds: 1_000_000,
      })
      expect(intent.intentClass).toBe('payment')
      expect(intent.targetContract).toBe(FACTORY)
      expect(intent.signature).toBe('0x') // no intent-struct signature
      expect(intent.params).toEqual({ pool: POOL }) // raw params only
      // Exactly one wallet prompt: the token's ReceiveWithAuthorization, paying INTO the clone.
      expect(signer.calls).toHaveLength(1)
      expect(signer.calls[0].message.to).toBe(POOL)
      expect(intent.authorization.to).toBe(POOL)
      expect(intent.authorization.nonce).toBe(intent.uniquenessMarker)
    })
  })

  describe('frontend↔contract signature parity (real wallet)', () => {
    it('poolClaim recovers to the signer under the CLONE domain + ClaimShare struct', async () => {
      const wallet = new ethers.Wallet('0x' + '11'.repeat(32))
      const recipient = '0x0000000000000000000000000000000000005555'
      const intent = await signIntent({
        signer: wallet,
        chainId: 137,
        action: 'poolClaim',
        targetContract: FACTORY,
        params: { pool: POOL, index: 0, recipient },
        nowSeconds: 1_000_000,
        validitySeconds: 600,
      })
      const domain = wagerPoolDomain(137, POOL)
      const types = { ClaimShare: INTENT_TYPES.ClaimShare }
      const message = {
        winner: wallet.address,
        index: 0,
        recipient,
        nonce: intent.uniquenessMarker,
        validAfter: 0,
        validBefore: 1_000_600,
      }
      const recovered = ethers.verifyTypedData(domain, types, message, intent.signature)
      expect(recovered).toBe(wallet.address)
    })
  })
})
