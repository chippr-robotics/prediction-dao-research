# Protect: multi-chain vaults and ordered policy rules (spec 068)

Protect is FairWins' shared-custody portal. This guide covers what spec 068 added on top of
specs 043 (Safe multisig vaults) and 049 (the first policy engine):

- vaults on **any supported custody chain**, each carrying its chain identity everywhere
- an **ordered rule engine** (`SafePolicyGuardV2`) with approver sets, tiers, token limits and
  approved-contract lists
- shared address entry (paste / address book / QR) on every Protect input

> **Two guard versions run side by side, on purpose.** `SafePolicyGuard` (v1, spec 049) keeps
> enforcing for vaults that have not adopted V2. Neither guard is upgradeable — an upgrade key over
> a policy guard would be a backdoor across every vault — so migration is *vault-consented*: owners
> adopt a new version with a threshold-approved `setGuard`. Never "migrate" a vault's policy in a
> release.

## The rule model

A vault's policy is an **ordered array of rules**, replaced atomically by `setRules(rules, cooldown)`
(so add / edit / remove / **reorder** are all one proposal). Rule fields:

| Field | Meaning |
|---|---|
| `asset` | `ANY_ASSET` (`address(1)`) / `address(0)` native / an ERC-20 address |
| `perTxLimit` | max per transaction under this rule; `0` = uncapped |
| `windowLimit` | max per rolling-reset 24 h window; `0` = none |
| `approvalsRequired` | how many of `approvers` must approve (`0` stored only when `approvers` is empty) |
| `banded` | `perTxLimit` also bounds *matching*, so ordered rules form amount tiers |
| `approvers` | vault owners who must approve; empty = the vault's base threshold suffices |
| `targets` | allowed destinations; empty = any. Doubles as the approved-contract list |

### Evaluation (the part to get right)

1. **Exemptions**: transactions to the vault itself or to the guard bypass all fund rules, so owners
   can always loosen a policy (no-lockout, FR-021). Value sent *to* the guard reverts.
2. **No rules** for this vault on this guard ⇒ behaves exactly like an unguarded Safe.
3. **Hard denials**: delegatecall and gas refunds are refused while a policy is active. (This is
   also why `MultiSend` batching is unavailable on policy vaults — it is a delegatecall.)
4. **First match governs.** The lowest-indexed rule whose *scope* (asset, band, destinations)
   covers the transaction decides its fate. Later rules are **not** consulted.
5. **One narrow fall-through — the same-scope alternative.** If the governing rule's approver
   requirement is unmet, evaluation continues to the next rule with *strictly identical* scope.
   That is what makes "A + B together, **or** C alone" two adjacent rules. Limit and destination
   failures never fall through.
6. **No match ⇒ denial.** Once a vault has rules, silence is denial. Owners who want a fallback add
   a final catch-all rule (`asset: ANY_ASSET`, no approvers, no limits).

Scope is deliberately **approver-blind**: who signed can never change *which* rule applies, only
whether the governing rule is satisfied.

### Expressing the common shapes

| Intent | Rules |
|---|---|
| A + B together, or C alone, up to L | `001 {approvers:[A,B], required:2, perTx:L}` + `002 {approvers:[C], required:1, perTx:L}` |
| A or B up to X; A + B up to Y | `001 {approvers:[A,B], required:1, perTx:X, banded}` + `002 {approvers:[A,B], required:2, perTx:Y, banded}` |
| 500 USDC/tx, 2000 USDC/day | `{asset: USDC, perTx: 500e6, window: 2000e6}` |
| Only Uniswap + one market | `{asset: ANY, targets:[router, positionManager, market], perTx: …}` |
| Catch-all fallback | last rule `{asset: ANY, approvers: []}` |

### How approvals are verified on-chain

The guard recomputes the in-flight transaction hash — Safe increments `nonce` *before* calling the
guard, so it reads `nonce() - 1` — and counts, for each named approver, either an on-chain
`approvedHashes` record or the executing owner (mirroring how Safe treats the caller's
pre-validated signature). **An approver only counts while they are still an owner** (FR-010): a rule
naming a removed owner cannot be satisfied until the policy is amended, even if the vault can still
reach its base threshold.

This works because FairWins custody collects approvals fully on-chain (`approveHash` + pre-validated
signature bundles) — no signature-format change was needed.

### Documented limits

- The 24 h window is **fixed-reset**, not rolling: at most 2× the limit can move across a straddling
  span. Disclosed in the UI.
- Calldata the guard cannot value (anything but native value and ERC-20
  `transfer`/`transferFrom`/`approve`) is still matched and destination-gated, but passes amount
  limits unvalued.
- On `ANY_ASSET` rules the per-transaction limit applies per leg in that leg's own units, and the
  window counter would add different assets together — so `validateRulesConfig` refuses daily limits
  on any-asset rules.
- Changing the rule set clears live window accounting (rule identity is positional). The UI says so
  before the change is proposed.

## Client integration

`frontend/src/lib/custody/policyV2.js` is the single seam:

| Export | Use |
|---|---|
| `getPolicyStatus` | `'unsupported' \| 'none' \| 'managed'` (v1) `\| 'managed-v2' \| 'foreign'` — the router every surface reads |
| `readPolicyV2` | live rules + per-rule window accounting |
| `validateRulesConfig` | member-language validation (bounds, approver-is-owner, band needs a limit) |
| `analyzeShadowing` / `findBrokenRules` | the composer's warnings (FR-015 / FR-010) |
| `matchPreview` | client twin of on-chain matching, incl. banding and the same-scope alternative |
| `encodeSetRules` / `buildRulesChangeTx` / `buildAdoptV2Txs` / `buildEnablePolicyV2Setup` | proposals + creation setup |
| `describeRulesV2` / `decodePolicyErrorV2` | plain language, with rule numbers (`001`) |
| `fromV1Policy` | lossless v1 → V2 pre-population for the upgrade flow |

**Keep `matchPreview` in step with the contract.** The Solidity suite and
`src/test/custody/policyV2.test.js` deliberately share scenarios; if you change matching in one
place, change both and update both suites.

Components: `PolicyPanelV2` (read / stage / review / propose), `RuleList` (numbering + drag and
keyboard reorder), `RuleComposer` (plain-language editor; members never see `banded` or
`approvalsRequired`), `CustodyAddressField` (the one address input Protect uses).

## Multi-chain behavior

- Custody chains are `SAFE_CONTRACTS` in `frontend/src/config/safeContracts.js` (ETC 61, Mordor 63,
  Polygon 137). The engine additionally needs `safePolicyGuardV2` + `policyGuardSetup` for that
  chain.
- `useCustodyVaults` lists **every** saved vault regardless of the connected network, reading each
  through a provider for *its* chain, with per-vault failure isolation.
- Use **strict** `NETWORKS[chainId]` lookups in custody code. `getNetwork()` falls back to the
  default network for unknown ids, which on a custody surface would label or address a vault with
  the wrong chain.
- Every state-changing path checks `Number(walletChainId) === Number(vault.chainId)` — including at
  submit time, because the wallet can switch networks mid-flow.
- `safeProposalHub` needs a recorded **deployment block** per chain
  (`DEPLOYMENT_BLOCKS_BY_CHAIN`), or `useVaultProposals` refuses to scan and proposal discovery is
  silently dead on that chain.

## Deploying

```bash
npx hardhat run scripts/deploy/custody/deploy-policy-guard-v2.js --network <localhost|mordor|etc|polygon>
npx hardhat run scripts/deploy/custody/deploy-safe-proposal-hub.js --network <net>   # where missing
npm run sync:frontend-contracts -- --network <net> --chainId <id>
```

Deployment keys: `safePolicyGuardV2` (new), `policyGuardSetup` (reused as-is — it is guard-agnostic,
taking the guard address as a parameter and ERC-165-checking it), `safeProposalHub`. Both contracts
are admin-free and hold no funds, so only the deploy signs. See
[the operations runbook](../runbooks/protect-policy-operations.md).

## Tests

| Suite | Covers |
|---|---|
| `test/custody/SafePolicyGuardV2.test.js` | matching, ordering, approvers, windows, bounds, preview parity |
| `test/integration/policy-guard-v2-safe.test.js` | the whole surface against real Safe v1.4.1, incl. the US2 acceptance walk |
| `frontend/src/test/custody/policyV2.test.js` | the client twin, sharing scenarios with Solidity |
| `test/custody/PolicyScenarioParity.test.js` | the shared scenarios, driven against the real guard |
| `frontend/cypress/e2e/full/29-protect-custody.cy.js` | the member-facing flows, judged by the chain |
| `frontend/src/test/custody/{RuleList,RuleComposer,PolicyPanelV2,CustodyAddressField}.test.jsx` | UI, incl. axe |
| `frontend/src/test/custody/useCustodyVaults.multichain.test.jsx` | cross-chain listing and isolation |

`MockSafe` carries the Safe approval surface (owners, `approvedHashes`, `nonce`, a byte-identical
`getTransactionHash`) so approver rules are unit-testable without a real Safe.

### The shared scenarios

`frontend/src/test/fixtures/policyScenarios.js` is the ONE ordered-policy scenario table, read by
three suites: the Solidity parity test drives it against the real guard, the Vitest suite checks
`matchPreview` against it, and the full-tier Cypress spec composes the same rules in the UI and lets
the chain decide. Those cases used to be hand-copied into two suites, which meant a divergence
between the client twin and enforcement could show up as two green suites that disagreed about what
a vault would actually do. Add a case there, not in a suite.

Amounts are decimal strings and destinations are symbolic names, so no consumer has to know
another's units or addresses.

### End-to-end coverage

`29-protect-custody.cy.js` covers all seven flows from #1235 — create, propose/approve/execute,
operate-as-vault, v1 enforcement, v2 adoption, v2 first-match, and the multi-chain list — and each
outcome is read back from the vault (owners, threshold, nonce, guard slot, balances) rather than
from the screen.

Two pieces of scaffolding make it possible, and both are DEV-only:

- `scripts/e2e/setup-custody-fixtures.js` (wired into `npm run setup:e2e`) places Safe v1.4.1 at its
  canonical addresses on the local node and puts our guards, the setup helper and the proposal hub
  at the addresses the app is BUILT with — plus a recorded hub deploy block, without which proposal
  discovery is silently dead. It refuses to run against any RPC that does not expose
  `hardhat_setCode`.
- The full tier's node impersonates Amoy, where custody is deliberately unsupported, so
  `safeContracts.js` and the hub's deploy block carry a **DEV-guarded 80002 entry** under the
  existing `E2E_AMOY_LOCAL` flag — the same seam `NETWORK_CONTRACTS[80002]` and `earn` already use.
  Real Amoy joins the map proper only if Safe and our contracts are verified live on it.

When writing more of these, copy ABI signatures from `frontend/src/abis/` rather than typing them
from memory: a guessed `Proposed` event hashes to a different topic0 and matches nothing (reading
exactly like an app that proposed nothing), and `configureRules` takes `uint128` limits, so a
`uint256` guess selects a different function and the Safe's setup delegatecall reverts with no data
to explain it. Both cost a debugging round.
