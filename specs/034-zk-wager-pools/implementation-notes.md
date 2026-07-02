# ZK-Wager Pools — Implementation Notes (remaining-task resolutions)

How the remaining spec-034 tasks were completed, including constraint-driven reframings. Honest record:
where a task was satisfied by reframe/CI/deferral rather than net-new code, it says so.

## No-backend reframe (US3 + leaderboard sync) — T044/T046/T047/T050

The standing **no-backend footprint** directive (FairWins ships only SPA+nginx, contracts, IPFS, edge,
logging — no app backend) overrides the spec's "Payload Packer service" + relayer service and the
off-chain leaderboard channel as originally written. Resolution:

- **Gasless join** is **client-side + a third-party relayer**, no FairWins server:
  - On-chain anchor: `ZKWagerPool.joinWithAuthorization` (EIP-3009), tested (T043).
  - Client signs the EIP-3009 authorization in `frontend/src/lib/pools/gasless.js`
    (`signReceiveAuthorization`); a **pluggable third-party relayer** (Gelato/Biconomy/OZ Defender, or
    the user's own) submits and pays gas (`relayGaslessJoin`). The signed authorization binds
    amount+recipient and is token-replay-protected, so the relayer is untrusted. **T046/T047 reframed**:
    no "Payload Packer" or relayer service is operated by FairWins. **T044**: client-side signing +
    relay-gating tests (`frontend/src/test/poolGasless.test.js`).
  - **T048**: gasless is config-gated — when a relayer is wired (env), the join flow uses it; otherwise
    members join normally (paying gas). Gasless is purely additive; the signing mechanism is implemented
    and tested.
- **Leaderboard sync (T050)** is **creator-local**, surfaced as explicitly non-final/off-chain
  (`PoolLeaderboard`, FR-031). Real-time cross-member sync, if desired, rides an optional **third-party
  realtime service** (no FairWins backend) — not built; documented as the no-backend-compatible path.

## ETC/Mordor enablement spike — T057 (folds in T001/T002)

Self-deploying Semaphore on Ethereum Classic is **feasible** (research.md §3: Atlantis bn128 precompiles
+ Spiral PUSH0). Steps (deferred increment):
1. **T001**: add `@semaphore-protocol/contracts` (Solidity) — only needed to compile Semaphore + its
   Groth16 verifier for self-deploy (Amoy/Polygon use the canonical singleton, so this is ETC-only).
2. **T002**: pin `evmVersion: "shanghai"` for the ETC compile profile. NOTE the repo already targets
   **paris** (no PUSH0 emitted), which is ETC-safe; shanghai is only needed if Semaphore's `solc`
   default pulls a post-paris opcode. Verify before the ETC build.
3. Deploy `SemaphoreVerifier` + `Semaphore` on Mordor/ETC; record the address; set
   `ZKPOOL_SEMAPHORE_<chainId>`; run `deploy-zk-wager-pool-factory.js`.
4. Confirm target RPC nodes are post-Spiral. The PSE trusted-setup artifacts are chain-agnostic.

## Security — T052 (Slither/Medusa) / T053 (review)

- **Slither** runs as a **gating CI check** ("Slither Static Analysis") over `contracts/` (the pool
  contracts are in scope); it passes on this branch. Local run is unavailable on this host (security
  tooling lives in the CI env / a venv).
- **Medusa** fuzzing runs in the CI/security env; add pool invariants to the fuzz suite before mainnet.
- **T053**: the contracts target EthTrust-SL ≥ L2 — CEI + reentrancy guards on all value paths, the
  no-escrow-exit-outside-claim/refund invariant, the our-contract-is-group-admin invariant, audited
  Semaphore V4. A formal smart-contract security review (`.github/agents/smart-contract-security`)
  **MUST** run before any mainnet (137) deploy; flagged in the deploy runbook.

## Gas — T054

Unit gas (Hardhat gas reporter, against MockSemaphore): `createPool` ≈432k, `join` ≈155k avg,
`approve` ≈102k, `claim` ≈102k, `refund` ≈73k, `closeJoining` ≈79k, `proposeOutcome` ≈53k. Real Groth16
`validateProof` cost is **constant** regardless of group size (Semaphore property, research.md §2) and is
confirmed against the real singleton via the Amoy fork test (T018) when a fork RPC is configured.

## Accessibility — T055

WCAG 2.1 AA axe checks cover the pool UI: `frontend/src/test/pools.axe.test.jsx` (CreatePool, JoinPool,
PoolPage, leaderboard, language selector) — no violations. CI Lighthouse + axe gates pass.

## Quickstart validation — T058

Verified locally on this branch: `npx hardhat compile` (OK), 38 pool contract tests pass (unit +
integration + gasless; fork skips without RPC), `graph codegen` + `graph build` green, 48 frontend pool
tests pass, `vite build` green (with the local `.env` `VITE_PINATA_JWT` unset — a known local-only
guard; CI is clean). Matchstick (T022) is Docker-gated on this host and runs in CI.

## Create-flow UX punchlist (tester feedback, round 2)

Testers reviewed the group-pool UX end to end. The **pool-manager** items (auto-shown nickname,
human-readable status, participant roster with creator drag-ranking, alphabetical member view,
auto-populated leaderboard/propose-builder, cached claim code, member-visible verified proposals)
shipped in the prior round (PR #786). This round refines the **create** flow so it matches the look
and feel of the other wager create surfaces:

- **No mode pill**: the lone "Create a pool" tab is gone — the modal is create-only (joining lives in
  the unified phrase lookup, spec 037) and the header alone says what it does, same as the open
  challenge.
- **Money-formatted buy-in**: `$`-prefixed, `USDC`-suffixed, 2-decimal-on-blur — identical chrome to
  the open-challenge stake entry.
- **Windows as the shared deadline timeline**: join and resolution windows are no longer bare
  day-count inputs. The open-challenge timeline element (sliders + track + stat tiles +
  tap-to-type `datetime-local`) was extracted into the shared
  `frontend/src/components/fairwins/DeadlineTimeline.jsx` and both surfaces render it (pools with
  "Joining open until" / "Must be resolved by" wording). The create form now passes an exact
  `joinDeadline` (unix seconds) and `resolutionWindow` (seconds after joining closes) to
  `usePools.createPool`, which still accepts the older day-count fields as a fallback.
- **Approval threshold as a named selector**: the raw percent field read as jargon — replaced with a
  Majority (51%) / Two-thirds (67%) / Everyone (100%) radio-pill selector with a plain-language hint,
  still stored as bips on-chain.
- **Share view matches the open challenge**: the four words render in the shared code display with an
  icon copy button and a QR that deep-links into the unified phrase lookup (`?oc=take&code=<words>`
  resolves pools as well as challenges), plus "Open my pool" / "Done" actions.

### Live-app verification follow-up (round 3)

Screenshots from fairwins.app showed the round-1 manager fixes only partially landing in practice:
the nickname/claim-code auto-show was **cache-only**, so any member whose device lacked the join-time
cache (joined pre-cache, another device, cleared storage) still saw click-to-reveal buttons; the
identity section rendered even for viewers who never joined; and the creator's first sight of "Live
standings" was a manual add-player form. Fixes:

- **`usePools.restorePoolIdentity`**: one-signature full restore — cache-first (no prompt on the
  join device), otherwise re-derive the identity, derive + cache the claim code, return
  `{ commitment, claimCode, nickname }`. `PoolPage` now auto-runs it whenever a joined member has no
  cached identity, so the nickname AND claim code always auto-show; declining the signature falls
  back to the manual Reveal button. The restored claim code is passed down to
  `PoolResolutionActions`.
- **Identity section only for joined members** — a viewer (including a creator who hasn't joined
  their own pool, the 0/N case in the screenshots) no longer sees a meaningless "Reveal my
  nickname" button.
- **Roster empty state**: once loaded with zero members, `PoolParticipants` says "share the pool's
  four words" instead of omitting the section.
- **Leaderboard**: the creator's empty state now says standings fill in automatically from the
  roster, and the manual add-player form is collapsed behind an "Add a player manually" disclosure
  (edge-case tool, not the primary flow).

### Manager redesign + resolution fixes (round 4)

Post-deploy tester punchlist. Delivered frontend-only against the **immutable** deployed pool contract:

- **Removed non-functional entry**: the propose-builder's "Add winner" row and the leaderboard's "Add
  player manually" form are gone. The `PoolLeaderboard` component (off-chain multi-round scores) was
  deleted — it duplicated the participant roster.
- **One unified roster** (`PoolParticipants`): the old "Participants" and "Live standings" sections were
  merged. Once a payout is proposed, in-the-money cards grow, sort to the top, carry a 🥇/🥈/🥉 medal,
  and show their amount; out-of-the-money cards are de-emphasised. The amounts come from a
  `{ commitment → amount }` display map the creator shares alongside the on-chain matrix (commitments
  are public, so this leaks nothing); it's trusted only after (a) the code-matrix hash matches the
  on-chain proposalId and (b) the display amount multiset matches the matrix (`payoutDisplayMap`).
- **Claim codes are system-managed**: no raw nullifier integer is shown anywhere. Members hand their
  code to the creator with one tap ("Copy my payout code"); the creator's own row auto-fills from the
  cached identity; at claim time the app matches the member's cached code to their row automatically and
  pays the connected wallet in one tap.
- **Creator can take part**: a "Join this pool" action on the manager page lets the creator (or any
  not-yet-joined viewer) join while joining is open — the contract's `join` already permits it.
- **Creator can revise a mis-keyed payout**: `proposeOutcome` accepts a new id (approvals are keyed per
  id, so a revision restarts the count), surfaced as "Update the proposed payout" with amounts prefilled.
- **Collapsible details**: pool details are a `<details>` collapsed by default with a one-line digest.

**Constraint-driven / honest limitations (need product decision before further work):**

- **Member "dispute" is off-chain by necessity.** The deployed `ZKWagerPool` only lets the *creator*
  call `proposeOutcome`; members can approve or, by withholding approval until `resolutionWindow`
  elapses, force refunds for everyone. There is **no on-chain path for a member-submitted counter
  proposal**. Round 4 ships the feasible version: a member can build a suggested split and copy it to
  the creator (who revises), and the UI surfaces the withhold→refund outcome. True on-chain member
  proposals would require a **new pool implementation + factory template swap + security review +
  redeploy** — deferred, needs explicit go.
- **Approve-does-nothing (vote) — root-cause analysis, partial fix.** The single wallet prompt users
  saw was the identity-derivation signature (`createPoolIdentity`); the on-chain `approve` then needs a
  browser-generated Groth16 proof (`generatePoolProof`) whose `scope` is the proposalId. Round 4 makes
  the flow honest — staged progress messages ("Generating your anonymous approval proof…", "Submitting
  on-chain…") and a surfaced error so it can never silently "do nothing." Two candidate root causes
  remain to confirm on the live network (not reproducible in-sandbox; tests use a mock verifier):
  1. **Proof artifacts** (`.wasm`/`.zkey`) failing/hanging to load in a mobile webview → now surfaced,
     but hosting/bundling of the artifacts should be verified in the deployed build.
  2. **Scope vs. field mismatch**: the proposalId is a full `keccak256` (up to 2²⁵⁶−1) used directly as
     the Semaphore `scope`; the real verifier requires a value in the BN254 field (~2²⁵⁴). If the
     library reduces it mod field, the returned `proof.scope` no longer equals the contract's
     `uint256(pid)` and `approve` reverts on estimate → no wallet prompt for the tx. **This would be a
     contract-level fix** (reduce/rehash the proposal scope into the field on both sides) — flagged for
     review, not changed here, because it touches the audited immutable pool.

## Actual on-chain deployment (ops, post-merge)

Not a tasks.md code task. Sequence: adversarial pre-deploy audit → Amoy (`deploy-zk-wager-pool-factory.js`)
→ validate end-to-end → `sync:frontend-contracts` + add the factory address/startBlock to
`subgraph/networks.json` + publish the subgraph → Polygon mainnet (pause for explicit go; real POL;
requires the formal security review) → Mordor/ETC (self-deploy Semaphore first, T057).
