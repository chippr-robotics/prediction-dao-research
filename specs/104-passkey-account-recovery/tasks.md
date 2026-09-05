# Tasks: Passkey account recovery — find the account, never guess it

**Feature**: 104 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

Ordered by dependency. `[P]` marks tasks that touch disjoint files and may run in parallel.

Release 1 is the whole of this change set. Releases 2 and 3 are listed so the sequencing is
visible, but they are **not** in scope here — Release 2 is blocked on T-101, and Release 3 needs an
index that does not exist (research R3).

---

## Release 1 — honest outcomes and address recovery

### Phase A: the resolver

- [x] **T-001** `frontend/src/lib/passkey/accountLookup.js` — the four-outcome `Resolution` type and
  its constructors. Three of the four take **no address**, so "return the derived one anyway" has
  nowhere to live (data-model.md). Same device as spec 089's `reading.js`.
- [x] **T-002** `verifyAccountForKey({ ownerBytes, address, chainId, deps })` — confirm ONE named
  address against its **current** owner set. `not-controller` only when the chain positively said
  so; an unreadable chain is `unverified`; an address with no code is `not-controller` with a
  reason that distinguishes it from "deployed, but not an owner".
- [x] **T-003** `resolveAccounts({ ownerBytes, chainId, deadlineMs, deps })` — Release 1 runs the
  single nonce-0 candidate and confirms it through T-002. The candidate is a **hint**; only a
  confirmed account is ever returned. Deadline-bounded, resolving `unverified` on expiry (R7).
- [x] **T-004** [P] Tests for T-001..T-003 in
  `frontend/src/lib/passkey/__tests__/accountLookup.test.js`. **The refusing cases are the feature**
  — a suite that asserts only the happy path has not tested this. Cover: owners include the key →
  `resolved` with the chain's `ownerIndex`; deployed without the key → `not-controller`; no code →
  `not-controller` with the other reason; read throws → `unverified` **and no address in the
  result**; deadline expiry → `unverified`; rotated-off key → not `resolved`.

### Phase B: stop opening sessions on unverified addresses (US2)

- [x] **T-005** `frontend/src/connectors/passkey.js#resolveAccountForCredential` rewritten onto the
  resolver. It may return an address **only** on `resolved`. The undeployed-derived-address branch
  stops returning that address — today it signs a locked-out member into a brand-new empty account
  with nothing said, which is the quietest failure in the spec.
- [x] **T-006** A typed `AccountUnresolved` error carrying `{ outcome, reason, credentialId }`, so
  the sign-in surface can offer recovery instead of rendering a dead end. Deliberately **not** a
  `CeremonyCancelled` — `ConnectModal` resets the step for those without showing the message, which
  would swallow the reason (the same trap as spec 103's `CredentialMismatch`).
- [x] **T-007** [P] Regression test: an empty credential book plus a key whose derived address is
  **undeployed** must NOT return that address. This is the single most important test in the
  feature — it is the failure a member reads as "my money is gone".

### Phase C: recovery by address (US3)

- [x] **T-008** `frontend/src/components/wallet/RecoverAccount.jsx` — address entry, three verdicts,
  no colour-only states (constitution V).
- [x] **T-009** Wire it into `ConnectModal` as a step reached from an unresolved sign-in, and from
  the picker for a member who knows they are on a new device. The address is a **hint**: it goes
  through the same T-002 confirmation as any search candidate, and where it came from never
  shortens the check.
- [x] **T-010** [P] Component tests, including the one that carries the security property: an
  address the key does **not** control is refused, and the two refusal reasons are distinguishable.

### Phase D: the read seam

- [x] **T-011** `smartAccount.js#defaultPublicClient` built from `resolveRpcEndpoints(chainId)`
  instead of `getNetwork(chainId).rpcUrl` (FR-012, research R6). Recovery is read-heavy, so it is
  the flow most likely to hit a rate-limited default endpoint — and an `unverified` that a member's
  own working endpoint would have made `resolved` is a member turned away for no reason.
- [x] **T-012** [P] Test that a member override is honoured on this path.

### Phase E: coverage and docs

- [x] **T-013** Cypress no-chain specs for the recovery surface; flip the matrix rows for
  `passkey.recover-account-by-lookup` (partial — verification only until Release 2),
  `passkey.recover-never-wrong-account` and `passkey.recover-by-address`. Regenerate
  `docs/developer-guide/e2e-coverage-matrix.md` (`npm run e2e:matrix`, regenerate-and-diff gated).
- [x] **T-014** `docs/developer-guide/passkey-account-recovery.md` + the `CLAUDE.md` guardrail note.
- [x] **T-015** Gates: `npm run e2e:matrix`, frontend lint, scoped Vitest. Do **not** run the full
  frontend suite locally — it OOMs this environment.

---

## Release 2 — discovery for initial owners (NOT IN THIS CHANGE)

- [ ] **T-101** *(blocking prerequisite)* Record `deployBlocks.accountFactory` per chain in
  `deployments/`. Until this exists the scan starts at block 0 and **hangs silently** rather than
  failing — the degradation `CLAUDE.md` already records for `safeProposalHub`. Verify the recorded
  block is not *later* than the factory's first `AccountCreated`: a too-late block quietly misses
  the oldest members' accounts.
- [ ] **T-102** Measure `AccountCreated` log volume per chain and record the number. Leg B's
  feasibility is a function of a figure nobody has looked at (research, open item).
- [ ] **T-103** Nonce enumeration beyond 0 (leg A).
- [ ] **T-104** Chunked, deadline-bounded `AccountCreated` scan (leg B); every candidate confirmed.
- [ ] **T-105** Multiple verified accounts → the member picks (FR-007). The resolver picks none.

## Release 3 — keys added after creation (DEFERRED, own spec)

`AddOwner` carries no address to filter on and the subgraph indexes no account entities, so
discovery for this shape needs an index (research R3/R4). Until it exists that member recovers
through Release 1's address path, and `none-found` says the search cannot see keys added after
creation rather than implying no account exists.

**Do not write a test asserting this shape is found.** It is not, by design, and a passing test
would mean the resolver was claiming something it cannot know.
