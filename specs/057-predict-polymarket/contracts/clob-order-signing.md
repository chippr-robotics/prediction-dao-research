# Signing Contract: Polymarket CLOB V2 Order

The member's own wallet signs the CLOB V2 order struct as EIP-712 typed data — the single
authorization for a trade; it cannot be delegated server-side (SC-005). Built in
`frontend/src/lib/predict/clobOrder.js`, signed through the repo's one signing seam
(`signTypedData` for EOAs; `passkeyIntentSigner` / ERC-1271 for passkey smart accounts,
exactly as Collect signs Seaport orders).

## EIP-712 domain

```
{ name: "Polymarket CTF Exchange", version: "2", chainId: 137,
  verifyingContract: <standard | neg-risk variant> }
```

`verifyingContract` is read from the market's `/book` (`neg_risk` flag selects the variant);
it is never a client-hardcoded constant. The CTF address is available in `deployments/`
(`polymarketCTF`) for reference/verification.

## Order type (fields signed)

`salt, maker, signer, tokenId, makerAmount, takerAmount, side (0=BUY/1=SELL), expiration,
signatureType, timestamp (ms), metadata, builder`

- **`builder`** — `bytes32`; carries FairWins' builder code (`0x6e03…93a3`) so attribution
  is recorded on-chain in `OrderFilled` from `CTFExchangeV2`. Zero bytes32 ⇒ unattributed
  (the never-stranded fallback, FR-015).
- **`signatureType`** — `0` EOA · `2` Gnosis Safe · `3` POLY_1271 deposit wallet
  (recommended for new API users). Passkey smart accounts validate via ERC-1271; where the
  CLOB cannot validate a given account's signature, the action is shown honestly
  unavailable per-account (FR-019), never a dead button.
- **`makerAmount`/`takerAmount`** — derived from price × size in USDC (6 decimals) and the
  outcome-token amount; the builder handles buy vs sell orientation.

## `buildOrder(...)` output (one source of truth)

```
buildOrder({ tokenId, side, price, size, isMaker }, feeBreakdown, builder) →
  { domain, types, message, totalCost, netProceeds, feeLines }
```

- `feeLines` includes the **platform fee** (taker, from the live fee schedule; maker 0) AND
  FairWins' **builder fee** (taker, from `feeBreakdown.builderFeeBps`; maker 0). Both are in
  USDC and labeled.
- `totalCost` (buy) = price×size + platform fee + builder fee. `netProceeds` (sell) =
  price×size − platform fee − builder fee. **The number shown to the member equals the
  number derived here equals what they pay/net** (FR-011) — the builder fee is included, not
  hidden (the Collect divergence, research D3).
- `salt` from injectable randomness; `timestamp` (ms) injectable — so tests are deterministic.

## Invariants (tested)

- Taker `totalCost`/`netProceeds` include the additive builder fee (FR-011/FR-012).
- Maker orders carry no platform fee and no builder fee (US1 scenario 4).
- `message.builder` equals the configured code (or zero when unattributed).
- The app never signs an order whose `chainId` ≠ the wallet's active network (FR-021).
- Signing is blocked when the fee breakdown could not be confirmed (FR-010).
