# Implementation Plan: Multi-Recipient Wager Encryption (Participants + Arbitrator)

**Branch**: `005-multi-recipient-encryption` | **Date**: 2026-06-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-multi-recipient-encryption/spec.md`

## Summary

Make an assigned **arbitrator** a full reader and actor on a private wager so third-party resolution works end-to-end again. Three coordinated changes:

1. **Encrypt for the arbitrator** — include the arbitrator's address in the per-reader encrypted bundle so they can decrypt the terms. The envelope format **already supports N readers** (`encryptEnvelope(data, recipients[])` wraps one copy of the data key per recipient, stored in `keys[]`); today it is called with exactly two readers (creator + opponent). This feature adds the arbitrator to that recipient set — the on-disk JSON/IPFS shape is unchanged.
2. **Make the arbitrator discoverable** — the on-chain per-user index (`_userWagerIds`) records only creator + opponent today, and `WagerCreated` omits the arbitrator, so an arbitrator can't find the wagers they oversee. Add the arbitrator to the per-user index at creation (`_userWagerIds[arbitrator].add(wagerId)` when an arbitrator is set), so `getUserWagers(arbitrator)` returns them. This is the **only** on-chain change.
3. **Re-enable + gate the create flow** — restore `ThirdParty` resolution in the create UI with an arbitrator-address input; before creating, require the arbitrator to have a published encryption key (block with a clear message if not), so the wager is never created in a state the arbitrator can never read. Surface, honestly, that the arbitrator can read the terms.

With read access + discovery + the existing on-chain `declareWinner` arbitrator branch (and the 004 arbitrator-solo draw), third-party resolution is usable again.

**Technical approach**: The cryptosystem, KeyRegistry (address→public key), IPFS envelope storage, and on-chain `metadataHash` integrity binding all already exist (feature 002). This feature is mostly **frontend** (recipient assembly, key-gate, UI, an "arbitrating" discovery view, honest disclosure) plus **one additive on-chain line** (index the arbitrator). Because `WagerRegistry` is non-upgradeable, that on-chain line ships via a registry redeploy — and there is already one in flight (the 004 draw-resolution **v3** on PR #633). This plan **composes the arbitrator-index change into that same v3 redeploy** rather than doing a second one.

## Technical Context

**Language/Version**: Solidity `^0.8.24` (one additive line in `WagerRegistry.createWager`); JavaScript/JSX + React 18 + Vite (the bulk — encryption recipient assembly, key-gate, UI); Vitest.

**Primary Dependencies**: Existing envelope encryption (`frontend/src/utils/crypto/envelopeEncryption.js` — X25519 v1 / X-Wing v2, multi-recipient), `keyRegistryService` (`lookupPublicKey` / `hasRegisteredKey` / `ensureKeyRegistered`), `ipfsService` (`uploadEncryptedEnvelope` / `fetchEncryptedEnvelope` / `parseEncryptedIpfsReference`), `KeyRegistry` contract, `WagerRegistry` (per-user `EnumerableSet` index + `getUserWagers`).

**Storage**: Off-chain encrypted bundle on IPFS (Pinata), referenced on-chain as `encrypted:ipfs://<CID>` in `Wager.metadataUri`, bound by `Wager.metadataHash`. On-chain per-user index in `WagerRegistry`.

**Testing**: Hardhat (`test/`), Vitest (frontend); Slither + Medusa for the contract change; axe/Lighthouse for the new UI.

**Target Platform**: EVM (Polygon mainnet 137 / Amoy 80002); web app at fairwins.app.

**Project Type**: Web3 monorepo — contracts + React/Vite frontend (+ subgraph, not used here — it indexes the Factory, not `WagerRegistry`).

**Performance Goals**: One extra key wrap per added reader at creation (negligible); one extra `SSTORE` (index add) when an arbitrator is set; arbitrator decrypt path identical to a participant's.

**Constraints**: Privacy + access control are the highest-risk surfaces. Only designated readers may decrypt (no leak to non-readers); the arbitrator's read ability must be disclosed honestly; the bundle must remain verifiable against the on-chain reference; creation must hard-block when the arbitrator lacks a key; addresses/ABIs come only from sync artifacts; new UI is WCAG 2.1 AA; CI fails loudly.

**Scale/Scope**: Small but cross-layer: 1 additive contract line (folded into the 004 v3 redeploy) + ABI regen, frontend recipient assembly + key-gate + ThirdParty create UI + arbitrating discovery view + honest disclosure, contract & frontend tests, security review. Legacy networks out of scope.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Security-First Smart Contracts (NON-NEGOTIABLE) — **PASS (additive, non-fund)**

- The only on-chain change adds `_userWagerIds[arbitrator].add(wagerId)` in `createWager` when `arbitrator != address(0)` (the `ThirdParty` branch already validates the arbitrator is non-zero and distinct from both participants). It moves **no funds**, changes no resolution authority, and follows the existing creator/opponent indexing pattern — no new reentrancy or CEI surface.
- **Information exposure**: the arbitrator address is already public on the `Wager` struct (`getWager` returns it); indexing it only makes "wagers where X is arbitrator" *queryable*, exposing no new on-chain data.
- Static analysis (Slither) + fuzzing (Medusa) on the changed `createWager`; smart-contract security-agent review. Ships in the 004 **v3** redeploy (see Complexity Tracking).

### II. Test-First and Comprehensive Coverage (NON-NEGOTIABLE) — **PASS**

- Contract: a test that an arbitrated wager appears in `getUserWagerIds(arbitrator)` (and a non-arbitrated wager does not); the existing `ThirdParty` `declareWinner` path stays green.
- Frontend: the encrypted bundle includes the arbitrator as a reader; the arbitrator can decrypt while a non-reader cannot; creation is **blocked** when the arbitrator has no registered key; the create UI offers ThirdParty + arbitrator input + honest disclosure; an "arbitrating" view lists wagers the connected wallet arbitrates. Interface/ABI change updates the contract tests + frontend ABI in the same PR.

### III. Honest State, No Mocks or Placeholders — **PASS (privacy-critical)**

- Adding the arbitrator as a reader is **disclosed** in the UI (participants see that an arbitrator can read the terms); the privacy state is presented truthfully (Principle V trust surface). Confidentiality is preserved for non-readers; the bundle stays verifiable against `metadataHash` (tamper-evident). No mock data; real KeyRegistry keys only.

### IV. Fail Loudly in CI — **PASS**

No `continue-on-error` on lint/test/build/security. New contract + frontend tests and Slither gating block on failure.

### V. Accessible, Consistent Frontend — **PASS**

The restored ThirdParty option, arbitrator-address input, key-missing block message, and the privacy disclosure meet WCAG 2.1 AA (labeled, keyboard-reachable, errors announced); ESLint clean. The new v3 address + regenerated ABI come from sync artifacts.

### Additional Constraints — **PASS**

Tech stack unchanged. Key management uses the existing on-chain KeyRegistry + the air-gapped floppy flow for the deploy; no secrets committed. `contracts-archive/` untouched. `deployments/` updated for the v3 address.

**Result**: No violations. One complexity item (the on-chain change requires a redeploy and must compose with the in-flight 004 v3) is tracked below.

## Project Structure

### Documentation (this feature)

```text
specs/005-multi-recipient-encryption/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (reader set, discovery via index, key-gate, v3 coordination)
├── data-model.md        # Phase 1 — reader set, bundle shape, index change, entities
├── quickstart.md        # Phase 1 — validation scenarios
├── contracts/           # Phase 1 — on-chain delta, encryption/bundle contract, UI contract
│   ├── wager-registry-arbitrator-index.md
│   ├── encryption-bundle-contract.md
│   └── frontend-ui-contract.md
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
contracts/
└── wagers/WagerRegistry.sol        # createWager: + _userWagerIds[arbitrator].add(wagerId) when arbitrator != 0
                                    #   (folds into the 004 draw-resolution v3 redeploy)

frontend/src/
├── utils/crypto/envelopeEncryption.js   # no change — encryptEnvelope already multi-recipient
├── utils/keyRegistryService.js          # reuse lookupPublicKey / hasRegisteredKey for the arbitrator
├── hooks/useEncryption.js               # recipient assembly: add arbitrator to recipients; key-gate
├── hooks/useFriendMarketCreation.js     # pass real arbitrator (not ZeroAddress) for ThirdParty
├── components/fairwins/FriendMarketsModal.jsx  # re-add ThirdParty to PARTICIPANT_RESOLUTION_TYPES + arbitrator input + key check + disclosure
├── components/fairwins/MyMarketsModal.jsx      # "Arbitrating" view: list wagers the wallet arbitrates (getUserWagers) + arbitrator resolve action
├── abis/WagerRegistry.js                # regenerated ABI (no surface change, but ships with the v3 artifact)
└── test/                                # Vitest: recipients incl. arbitrator, key-gate block, ThirdParty UI, arbitrating view, decrypt-by-arbitrator

test/
└── WagerRegistry.arbitrator-index.test.js   # NEW: arbitrated wager indexed for arbitrator; ThirdParty declareWinner still works
```

**Structure Decision**: Existing Web3 monorepo. The feature is overwhelmingly frontend; the single additive contract line is **deferred into the 004 v3 redeploy** so there is one coordinated `WagerRegistry` cutover, not two. The subgraph is not involved (it indexes `FriendGroupMarketFactory`, not `WagerRegistry`; discovery uses the on-chain per-user index the frontend already reads).

## Complexity Tracking

| Cost | Why Needed | Simpler Alternative Rejected Because |
|------|-----------|--------------------------------------|
| **An on-chain change → another `WagerRegistry` redeploy**, coordinated with the in-flight 004 draw-resolution **v3** (PR #633) | Arbitrator discovery (FR-005/SC-002) genuinely requires the registry to index wagers by arbitrator — off-chain alternatives don't exist here (the subgraph indexes the Factory, not the registry; `WagerCreated` omits the arbitrator). The cheapest correct approach mirrors the existing creator/opponent per-user index. | (a) *Index off-chain via events* — rejected: `WagerCreated` has no arbitrator field and the subgraph doesn't track the registry, so it would itself need an on-chain event change + new subgraph wiring (more work, more surface). (b) *Two separate redeploys (004 then 005)* — rejected: wasteful and risky; fold both additive changes into one v3 cutover. (c) *Skip discovery* — rejected: it's an explicit in-scope decision; without it arbitration isn't usable end-to-end. |
| **Adding a reader (arbitrator) to a privacy-critical encrypted bundle** | The feature's purpose: a neutral resolver must read the terms. | Not adding the arbitrator as a reader would leave third-party resolution dead (the status quo). The privacy cost is bounded and disclosed: only the named arbitrator is added, confidentiality vs. non-readers is unchanged, and the UI states it plainly. |

> **Dependency note:** the on-chain slice of this feature depends on / merges with the 004 v3 redeploy. If 004 ships first, 005 adds its one line to v3 (or a v3.1) before the mainnet cutover. The **frontend** slice (recipients, key-gate, UI) can land and be tested independently against the current contract for everything except live arbitrator *discovery*, which needs the deployed index change.
