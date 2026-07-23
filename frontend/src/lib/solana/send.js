/**
 * Solana native SOL transfer — build, sign, broadcast (spec 063, US3 / T033).
 *
 * Transaction assembly + wire serialization use @solana/kit (tree-shakeable, no
 * Buffer/bn.js — Vite-clean) and the SystemProgram transfer instruction from
 * @solana-program/system, so the compact-u16 arrays, header flags, blockhash
 * lifetime, and base64 wire format are library-correct rather than hand-rolled.
 * Signing uses the recovered account's derived ed25519 key. Only the resulting
 * base64 SIGNED transaction is broadcast — the key never leaves the client.
 */

import {
  pipe,
  address,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  signTransactionMessageWithSigners,
  getBase64EncodedWireTransaction,
  createKeyPairSignerFromBytes,
} from '@solana/kit'
import { getTransferSolInstruction } from '@solana-program/system'
import { isValidSolanaAddress } from './address'

/**
 * Build a fully-signed native SOL transfer, returned as a base64 wire transaction.
 *
 * @param {{ secret:Uint8Array, pubkey:Uint8Array, to:string, lamports:bigint,
 *           blockhash:{blockhash:string, lastValidBlockHeight:number|bigint} }} args
 * @returns {Promise<string>} base64-encoded signed transaction
 */
export async function buildSignedSolTransfer({ secret, pubkey, to, lamports, blockhash }) {
  if (!isValidSolanaAddress(to)) throw new Error('Invalid Solana destination address')
  if (typeof lamports !== 'bigint' || lamports <= 0n) throw new Error('lamports must be a positive bigint')
  // Solana's 64-byte secret key = ed25519 private(32) || public(32).
  const secret64 = new Uint8Array(64)
  secret64.set(secret.slice(0, 32))
  secret64.set(pubkey, 32)
  const signer = await createKeyPairSignerFromBytes(secret64)
  const lifetime = {
    blockhash: blockhash.blockhash,
    lastValidBlockHeight: BigInt(blockhash.lastValidBlockHeight),
  }
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(signer.address, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
    (m) =>
      appendTransactionMessageInstruction(
        getTransferSolInstruction({ source: signer, destination: address(to), amount: lamports }),
        m,
      ),
  )
  const signed = await signTransactionMessageWithSigners(message)
  return getBase64EncodedWireTransaction(signed)
}

/**
 * Fetch a fresh blockhash, build+sign the transfer, and broadcast it. The member
 * pays the network fee (Solana sends are never gasless) — disclose that in the UI.
 *
 * @param {{ rpc:object, keypair:{secret:Uint8Array,pubkey:Uint8Array}, to:string, lamports:bigint }} args
 * @returns {Promise<{ signature:string }>}
 */
export async function sendSol({ rpc, keypair, to, lamports }) {
  const blockhash = await rpc.getLatestBlockhash()
  if (!blockhash?.blockhash) throw new Error('Could not fetch a recent blockhash')
  const base64 = await buildSignedSolTransfer({
    secret: keypair.secret,
    pubkey: keypair.pubkey,
    to,
    lamports,
    blockhash,
  })
  const signature = await rpc.sendTransaction(base64)
  return { signature }
}
