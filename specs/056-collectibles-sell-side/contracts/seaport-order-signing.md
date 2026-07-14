# Contract: Seaport Order Signing (client-side)

**Feature**: 056-collectibles-sell-side | **Module**: `frontend/src/lib/collectibles/seaportOrder.js`

The signed structure the seller's wallet approves for a listing, and the one
signer seam both account types use. Hand-built EIP-712 typed data (research D1),
modeled on `frontend/src/lib/relay/intentTypes.js`. **Never redefine these types
elsewhere.**

## EIP-712 domain

```
name:              "Seaport"
version:           <protocol version, pinned>
chainId:           <item.chainId>   // 1 or 137
verifyingContract: <Seaport protocol address for that chain>   // from FeeBreakdown.protocolAddress
```

## Type: `OrderComponents`

Standard Seaport order fields — `offerer`, `zone`, `offer[]` (`OfferItem`),
`consideration[]` (`ConsiderationItem`), `orderType`, `startTime`, `endTime`,
`zoneHash`, `salt`, `conduitKey`, `counter`. The consideration MUST include the
seller-receipt item (net) plus **every required fee item** from `FeeBreakdown.fees`
(recipient + basisPoints), so OpenSea accepts the order and the displayed net
matches the signed net (FR-002/FR-010). `counter` is read from the Seaport contract
for `offerer` at build time.

## Signing seam (both account types)

```
buildOrder(item, price, feeBreakdown) -> { domain, types, message }   // net computed here
signature = await signer.signTypedData(domain, types, message)
```

- **EOA**: `signer` = ethers signer from `useWeb3().signer` → ECDSA signature.
- **Passkey smart account**: `signer` = `passkeyIntentSigner({ chainId, address,
  credentialId, ownerIndex })` → it computes `TypedDataEncoder.hash(domain, types,
  message)`, wraps via the account's `replaySafeHash`, performs the WebAuthn
  assertion, and returns the ERC-1271 `SignatureWrapper` envelope. **No new signing
  code** — the adapter already does the wrapping (research D3).

## On-chain validation (why the wrapping is correct)

OpenSea validates a contract-account order by calling
`account.isValidSignature(orderHash, signature)`. `CoinbaseSmartWallet`'s
`isValidSignature` internally applies `replaySafeHash(orderHash)` before verifying —
the same wrap the client applied — so it returns the ERC-1271 magic value
`0x1626ba7e`. If validation fails for a given account/network, the client shows the
honest-unavailable state (FR-019); it is verified end-to-end before enabling the
passkey path in production.

## Cancel & accept (not a listing signature)

- **Cancel**: an off-chain cancel is a gas-free authorization the gateway forwards
  (FR-008); an on-chain cancel is a Seaport contract call the wallet submits.
- **Accept offer**: not a signed order — the gateway returns fulfillment calldata
  (`gateway-sell-api.md` §3) and the wallet submits the transaction (EOA) or a
  UserOp (passkey; sponsorship decided server-side by tier — FR-023).

## Invariants (test targets)

1. The `net` shown in the confirm UI equals the seller-receipt consideration amount
   in the signed order (FR-010).
2. No consideration item pays a FairWins address a fee (FR-015 — attribution is not
   a consideration fee).
3. `belowFloor` (net ≤ 0) blocks/ warns before signing (FR-011).
4. A passkey signature is produced over `replaySafeHash(orderHash)`, verifiable by
   the account's `isValidSignature` returning the ERC-1271 magic value.
