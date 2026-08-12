# Hyperliquid management: go / no-go

**Status**: DECIDED — **do not ship** | **Date**: 2026-08-12 | **Feature**: 083 (perps position
management) | **Decides**: research [D12](research.md#d12--hyperliquid-is-a-fast-follow-and-why-it-is-all-or-nothing)

**Inputs**: spikes S1 (signing + account types), S2 (agent-key custody), S3 (operational reality),
each verified against Hyperliquid's live API, its official SDK source, and this repository's shipped
code on 2026-08-12. Provenance is labelled **VERIFIED** (measured or read from a primary source) or
**INFERRED** (argued, not observed) throughout.

---

## 0. The decision, in one paragraph

**FairWins does not ship Hyperliquid management.** Hyperliquid positions stay read-only with the
venue link-out, which is what the product says today and what it will keep saying. The blocker is
not effort and not the browser-held key on its own — it is that **on Hyperliquid the exit itself
requires that key**, so the ordering this spec was built on (exits first, exits never gated) cannot
be honoured on that venue by construction. Four things follow from the decision and should be done
anyway: fix two live honesty defects in the read-only surface, record the passkey deposit
prohibition as a standing rule, and correct research D12, which is misleading in two places.

---

## 1. Can Hyperliquid management ship?

### 1.1 EOA members — technically YES, and cheaper than D12 assumed

| Question | Answer | Provenance |
|---|---|---|
| Can an injected wallet sign the two approvals? | **Yes**, with **no chain switch** | VERIFIED live — one `ApproveBuilderFee` action signed under `signatureChainId` `0xa4b1`/`0x66eee`/`0x1`/`0x89` produced four signatures from which Hyperliquid recovered the **identical** signer |
| Under what domain? | `{name:'HyperliquidSignTransaction', version:'1', chainId: <free choice>, verifyingContract: 0x0}` — **not** the 1337 `Exchange` domain | VERIFIED — `hyperliquid-python-sdk/utils/signing.py` L217/L412/L427; the SDK's own comment at L248: *"signatureChainId is the chain used by the wallet to sign and can be any chain."* Replay separation is carried by the `hyperliquidChain` field, not by `chainId` |
| Can trading be done without an agent key? | **No.** Orders/cancels are L1 actions under `chainId 1337`, which MetaMask refuses unless the member adds and switches to a chain-1337 network, and whose payload is an opaque `Agent{source, connectionId}` hash — blind signing, plus a wallet prompt on every close | VERIFIED (SDK `l1_payload` L192-212; MetaMask's own `assert.equal(chainId, activeChainId)`) |
| Cost of the first order | **3 prompts**: 1 transaction (bridge USDC) + 2 gasless signatures (`approveAgent`, `approveBuilderFee`), plus a ~1 minute credit wait | VERIFIED live — both approvals are refused from an unfunded address (`"Must deposit before performing actions"`), so onboarding is **strictly serial**; you cannot pre-approve |
| Recurring cost | Agent expires at 90 days (180 max via a timestamped agent name) → 1 further signature | VERIFIED (official nonces/API-wallets page) |

So the D12 sentence "HL L1 actions sign under a hardcoded `domain.chainId = 1337`, which injected
wallets reject" is **true of orders and misleading about the approvals** — it reads as though the
whole integration needed a chain switch. It does not. The EOA path is a normal, readable EIP-712
prompt on whatever chain the member is already on.

**The conclusion D12 got right and this decision keeps**: an agent key is required *even to close a
position*. There is no cheap manage-only Hyperliquid.

### 1.2 Passkey (ERC-4337) members — NO, permanently, and this is a protocol fact

Not "not yet". Four independent strands, three VERIFIED and one INFERRED:

1. **The request envelope has nowhere to put a contract signature.** An exchange request is
   `{action, nonce, signature:{r,s,v}}` (+ optional `vaultAddress`/`expiresAfter`). There is no
   `signatureType` discriminator and no field naming a claimed signer: **the acting account IS the
   `ecrecover` output**. You cannot derive a contract's address from a contract signature, so the
   scheme structurally cannot admit ERC-1271. VERIFIED (docs + live probes, whose error text echoes
   the recovered address).
2. **HyperCore is not an EVM.** Evaluating `isValidSignature` would require Hyperliquid consensus to
   make a stateful call into another chain's EVM at a pinned block. VERIFIED as architecture.
3. **Hyperliquid's own answers to "the account is not one EOA" exist because 1271 does not** —
   `convertToMultiSigUser` (whose authorised users must themselves be existing Hyperliquid users,
   i.e. EOAs) and the `CoreWriter` precompile, which lets a HyperEVM contract act **as itself** and
   is already forbidden by [D1](research.md#d1--a-perpsrouter-contract-is-forbidden-not-deferred).
4. **INFERRED**: that no undocumented server-side 1271 branch exists. A negative cannot be proved by
   probing. The only test that would settle it is deploying a contract wallet with a funded
   Hyperliquid account, and it is not worth the money against evidence this one-sided.

**Contrast worth recording**: Polymarket *does* have a `signatureType` enum covering contract
wallets, which is why `frontend/src/lib/predict/tradeSigner.js` can legitimately hold the door open
behind `PASSKEY_PREDICT_ENABLED`. **A Hyperliquid equivalent of that flag would be dishonest** — a
flag encodes "pending", and this is "not possible without a Hyperliquid protocol change."

### 1.3 What passkey members would be shown (FR-019)

**Today FR-019 is satisfied vacuously**: Hyperliquid is read-only for *every* account type, so there
is no per-account distinction to state and no control to withhold. The copy below is required only
if Hyperliquid management ever ships for EOA members, at which point the difference becomes real.

It is a **stated absence beside the read-only Hyperliquid rows** — the same place the current
per-venue sentence lives — **never a disabled button**, and never a flag-shaped "not yet":

> Hyperliquid checks a signature made by a private key, so a passkey account cannot hold a
> Hyperliquid account. That is how Hyperliquid works rather than a FairWins setting, and it is not
> something we expect to change. Your Hyperliquid positions here are read-only, and Hyperliquid's
> own app can manage them.

Shape it like `resolveTradeSigner` (`loginMethod === 'passkey'` → `{ canSign: false, reason }`) but
**without the enable flag**, and name the mechanism rather than the product.

### 1.4 THE FUND-LOSS TRAP — a standing rule, live today, independent of this decision

Withdrawals and transfers use the **same user-signed, ECDSA-only, master-wallet-only** scheme as the
approvals (`HyperliquidTransaction:Withdraw`, `:UsdSend`, `SpotSend`, `UsdClassTransfer`,
`SendAsset` — VERIFIED in the SDK function table). The Hyperliquid bridge **credits the sending
address**. Compose the two:

> USDC sent from a FairWins passkey smart account to Hyperliquid Bridge2 on Arbitrum credits a
> Hyperliquid account that can never place an order **and can never withdraw**. The funds are
> permanently unrecoverable, with no venue-side escape hatch — `app.hyperliquid.xyz` cannot sign for
> that account either.

Status: **INFERRED** (both inputs verified independently; the composition was not tested, and will
not be). Both inputs being verified is enough — this is not a risk to characterise empirically.

**The rule, effective now**: *never render a Hyperliquid funding target — bridge address, deposit
button, copyable text, QR — on the passkey rail.* VERIFIED that no such affordance exists in
`frontend/src` or `services/relay-gateway/src` today (grep: zero hits for the Bridge2 address or any
Hyperliquid deposit path), so this is a prohibition to record, not a defect to fix. It needs no
Hyperliquid trading feature to trigger: **surfacing the bridge address next to the existing
read-only rows is sufficient.**

---

## 2. What shipping it would cost

### 2.1 Surfaces

| Surface | New or extended | Note |
|---|---|---|
| `lib/perps/hyperliquidAgent.js` | **NEW** | Key generation, named-agent registration, rotation, wipe. Must be classified **LIB_EXIT** in `src/test/perps/safetyInvariants.test.js` — closing runs through it |
| `lib/perps/venues/hyperliquid.js` | **NEW** | Action construction + msgpack `connectionId` + both signing schemes. The only non-EVM venue module; builds signed JSON, not calldata |
| `lib/perps/hyperliquidAccount.js` | **NEW** | Mode-aware balance + account existence (§2.3). **ENTRY or READ_ONLY, and unreachable from any exit** |
| `hooks/usePerpsTrade.js` | EXTEND | A third rail: neither `signer.sendTransaction` nor `sendCalls`, but a signed POST to `api.hyperliquid.xyz`. This is the module the spec deliberately keeps as the *only* gate-naming file |
| `lib/perps/orderState.js` | EXTEND | Hyperliquid resolves at **fill**, with no chain event. A new signal source, and the honest-state rules must survive it |
| `components/perps/PositionSheet.jsx` | EXTEND | Hyperliquid rows gain controls; plus agent state, expiry warning, and the "your session key was replaced" case |
| `components/perps/OpenPositionSheet.jsx` | EXTEND | Third venue, plus the two-approval onboarding, plus the builder-fee disclosure |
| `services/relay-gateway/src/perps/*` | EXTEND (reads only) | §2.5. **The agent key must never touch the gateway** — VERIFIED that `api.hyperliquid.xyz` serves `access-control-allow-origin: *` on `/info` and `/exchange`, so signed actions go browser-direct and the shipped CSP (spec 069's scheme-wide `https:` `connect-src` grant) already permits it. Proxying `/exchange` would buy nothing and put a signed-action stream through our infrastructure |

Roughly three new modules and five extended ones, plus the test suites each of them owes — and
`safetyInvariants.test.js` fails until every one is classified, which is the intended forcing
function, not an obstacle.

### 2.2 The key-custody decision

Four models were evaluated. **Two are disqualified, not merely worse.**

| Model | Verdict |
|---|---|
| (a) Session-memory only | Best hygiene, worst availability: a page refresh costs a wallet signature **before a member can close a liquidating position** |
| (b) sessionStorage (the Predict shape) | **The right shape**, with one correction — see the multi-tab hazard |
| (c) AES-GCM under a PBKDF2 passphrase (the spec-062 shape) | **DISQUALIFIED.** XSS owns the prompt, so it is a delay not a defence; it protects a **freely re-mintable** secret (unlike a legacy EOA key, which is irreplaceable); and it puts a typed secret **on the exit path**. Note `safetyInvariants` would *not* catch this — a passphrase is not one of the four named gates — so the principle catches it, not the test |
| (d) Deterministic derivation from a wallet signature | **DISQUALIFIED BY THE VENUE.** Hyperliquid: *"It is STRONGLY suggested to not reuse their addresses… Generate a new agent wallet on future use"*, and nonce state is pruned on deregistration/expiry/defunding. Deterministic derivation makes address **reuse the permanent default** — the same member re-derives the same agent address after expiry, on every device, forever — which is exactly the state in which consumed nonces become replayable. The model that stores no key is the one the venue rules out |

**Recommended if it ships — model (b′)**: per-session key from `crypto.getRandomValues(32)`,
memory-first with a sessionStorage mirror scoped to `(signed-in account, HL account)`, a **named
agent per session**, rotated on every approval, wiped on disconnect / account switch / tab close /
detected deregistration. **Not** localStorage, **not** in `lib/backup/syncedObjects.js`, **no**
passphrase, **no** passkey-PRF wrapping.

Three rules that carry the whole failure class:

- **Approval is key GENERATION, never key LOADING.** No code path may restore an old key and
  re-approve it. This one line kills the nonce-replay class entirely.
- **The backup must exclude it.** Precedent: spec 069 excludes RPC credentials. The sharper,
  Hyperliquid-specific reason: restoring a months-old backup restores an **expired or deregistered**
  agent, and the natural next step ("restore, then re-approve") is precisely the pruned-address
  re-registration the venue warns about. Back up what cannot be re-minted; an agent key can.
- **THE MULTI-TAB HAZARD, which the Predict precedent hides.** sessionStorage is per-tab. For CLOB
  creds that is harmless because derivation is idempotent. Hyperliquid agent approval is
  **destructive**: registering a new *unnamed* agent replaces the previous one. Two FairWins tabs ⇒
  tab 2 silently deregisters tab 1 ⇒ **tab 1 renders live Close/Reduce controls the venue will
  reject** — a dead control *and* a broken exit, produced by opening a second tab. Fix with a named
  agent per session (3 named slots + 1 unnamed), a BroadcastChannel-shared key, or an honest
  single-tab declaration. Whichever: the failure must be **detected** and surfaced as "your session
  key was replaced — re-approve, or manage on Hyperliquid", never as a generic error.

**The honest caveat that outranks the model choice**: this repository has **never held a bearer
secret that can unilaterally risk value.** The nearest precedent does not transfer — stolen spec-057
CLOB creds cannot place an order, because every Polymarket order carries its own EIP-712 wallet
signature (VERIFIED in `clobSession.js` / `makeClobClient`). An agent key signs the entire action
alone. Adopting one is a **genuine widening of the app's security posture**, and reviewers must not
be told "this is just like Predict."

**What the key can and cannot do** (VERIFIED, and stronger than a permission list): user-signed
actions carry **no account field**, so the signer *is* the account — an agent signing `withdraw3`
withdraws from its own empty account. `agentSendAsset` is the one agent-signable transfer and is
destination-locked to the source. This cannot be widened by a future permission bug. But the
member-facing sentence must be **"this key can trade, not withdraw"** — never "cannot lose your
money": trade authority on a leveraged account **is** value-destruction authority (deliberate
spread-crossing into an attacker's resting orders drains the account with no withdrawal at all).

### 2.3 Funding states — three reads that do not exist today

| # | State | Condition | What it says |
|---|---|---|---|
| 1 | **No account** | `userRole == "missing"` | "You do not have a Hyperliquid account yet", + link, disclosing **both** costs: ≥5 USDC if depositing via the Arbitrum bridge, and a **1 USDC one-time activation fee charged on your first withdrawal** |
| 2 | **Account, no collateral** | `role == "user"` and the **mode-correct** balance is 0 | "No collateral on Hyperliquid" + link. **Must never say "no account"** |
| 3 | **Funded** | mode-correct balance > 0 | Offer management, and show **no deposit prompt** (a deposit link to a funded member is a dead control) |
| 4 | **Unknown** | any read failed | Say so, render `—` **not 0**, never claim "no account", still show the link. **Mandatory, not a nicety** |

Two traps, both measured:

- **`userRole` is the ONLY discriminator between states 1 and 2.** VERIFIED: a never-used address and
  an existing-but-empty one are byte-identical on `clearinghouseState` (all zeros) and
  `spotClearinghouseState` (`balances: []`).
- **THE BALANCE-SOURCE TRAP IS THE MAJORITY CASE.** Hyperliquid's own docs: *"Under unified account
  or portfolio margin, use spot balances endpoint instead"* and *"Individual perp dex user states are
  not meaningful."* MEASURED across the top 40 leaderboard traders: **42.5% on `unifiedAccount`**.
  Concrete lies from `clearinghouseState`: `0x49e96e25…` reports accountValue **0.0** while holding
  **25,817,395 USDC** spot; `0xa2aba48c…` reports 0.0 against 919,844. Reading it would produce
  exactly the prohibited outcome — telling a funded member they have nothing.
  **Correct read is two calls, in order**: `userAbstraction` → if `unifiedAccount` or
  `portfolioMargin`, read `spotClearinghouseState`; otherwise `clearinghouseState.withdrawable`.
  `"default"` is **undocumented** (measured once, behaves like standard) — keep the mapping in ONE
  function and name that risk in its comment, because Hyperliquid calls unified account
  "recommended for most users" and a flipped protocol default would silently restart the lying.

Both endpoints re-confirmed live while writing this document: `userRole` → `{"role":"user"}`,
`userAbstraction` → `"default"`.

**Orthogonal and binding**: this whole read is **ENTRY**. A member holding a Hyperliquid position
must be able to reach an exit while their funding state is unknown or zero, so **no exit path may
import it.**

### 2.4 Ongoing operational burden — builder eligibility

Both conditions VERIFIED: *"The builder must have at least 100 USDC in perps account value and must
use standard as the account abstraction mode"*.

**The mode name is a trap**: the member-facing name is *Standard*, but **the API string is
`"disabled"`** (`userSetAbstraction` accepts `["disabled","unifiedAccount","portfolioMargin"]`). A
monitor asserting `"standard"` would never match.

**The failure is genuinely silent**: nothing in the order path rejects. Fills keep landing, the
`{b,f}` simply stops paying, and there is no retroactive claim.

The monitor — three unauthenticated POSTs to `/info`, VERIFIED end-to-end against a live builder
(`0xecb63caa…`, 7,011 USDC of accrued `builderRewards`):

1. `userAbstraction(BUILDER) == "disabled"`
2. `clearinghouseState(BUILDER).marginSummary.accountValue >= 100` — **alert on a buffer (~150), not
   the cliff**
3. `referral(BUILDER).builderRewards` monotonically non-decreasing while volume exists — read **per
   token** via `tokenToState`, since Hyperliquid now has permissionless quote assets

Optional daily reconcile:
`https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/<lowercase-builder>/YYYYMMDD.csv.lz4` —
**MEASURED LAG**: D and D-1 returned 403 while D-2/D-3/D-4 returned 200, so the monitor must
tolerate the last two UTC days missing **or it pages every single day.**

Ordering is not optional (eligibility is evaluated **at fill time**): fund the builder wallet →
`userSetAbstraction("disabled")` → verify both reads → **only then** set
`PERPS_HL_BUILDER_ADDRESS`. Reversing it forfeits the first fills with no way to recover them.

Worth writing down so nobody "fixes" it: the builder is *required* to be in disabled mode, so
`clearinghouseState` **is** the right balance source for the monitor. The §2.3 trap applies to
members, not to the builder.

### 2.5 The rate-limit budget — the binding constraint on the reads

Hyperliquid's per-IP limit is **1200 weight/minute**, and **the gateway is one IP for every member.**

| Read | Weight | Consequence |
|---|---|---|
| Today's HL position read (1 call / 15s cache) | 8/min/member | ~150 concurrently-active members |
| Honest funding read, naive: `userRole`(60) + `userAbstraction`(20) + `clearinghouseState`(2) + `spotClearinghouseState`(2) | **84** | **~14 member reads/min** — `userRole` alone is 71% of it |
| Same, with `userRole` latched | 24 | ~50 members/min |
| Fixing per-dex blindness by fan-out (10 dexes × 2) | +20/refresh | ~15 concurrent members at a 15s cache |

The mitigation that stays honest: **`userRole` is a monotonic latch** (an account that exists never
becomes missing), so cache `"exists"` permanently per address and re-poll only the `"missing"`
answer, on member action rather than on a timer.

Websockets do **not** rescue this at the gateway: the **10-unique-users** cap on user-specific
subscriptions makes a shared server-side per-member feed impossible. A websocket path is viable only
client-direct. Address-based limits are a non-issue for members (actions only, 10k initial buffer,
info exempt). All concurrency figures are **arithmetic over published weights, not load-tested.**

### 2.6 The security review it would need

Not the standard contract review — **no Solidity ships here either**. The review is over a new
category, and these are its questions:

1. **The XSS blast radius, stated plainly**: an agent key raises an XSS on `fairwins.app` from
   "prompt the member to sign something they might refuse" to "silently open and close leveraged
   positions". No custody model prevents this; only CSP discipline, dependency hygiene and the
   mini-app boundary do. This is the real cost of the feature and belongs in the review's first line.
2. **The mini-app interaction.** Spec 073 executes third-party code in this origin. The host object
   is the entire privileged surface *for a mini-app*, but a bearer key in page memory is reachable by
   anything that achieves script execution in the origin. The review must state whether a
   browser-held trading key is compatible with hosting third-party packages at all.
3. **Storage-boundary review**: not in `syncedObjects.js`, not in localStorage, no "remember this
   device" affordance, no restore path — each asserted by test, not only by convention.
4. **The economic-drain scenario** (§2.2): "cannot withdraw" is true and narrower than it sounds.
5. **The passkey deposit prohibition** (§1.4) as a permanent invariant with a test.
6. **The dependency question**: msgpack + secp256k1 signing with **no new npm dependencies** (house
   rule). ethers v6 covers the signing; the msgpack `connectionId` encoding would be hand-rolled and
   is consensus-critical — a wrong byte is a signature over a different order. That is its own review
   item, and its own differential test against the SDK's fixtures.

---

## 3. Recommendation, and the reasoning

### DO NOT SHIP. Keep Hyperliquid read-only.

Five reasons, ordered by how much weight they carry.

**1. On Hyperliquid, the exit itself is gated on the key — and the spec's ordering cannot fix it.**
This is the decisive one. On Gains and GMX, an exit needs **no new authority**: the member's own
wallet closes the position, and the app is one client among many. On Hyperliquid the close is an L1
action, so it requires a valid, unexpired, un-replaced agent key. If the key expired (90 days), was
destroyed by a second tab, or the member is on a new device, **the in-app close does not work, and
the remedy is a wallet signature** — a ceremony standing between a member and a leveraged position.
Spec 083's exits-are-never-gated rule can be satisfied on that venue only by declaring the venue
link-out to be the exit — which is exactly what shipping nothing already does.

And the codebase could not defend the rule mechanically. `hyperliquidAgent.js` would be classified
**LIB_EXIT**, but I read what that classification actually enforces rather than assuming: `(g)` and
`(h)` forbid an exit module from naming the attestation, sanctions screening,
`VITE_PERPS_MANAGE_ENABLED`, and `canOpen`/`openBlockedNote` — and nothing else. A missing,
expired or replaced session key is a **fifth gate the suite has no vocabulary for**, so
`safetyInvariants` would go green over an exit that a wallet signature stands in front of. This is
the same blind spot §2.2 records for the passphrase model, and it is worse here: the passphrase was
a model we could reject, whereas the key ceremony is *intrinsic to the venue* and would sit on the
close path permanently, defended by reviewer discipline alone. The suite is not what is stopping
this design; the principle behind it is.

**2. There is no safer middle option, because the credential is not scopeable.** The obvious
compromise — "ship close/reduce only, never opening, so FairWins never creates leveraged exposure" —
**does not reduce risk at all.** Hyperliquid agents are not scoped by action: a key that can close
can also open, at any leverage, on any market. The blast radius of a close-only integration is
*identical* to full management. So the exits-first ordering that made Gains/GMX safe to build
incrementally has no equivalent here: the only coherent options are ship-all or ship-none.

**3. It structurally excludes FairWins' own flagship account rail.** Passkey accounts (specs
041/050) are where this product has invested most heavily, and Hyperliquid cannot ever serve them.
Shipping a venue that permanently splits members into two classes — with an unrecoverable-funds trap
sitting one UI affordance away from the excluded class — is a poor trade for one venue.

**4. Today, no Hyperliquid position on our screen was created by us.** FairWins cannot open one, so
every Hyperliquid row a member sees came from somewhere they already have access to: they
demonstrably have a way in and a way out. Shipping inverts that, and it inverts it into a venue whose
only fallback exit is **one company's website**. For Gains and GMX the never-stranded fallback is
genuinely robust — permissionless contracts, any client, a block explorer at worst. For Hyperliquid
the fallback is `app.hyperliquid.xyz`, and there is no permissionless on-chain path behind it
because HyperCore is not an EVM. Taking on responsibility for a member's exit while holding a
weaker fallback than we hold anywhere else in the product is the wrong direction.

**5. The new security category is real, and one venue is not enough reason to open it.** §2.2: this
codebase has no precedent for a cached credential that can unilaterally risk value. Well-managed is
not the same as previously-accepted.

**What this costs us**: Hyperliquid is the largest venue by volume in the perps set, and the builder
rail (10 bps cap, already registered at 0 on Polygon) is real money left on the table. That is a
genuine loss and should be stated as one, not minimised. The same engineering effort spent on GMX
and Gains depth — GMX's `venueFee` and `minCollateralUsd`, which the gateway publishes as explicit
`null` because GMX's REST feed genuinely does not carry them, plus DataStore-read minimums and
better defaults — costs no new security category and strands nobody.

**"We chose not to hold that risk for one venue"** is the answer, and it is consistent with every
convention this codebase already enforces: never-stranded, no custody, honest absence over dead
buttons.

---

## 4. If the decision is overridden: the ordered plan

Written to be implementable. Ordering is **exits-first**, with the additional rule that §3's point 2
forces: because the credential is unscopeable, **the custody model and its failure detection must
land before any action at all**, not alongside opening.

### Phase H0 — read-only correctness (independent of the decision; do this anyway)

| # | Work | Module |
|---|---|---|
| H0.1 | Per-dex fan-out or a scoped label — §5.2 defect 1 | `services/relay-gateway/src/perps/routes.js` (~L238), `normalize.js#normalizeHyperliquidPositions`, `#normalizeHyperliquidPairs` |
| H0.2 | Never read a balance from `clearinghouseState` without checking `userAbstraction` first | new `frontend/src/lib/perps/hyperliquidAccount.js` — **ENTRY/READ_ONLY**, unreachable from any exit |
| H0.3 | `userRole` existence read with a permanent "exists" latch, long TTL, polled on member action | gateway cache, separate key from the 15s position cache |
| H0.4 | Classify every new module in `safetyInvariants.test.js` (§2.1) | `frontend/src/test/perps/safetyInvariants.test.js` |

### Phase H1 — the key, and the ways it fails (before any action)

| # | Work |
|---|---|
| H1.1 | `lib/perps/hyperliquidAgent.js` — `crypto.getRandomValues(32)`, **generation only, never loading**; memory + sessionStorage mirror scoped to `(account, HL account)`; wipe on disconnect / account switch / tab close |
| H1.2 | **Named agent per session** (3 named slots + 1 unnamed) with honest degradation at slot exhaustion; detect replacement and say "your session key was replaced — re-approve, or manage on Hyperliquid" |
| H1.3 | Expiry warning ahead of 90 days. **Never let expiry be discovered by a failed exit** |
| H1.4 | Tests: no restore path exists; the key is absent from `lib/backup/syncedObjects.js`; a wipe actually wipes; the multi-tab case produces the honest message and not a dead control |
| H1.5 | Rotate-as-revoke: an offered, plainly labelled "replace my session key" control (Hyperliquid gives us no revoke primitive) |

### Phase H2 — EXIT (close / reduce), the first action shipped

| # | Work |
|---|---|
| H2.1 | `lib/perps/venues/hyperliquid.js` — L1 `order` action (reduce-only), msgpack `connectionId`, `Agent{source, connectionId}` signing. **Differential test against the SDK's own fixtures** |
| H2.2 | `orderState.js`: Hyperliquid resolves at **fill**, with no chain event. `submitted` → `venue_pending` on an accepted POST; `executed` **only** from a fill. The `(d)` exhaustive sweep must stay green with the new signal source |
| H2.3 | `PositionSheet` Hyperliquid branch: close/reduce, plus agent-missing/expired/replaced states each stating the venue link-out |
| H2.4 | `usePerpsTrade` third rail (signed POST, browser-direct). **The agent key must not reach the gateway** |
| H2.5 | Exit tests: every agent failure state still offers the link-out; nothing in the exit path imports `hyperliquidAccount.js` or any gate |

### Phase H3 — protect (TP/SL)

Hyperliquid expresses protection as trigger orders. The FR-003 rule that they must not linger as
stale exposure applies, and Hyperliquid does not clean them up for us.

### Phase H4 — the two approvals, then opening

| # | Work |
|---|---|
| H4.1 | `approveAgent` + `approveBuilderFee` under the `HyperliquidSignTransaction` domain with `signatureChainId` = the member's **current** chain (prefer `0xa4b1` when they are already on Arbitrum — the best-trodden server path). **Add a gateway-side canary**: "any chain" is verified live and stated in the SDK, but the public gitbook is weaker, so treat it as a compatibility assumption |
| H4.2 | Onboarding is **strictly serial** — fund → approve agent → approve builder fee. Handle the abandoned member (funds on Hyperliquid, no agent) explicitly |
| H4.3 | Funding states 1–4 (§2.3) with `—` for unknown, never 0 |
| H4.4 | Opening: attestation + screening gates (entry only), builder-fee disclosure via the existing `feeUnits.js` (`bpsToHyperliquidBuilderFee` → `f` in tenths of a bp, `bpsToHyperliquidMaxFeeRate` → `"0.05%"`, both already shipped and tested) |
| H4.5 | A member who approves the agent but not the builder fee **trades fine and pays FairWins nothing.** Treat that as normal, disclose it, and **never** use it to gate anything |

### Phase H5 — builder operations

Fund → `userSetAbstraction("disabled")` → verify → set `PERPS_HL_BUILDER_ADDRESS`. Add the §2.4
monitor and a new section in `docs/runbooks/perps-operations.md` carrying the three `/info` checks,
the "silent revenue failure" framing, the 2-day CSV lag tolerance, and the rule that **the alert
stays quiet while the builder address is unset**.

### Phase H6 — the security review of §2.6, before enablement, not after

---

## 5. Since the answer is do-not-ship-yet

### 5.1 Exactly what would flip it

Each is specific and checkable. None is "further investigation".

| # | Condition | Who controls it | How we would know |
|---|---|---|---|
| **F1** | **Hyperliquid accepts a contract signature** for user-signed actions (a `signatureType` discriminator, or an equivalent of Polymarket's enum) | Hyperliquid | Their exchange-endpoint docs grow a signer-type field. Removes the passkey exclusion **and** the fund-loss trap in one move |
| **F2** | **An exit exists that does not require a pre-approved agent key** — e.g. a user-signed close/flatten, or L1 actions signed under a domain injected wallets accept | Hyperliquid | The SDK gains a user-signed close, or `l1_payload` stops pinning `chainId 1337`. This is the one that answers §3's decisive objection |
| **F3** | **Measured demand.** The gateway already reads Hyperliquid positions: count distinct accounts with a non-empty `assetPositions` over 30 days (after H0.1, or the count is wrong) | Us — **do this first, it is nearly free** | If the number is ~0, the decision is settled on evidence rather than principle, permanently. If it is large, F4 becomes worth asking |
| **F4** | **An explicit product-owner acceptance** of a browser-held trading key as a new security category, plus the §2.6 review passed | Us | A recorded decision, not an inference from a merged PR |

F1 or F2 alone would make this worth re-opening. F3 and F4 are ours; **F3 should be measured
regardless**, because it is the cheapest input to every future version of this decision.

**The one thing that cannot be resolved from here, named**: whether `app.hyperliquid.xyz` geoblocks
the jurisdictions the spec-083 attestation warns about. It answered 200 from this host, which proves
nothing — any block is applied per member IP, not to our server. It cannot be measured from a
datacenter and it does not change the verdict, but it sharpens §3's point 4: if the venue's own app
is unavailable to some members, then a Hyperliquid position FairWins opened would have **no**
reachable exit for exactly those members. Verify it before any future ship, from the jurisdictions in
question.

### 5.2 What the product says today — verified, not assumed

I read the shipped copy rather than trusting the brief. **Today's statements are accurate**, with two
defects and one latent inaccuracy.

**Accurate today:**

| Where | What it says | Verdict |
|---|---|---|
| `components/perps/PerpsPositions.jsx` (the per-venue note) | "Hyperliquid positions are read-only in FairWins this release — manage those on the venue." + "FairWins never holds your positions." | **Accurate.** Rendered per venue from the venues actually on screen, so it never over-claims. With `VITE_PERPS_MANAGE_ENABLED` off (the default, and the current state) *every* venue reads this way, which is also true |
| Member with no Hyperliquid position | Nothing about Hyperliquid at all | **Correct** — honest absence, not a disclaimer looking for an audience |
| `components/admin/PerpsFeesPanel.jsx` | "read-only this release — Hyperliquid's L1 actions need an agent key even to close a position, so FairWins sends it no orders and **this rate rides nothing**" | **Accurate**, and unusually good: it warns the operator at the moment they could change the rate |
| `docs/runbooks/perps-operations.md` §3 | "It does nothing today… Setting a non-zero rate changes no member's cost until Hyperliquid…" | **Accurate** |
| No Hyperliquid deposit/bridge affordance anywhere | — | **VERIFIED by grep**: zero hits in `frontend/src` and `services/relay-gateway/src`. §1.4's rule is therefore preserved by default; keep it that way |

**Defect 1 — per-dex blindness fabricates absence (rule 4, honest numbers).** `routes.js` (~L238)
sends `{type:'clearinghouseState', user}` with **no `dex`**, and the docs say `dex` *"Defaults to the
empty string which represents the first perp dex."* CONFIRMED LIVE while writing this: `perpDexs`
returns **10** dexes — `''`, `xyz`, `flx`, `vntl`, `hyna`, `km`, `abcd`, `cash`, `para`, `mkts`. A
measured member holds **35 positions** across `xyz`/`hyna`/`mkts` and **zero** on the first dex;
FairWins renders "No open perp positions found for this account." That is a fabricated absence on the
one surface we are choosing to keep. `normalizeHyperliquidPairs` has the same gap
(`metaAndAssetCtxs` with no `dex`), so HIP-3 markets are missing from the pair list too. Full fix =
10× `clearinghouseState` (§2.5 budget). **Cheap honest fix if the fan-out is unaffordable: scope the
label** ("validator-operated perps") so the absence is qualified rather than absolute. **Do not leave
it unqualified.**

One implementation detail the fan-out carries: `normalizeHyperliquidPositions` already takes a
single `clearinghouseState` and reads `assetPositions`, so it can simply be called once per dex —
but its `id` is `hyperliquid:${coin}:${direction}`, which **collides across dexes** listing the same
coin. The dex name has to enter the id, and `venueRef` has to carry it, or two positions merge into
one row.

**Defect 2 — a balance read would lie to 42.5% of active traders.** Not shipped yet, which is the
point: the read-only surface shows no Hyperliquid balance today, so nothing is currently wrong. The
moment one is added — in any release, for any reason — it must go through §2.3's two-call
mode-aware path. Record it now so it is not rediscovered later.

**Latent inaccuracy — the fee copy describes a capability that does not exist.**
`PerpsView.jsx` (~L531) renders *"FairWins charges a {rate} fee on Hyperliquid orders placed through
FairWins"*, and `PERPS_TIPS.builderFee` elaborates it. It is dark **only because the rate is 0**, and
the rate is **admin-settable today** from the Fees tab (`perps.hyperliquid.builder`, Polygon,
ConfigOnly, cap 10). One admin action turns on a member-facing sentence about placing Hyperliquid
orders through FairWins, which is impossible. The admin panel warns the operator; the member surface
does not defend itself. **Fix**: condition that block on Hyperliquid management actually being
available — not on the rate alone — or reword it to the conditional it really is.

### 5.3 Corrections to research D12 (this document supersedes it on these points)

D12 is a dated decision log and stays as written; these are the corrections it needs where it is
quoted in living documents (`docs/developer-guide/perps.md` §"Hyperliquid stays read-only",
~L190-203):

1. **"HL L1 actions sign under a hardcoded `domain.chainId = 1337`"** — true of **orders**, and the
   sentence reads as if it also governed `approveAgent`/`approveBuilderFee`. It does not: those are
   user-signed actions whose `signatureChainId` is free-choice, so **EOA members need no chain
   switch** and see a readable typed prompt.
2. **"no documented ERC-1271 path, so passkey members are likely excluded"** — upgrade "likely" to
   **structurally and permanently excluded** (§1.2), and add the fund-loss trap (§1.4), which is the
   part that matters today.
3. **"Standard/Manual account-abstraction mode"** is Hyperliquid's **margin** mode, not ERC-4337. It
   constrains **FairWins' own builder account** (`"disabled"` + ≥100 USDC), not members. Move it out
   of the passkey discussion, where it currently reads as though the two were connected.
4. **Keep**, because it is right and load-bearing: *"even to close a position"*, and the
   never-stranded backstop — a Hyperliquid position stays closable by the member on the venue, so a
   lost or expired agent key would degrade FairWins to the link-out that already ships rather than
   stranding anyone.

### 5.4 The four follow-ups this decision creates

| # | Work | Where |
|---|---|---|
| 1 | Per-dex fan-out **or** a scoped label | `services/relay-gateway/src/perps/routes.js` (~L238) + `normalize.js` (`normalizeHyperliquidPositions`, `normalizeHyperliquidPairs`) |
| 2 | Gate the Hyperliquid fee sentence on management availability, not on the rate | `frontend/src/components/perps/PerpsView.jsx` (~L526-535), `frontend/src/lib/perps/perpsCopy.js#PERPS_TIPS.builderFee` |
| 3 | Apply §5.3's corrections; link this document from the Hyperliquid section | `docs/developer-guide/perps.md` (~L190-203) |
| 4 | Record §1.4's passkey deposit prohibition as a standing invariant, with a test that no Hyperliquid funding target can render on that rail | `docs/developer-guide/perps.md` + `frontend/src/test/perps/safetyInvariants.test.js` |

Follow-up 3 is deliberately not applied here: `docs/developer-guide/perps.md` is being edited
concurrently on this branch, and a decision document should not race a doc update.

---

## 6. Evidence ledger — the repo-side claims, re-checked in the tree

The Hyperliquid-side facts are pinned to their sources inline above. These are the claims this
document makes about **our own code**, each re-read at the stated location on 2026-08-12
(branch `claude/perps-083-completion`, at `ff3a8223`). They are listed so a later reader can
re-check them rather than inherit them.

| Claim | Where it was verified | Result |
|---|---|---|
| The read-only sentence is rendered **per venue**, so it never over-claims | `frontend/src/components/perps/PerpsPositions.jsx` L152-158 (`readOnlyVenues` branch) | Confirmed, verbatim |
| No Hyperliquid deposit/bridge affordance exists anywhere (§1.4's rule is preserved by default) | grep for `Bridge2`, `0x2Df1c51E`, and any Hyperliquid deposit path across `frontend/src` + `services/relay-gateway/src` | **Zero hits** |
| Per-dex blindness — `clearinghouseState` is sent with no `dex` | `services/relay-gateway/src/perps/routes.js` **L238** (pairs have the same gap at **L144**, `metaAndAssetCtxs`) | Confirmed |
| A per-dex fan-out would collide position ids | `services/relay-gateway/src/perps/normalize.js` **L739**: id is `` `hyperliquid:${p.coin}:${long\|short}` `` — no dex component | Confirmed |
| The fee sentence is conditioned on the **rate**, not on management being available | `frontend/src/components/perps/PerpsView.jsx` L530-534 (`fee.bps > 0 ?`) + `lib/perps/perpsCopy.js` L26-29 | Confirmed — the latent inaccuracy is real |
| The admin panel warns the operator that the rate rides nothing | `frontend/src/components/admin/PerpsFeesPanel.jsx` L439 | Confirmed |
| The runbook says the rate does nothing today | `docs/runbooks/perps-operations.md` §3, L181-182 | Confirmed |
| The builder address is unset everywhere | `services/relay-gateway/.env.example` L163 (commented); `infra/vm/gateway/docker-compose.yml` L77 ("unset on purpose") | Confirmed |
| Management is off by default | `frontend/src/config/perps.js` L196 — `VITE_PERPS_MANAGE_ENABLED`, string-compared to `'true'` | Confirmed |
| **LIB_EXIT forbids four named gates and nothing else** (the §3 correction) | `safetyInvariants.test.js` — `(g)` L1064-1084, `(h)` L1344-1358 | Confirmed: attestation, sanctions, kill switch, `canOpen` only |
| `orderState.js` already has the vocabulary §4 H2.2 uses | `frontend/src/lib/perps/orderState.js` L43-72 — `SUBMITTED`, `VENUE_PENDING`, `EXECUTED`, `PENDING_STATES` | Confirmed — H2.2 invents no new state |
| The Predict precedent does not transfer — CLOB creds alone cannot order | `frontend/src/lib/predict/clobSession.js` L116: `makeClobClient(walletClient, creds, …)` takes the member's wallet | Confirmed |
| The FR-019 copy shape exists to copy from | `frontend/src/lib/predict/tradeSigner.js` L25-39 (`{canSign:false, kind:'passkey', reason}`), `PASSKEY_PREDICT_ENABLED = false` at L15 | Confirmed — and §1.3's "without the flag" is the deliberate difference |
| The builder-fee unit helpers already exist and are tested | `frontend/src/lib/perps/feeUnits.js` L169 (`bpsToHyperliquidBuilderFee`, ×10, clamp 100), L196 (`bpsToHyperliquidMaxFeeRate`, percent string) | Confirmed — §4 H4.4 extends nothing here |
| D12's three misleading sentences are quoted accurately in §5.3 | `specs/083-perps-position-management/research.md` L201-212 | Confirmed, verbatim |

**One correction this pass made to an earlier draft of this document**: §3's first reason previously
claimed the design "cannot pass its own test." That was false — `safetyInvariants` would pass, because
a credential ceremony is not one of the four gates it knows about. The argument is stronger stated
honestly, and it now is: the suite cannot see this failure, which is precisely why the principle has
to hold the line.
