# Phase 1 Data Model: test entities & per-spec matrix

## Entities (test view)

- **EncryptionKey** (KeyRegistry): per-account public key; state `registered |
  not-registered`. Set by the WalletPage register flow; read via the app's
  KeyRegistry lookup. Derived from the account's (per-account, R2) signature.
- **PrivateWager**: a wager created with the "Private Wager" toggle ON. Public
  fields on-chain (creator, opponent, stakes, status); private details encrypted
  to the participants' keys and stored off-chain, referenced by `metadataUri`
  (`encrypted:ipfs://<cid>`).
- **IpfsBlob** (mocked): the encrypted JSON payload, keyed by CID in the
  intercept's in-memory store. `available | unreachable` (the latter drives the
  failure path).
- **LifecycleJourney**: a connected path Open → Active → Resolved|Refunded with a
  terminal assertion.

## Actors (fixed Hardhat accounts; per-account keys via R2)

| # | Address | Role |
|---|---|---|
| 0 | 0xf39F… | Creator / admin / participant A |
| 1 | 0x7099… | Opponent / participant B |
| 4 | 0x15d3… | Bystander / non-participant (cannot decrypt) |

## Per-spec matrix (precondition → action → assertion)

### 03-encryption-chain (US2)
- No key registered → open WalletPage register flow → **assert** the register tx
  lands and the UI shows "registered"; KeyRegistry read returns a key for the
  account.
- Status query before/after → **assert** `not-registered` then `registered`.

### 16-privacy-encryption (US3)
Preconditions: `interceptIpfs()` active; per-account signing on; #0 and #1 have
registered keys (reuse the 03 flow / a setup helper).
- #0 creates a **private** wager to #1 → encrypted blob uploaded (intercepted),
  `metadataUri` is `encrypted:ipfs://…` → **assert** the wager exists with a
  private/encrypted marker and the public fields (addresses, stakes, status) are
  visible.
- #1 (participant) opens it → blob fetched (intercepted) + decrypted → **assert**
  the private details render (no `.mm-decrypt-error`/`.ma-decrypt-error`).
- #4 (non-participant) opens it → **assert** public fields visible but private
  details blocked (`.*-decrypt-error` / "Unable to decrypt").
- IPFS made unreachable (500) → participant opens → **assert** a graceful error
  with a retry affordance (no infinite spinner).

### 23-lifecycle-e2e (US1)
Reuse 001 helpers; assert terminal `wagerInfo` + a UI signal.
- **E2E-01** 1v1 manual: createAndAcceptWager → `declareWinner` → winner claims →
  **assert** Resolved + winner paid.
- **E2E-02** Polymarket auto: prepare condition → create+accept (type 4) → resolve
  [1,0] → autoResolve → **assert** Resolved, correct winner.
- **E2E-03** accept-timeout: open wager → advanceTime → claimRefund → **assert**
  Refunded.
- **E2E-04** oracle-timeout: active oracle wager → advanceTime past resolve →
  claimRefund → **assert** Refunded (both parties).
- **E2E-05** frozen-winner: resolved wager, winner frozen → claim blocked; unfreeze
  → claim succeeds → **assert** transitions.
- **(removed)** the arbitrator/challenge journey is deleted (FR-002).

## Validation rules surfaced

- A private wager can only be addressed to an opponent with a registered key
  (else the create UI blocks/guides — edge case).
- Decryption succeeds iff the viewer is a participant whose key matches; otherwise
  `*-decrypt-error`.
- Public wager fields are always visible regardless of decryption.
- IPFS-unreachable never hangs the UI; it shows an error + retry.
