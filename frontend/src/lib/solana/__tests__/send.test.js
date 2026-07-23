// Spec 063 (US3, T030 core) — Solana RPC + send. @solana/kit signing uses WebCrypto Ed25519
// (available via Node's webcrypto under the jsdom test env).

import { describe, it, expect, vi } from 'vitest'
import { createSolanaRpc, addressHasActivity, LAMPORTS_PER_SOL } from '../rpc'
import { buildSignedSolTransfer, sendSol } from '../send'
import { deriveSolanaKeypair } from '../derivation'
import { encodeSolanaAddress } from '../address'
import { seedFromMnemonic } from '../../bitcoin/legacyDerivation'

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const DEST = '11111111111111111111111111111112'

const jsonResponse = (result) => ({ ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result }) })

describe('Solana RPC (mocked fetch)', () => {
  it('reads balance as lamports (bigint)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ value: 2_500_000_000 }))
    const rpc = createSolanaRpc('https://rpc.example', { fetchImpl })
    const bal = await rpc.getBalance('So1anaAddr')
    expect(bal).toBe(2_500_000_000n)
    expect(Number(bal) / Number(LAMPORTS_PER_SOL)).toBe(2.5)
  })

  it('detects activity from signatures even at zero balance', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ value: 0 })) // getBalance
      .mockResolvedValueOnce(jsonResponse([{ signature: 'abc' }])) // getSignaturesForAddress
    const rpc = createSolanaRpc('https://rpc.example', { fetchImpl })
    expect(await addressHasActivity(rpc, 'So1anaAddr')).toBe(true)
  })

  it('surfaces RPC errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ error: { message: 'boom' } }) })
    const rpc = createSolanaRpc('https://rpc.example', { fetchImpl })
    await expect(rpc.getBalance('x')).rejects.toThrow(/boom/)
  })
})

describe('Solana send (real @solana/kit signing)', () => {
  it('my address codec agrees with @solana/kit for the derived key', async () => {
    const kp = deriveSolanaKeypair(seedFromMnemonic(MNEMONIC), { account: 0 })
    // buildSignedSolTransfer derives signer.address internally; cross-check via a fresh signer.
    const { createKeyPairSignerFromBytes } = await import('@solana/kit')
    const secret64 = new Uint8Array(64); secret64.set(kp.secret); secret64.set(kp.pubkey, 32)
    const signer = await createKeyPairSignerFromBytes(secret64)
    expect(signer.address).toBe(kp.address)
    expect(kp.address).toBe(encodeSolanaAddress(kp.pubkey))
  })

  it('builds a base64 signed transfer', async () => {
    const kp = deriveSolanaKeypair(seedFromMnemonic(MNEMONIC), { account: 0 })
    const base64 = await buildSignedSolTransfer({
      secret: kp.secret, pubkey: kp.pubkey, to: DEST, lamports: 1_000_000n,
      blockhash: { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 200 },
    })
    expect(typeof base64).toBe('string')
    expect(base64.length).toBeGreaterThan(100)
  })

  it('rejects an invalid destination and non-positive amount', async () => {
    const kp = deriveSolanaKeypair(seedFromMnemonic(MNEMONIC), { account: 0 })
    const bh = { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1 }
    await expect(buildSignedSolTransfer({ secret: kp.secret, pubkey: kp.pubkey, to: 'nope!!', lamports: 1n, blockhash: bh })).rejects.toThrow(/destination/i)
    await expect(buildSignedSolTransfer({ secret: kp.secret, pubkey: kp.pubkey, to: DEST, lamports: 0n, blockhash: bh })).rejects.toThrow(/positive/i)
  })

  it('sendSol fetches a blockhash then broadcasts the signed tx', async () => {
    const kp = deriveSolanaKeypair(seedFromMnemonic(MNEMONIC), { account: 0 })
    const rpc = {
      getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 300 }),
      sendTransaction: vi.fn().mockResolvedValue('SIGNATURE123'),
    }
    const res = await sendSol({ rpc, keypair: kp, to: DEST, lamports: 5_000n })
    expect(rpc.getLatestBlockhash).toHaveBeenCalled()
    expect(rpc.sendTransaction).toHaveBeenCalledWith(expect.any(String))
    expect(res.signature).toBe('SIGNATURE123')
  })
})
