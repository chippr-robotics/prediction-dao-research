# Implementation Plan: Wager Tag Naming Registry

**Branch**: `claude/wager-tag-registry-lmikng` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/053-wager-tag-registry/spec.md`

## Summary

Members register a unique `%tag` handle bound to their wallet, resolvable everywhere an
address is entered and shown in the display-name chain (book > tag > ENS > generated).
Technical approach (per clarifications + research.md): a new **on-chain UUPS registry
contract** (`WagerTagRegistry`, `UUPSManaged` + `SignerIntentBase`) with ENS-style
commit–reveal registration, canonical ASCII-only tags keyed by hash, 90-day release
quarantine, 30-day change cooldown, 48-hour delayed repointing, permissionless 12-month
lapse reclamation, and least-privilege curator/moderator/verifier roles that can never
reassign a tag. Frontend integrates via a new `lib/tags/` module + `useWagerTag` hook
(extending spec 040's `useOpponentName`) and tag-aware `AddressInput`; gasless via spec
035 relayed intents with self-submit fallback.

## Technical Context

**Language/Version**: Solidity ^0.8.24 (Hardhat); JavaScript ES modules (React 18 + Vite)

**Primary Dependencies**: OpenZeppelin upgradeable (via `UUPSManaged`, `SignerIntentBase`),
ethers v6, existing `IMembershipManager` + `ISanctionsGuard` proxies, relay-gateway (spec
036) for optional gasless submission

**Storage**: On-chain contract storage (append-only + `__gap`, ERC-7201 for intent nonces);
no new off-chain datastore; no subgraph dependency for resolution (research R7)

**Testing**: Hardhat (unit + integration + Medusa fuzz invariants, Slither), Vitest + axe
for frontend

**Target Platform**: EVM networks already configured in `deployments/` (launch cadence
follows the platform's standard testnet → mainnet flow); frontend web app

**Project Type**: Web app + smart contracts (existing repo structure)

**Performance Goals**: Tag resolution ≤ 2 s in entry fields (SC-002) — single `eth_call`;
reverse lookups cached short-TTL alongside the ENS cache; registration end-to-end ≤ 2 min
including the 60 s commit age (SC-001)

**Constraints**: Registration/changes gated on active membership + sanctions screening;
never-stranded rule (every gasless action has self-submit fallback); no flow may hard-block
when the registry is unreachable (FR-013); tags never on-chain-linked to pool anonymity
(spec 034 nicknames untouched)

**Scale/Scope**: One singleton registry per network; membership-sized population (≤ tens of
thousands of tags); 1 contract + 1 interface + ~6 intent structs + 1 frontend lib + 2 hooks
touched + 1 settings panel + deploy script

## Constitution Check

*GATE: evaluated pre-Phase 0 and re-checked post-Phase 1 design — PASS (no violations; Complexity Tracking empty).*

- **I. Security-first contracts**: No fund custody; risk surface is identity/routing.
  Checks-effects-interactions holds (external calls are view-only reads of membership/
  sanctions before effects; no value transfer). Access control is least-privilege
  (curator/moderator/verifier/upgrader split; **no role can reassign a tag** — the spec's
  FR-017 is enforced by absence of code). Takeover protections (commit–reveal, repoint
  delay, quarantine) are bounded-tunable, not disableable (research R10). Slither + Medusa
  invariants required (quickstart §2); security-agent review before merge. EthTrust-SL2
  posture documented in the contract NatSpec.
- **II. Test-first / coverage**: Unit + integration + fuzz for every transition and failure
  path (quickstart §1); Vitest for lib/hooks/components (§3); interface change ships with
  its tests in the same PR.
- **III. Honest state**: Resolution statuses (`REPOINTING`, `QUARANTINED`, `SUSPENDED`,
  `LAPSED_RECLAIMABLE`) are computed from chain state + clock in views — the UI can never
  show a stale "active" tag as committable; pending repoints are disclosed, never hidden.
  Network-scoped: registry resolved per-chain via `getContractAddressForChain`.
- **IV. Fail loudly in CI**: New tests join existing gating jobs; `check:storage-layout`
  gains the `wagerTagRegistry` pair; no `continue-on-error`.
- **V. Accessible frontend**: New panel + input affordances meet WCAG 2.1 AA (axe
  assertions in component tests); addresses/ABIs come only from sync artifacts.
- **Upgradeable-contracts rule**: inherits `UUPSManaged`, one-time `initialize`,
  append-only storage + `__gap`, in-place upgrade path via `scripts/deploy/lib/upgradeable.js`.
- **Gasless rule (specs 035/036)**: intent structs byte-identical in the three mandated
  locations; self-submit fallback for every action.

## Project Structure

### Documentation (this feature)

```text
specs/053-wager-tag-registry/
├── plan.md              # This file
├── research.md          # Phase 0 — 10 resolved decisions
├── data-model.md        # Phase 1 — storage, roles, statuses, transitions
├── quickstart.md        # Phase 1 — validation guide
├── contracts/
│   ├── wager-tag-registry-interface.md   # Solidity + frontend lib surface
│   └── intent-eip712-schemas.md          # gasless intent structs (3-way sync rule)
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
contracts/
├── naming/
│   └── WagerTagRegistry.sol          # NEW — UUPS impl (UUPSManaged + SignerIntentBase)
├── interfaces/
│   └── IWagerTagRegistry.sol         # NEW
└── mocks/                            # membership/sanctions mocks reused; add if gaps found

test/
├── wagerTagRegistry.test.js          # NEW — lifecycle, guards, moderation, lapse
├── wagerTagRegistry.intents.test.js  # NEW — …WithSig twins
└── integration/wagerTagRegistry.membership.test.js  # NEW — real MembershipManager proxy

frontend/src/
├── lib/tags/                         # NEW — normalizeTag, formatTag, resolveTag, lookupTagOf
├── hooks/useWagerTag.js              # NEW — cached reverse lookup
├── hooks/useOpponentName.js          # MODIFIED — insert tag step (book > tag > ens > generated)
├── components/ui/AddressInput.jsx    # MODIFIED — %tag entry + confirmation affordance
└── components/account/WagerTagPanel.jsx  # NEW — register/change/release/repoint UI

frontend/src/lib/relay/intentTypes.js         # MODIFIED — 6 tag intent structs
services/relay-gateway/src/intent/intentTypes.js  # MODIFIED — same structs + policy allowlist

scripts/deploy/deploy-wager-tag-registry.js   # NEW — proxy deploy via lib/upgradeable.js
scripts/deploy/check-storage-layout.js        # MODIFIED — register wagerTagRegistry pair
config/reserved-tags.json                     # NEW — seed reserved-term list
deployments/                                  # wagerTagRegistry + wagerTagRegistryImpl keys
```

**Structure Decision**: Follows the established repo layout exactly — new contract domain
dir `contracts/naming/`, tests beside their peers in `test/`, frontend logic under
`frontend/src/lib/` with hooks/components in their existing homes, and the two intent-type
files updated under the CLAUDE.md three-way sync rule.

## Complexity Tracking

No constitution violations — table intentionally empty.
