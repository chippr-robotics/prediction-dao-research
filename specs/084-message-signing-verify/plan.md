# Implementation Plan: Message Signing and Verification (Protect ▸ Verify)

**Branch**: `claude/message-signing-verification-ax4xbc` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/084-message-signing-verify/spec.md`

## Summary

A frontend-only area inside Protect where a member signs an arbitrary message to prove control of
the account they are acting as, and checks proofs handed to them by others. No contracts, no
gateway, no subgraph, no new stored data, no deployment anywhere.

The design turns on one decision: **verification resolves to three outcomes, not two.** One of the
two verification paths is a network read, so "we could not complete the check" is a distinct and
frequent result that must never be rendered as "this signature is forged". Everything else —
which module owns which decision, what travels between two members, how the surface is laid out —
follows from keeping that distinction intact from the seam that computes it to the pixels that
show it.

## Technical Context

**Language/Version**: JavaScript (ES2022), React 18, Vite 8

**Primary Dependencies**: `ethers` v6 (already a workspace dependency — signature recovery, message
hashing, ABI encoding). No new dependency is introduced.

**Storage**: None. The feature persists nothing: no new `userStorage` key, no new synced-backup
object, no cache. The record lives in the member's clipboard and wherever they choose to send it.

**Testing**: Vitest + Testing Library + `vitest-axe` (unit, component, accessibility); Playwright
capture script (operator-installed, NOT a workspace dependency — spec-075 rule) for the
actor-critic visual loop.

**Target Platform**: Frontend SPA only.

**Project Type**: Web application — `frontend/` only. No `contracts/`, no `services/`, no
`subgraph/`.

**Performance Goals**: The wallet-signature path is a pure computation and must return without any
network round-trip. The contract path costs at most two reads (`getCode`, then one `eth_call`) and
is only attempted when the cheap path has not already settled the question.

**Constraints**: Three honest outcomes with no collapsing (FR-009/FR-010/FR-011); the message is
signed and carried verbatim (FR-002); no dead controls (FR-006); every check ends in a stated
outcome (FR-014); available on every network including those with nothing deployed (FR-015); no
funds moved and nothing written to a chain (FR-024); WCAG 2.1 AA (FR-025).

**Scale/Scope**: 3 new library modules, 1 hook, 3 components + 1 stylesheet, 1 shared-component
prop, 1 method added to an existing signer adapter, 1 shared fixture module, 4 test files, 1
capture script, 1 developer guide.

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.0.0 — PASS.*

| Principle | Assessment |
|---|---|
| **I. Security-First Smart Contracts** | Not engaged: no change under `contracts/`. The feature only *reads* an existing account's `isValidSignature`. Security reasoning that does apply is recorded under Security Notes below, since the feature makes assertions about identity. |
| **II. Test-First and Comprehensive Coverage** | Vitest coverage for every decision in `lib/verify/`, the surface, and two axe audits. Failure and edge paths (unreachable node, reverting contract, malformed input, cancelled ceremony) are tested explicitly, not just happy paths. |
| **III. Honest State, No Mocks in Shipped Paths** | This is the principle the feature is *about*. The three-outcome model exists so an unreachable node is never rendered as a verdict. Stubs live only in test fixtures and the capture harness; nothing mock-shaped ships. Network selection is cohort-scoped, so the surface cannot offer a chain across the testnet/mainnet boundary. |
| **IV. Fail Loudly in CI** | No `continue-on-error` added. The capture harness is a dev-time script and is not wired into CI, so it cannot mask anything. |
| **V. Accessible, Consistent Frontend** | Reuses the platform's existing address entry, sheet, clipboard hook and read-provider seam rather than introducing parallel ones. Two axe audits. No hardcoded network config: chains come from the cohort helper, providers from the shared factory. |
| **Simplicity (YAGNI)** | No new dependency, no new stored state, no new service. The one new shared-component capability is a single optional `className` prop, justified below. |

**Post-design re-evaluation: PASS.** The design added one thing not in the original sketch — an
optional `className` on the shared `ActionSheet`. It is additive, defaulted, changes no existing
caller's render, and exists because a long scrolling form needs its header pinned while the other
callers (short, informative sheets) do not. The alternative — a second sheet component — would
have duplicated focus trapping and scroll locking, which is worse by every principle above.

## Project Structure

### Documentation (this feature)

```text
specs/084-message-signing-verify/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0 — the decisions and what was rejected
├── data-model.md        # Phase 1 — the record and the outcome
├── quickstart.md        # Phase 1 — how to prove it works
├── contracts/
│   └── signed-message-record.md   # the interoperability contract
├── checklists/
│   └── requirements.md
├── tasks.md
└── screenshots/         # actor-critic visual review record
```

### Source Code (repository root)

```text
frontend/src/
├── lib/verify/
│   ├── signedMessage.js            [NEW] the portable record: build / serialize / parse
│   ├── signMessage.js              [NEW] identity → how it signs, or why it cannot
│   └── verifyMessage.js            [NEW] the three-outcome verdict
├── hooks/useMessageSigning.js      [NEW] React wiring; the seam that must never fail silently
├── components/custody/
│   ├── VerifySection.jsx           [NEW] two entry rows + two sheets; owns both drafts
│   ├── SignMessageForm.jsx         [NEW]
│   ├── VerifyMessageForm.jsx       [NEW]
│   └── Verify.css                  [NEW]
├── components/custody/CustodyPanel.jsx   [MODIFY] mount the Verify subsection
├── components/account/ActionSheet.jsx    [MODIFY] optional `className` (additive)
├── lib/passkey/intentSigner.js           [MODIFY] add signMessage beside signTypedData
└── test/
    ├── fixtures/signedMessages.js  [NEW] the single fixture source
    └── verify/*.test.{js,jsx}      [NEW] 4 suites incl. 2 axe audits

scripts/ui/capture-verify.mjs       [NEW] actor-critic capture harness
docs/developer-guide/message-signing.md  [NEW] (+ mkdocs.yml nav entry)
CLAUDE.md                            [MODIFY] guardrail for the three-outcome rule
```

**Structure Decision**: Frontend layers only. The feature lives under `components/custody/` rather
than a new top-level directory because Protect *is* the custody surface and the spec places Verify
inside it; a sibling directory would split one tab across two trees. Pure decisions live in
`lib/verify/` so they are testable without React — the same split the rest of the codebase uses.

## Security Notes

The feature asserts identity, so three properties are load-bearing:

1. **The claimed address is never trusted as the answer.** It is an input to a check, and the check
   consults either the mathematics (signature recovery) or the account itself (`isValidSignature`).
   The record's self-description is never authority (FR-018).
2. **A refusal to sign is a security control, not a limitation.** Acting as a shared/multi-party
   account, signing with the member's personal key would produce a proof attributing that key to the
   other account. The refusal is what prevents a truthful-looking, false claim.
3. **Only the ERC-1271 magic value counts as acceptance.** Any other return, an empty return, or a
   revert is not acceptance. A revert specifically resolves to *not determinable*, because a
   reverting call and an unreachable node are indistinguishable at this seam and the safe reading is
   the one that claims nothing.

No key material, no signature, and no message leaves the client.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| Optional `className` on the shared `ActionSheet` | A long scrolling form needs its header (and close control) pinned; the component scrolls as a whole | A second sheet component would duplicate focus trapping, scroll locking and Escape handling — three things that are easy to get subtly wrong and already correct once |
| Drafts hoisted out of the forms into `VerifySection` | The sheet unmounts its children when closed, so form-local state is destroyed by closing it | Keeping the sheets mounted would leave two hidden dialogs in the DOM and the tab order; hoisting two small objects is far cheaper |
