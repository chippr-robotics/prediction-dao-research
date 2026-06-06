# Phase 0 Research: Multi-Recipient Wager Encryption (Participants + Arbitrator)

Grounded in the current code (file:line) and the resolved spec decisions (observer = arbitrator; discovery in scope; block-on-missing-key).

---

## D1 — Adding the arbitrator as a reader: reuse the existing multi-recipient envelope

**Decision**: Include the arbitrator in the existing per-recipient envelope `recipients` array; do **not** change the envelope/IPFS format.

**Rationale**: `encryptEnvelope(data, recipients, signingVersion)` already accepts `recipients: Array<{address, publicKey}>` and wraps one copy of the data key per recipient into a `keys[]` array (`frontend/src/utils/crypto/envelopeEncryption.js:295,309` for X25519 v1 and `:472,486` for X-Wing v2). `canDecrypt(envelope, address)` already returns true for any address present in `keys[]` (`:644-648`), so an arbitrator added as a recipient decrypts exactly like a participant — **no decryption-side change**. The user's proposal ("a JSON object with the creator encrypting the message for the other parties, saved as a file in IPFS") is literally the current format; the only change is *who* is in `recipients`. Today the creation path uses two recipients (creator + opponent); this feature adds the arbitrator when one is assigned.

**Alternatives considered**: A new bundle format / separate per-reader files — rejected: the existing single-bundle, per-recipient-wrapped-key design already satisfies "each party decodes their own copy" and is feature-002-audited. Re-inventing it adds risk for no gain.

---

## D2 — Arbitrator discovery: on-chain per-user index (the one contract change)

**Decision**: In `WagerRegistry.createWager`, when `arbitrator != address(0)`, also `_userWagerIds[arbitrator].add(wagerId)` so `getUserWagers(arbitrator)` / `getUserWagerIds(arbitrator)` return arbitrated wagers. No event change required.

**Rationale**: Today the index is populated only for creator and opponent (`WagerRegistry.sol:243-244`), and `WagerCreated` has no arbitrator field (`IWagerRegistry.sol:29-39`), so an arbitrator literally cannot enumerate the wagers they oversee — the documented reason `ThirdParty` was disabled (`FriendMarketsModal.jsx:33-37`, `useFriendMarketCreation.js:235-241`, `docs/fairwins-functional-testing-checklist.md:130`). Adding the arbitrator to the same `EnumerableSet` index is the minimal change, mirrors the existing pattern, and the frontend already reads wagers via `getUserWagers` — so the discovery UI is a filter, not a new data path.

**Alternatives considered**:
- *Add an `arbitrator` field to `WagerCreated` + index off-chain* — rejected: the deployed subgraph indexes `FriendGroupMarketFactory`, **not** `WagerRegistry` (see project memory), so events alone don't yield a queryable index without new subgraph wiring; and it's still an on-chain change (event signature). The per-user index is simpler and already consumed.
- *Client-side scan of all wagers* — rejected: not feasible at scale; `getUserWagers` exists precisely to avoid log scans.

**Scope note**: discovery applies to wagers created **after** the index change deploys. Pre-existing `ThirdParty` wagers (none creatable via UI recently) are not retro-indexed; acceptable.

---

## D3 — Composing the contract change with the in-flight 004 v3 redeploy

**Decision**: Fold the one-line `createWager` index change into the **same `WagerRegistry` v3 redeploy** already planned for 004 draw-resolution (PR #633), rather than a separate redeploy.

**Rationale**: `WagerRegistry` is non-upgradeable; each contract change is a versioned redeploy (v1→v2→v3). Two pending features both touch `createWager`/the registry; deploying twice doubles the gas, migration, and re-point risk. One coordinated v3 cutover (Status.Draw + arbitrator-index) is cleaner. The mainnet registry is currently **paused for testing**, so a single combined cutover has minimal live-state impact.

**Sequencing**: If 004 merges first, 005 adds its line to the v3 contract before the (gated) mainnet deploy. The **frontend** slice of 005 (recipients incl. arbitrator, key-gate, ThirdParty create UI) can be built and unit-tested independently now; only live arbitrator *discovery* depends on the deployed index. Document the cross-PR dependency in tasks.

**Alternatives considered**: Independent 005 redeploy — rejected (wasteful/risky, above). Making the registry upgradeable — rejected (adds an admin upgrade path to a fund-custody contract; same reasoning as 004's plan).

---

## D4 — Key-gate: block creation when the arbitrator has no published key

**Decision**: Before creating a private `ThirdParty` wager, verify the arbitrator has a registered encryption key via `hasRegisteredKey(arbitrator, provider)`; if not, **block** creation with a clear message naming the missing party. Encryption uses `lookupPublicKey(arbitrator)` to add them as a recipient.

**Rationale**: A reader can only be included if their public key is known (`keyRegistryService.js:60,104`). The spec decision (Q3) is to block rather than late-bind, guaranteeing the arbitrator can read the moment the wager exists (FR-007/SC-007) and keeping v1 simple (no re-prepare/update flow). The participants' own key checks already gate private creation today; this extends the same check to the arbitrator.

**Alternatives considered**: Late-binding (attach the arbitrator's copy after they register) and warn-and-proceed — both rejected by the spec decision; recorded as possible future enhancements.

---

## D5 — Re-enabling ThirdParty in the create flow

**Decision**: Add `ResolutionType.ThirdParty` back to `PARTICIPANT_RESOLUTION_TYPES` (`FriendMarketsModal.jsx:33`), add an arbitrator-address input (validated: a valid address, not the creator or opponent — mirrors the contract's `ArbitratorDisallowed`/`ArbitratorRequired` rules), run the D4 key-gate, and pass the real arbitrator to `createWager` instead of the hardcoded `ethers.ZeroAddress` (`useFriendMarketCreation.js:241`). Disclose in the UI that the arbitrator can read the terms.

**Rationale**: These are the exact spots that were neutralized when ThirdParty was disabled; re-enabling them, now that read + discovery are solved, restores the path (FR-006). The contract already enforces arbitrator validity, so the UI validation is defense-in-depth + good UX.

---

## D6 — Arbitrator's decryption, integrity, and resolution: no new mechanics

**Decision**: Reuse the existing decrypt path, `metadataHash` integrity binding, and `declareWinner` ThirdParty branch unchanged.

**Rationale**: Once the arbitrator is a recipient (D1), `useLazyMarketDecryption`/`canDecrypt` already let them read; the on-chain `metadataHash` over `metadataReference` already makes the bundle tamper-evident (`useFriendMarketCreation.js:278`), so the arbitrator (like participants) can trust the terms match the wager (FR-008). Resolution authority already exists: `declareWinner` authorizes the arbitrator for `ThirdParty` wagers, and the 004 work adds arbitrator-solo `declareDraw`. So end-to-end resolution (FR-006/SC-003) needs no new resolution code — only discovery + read, which D1–D2 provide.

**Alternatives considered**: A bespoke arbitrator-resolution flow — rejected as unnecessary; the existing authority + the new visibility are sufficient.

---

## D7 — Surfacing "wagers I arbitrate" (discovery UI)

**Decision**: Add an "Arbitrating" view/filter in the wager list (`MyMarketsModal.jsx`) that lists wagers where the connected wallet is the arbitrator, sourced from `getUserWagers(account)` (which, post-D2, includes arbitrated wagers) filtered by `wager.arbitrator == account`, with the arbitrator's resolve/draw actions.

**Rationale**: `getUserWagers` already returns full structs the UI renders; after D2 it includes arbitrated wagers, so this is a filter + a tab/section, not a new fetch path. Keeps discovery consistent with how participants already see their wagers.

**Alternatives considered**: A separate arbitrator dashboard/page — rejected for v1 (more surface); a filter in the existing list is the smallest honest delivery.
