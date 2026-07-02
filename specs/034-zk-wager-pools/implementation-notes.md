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
- **Approve-does-nothing (vote) — CONFIRMED root cause, no contract fix needed.** Round 4 shipped a
  partial fix (staged progress + surfaced errors) and flagged two candidate root causes: proof-artifact
  loading failures, or a scope-vs-BN254-field mismatch that would need a contract change. Both are now
  resolved with certainty, using this environment's deploy/browser access:
  - **Scope/field mismatch: REFUTED by reading the real package.** `Semaphore.sol::verifyProof` never
    passes `proof.scope` to the Groth16 verifier raw — it computes
    `_hash(scope) = uint256(keccak256(abi.encodePacked(scope))) >> 8` (248 bits, safely inside the
    BN254 scalar field) as the actual public signal, and the installed
    `@semaphore-protocol/proof` (`dist/index.node.js`) computes the **identical** `hash()` for the
    circuit witness while returning the **raw, unhashed** `scope` in the proof object for the on-chain
    struct — byte-for-byte symmetric with the contract. A full `keccak256` proposalId is valid input;
    no field-reduction is missing on either side. **Empirically confirmed**: the new
    `test/pools/integration/pool-real-semaphore-resolution.test.js` self-deploys the REAL
    `Semaphore`/`SemaphoreVerifier`/`PoseidonT3` (the same trio `deploy-semaphore.js` uses for
    ETC/Mordor) against a plain hardhat node, generates genuine Groth16 proofs via
    `@semaphore-protocol/proof`, and drives a full `proposeOutcome → approve ×2 → OutcomeLocked →
    claim` cycle — including a member who is also the pool's creator (round-4's join-your-own-pool
    path) — against the real verifier, with a real ERC20 payout asserted. This closes the exact gap
    `test/fork/Semaphore.fork.test.js` documents as "impractical to run inside this on-chain fork
    harness... intentionally NOT exercised" — approve/claim are now verified against real crypto, not
    just `MockSemaphore`. No contract-level change is warranted for this concern.
  - **CSP blocks WebAssembly compilation: CONFIRMED, this is the actual bug.** `frontend/nginx.conf`'s
    CSP `script-src` has no `'unsafe-eval'` or `'wasm-unsafe-eval'` (the comment even claimed "the
    app/bundle uses no eval()/Function()/WASM" — stale as of spec 034, which added the first WASM
    consumer). `@semaphore-protocol/proof`'s Groth16 prover compiles/instantiates a `.wasm` circuit
    witness calculator for every proof — join-time claim-code precache, `vote`/`approve`, and `claim`
    (`frontend/src/lib/pools/semaphoreProof.js`). **Reproduced empirically**: a page served under the
    exact production CSP string, fetching the real `semaphore-16.wasm`, throws
    `CompileError: WebAssembly.instantiate(): Compiling or instantiating WebAssembly module violates
    the following Content Security Policy directive because 'unsafe-eval' is not an allowed source of
    script...` — this fires strictly after `createPoolIdentity`'s wallet signature (the one signature
    users report seeing), so from the user's side it looks exactly like "signs once, then nothing
    happens." Adding **only** `'wasm-unsafe-eval'` (the narrow WASM-compile grant — NOT the broader
    `'unsafe-eval'`, which would also permit `eval()`/`new Function()`) to `script-src` was verified to
    clear the CSP block (the failure mode changes from a `CompileError`/CSP violation to ordinary
    WASM-instantiation semantics). **Fix applied** to `frontend/nginx.conf`'s `script-src` (explicit
    user authorization obtained — the harness's auto-mode classifier gates loosening a production CSP
    even with strong supporting evidence).
  - **Secondary hardening: applied.** Proof generation previously fetched the ~5.2 MB circuit
    artifacts (`semaphore-16.wasm` + `.zkey`) fresh from a third-party CDN (`snark-artifacts.pse.dev`)
    on **every** proof — no caching, and three separate flows (join precache, vote, claim) each
    re-fetched it. On a slow/mobile connection this was a second, independent way the flow could stall
    even after the CSP fix. Now self-hosted (user-authorized) under `frontend/public/semaphore/`
    (`semaphore-16.<contenthash>.wasm`/`.zkey`, checksummed against the PSE-published bytes at vendor
    time) and passed explicitly via `generateProof`'s `snarkArtifacts` parameter
    (`frontend/src/lib/pools/semaphoreProof.js`) — the runtime dependency on that CDN is gone. nginx
    long-caches `.wasm`/`.zkey` immutably like other content-hashed static assets.

### CSP fix landed in the wrong file — production was still broken (round 5)

The round-4-followup CSP fix above added `'wasm-unsafe-eval'` to **`frontend/nginx.conf`** only. But
production (fairwins.app) is built from the **root `Dockerfile`**, which deploys
**`frontend/nginx.conf.template`** (envsubst'd at container start) — `frontend/nginx.conf` is used by
`frontend/Dockerfile`, a different image. So the deployed CSP never gained the token, and a tester on
fairwins.app still hit the exact `WebAssembly.compile() … 'unsafe-eval' is not an allowed source`
CompileError when approving a payout. (Round-4's error surfacing did its job — the failure is now
visible in red instead of silent.)

Fix: applied the identical `'wasm-unsafe-eval'` token + rationale comment to
`frontend/nginx.conf.template`, and added `frontend/src/test/nginxCspScriptSrc.test.js` — a regression
guard asserting **both** configs carry the narrow WASM grant (and never the broad `'unsafe-eval'`),
mirroring `nginxCspConnectSrc.test.js`. That connect-src guard already existed *because these two files
diverged once before*, but it only checked `connect-src`; the new test closes the `script-src` gap so a
one-file fix can't silently leave production broken again. The self-hosted artifacts are served from
`'self'`, so no `connect-src`/CDN change is needed alongside this.

### Resolution redesign — address-based pools, no claim code (round 6)

Testers rejected the per-member "claim code" (a private Semaphore nullifier the winner had to hand the
creator to be included in the payout). Requirement: the claim code must be **derivable from public
knowledge by both parties, or not exist**. That is impossible while claims stay anonymous — the
nullifier is `Poseidon(identity secret, claimScope)`, private by construction, and *not* derivable from
the public identity commitment (that unlinkability is the whole anonymity guarantee). Product decision
(confirmed with the user, twice, after surfacing the true cost): **drop pool anonymity** and make the
winner's **wallet address** the public claim code.

- **`contracts/pools/PublicWagerPool.sol`** — a new, non-anonymous, **address-based** pool. It is a
  **drop-in template** for the existing `ZKWagerPoolFactory`: identical `initialize(...)` selector, so
  `factory.setTemplate(newImpl)` adopts it for **new pools** with **no factory upgrade**. The
  `semaphore_`/`groupId_` init args are accepted but unused (call-selector compat); the factory still
  creates a per-pool Semaphore group that this template never touches — trimming that is a safe factory
  follow-up (the group is inert). Members `join()` / `approve()` / `claim()` with their wallet; the
  payout matrix keys on `PayoutEntry{ address winner, uint256 amount }`. Same lifecycle/states, same
  creator-proposes-members-approve-to-threshold resolution, same CEI + reentrancy-guard + escrow-only-
  exits (claim on Resolved; refund/cancel) invariants as `ZKWagerPool`. No Semaphore, no Groth16, no
  WASM — which also removes the CSP/proof-generation failure surface entirely for these pools.
- **Tests**: `test/pools/PublicWagerPool.test.js` (9 cases) drives the full lifecycle against the REAL
  factory with `PublicWagerPool` as the template — proving the drop-in, plus join/auto-close, threshold
  approval + lock, address-keyed claim (winner-only, double-claim guard, matrix-hash + sum checks),
  creator revise, non-member/non-creator guards, timeout refund, and cancel.

**GATES before this is live (not done here):**
1. **Formal smart-contract security review** (`.github/agents/smart-contract-security`) of
   `PublicWagerPool` — it handles escrowed funds. MUST pass before any value-bearing deploy.
2. **Deploy + `factory.setTemplate(publicWagerPoolImpl)`** on Amoy → validate end-to-end → Polygon
   (explicit go). Existing `ZKWagerPool` pools are immutable and unaffected; only pools created *after*
   the template swap are address-based.
3. **Frontend rewire (follow-up PR)**: rip out the Semaphore identity/proof/claim-code machinery for
   new pools — `join()` with no identity, roster from `Joined(address)` events (nickname still derived
   deterministically from the public address for a friendly label), `approve()` as a plain tx (no
   proof/progress/WASM), creator builds the payout by address straight from the roster, one-tap
   `claim(entries, index, recipient)` where the app picks the row whose `winner == connected account`.
   Deferred until the contract direction passes review, to avoid rework against a changing interface.

## Actual on-chain deployment (ops, post-merge)

Not a tasks.md code task. Sequence: adversarial pre-deploy audit → Amoy (`deploy-zk-wager-pool-factory.js`)
→ validate end-to-end → `sync:frontend-contracts` + add the factory address/startBlock to
`subgraph/networks.json` + publish the subgraph → Polygon mainnet (pause for explicit go; real POL;
requires the formal security review) → Mordor/ETC (self-deploy Semaphore first, T057).
