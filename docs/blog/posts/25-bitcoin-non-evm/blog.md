# Bitcoin in an EVM-Native App: Guarding Every Boundary

*How FairWins added its first non-EVM chain — string network ids, seed-derived BIP84/86 keys, and fail-safe UTXO handling — without corrupting a codebase built on numeric chainIds*

| | |
|---|---|
| **Series** | Finance Surfaces (part 4) |
| **Part** | 25 of 34 |
| **Audience** | Multi-chain and wallet engineers |
| **Tags** | `bitcoin`, `non-evm`, `bip84`, `bip86`, `hd-wallets`, `multi-chain` |
| **Reading time** | ~9 minutes |

---

## The Assumption Buried in Every File

Imagine you maintain a mature EVM app. Every network is a numeric chainId: 137 is Polygon, 80002 is Amoy, 61 is Ethereum Classic. That number is a load-bearing key in dozens of places — `getContractAddressForChain(name, chainId)` resolves contract addresses, wagmi builds providers from it, the subgraph router selects endpoints by it, the testnet toggle flips between paired numbers. The assumption "a network is an integer with contracts on it" is not written down anywhere, because it never needed to be. It is simply everywhere.

Then the roadmap says: add Bitcoin. Portfolio, send, receive — a real non-custodial wallet inside the existing passkey account.

Bitcoin breaks every one of those silent assumptions at once. There is no chainId — [EIP-155](https://eips.ethereum.org/EIPS/eip-155) is an Ethereum construct. There are no contracts, so `getContractAddressForChain` is meaningless. There are no accounts or nonces — value lives in UTXOs, addresses are supposed to rotate rather than persist, and fees are priced in sat/vB against a transaction's virtual size, not gas. The tempting shortcut — assign Bitcoin a fake numeric id like `-1` or `99999` and let it flow through the existing plumbing — is exactly how multi-chain codebases rot: every consumer of chainId becomes a landmine that might receive a number that is not actually an EVM chain.

FairWins spec 061 took the opposite approach: Bitcoin is *structurally* different, so it gets a *structurally* different type, and every place the two worlds touch gets an explicit guard. This post walks the four boundaries that made it work.

## Boundary 1: A Parallel Registry, Not a New Row

Bitcoin networks are string ids — `'bitcoin'` and `'bitcoin-testnet'` (testnet4) — in their own registry, `frontend/src/config/bitcoinNetworks.js`, deliberately parallel to and never merged into the numeric `NETWORKS` map:

```js
export const BITCOIN_NETWORKS = Object.freeze({
  bitcoin: Object.freeze({
    id: 'bitcoin',
    kind: 'bitcoin',
    isTestnet: false,
    gatewaySegment: 'mainnet',
    addressHrp: 'bc',   // bech32 HRP — drives wrong-network rejection
    coinType: 0,        // BIP44 coin type (hardened)
    capabilities: CAPABILITIES,
  }),
  // 'bitcoin-testnet' → testnet4, hrp 'tb', coinType 1
})

export function isBitcoinNetworkId(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(BITCOIN_NETWORKS, id)
}
```

`isBitcoinNetworkId()` is the boundary type guard. Any shared code path — portfolio aggregation, the network switcher, activity feeds — checks it before handing an id to anything typed on numeric chainIds. A string id must never reach `getContractAddressForChain`, wagmi provider construction, or subgraph routing; the guard makes the crossing impossible to do by accident rather than merely discouraged.

Two details keep the parallel registry honest. First, `BITCOIN_TESTNET_MAINNET_PAIR` mirrors the existing EVM testnet/mainnet toggle semantics, so the app's single global toggle flips Bitcoin between testnet4 and mainnet in lockstep with 80002 ↔ 137 — the two environments never mix. Second, a frozen `capabilities` map (`wagers: false`, `pools: false`, `gasless: false`, `send: true`, …) is the single source of truth for what Bitcoin supports. Everything false hides its surface exactly like a disabled EVM capability. There are no wagers, pools, membership, or gasless transactions on Bitcoin, and the UI never implies otherwise.

## Boundary 2: One Seed, Two Cryptographies

FairWins passkey accounts (spec 041) hold a 32-byte, PRF-recoverable, memory-only master seed. Bitcoin keys derive from that same seed — no separate backup, no new recovery phrase — through a domain-separated subtree defined in `specs/061-bitcoin-transactions/contracts/key-derivation-btc.md`:

```
btcSeed     = HKDF-SHA256(ikm = masterSeed, salt = 32 zero bytes,
                          info = "fairwins-btc-seed-v1", length = 64)
root        = BIP32.fromMasterSeed(btcSeed)
segwitAcct  = root.derive("m/84'/{coin}'/0'")   // BIP84 → P2WPKH bc1q…
taprootAcct = root.derive("m/86'/{coin}'/0'")   // BIP86 → P2TR   bc1p…
receive(i)  = acct/0/i                          // external chain only (v1)
```

The [HKDF](https://datatracker.ietf.org/doc/html/rfc5869) info string `"fairwins-btc-seed-v1"` is exclusive to this tree, so the Bitcoin subtree can never collide with the spec-041 key-encryption path or any future consumer of the master seed. Native segwit ([BIP-84](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki)) is the default; taproot ([BIP-86](https://github.com/bitcoin/bips/blob/master/bip-0086.mediawiki), key-path only, [BIP-341](https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki)-tweaked) is opt-in. Every constant in that block is marked **wallet-breaking**: funds live at the derived addresses, so changing the info string, paths, or coin-type mapping requires a versioned migration, never an edit.

Two invariants shape everything downstream. *Memory-only:* `btcSeed`, the BIP32 root, account xprvs, and child private keys are never persisted, logged, serialized, or transmitted — `frontend/src/lib/bitcoin/derivation.js` derives transiently and callers drop references after signing. *xpub confinement:* even the account xpubs stay in the client; the relay gateway sees bare addresses (at most 50 per call) and signed raw transactions, nothing else. A server that never holds keys or extended public keys cannot leak the wallet or link its full address graph.

There is also a "no wrong keys" rule: if the master seed is unavailable — a non-PRF authenticator, an injected or WalletConnect EVM wallet — the Bitcoin wallet reports an honest `unavailable` state with the reason. It never falls back to deriving from other material, because a fallback derivation would be a *different wallet* holding someone's funds hostage to an implementation detail.

## Boundary 3: Rotation, Recovery, and Coins That Fail Safe

EVM habits say "your address is your identity." Bitcoin practice says the opposite: `frontend/src/lib/bitcoin/wallet.js` issues a fresh receive address per request and never repeats one. The rotation cursor per (network, address type) only increases, and the persisted ledger is explicitly a cache, never the source of truth. On a new device, gap-limit-20 discovery — scan sequential addresses, stop after 20 consecutive unused ones, the convention descended from [BIP-32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki)/BIP-44 wallets — rebuilds the issued set and resumes the cursor after the highest used index. Recovery needs no Bitcoin-specific backup because the passkey seed plus deterministic derivation *is* the backup.

Spending is where UTXO reality bites hardest. Bitcoin Stamps embed collectible data in specific UTXOs; spend one as ordinary money and the collectible is destroyed. FairWins classifies every coin before it can be selected:

```js
if ((u.confirmations ?? 0) < 1) {
  classification = 'pending'
} else if (!recognitionHealthy) {
  // Fail safe: nothing is positively stamp-free while recognition is down.
  classification = 'unverified'
} else if (stampByOutpoint.has(key)) {
  classification = 'protected'
} else {
  classification = 'spendable'
}
```

The polarity is the point: a coin is spendable only when *positively verified* stamp-free. If the stamps indexer is degraded or unreachable, coins classify `unverified` and coin selection treats them exactly like `protected` — excluded from sends and from spendable balance, shown as protected value. Over-protection temporarily shrinks what a member can send; the alternative is irreversibly destroying an asset during an outage.

## Boundary 4: Fees Are a Ceiling, Not an Estimate

On the EVM side, FairWins runs two gasless rails. Bitcoin has neither — there is no relayer and no paymaster for BTC, and the confirm UI says plainly that the member pays the network fee. What the platform *can* guarantee is that the fee the member confirmed is the most they will ever pay.

Fee quotes (sat/vB tiers) expire after 60 seconds; `frontend/src/lib/bitcoin/send.js` rejects a stale quote with `stale_fee_quote` before a plan is even built, so a fee spike between quote and confirmation can never silently reprice a send. The confirmed fee then becomes a hard ceiling enforced at the signing layer in `frontend/src/lib/bitcoin/psbt.js`:

```js
const feeSats = inSats - outSats
if (feeSats < 0) throw new Error('psbt: outputs exceed inputs')
if (feeSats > maxFeeSats) throw new FeeOverrunError(feeSats, maxFeeSats)
```

`buildAndSignTx` computes the actual fee from inputs minus outputs *before* signing and refuses to produce a signature above `maxFeeSats` — the same shape as the EVM-side `maxFeeBps` rule from the FeeRouter work: the quote shown at confirmation is a binding maximum, not a talking point. Sub-dust change folds into the fee rather than creating an unspendable output, and sends are RBF-signaled per [BIP-125](https://github.com/bitcoin/bips/blob/master/bip-0125.mediawiki) so a stuck transaction has an escape hatch.

The server side, `services/relay-gateway/src/bitcoin/routes.js`, is a deliberately dumb proxy: killswitch check, enable check, parameter validation, per-IP quotas, TTL cache, then Esplora upstream. It never touches intents, funds, or keys. And the whole module is optional — with `BTC_ENABLED=false` or the killswitch active, every Bitcoin surface in the frontend hides or degrades honestly rather than pretending. A total gateway outage leaves every EVM value path untouched.

## Design Decisions

**String ids over a fake chainId.** A synthetic numeric id would have been one line of code and an unbounded audit surface — every chainId consumer forever suspect. Distinct types plus `isBitcoinNetworkId` guards cost more upfront and make the wrong crossing a type error instead of a runtime surprise.

**One seed, domain-separated.** Deriving from the passkey master seed means no second recovery ceremony, at the price of hard coupling: Bitcoin availability requires a PRF-capable passkey. The availability matrix in the derivation contract makes that an honest, explained limitation rather than a silent failure.

**Cache-as-ledger.** Treating persisted state as a rebuildable cache (gap-limit discovery, never-decreasing cursor) trades extra lookups on unlock for a wallet that survives device loss with zero Bitcoin-specific backup.

**Fail-safe over available.** Both the stamps classifier and the fee ceiling prefer refusing to act over acting on unverified data. A blocked send is recoverable; a destroyed Stamp or an unexpectedly expensive transaction is not.

**Scope discipline.** Portfolio, send, receive — nothing else. No wagers, no gasless, no contracts on Bitcoin. The capabilities map turns that scope into enforced configuration instead of tribal knowledge.

## Sources

- `specs/061-bitcoin-transactions/` — spec.md, plan.md, `contracts/key-derivation-btc.md`
- `docs/developer-guide/bitcoin.md`, `docs/runbooks/bitcoin-operations.md`
- `frontend/src/config/bitcoinNetworks.js`
- `frontend/src/lib/bitcoin/` — `derivation.js`, `wallet.js`, `send.js`, `psbt.js`
- `services/relay-gateway/src/bitcoin/routes.js`
- [BIP-32: Hierarchical Deterministic Wallets](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki)
- [BIP-84: Derivation scheme for P2WPKH](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki)
- [BIP-86: Key derivation for single-key P2TR outputs](https://github.com/bitcoin/bips/blob/master/bip-0086.mediawiki)
- [BIP-341: Taproot](https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki) · [BIP-125: Opt-in RBF](https://github.com/bitcoin/bips/blob/master/bip-0125.mediawiki)
- [RFC 5869: HKDF](https://datatracker.ietf.org/doc/html/rfc5869) · [EIP-155: Chain ID](https://eips.ethereum.org/EIPS/eip-155)
