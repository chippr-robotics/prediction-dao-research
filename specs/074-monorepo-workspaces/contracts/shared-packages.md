# Contract: Shared Packages

**Feature**: 074-monorepo-workspaces | **Phase 1 design artifact**

Three shared packages. Two are new; one already exists and is merely consumed by name.

> **Authoring rule for every shared package**: extensioned relative imports and an explicit
> `exports` map, so **plain Node can resolve it**. `frontend/src` has 2,966 extensionless imports
> against the gateway's 0 — that asymmetry is the mechanical reason the duplication exists at all
> (research R6). A package that only Vite can resolve solves nothing.

---

## 1. `@fairwins/intent-types` (new) — Phase 4

**Purpose**: one source for the EIP-712 tables currently hand-synced across three (really four)
locations.

**Contents** — zero runtime dependencies, pure data plus a pure generator:

- the intent struct table (27 → 29 entries)
- the actions map
- **`RECEIVE_WITH_AUTHORIZATION_TYPES`** (EIP-3009) — the fourth table, currently in
  `frontend/src/lib/pools/gasless.js` *and* `services/relay-gateway/src/intent/intentTypes.js:192`
- `typeStringFor(action)` — a pure EIP-712 type-string generator

**Consumers after extraction**

| Consumer | Reduced to |
|---|---|
| `frontend/src/lib/relay/intentTypes.js` (329 lines) | re-export + the `NETWORKS[chainId]?.stablecoin` adapter |
| `frontend/src/lib/pools/gasless.js` | re-export of the EIP-3009 table |
| `services/relay-gateway/src/intent/intentTypes.js` (622 lines) | re-export + its ethers-based signing helpers |

**Feasibility** — verified: the gateway copy imports only `ethers` + a local errors module; the
frontend copy imports `NETWORKS`, the EIP-3009 table, and a local error class; and
`frontend/src/config/networks.js` does **not** reach `virtual:tenant`. Extraction is unblocked.

**Why EIP-3009 must be included**: extracting only the primary file would leave EIP-3009
duplicated **and asymmetric** — gateway reading a package, frontend reading a local literal — which
is strictly worse than today. And it is the money path (`joinWithAuthorization`). *(FR-025)*

### Parity gates

Two **different** gates, because the two cases have different sources of truth. *(FR-027)*

| Case | Gate | Why |
|---|---|---|
| Intent structs (23 of 24 tables) | `test/intent/TypehashParity.test.js` — regenerate the type string, assert `keccak256(string)` equals the `*_TYPEHASH` literal read from the contract | The root hardhat suite already compiles the contracts, so the assertion is nearly free |
| **EIP-3009 `ReceiveWithAuthorization`** | **recorded fixed-vector test** | Its authoritative typehash lives in the **deployed USDC contract**, not this repo. The only in-repo Solidity copy is `contracts/mocks/MockUSDCPermit.sol:16` — a **mock**. A contract-parity test would assert against a mock and prove nothing. |

### Sequencing (non-negotiable)

Two separate commits, so a bisect can distinguish *moved* from *added*:

1. **Extract** — must be proven byte-neutral. Measured: the 26 shared structs are currently
   field-for-field identical.
2. **Add `InvalidateNonce`** to the gateway. Measured: frontend 29 actions / 27 tables vs gateway
   28 / 26. `invalidateNonceWithSig` is live in `SignerIntentBase.sol:84`,
   `IWagerRegistryIntents.sol:80`, `WagerPoolFactory.sol:438` — so a relayed `invalidateNonce` is
   an unknown action at the gateway **today**. *(FR-028)*

**Verification**: all 29 actions green; both consumer suites green; manually sign one intent per
rail against a local hardhat deploy and confirm `ecrecover` returns the expected signer; confirm
the never-stranded self-submit fallback still works with the gateway unreachable.

---

## 2. `@fairwins/abi` (new, **generated**) — Phase 5

**Purpose**: give the 57 hand-maintained ABI files a producer and a parity gate. This closes a
live violation of constitution Principle V.

**Current state** (measured): 47 `.js` + 10 `.json` in `frontend/src/abis/` with **no generator**;
`subgraph.yaml` reaches into them via **8** `../frontend/src/abis/*.json` traversals; `subgraph/abis/`
holds 2 further vendored copies, of which **`WagerPool.json` has already drifted** — 81 entries
against the frontend's 88, missing `IntentNonceUsed`, `DOMAIN_SEPARATOR` and
`invalidateNonceWithSig`, and still carrying two removed errors.

Because `wagerRegistry` and `membershipManager` are UUPS proxies upgraded **in place at stable
addresses**, the ordinary shipping path is exactly the path that desynchronises them.

**Generator**: `scripts/codegen/emit-abis.js`, reading `artifacts/build-info/`, driven by a small
committed manifest naming which contracts are consumed and how.

**Critical generation rule**: `WagerRegistry` MUST emit the **merged two-facet ABI**. The proxy
delegatecalls unknown selectors to `WagerRegistryIntents`, so a single-facet ABI is wrong for every
`…WithSig` entry point. *(FR-031)*

**Committed or generated on demand?** — **Committed.** *(FR-035, decided in the plan's post-design
constitution re-check.)* Not committing them would mean a fresh clone could no longer run the
frontend without first installing a Solidity toolchain, fetching two solc binaries, and compiling
120 contracts through `viaIR` — today the frontend builds with **no Solidity toolchain at all**.
The parity gate (`emit-abis.js --check`, blocking in CI) is what keeps a committed tree honest.

**Migration rule**: adjudicate every generated-vs-committed difference individually. Some hand
edits are corrections and some are rot, and only someone who knows the contract can tell them
apart. Migrate **one contract at a time**, starting with those the subgraph reads — a wrong ABI
there produces truthful-looking *empty results*, which is the exact failure mode already recorded
for the Polygon subgraph. *(FR-033)*

**Explicitly not in scope**: `sync-frontend-contracts.js`'s **address** sync. It regex-rewrites
`frontend/src/config/contracts.js` in place, and untangling that is blocked on that file's
transitive `virtual:tenant` import. Only the `emitAbiJson` path is retired.

---

## 3. `@fairwins/miniapp-build` (exists) — Phase 3

**Purpose**: already a package; simply stops being imported by relative path.

**Change**: 6 relative imports become the package name. Four of them are the **only** imports
anywhere in `frontend/src` that escape `frontend/` — and all four sit in `src/test/miniapps/`,
which `frontend/eslint.config.js:13` currently **ignores**:

- `frontend/src/test/miniapps/buildPreset.test.js:24`
- `frontend/src/test/miniapps/hostScope.test.js:45`
- `frontend/src/test/miniapps/fixtures/regenerate.mjs:50`
- `frontend/src/test/miniapps/fixtures/source/vite.config.js:21`

The other two are the mini-app `vite.config.js` files, outside `src/`.

---

## Mini-app package manifests — Phase 3

`frontend/miniapps/token-mint` and `frontend/miniapps/clearpath` have **no `package.json` at all**
and resolve ~7 bare specifiers each purely by walk-up hoisting into `frontend/node_modules`.

New manifests declare `@fairwins/miniapp-build`, `vite`, `@vitejs/plugin-react` as devDeps and
`react`/`ethers` as peerDeps, and carry a **real `version`** — currently the manifest version is a
hardcoded `'1.0.0'` literal in both apps, so nothing signals a content change. *(FR-023)*

### The on-chain hazard this creates

`tools/miniapp-build/hostScopePlugin.js:235-237` calls `this.resolve()` then
`await import(resolvedFile)` to enumerate a dependency's **export names** at build time, and bakes
them into the emitted shim → `dist/entry.js` → its sha256 → `manifest.json` → `keccak256(manifest)`
→ the on-chain `MiniAppRegistry` commitment.

**Workspaces change hoisting → hoisting changes resolution → the committed hash changes, silently.**

Three blocking requirements:

1. **Record a baseline first** (FR-019): read `manifestHash` + `cid` for both apps from
   `MiniAppRegistry` on Polygon 137 **and** Mordor 63, rebuild on today's tree, and commit the
   observed digests — together with a stated answer to whether HEAD reproduces the published CIDs.
   If a chain is unreachable, record *unreachable* and block the gate.
2. **Extend the fixture to import `ethers`** (FR-021). The existing fixture's own header states
   `ethers` is *intentionally not imported* — so it covers the React shim and is structurally blind
   to the ~190-binding `ethers` shim, which is the larger, more version-sensitive, and only
   actually-used one. Both real packages import `ethers` (10 sites).
3. **The gate is before-vs-after on the same tree** (FR-020, B2) — never "matches what is on
   chain". The live packages were built from an unrecorded commit against unrecorded dependencies,
   so a mismatch could not distinguish "this change broke it" from "it was never reproducible".

If bytes change, the change is **blocked** until explained, and the package re-published and
re-approved on-chain. *(FR-022)*

---

## Boundary enforcement (FR-044–FR-047) — Phase 3

**A manifest does not enforce a boundary.** Verified: `packageBoundary.test.js` detects violations
by resolving **relative** paths, and Node/Vite resolve those without ever consulting a
`package.json`. Workspaces also hoist, so an undeclared bare specifier still resolves from root.

Enforcement is therefore three mechanisms together:

| Mechanism | Covers |
|---|---|
| existing `packageBoundary.test.js` | relative-path escapes (keep it) |
| **new** `eslint-plugin-boundaries` | both directions, element types `host` / `package` / `preset` |
| **narrowed** `frontend/eslint.config.js` `ignores` | `src/test/**` must come out — 3 of 4 real escapes live there |

Plus a **new** direction introduced by this feature: npm symlinks each member into the root
`node_modules` under its name (verified), so `import '@fairwins/miniapp-token-mint'` becomes
resolvable from `frontend/src`. The existing guard checks only relative paths and a literal
substring and would not catch it. It must be covered **in the same PR that adds the manifests**.
*(FR-046)*
