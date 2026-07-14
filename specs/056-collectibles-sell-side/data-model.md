# Data Model: Collectibles Sell-Side Trading (Phase 2)

**Feature**: 056-collectibles-sell-side | **Date**: 2026-07-14

No persistent storage is introduced. Entities are transient: order structures the
frontend builds and signs, gateway request/response DTOs, and hook state. Field
names below are the gateway/client contract (camelCase). See
`contracts/gateway-sell-api.md` (write routes) and
`contracts/seaport-order-signing.md` (the signed structure).

## FeeBreakdown

The live, per-order fee basis fetched from the marketplace — the single source for
both the signed order's consideration and the displayed net (FR-002/FR-010).

| Field | Type | Notes |
|---|---|---|
| `chainId` | number | 1 or 137 |
| `collectionSlug` | string | join key |
| `marketplaceFee` | `{ recipient, basisPoints }` | OpenSea's required fee; `required: true` |
| `creatorRoyalty` | `{ recipient, basisPoints, required }` \| null | may be optional per collection |
| `fees` | `FeeItem[]` | full list the consideration must include (recipient + basisPoints + required) |
| `protocolAddress` | string | Seaport contract for the order domain |
| `conduitKey` | string | Seaport conduit for transfers |
| `fetchedAt` / `stale` | ISO-8601 / boolean | staleness envelope (055 convention) |

**Rule**: if this cannot be fetched, the client blocks signing (FR-009) — never a
guessed or hardcoded fee.

## NetProceeds (client-computed)

The one honest number shown before signing (FR-010). Derived, never stored.

| Field | Type | Notes |
|---|---|---|
| `price` | `PriceInput` | seller's chosen amount + currency |
| `totalFee` | string | Σ(required fee basisPoints) applied to price, in the order currency |
| `net` | string | `price − totalFee`, in the order currency |
| `feeLines` | `Array<{label, amount, currency}>` | marketplace fee, each royalty — labeled |
| `belowFloor` | boolean | true when `net <= 0` → warn before listing (FR-011) |

## SeaportOrder (built + signed on the client)

The EIP-712 `OrderComponents` the wallet signs; posted to the gateway. Full field
list in `contracts/seaport-order-signing.md`. Summary:

| Field | Type | Notes |
|---|---|---|
| `offerer` | address | the seller's account (EOA or passkey smart account) |
| `offer` | `OfferItem[]` | the owned NFT (contract + tokenId + amount) |
| `consideration` | `ConsiderationItem[]` | seller receipt (net) + every required fee item |
| `startTime` / `endTime` | uint | now / expiry |
| `orderType`, `zone`, `zoneHash`, `salt`, `conduitKey`, `counter` | Seaport fields | `counter` read from the Seaport contract for `offerer` |
| `signature` | bytes | EOA ECDSA, or passkey ERC-1271 envelope (over `replaySafeHash(orderHash)`) |

## Listing (marketplace state)

An owner's live offer to sell, read back from the marketplace for display.

| Field | Type | Notes |
|---|---|---|
| `orderHash` | string | identity for cancel |
| `item` | `{chainId, contract, identifier}` | |
| `price` | `PriceQuote` | asking price + currency |
| `expiry` | ISO-8601 | |
| `state` | enum | `active` \| `cancelled` \| `filled` \| `expired` |

## BestOffer (reused from 055, extended for accept)

| Field | Type | Notes |
|---|---|---|
| `orderHash` | string | for fulfillment + staleness re-check (FR-007) |
| `amount` / `currency` | string | |
| `netToSeller` | `NetProceeds` | after fees |
| `fetchedAt` | ISO-8601 | compared at accept time to detect a changed/withdrawn offer |

## FulfillmentData (gateway → client, for accept-offer)

| Field | Type | Notes |
|---|---|---|
| `to` / `data` / `value` | string | the transaction the seller's wallet submits (FR-006) |
| `orderHash` | string | echoes the offer being accepted |

## RewardAttribution (server-side seam)

Records FairWins as the marketplace's referral/affiliate beneficiary (D6). Holds no
funds; carries no user cost.

| Field | Type | Notes |
|---|---|---|
| `beneficiary` | address \| null | configured `OPENSEA_REFERRAL_ADDRESS[_<chainId>]`; null = attribution disabled (safe default) |
| `source` | enum | `affiliate-listing` \| `referrer-fulfillment` \| `none` |
| `appliedAtNoUserCost` | boolean | MUST be true when attached; if attaching would cost the user, `source = none` (FR-013) |

## SellActionState (client hook — `useCollectibleSell`)

State machine per action (list / cancel / accept), mirroring the gasless-write
lifecycle conventions.

```
idle
  → checking        (fetch fees; verify network == item.chainId; verify account can sign)
  → blocked         (fees unavailable → FR-009 retry; or account unsupported → FR-019 honest reason)
  → confirming      (net proceeds + fee lines + reward disclosure + gas disclosure shown)
  → signing         (wallet approval: gas-free typed-data sig for list/cancel; on-chain tx for accept)
  → submitting      (list/cancel: POST signed order to gateway; accept: send fulfillment tx / UserOp)
  → done            (list → "Listed"; cancel → "Not listed"; accept → item transferred, proceeds arrived)
  → error           (honest message; self-submit / act-on-OpenSea path always offered — FR-017)
any → networkSwitch (prompt to switch to item.chainId before signing — FR-021)
unsupported network / gateway down / killswitch: action hidden or disabled-with-reason (FR-017/FR-018)
```

**Passkey branch**: for a passkey account, `signing` uses `passkeyIntentSigner`
(ERC-1271 envelope); `submitting` an accept sends a UserOp (sponsorship decided
server-side by tier — FR-023). If the marketplace can't validate the account's
signature, the action resolves to `blocked` with an honest reason (FR-019), never a
failed submit.

## State transitions (marketplace-truth reconciliation)

Listing state is read from the marketplace, not held locally: after `list` the item
shows `Listed`; after `cancel` or `fill` it shows `Not listed`; a listing created
by another route still shows `Listed` (edge case — no misleading "not listed").
