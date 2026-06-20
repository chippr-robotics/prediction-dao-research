# Implementation Plan: Open-Challenge Wagers Gated by a Shared Claim Code

**Branch**: `claude/open-challenge-wagers-twl5m8` | **Date**: 2026-06-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/024-open-challenge-wagers/spec.md`

## Summary

Add an **open-challenge** wager: a wager created with no named counterparty, protected by a
shared four-word claim code. The code does triple duty — discovery, accept authorization, and
decryption of the private terms — and the first code-holding member to accept becomes the bound
opponent, after which the wager behaves exactly like a named-opponent wager.

Technical approach (smallest change that satisfies the spec):

- **On-chain (`WagerRegistry`)**: the code is committed as an Ethereum **address** (`claimAuthority`)
  derived from the code via a deterministic keypair. A new `createOpenWager` entrypoint escrows a
  single equal stake, records `claimAuthority`, restricts resolution to oracle/`Either`/`ThirdParty`,
  and enforces active-commitment uniqueness. A new `acceptOpenWager(wagerId, signature)` verifies an
  **EIP-712 signature** from the code-derived key over `(wagerId, taker, chainId, contract)` — binding
  the acceptance to the taker's own address so a mempool observer cannot steal it — then runs the exact
  same accept-time gauntlet as today (sanctions, membership, escrow) and binds the taker as opponent.
  The `Wager` struct and all existing events/ABIs are unchanged; new state lives in side mappings
  (the established pattern for `wagerTermsVersionHash` / `_drawConsent`).
- **Off-chain crypto**: the same code deterministically derives (a) the secp256k1 claim keypair and
  (b) a symmetric key that encrypts the terms envelope (a new code-keyed envelope mode alongside the
  existing recipient-keyed ones). v1 uses a **fast** derivation — entropy-only, per the clarified
  casual-guessing threat scope.
- **Frontend**: a create-open-challenge flow (generate/display/save the four words, honest residual-risk
  + resolution-type/equal-stakes messaging) and a take-a-challenge flow (enter words → discover →
  decrypt + read → sign with the claim key → accept), with a non-member buy-membership prompt for takers.
- **Subgraph**: already backfills `opponent` on accept; add handling for the open-challenge creation
  event so open wagers index with a null opponent and `open` status.

## Technical Context

**Language/Version**: Solidity ^0.8.24 (Hardhat) for contracts; JavaScript/ES2022 + React 18 + Vite for
the frontend; AssemblyScript (The Graph) for the subgraph.

**Primary Dependencies**: OpenZeppelin Contracts (AccessControl, ReentrancyGuard, Pausable, SafeERC20,
**ECDSA** — newly used for signature recovery, already in the OZ package). Frontend: ethers v6.16
(EIP-712 signing, BIP-39 wordlist via `Mnemonic`/`LangEn`), `@noble/hashes` (keccak/HKDF),
`@noble/ciphers` (XChaCha20-Poly1305 for the code-keyed envelope) — all already in `frontend/package.json`.
No new dependencies.

**Storage**: On-chain — two new mappings on `WagerRegistry` (`claimAuthority[wagerId]`,
`openWagerIdByClaim[claimAuthority]`). Off-chain — encrypted terms bundle on IPFS (existing path),
referenced by the unchanged on-chain `metadataHash` + `metadataUri`.

**Testing**: Hardhat unit tests (`test/*.test.js`) + fuzz (`contracts/test/WagerRegistryFuzzTest.sol`,
Medusa) + Slither for the contract; Vitest for frontend crypto/flows; subgraph matchstick tests; existing
Cypress e2e for the wager lifecycle.

**Target Platform**: Polygon mainnet (137) + Amoy testnet (80002) live deployments; Mordor (63) / local
(1337) for dev. Browser SPA frontend.

**Project Type**: Web3 monorepo — Solidity contracts + React frontend + Graph subgraph.

**Performance Goals**: Accept verification is a single `ecrecover` (~3k gas) plus the existing accept
flow; no loops or unbounded state. Discovery is an O(1) mapping read (`openWagerIdByClaim`). Code
derivation/signing is client-side and sub-second.

**Constraints**: Funds-bearing + access-control + (indirectly) oracle-resolution surfaces → Constitution
Principle I applies in full (checks-effects-interactions, reentrancy guard, signature-malleability and
replay resistance, EthTrust-SL ≥ L2). Backward compatibility is mandatory: the `Wager` struct, every
existing function signature, and all events stay byte-compatible (FR-024). Network-scoped data only
(Principle III). v1 anti-guessing guarantee is explicitly scoped to casual/indiscriminate attempts
(spec FR-003a) and MUST be surfaced honestly in the UI for meaningful stakes.

**Scale/Scope**: ~4 chains; 3 user stories; 31 functional requirements. Touches `WagerRegistry.sol` +
its interface, one new wordlist/crypto module + envelope mode in the frontend, the create/accept modals,
the contract→frontend ABI sync, and one subgraph mapping handler.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Security-First Smart Contracts (NON-NEGOTIABLE)**: This is the highest-risk surface (fund custody
  + who-becomes-opponent). Design commitments:
  - **Checks-effects-interactions**: `acceptOpenWager` performs all checks (status/open, deadline, EIP-712
    signature recovery == `claimAuthority`, `taker != creator`, `taker != arbitrator` for ThirdParty,
    sanctions screen of taker + creator, membership `checkCanCreate`), then effects (set opponent, set
    Active, clear claim mappings, index taker, `recordCreate`), then the single `safeTransferFrom`
    interaction — under `nonReentrant`, mirroring the existing `acceptWager`.
  - **Signature safety**: use OpenZeppelin `ECDSA.recover` (rejects malleable `s` / `v`, reverts on bad
    sig — never returns `address(0)` to collide with an unset authority). EIP-712 domain binds `chainId`
    + `verifyingContract`; the typed message binds `wagerId` + `taker` → no cross-chain, cross-contract,
    cross-wager, or cross-taker replay, and front-running resistance (FR-011).
  - **No new fund math**: equal stakes (FR-016b) ⇒ `opponentStake == creatorStake`; payout/refund/draw
    paths are byte-for-byte the existing ones.
  - **Access control**: `createOpenWager`/`acceptOpenWager` keep the membership gate and sanctions guard;
    no new roles. Resolution-type restriction (FR-016a) and equal-stakes (FR-016b) revert at creation.
  - **Tooling**: Slither clean (no new high/critical), Medusa fuzz extended to the open path, EthTrust-SL
    ≥ L2 with documented reasoning. Smart-contract security agent review before merge. **PASS (with the
    above carried into the design and tasks).**
- **II. Test-First and Comprehensive Coverage (NON-NEGOTIABLE)**: Unit + fuzz tests written with the
  contract change — open create (each allowed/forbidden resolution type, unequal-stake revert, duplicate
  claim revert), accept (valid sig happy path, wrong-key reject, self-accept reject, arbitrator-accept
  reject, replay/front-run reject, non-member/sanctioned reject, double-accept race), and claim-slot
  release on cancel/expire/refund. Frontend Vitest for code↔keypair/key derivation determinism and the
  code-keyed envelope round-trip. Existing named-opponent tests MUST stay green (FR-024). **PASS.**
- **III. Honest State, No Mocks/Placeholders**: Discovery, decryption, and acceptance all reflect real
  on-chain state; no mocked codes or stubbed acceptance. The UI states the v1 residual brute-force risk
  honestly (FR-003a) and prompts the opponent to retain the code (FR-018a, no false durability). Open
  wagers are network-scoped like all wagers. **PASS — and central to the design.**
- **IV. Fail Loudly in CI**: No `continue-on-error` on contract test/Slither/lint/build or frontend
  test/lint/a11y. **PASS.**
- **V. Accessible, Consistent Frontend**: New create/accept UI meets WCAG 2.1 AA (code entry is a labeled
  input with clear error states; the residual-risk warning is a discoverable, non-color-only notice).
  ABIs/addresses come from the generated `sync:frontend-contracts` artifacts, never hand-copied
  (the new functions/events flow through the sync). **PASS.**

**Result**: All gates pass with explicit Principle I commitments above. No deviations →
**Complexity Tracking not required.**

*Post-Phase 1 re-check*: The design adds only two O(1) side mappings + two functions to the contract
(no struct/event/ABI break), one pure crypto module + one envelope mode to the frontend, and one
subgraph handler. It introduces no new core technology, no new roles, and reuses the existing escrow,
membership, sanctions, IPFS, and ABI-sync machinery. Signature handling uses the audited OZ `ECDSA`
library rather than raw `ecrecover`. **Still PASS.**

## Project Structure

### Documentation (this feature)

```text
specs/024-open-challenge-wagers/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 output — derivation, signature, ABI-stability, crypto decisions
├── data-model.md        # Phase 1 output — on-chain state + envelope shape + state transitions
├── quickstart.md        # Phase 1 output — end-to-end validation guide
├── contracts/           # Phase 1 output
│   ├── wager-registry-open-challenge.md   # New functions, events, errors, view contracts
│   └── claim-code-crypto.md               # code → keypair + symmetric key + EIP-712 message
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
contracts/
├── wagers/
│   └── WagerRegistry.sol          # EDIT: createOpenWager, acceptOpenWager, claim mappings + cleanup
├── interfaces/
│   └── IWagerRegistry.sol         # EDIT: new fns/events/errors (struct UNCHANGED)
└── test/
    └── WagerRegistryFuzzTest.sol  # EDIT: fuzz the open create/accept invariants

test/
├── WagerRegistry.openChallenge.test.js   # NEW: unit tests for the open path
└── integration/
    └── openChallengeLifecycle.test.js     # NEW: create → discover → accept → resolve → claim

frontend/
├── src/
│   ├── utils/
│   │   ├── claimCode/
│   │   │   ├── wordlist.js          # NEW: BIP-39 4-word generate/normalize/validate (ethers LangEn)
│   │   │   └── deriveFromCode.js    # NEW: code → {claimPrivKey, claimAddress, symKey}; EIP-712 signer
│   │   └── crypto/
│   │       └── envelopeEncryption.js  # EDIT: add code-keyed envelope mode (encrypt/decrypt by symKey)
│   ├── hooks/
│   │   ├── useFriendMarketCreation.js  # EDIT: open-challenge branch (no opponent, createOpenWager)
│   │   └── useOpenChallengeAccept.js   # NEW: discover by code → decrypt → sign → acceptOpenWager
│   ├── components/fairwins/
│   │   ├── FriendMarketsModal.jsx      # EDIT: "open challenge" mode + code display/save + warnings
│   │   └── TakeChallengeModal.jsx      # NEW: enter code, read terms, accept (+ buy-membership prompt)
│   ├── abis/WagerRegistry.{js,json}    # GENERATED via sync:frontend-contracts (do not hand-edit)
│   └── test/
│       ├── claimCode/deriveFromCode.test.js   # NEW: determinism + EIP-712 vectors
│       └── claimCode/envelopeCode.test.js     # NEW: code-keyed envelope round-trip + tamper
└── ...

subgraph/
├── subgraph.yaml                      # EDIT: register OpenWagerCreated event handler
└── src/mappings/wagerRegistry.ts      # EDIT: handleOpenWagerCreated (opponent=null, status=open)
```

**Structure Decision**: Web3 monorepo. Contract logic stays inside the existing `WagerRegistry` (the
constitution-blessed active escrow) with additive functions + side mappings so the struct/ABI/events
remain backward compatible. All code↔key derivation is isolated in a pure, unit-testable
`frontend/src/utils/claimCode/` module reused by both the create and accept flows, preventing the
security-critical derivation from drifting between surfaces. The contract ABI reaches the frontend only
through the existing `sync:frontend-contracts` generator (Principle V).

## Complexity Tracking

> No constitution violations — section intentionally empty.
