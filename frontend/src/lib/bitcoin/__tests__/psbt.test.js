import { describe, it, expect } from 'vitest'
import * as btc from '@scure/btc-signer'
import { HDKey } from '@scure/bip32'
import { buildAndSignTx, FeeOverrunError } from '../psbt'
import { estimateVsize } from '../coinSelection'

// Fixture keys from a fixed seed — test-only material.
const root = HDKey.fromMasterSeed(new Uint8Array(64).fill(7))
const segwitKey = root.derive("m/84'/1'/0'/0/0")
const taprootKey = root.derive("m/86'/1'/0'/0/0")
const net = btc.TEST_NETWORK

const segwitInput = (valueSats, txbyte = '11') => ({
  txid: txbyte.repeat(32),
  vout: 0,
  valueSats,
  scriptType: 'p2wpkh',
  publicKey: segwitKey.publicKey,
  privateKey: segwitKey.privateKey,
})
const taprootInput = (valueSats, txbyte = '22') => ({
  txid: txbyte.repeat(32),
  vout: 1,
  valueSats,
  scriptType: 'p2tr',
  publicKey: taprootKey.publicKey,
  privateKey: taprootKey.privateKey,
})

// A destination of each standard type (testnet forms) — FR-011.
const DESTINATIONS = {
  p2pkh: 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn',
  p2sh: '2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc',
  p2wpkh: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
  p2tr: btc.p2tr(taprootKey.publicKey.slice(1), undefined, net).address,
}

describe('psbt build + sign (spec 061, FR-011/FR-012/FR-014)', () => {
  it.each(Object.entries(DESTINATIONS))(
    'signs a segwit-input send to a %s destination',
    (type, address) => {
      const res = buildAndSignTx({
        inputs: [segwitInput(100_000)],
        recipient: { address, valueSats: 60_000 },
        change: { address: btc.p2wpkh(segwitKey.publicKey, net).address, valueSats: 38_000 },
        networkId: 'bitcoin-testnet',
        maxFeeSats: 5_000,
      })
      expect(res.feeSats).toBe(2_000)
      expect(res.txid).toMatch(/^[0-9a-f]{64}$/)
      const decoded = btc.Transaction.fromRaw(hexToBytes(res.rawTxHex), {
        allowUnknownInputs: true,
        allowUnknownOutputs: true,
      })
      expect(decoded.inputsLength).toBe(1)
      expect(decoded.outputsLength).toBe(2)
      // recipient script really is the requested type
      const outScript = decoded.getOutput(0).script
      expect(btc.Address(net).encode(btc.OutScript.decode(outScript))).toBe(address)
    }
  )

  it('signs mixed segwit + taproot inputs with RBF sequences', () => {
    const res = buildAndSignTx({
      inputs: [segwitInput(50_000), taprootInput(40_000)],
      recipient: { address: DESTINATIONS.p2wpkh, valueSats: 60_000 },
      change: { address: DESTINATIONS.p2tr, valueSats: 20_000 },
      networkId: 'bitcoin-testnet',
      maxFeeSats: 15_000,
    })
    expect(res.feeSats).toBe(10_000)
    const decoded = btc.Transaction.fromRaw(hexToBytes(res.rawTxHex), { allowUnknownInputs: true })
    expect(decoded.inputsLength).toBe(2)
    expect(decoded.getInput(0).sequence).toBe(0xfffffffd)
    expect(decoded.getInput(1).sequence).toBe(0xfffffffd)
    expect(decoded.getInput(0).finalScriptWitness).toBeTruthy()
    expect(decoded.getInput(1).finalScriptWitness).toBeTruthy()
  })

  it('actual vsize never exceeds the coinSelection estimate (quote honesty)', () => {
    const inputs = [segwitInput(50_000), taprootInput(40_000)]
    const est = estimateVsize(
      inputs.map((i) => ({ scriptType: i.scriptType })),
      'p2wpkh',
      true,
      'p2tr'
    )
    const res = buildAndSignTx({
      inputs,
      recipient: { address: DESTINATIONS.p2wpkh, valueSats: 60_000 },
      change: { address: DESTINATIONS.p2tr, valueSats: 20_000 },
      networkId: 'bitcoin-testnet',
      maxFeeSats: 15_000,
    })
    expect(res.vsize).toBeLessThanOrEqual(est)
  })

  it('refuses to sign when the fee exceeds the confirmed quote (FR-012)', () => {
    expect(() =>
      buildAndSignTx({
        inputs: [segwitInput(100_000)],
        recipient: { address: DESTINATIONS.p2wpkh, valueSats: 60_000 },
        change: null, // 40k sats would go to fee
        networkId: 'bitcoin-testnet',
        maxFeeSats: 5_000,
      })
    ).toThrow(FeeOverrunError)
  })

  it('rejects outputs exceeding inputs, empty inputs, bad networks and wrong-network destinations', () => {
    expect(() =>
      buildAndSignTx({
        inputs: [segwitInput(10_000)],
        recipient: { address: DESTINATIONS.p2wpkh, valueSats: 20_000 },
        networkId: 'bitcoin-testnet',
        maxFeeSats: 1_000,
      })
    ).toThrow(/outputs exceed inputs/)
    expect(() =>
      buildAndSignTx({ inputs: [], recipient: { address: DESTINATIONS.p2wpkh, valueSats: 1 }, networkId: 'bitcoin-testnet', maxFeeSats: 1 })
    ).toThrow(/no inputs/)
    expect(() =>
      buildAndSignTx({
        inputs: [segwitInput(10_000)],
        recipient: { address: DESTINATIONS.p2wpkh, valueSats: 5_000 },
        networkId: 'litecoin',
        maxFeeSats: 6_000,
      })
    ).toThrow(/unknown bitcoin network/)
    // mainnet destination on testnet build
    expect(() =>
      buildAndSignTx({
        inputs: [segwitInput(10_000)],
        recipient: { address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', valueSats: 5_000 },
        networkId: 'bitcoin-testnet',
        maxFeeSats: 6_000,
      })
    ).toThrow()
  })

  it('taproot txid is deterministic (witness may differ — BIP-340 aux randomness)', () => {
    const build = () =>
      buildAndSignTx({
        inputs: [taprootInput(40_000)],
        recipient: { address: DESTINATIONS.p2wpkh, valueSats: 39_000 },
        networkId: 'bitcoin-testnet',
        maxFeeSats: 1_000,
      })
    const a = build()
    const b = build()
    // txid commits to everything except witness data; schnorr aux-rand makes
    // the signature bytes differ run-to-run, which is expected and harmless.
    expect(a.txid).toBe(b.txid)
    expect(a.feeSats).toBe(b.feeSats)
    expect(a.vsize).toBe(b.vsize)
  })
})

function hexToBytes(hex) {
  return Uint8Array.from(hex.match(/.{2}/g).map((b) => parseInt(b, 16)))
}
