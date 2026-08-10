# Contract: `lib/recovery/legacyKeys.js` (extended)

Existing functions (shipped) stay unchanged. This feature **adds** multi-asset sweep functions;
`quoteNativeSweep`/`sweepNativeToSmartAccount` remain for the native-only path but the panel moves to
the all-asset functions below.

## Existing (unchanged)

- `classifySecret(input) → { kind: 'privateKey'|'mnemonic', address, secret, wordCount } | { kind: 'empty'|'invalid' }`
- `walletFromSecret({ kind, secret }, provider?) → ethers.Signer`
- `encryptLegacySecret({ secret, kind, address, passphrase, deps? }) → Promise<VaultEntry>`
- `decryptLegacySecret({ entry, passphrase, deps? }) → Promise<string>`  *(wrong pass ⇒ throws)*
- `legacyKeyVault(storage?) → { list, get, has, set, delete }`
- `quoteNativeSweep({ kind, secret, provider }) → Promise<{ from, balance, gasReserve, sendable, gasLimit, gasPrice }>`
- `sweepNativeToSmartAccount({ kind, secret, to, provider }) → Promise<ethers.TransactionResponse>`

## New: `quoteAllAssets`

```
quoteAllAssets({ kind, secret, chainId, provider, registry? }) → Promise<{
  from: string,
  holdings: Array<{ asset, balance: bigint }>,   // non-zero only; ERC-20s then native
  nativeGasReserve: bigint,
  hasNative: boolean,
}>
```

- `registry` defaults to `getPortfolioRegistry(chainId).filter(a => a.kind === 'native' || a.kind === 'erc20')`.
- Reads native via `provider.getBalance(from)` and each ERC-20 via `balanceOf(from)` **concurrently**.
- Excludes zero balances. `nativeGasReserve` = `~21000 * gasPrice * 1.2` (from `getFeeData`).
- Read-only; no signing.

## New: `sweepAllAssets`

```
sweepAllAssets({ kind, secret, to, chainId, provider, onProgress? }) → Promise<Array<{
  asset, status: 'sent'|'skipped'|'failed', txHash?: string, error?: string,
}>>
```

- Validates `to` (`ethers.isAddress`) and `to !== from`; throws on invalid destination.
- Transfers **ERC-20s first** (`new ethers.Contract(asset.address, TRANSFER_ABI, signer).transfer(to, value)` → `.wait()`),
  then **native last** (send `balance - nativeGasReserve` if positive, else native `skipped`).
- A single asset failure is caught and recorded as `status:'failed'` with `error`; the sweep **continues**.
- `onProgress(outcome)` (optional) is called after each asset for live UI.
- **Never** logs the secret; the signer is built once via `walletFromSecret`.

## Errors

- Invalid/empty destination → `throw new Error('Enter a valid destination address.')`
- Destination equals the legacy address → `throw new Error('Choose a destination other than the legacy account.')`
- No provider → `throw new Error('No network connection to read balances.')`
- Per-asset failures never throw out of `sweepAllAssets`; they surface as `failed` outcomes.
