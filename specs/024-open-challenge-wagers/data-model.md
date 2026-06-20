# Phase 1 Data Model: Open-Challenge Wagers

## On-chain state (WagerRegistry)

### Unchanged

- **`Wager` struct** — byte-for-byte as today (FR-024). For an open challenge, `opponent` is
  `address(0)` while `status == Open`, and is set to the taker's address on accept. `creatorStake ==
  opponentStake` always (equal-stakes, FR-016b). No new fields.
- All existing mappings (`_wagers`, `_userWagerIds`, `wagerTermsVersionHash`, `_drawConsent`,
  `_allowedTokens`, `_frozen`) and their semantics.

### New side mappings (kept out of the struct, per the existing pattern)

| Name | Type | Meaning | Lifecycle |
|------|------|---------|-----------|
| `claimAuthority` | `mapping(uint256 => address)` (public) | Code-derived address committed to an open wager. `0` ⇒ not an open challenge. | Set in `createOpenWager`; cleared when the wager leaves `Open` (accept / cancel / expire / refund). |
| `openWagerIdByClaim` | `mapping(address => uint256)` (public) | Reverse index: active open wager for a given claim authority. `0` ⇒ none. Powers discovery (FR-007) and active-uniqueness (FR-006a). | Set in `createOpenWager`; cleared alongside `claimAuthority`. |

**Invariants**
- `claimAuthority[id] != 0` ⟺ wager `id` is (or was) an open challenge.
- While `status(id) == Open` and it is an open challenge: `openWagerIdByClaim[claimAuthority[id]] == id`.
- A given `claimAuthority` maps to **at most one** wager in `Open` status at a time (FR-006a). After it
  leaves `Open`, both mappings for it are cleared so the code may be reused.
- `claimAuthority` is never `address(0)` for an open wager (enforced at create); combined with
  `ECDSA.recover` reverting on bad signatures, an unset slot can never be satisfied by a forged accept.

## State transitions (open challenge)

```
                       createOpenWager
                            │  (escrow creatorStake; opponent = 0x0; claimAuthority set)
                            ▼
                         ┌──────┐  acceptOpenWager(id, sig)         ┌────────┐
                         │ Open │ ───────────────────────────────► │ Active │
                         └──────┘  (sig==authority, taker bound,     └────────┘
                            │        opponentStake escrowed,             │
                            │        claim mappings cleared)             │  (identical to a
          cancelOpen /      │                                            │   named-opponent wager
          claimRefund(Open)/│                                            ▼   from here on)
          batchExpireOpen   │                                  Resolved / Draw / Refunded
            (refund creator,▼                                  → claimPayout / claimRefund
             clear claim)  Cancelled / Refunded
```

- **Open → Active**: only via `acceptOpenWager` with a valid claim-key signature; binds `opponent =
  msg.sender`, clears the claim mappings (frees the code), escrows the opponent's equal stake.
- **Open → Cancelled** (`cancelOpen`, creator only) / **Open → Refunded** (`claimRefund` or
  `batchExpireOpen` after `acceptDeadline`): refund the creator and clear the claim mappings.
- **`declineWager` does not apply** to open challenges (no named opponent) — FR-023.
- From `Active` onward the wager is indistinguishable from a named-opponent wager: `declareWinner`,
  `declareDraw`/`revokeDraw`, `autoResolveFromPolymarket`/`autoResolveFromOracle`, `claimPayout`,
  `claimRefund` (Active branch) are unchanged (FR-016, FR-009-equivalent).

## Validation rules (createOpenWager — Checks phase)

1. `_screen(msg.sender)` (sanctions, before effects).
2. `claimAuthority_ != address(0)` → else `ZeroClaimAuthority`.
3. `openWagerIdByClaim[claimAuthority_] == 0` → else `ClaimAuthorityInUse` (FR-006a uniqueness).
4. `_allowedTokens[token]` and `stake != 0` (single stake; `creatorStake = opponentStake = stake`).
5. Deadlines: `acceptDeadline > now`, `resolveDeadline > acceptDeadline`, within `MAX_ACCEPT_WINDOW` /
   `MAX_RESOLVE_WINDOW` (reused).
6. Resolution type ∈ { `Either`, `ThirdParty`, `Polymarket`, `ChainlinkDataFeed`, `ChainlinkFunctions`,
   `UMA` } → else `OpenResolutionTypeNotAllowed` (FR-016a; `Creator`/`Opponent` rejected). `Either` is
   automatically equal-stakes (satisfied by the single-stake design).
7. `ThirdParty`: `arbitrator != 0` and `arbitrator != msg.sender` (the taker is unknown now, so the
   `arbitrator != opponent` half is enforced at accept). Other types: `arbitrator == 0`.
8. Oracle types: non-zero `oracleConditionId`, adapter set, condition not already resolved (reused logic).
9. Membership gate `checkCanCreate(msg.sender)`.

## Validation rules (acceptOpenWager — Checks phase)

1. `status == Open` and `claimAuthority[id] != 0` (is an open challenge) → else `NotOpenChallenge` /
   `NotOpen`.
2. `now <= acceptDeadline` → else `AcceptExpired`.
3. `ECDSA.recover(digest(id, msg.sender), sig) == claimAuthority[id]` → else `BadClaimSignature`
   (FR-010/FR-011).
4. `msg.sender != creator` → else `SelfWager` (FR-014).
5. `ThirdParty`: `msg.sender != arbitrator` → else `ArbitratorCannotTake` (FR-015).
6. `_screen(msg.sender)`, `_screen(creator)` (FR-013).
7. `checkCanCreate(msg.sender)` membership gate (FR-013).

Effects then interactions exactly as `acceptWager` (set opponent/Active, clear claim mappings, index
taker, `recordCreate`, then `safeTransferFrom(opponentStake)`), under `nonReentrant`/`whenNotPaused`.

## Off-chain: Code-keyed terms envelope

| Field | Meaning |
|-------|---------|
| `version` | Envelope schema/version tag (distinguishes code-keyed from recipient-keyed). |
| `mode` | `"code"` (vs existing `"x25519"` / `"xwing"`). |
| `nonce` | XChaCha20-Poly1305 nonce (24 bytes, random per encryption). |
| `ciphertext` | AEAD-sealed terms (description, side labels, etc.). |
| `aad` | Associated data binding the terms-version hash (parity with recipient-keyed path). |
| — | **No `recipients` list** — readability is by `symKey` derived from the code. |

The IPFS reference to this bundle is hashed into the on-chain `metadataHash` (unchanged), so a substituted
or corrupted bundle is detectable (FR-019); an unreachable bundle yields "terms unavailable" (FR-020).

## Off-chain: Claim Code (derived, never stored)

| Derived value | From | Used for |
|---------------|------|----------|
| `normalize(code)` | the 4 words | canonical input to both derivations (R2) |
| `claimPrivKey` / `claimAddress` | `keccak256("FairWins/claim/v1" ‖ normalized)` | EIP-712 accept signature ; `claimAddress` is the on-chain `claimAuthority` and discovery key |
| `symKey` | `keccak256("FairWins/terms/v1" ‖ normalized)` | seal/open the code-keyed envelope |

The code itself is generated client-side, displayed once for the creator to save and share out-of-band,
and never transmitted to a server or written on-chain.
