# Frontend Integration Contracts

Client-side module and component contracts for spec 068. Everything here composes with the
shipped spec 043/049 custody stack; nothing replaces it.

## `lib/custody/policyV2.js` (new)

| Export | Contract |
|---|---|
| `getPolicyEngineV2Addresses(chainId)` | `{ guardV2, setup } \| null` — requires both `safePolicyGuardV2` and `policyGuardSetup` for the chain |
| `isPolicyV2Supported(chainId)` | boolean from the above |
| `getPolicyStatus(vault, chainId)` | extends the v1 status: `'unsupported' \| 'none' \| 'managed' (v1 guard) \| 'managed-v2' \| 'foreign'` — reads the guard storage slot and compares against both singletons; exported from policyV2 and re-used by PolicyBadge/Panel routing |
| `readPolicyV2(vault, chainId)` | `{ rules: Rule[], cooldown, accounting[] }` decoded via `getRules` + per-rule `getRuleAccounting` |
| `validateRulesConfig(rules, cooldown, { owners })` | throws member-language errors; enforces bounds (≤16/≤8/≤16), approvalsRequired sanity, banded⇒perTxLimit, approver-must-be-owner, duplicate detection; returns normalized config |
| `analyzeShadowing(rules)` | `[{ index, shadowedBy }]` — static scope-cover analysis for the FR-015 composer warning |
| `matchPreview(rules, payload)` | client twin of on-chain matching (incl. banding + same-scope fall-through) for the compose-time and propose-time previews |
| `encodeSetRules(rules, cooldown)` | calldata for `setRules` |
| `buildRulesChangeTx(chainId, config)` | `{ to: guardV2, value: 0n, data }` |
| `buildAdoptV2Txs(vault, chainId, config)` | `[setRulesTx, setGuardTx]` for the two-step attach/upgrade (consecutive nonces, 049 pattern) |
| `describeRulesV2(rules, cooldown, assetMeta)` | plain-language lines per rule, display numbers `001…`; used by list, diff, and proposal decode |
| `decodePolicyErrorV2(err)` | typed error → member message naming the display rule number (SC-003) |
| `classifyPolicyProposalV2(proposal, chainId, vault)` | decodes `setRules`/`setGuard(guardV2)` proposals for the queue (extends 049's `classifyPolicyProposal`) |
| `fromV1Policy(v1Policy)` | lossless pre-population: v1 asset rules → rules, allowlist → catch-all targets, cooldown → cooldown (R10) |

## `config/serviceCatalog.js` (new)

`getServiceCatalog(chainId) → [{ id, name, addresses, source }]` — strict per-chain (no
`getNetwork` fallback); empty array on non-custody chains. Sources: `NETWORKS[chainId].dex` +
`dexProvider` name, `config/staking.js` (where applicable), platform contracts via
`getContractAddressForChain`. Pure + unit-tested; adding a service is config-only (FR-022).

## `config/safeContracts.js` + `config/contracts.js`

- `SAFE_CONTRACTS` gains `61: SAFE_V1_4_1` → `CUSTODY_SUPPORTED_CHAIN_IDS = [61, 63, 137]`.
- Per-chain keys after deploys: `safePolicyGuardV2` (new), `policyGuardSetup`, `safeProposalHub`
  on 61/63/137 (+1337 local), via `sync:frontend-contracts` from `deployments/`.
- `DEPLOYMENT_BLOCKS_BY_CHAIN` gains `safeProposalHub` for every custody chain (fixes the shipped
  gap that makes `useVaultProposals.refresh()` error everywhere today).

## `hooks/useCustodyVaults.js` (changed)

- No chain filter: enrich ALL saved references concurrently, each via `getProvider(ref.chainId)`.
- Per-vault failure isolation: enrichment failure ⇒ `{ ...ref, reachable: false }`, list intact.
- Returned vaults gain `chainName` (strict `NETWORKS` lookup, numeric id fallback rendered
  as-is), `onVaultChain`.
- `createVault`/`previewVaultAddress` unchanged (connected chain only); `loadByAddress` unchanged
  (connected chain), documented.

## Components

| Component | Contract |
|---|---|
| `CustodyAddressField` (new) | `{ id, label, value, onChange(rawString), chainId, placeholder?, disabled?, hint?, selfAddress? }` — AddressInput + AddressBookButton + QR scan (CpAddressField pattern). Replaces raw inputs in CreateVaultWizard owner rows, OwnersThresholdPanel new-owner, LoadVaultForm address, ProposeTransactionForm recipient/token, RuleComposer target entry. Book names shown via AddressInput resolution (FR-007). |
| `RuleList` (new) | `{ rules, editable, onReorder(nextOrder), onEdit(index), onRemove(index) }` — numbered rows (`001…`), drag + keyboard ↑/↓ (aria-labels, PoolParticipants pattern), shadowing warnings inline, legacy-v1 variant renders unnumbered + visually distinct (FR-020). |
| `RuleComposer` (new) | per-kind editors mapping plain language → rule fields (approver picker limited to current owners; K-of-N toggle for "any of"; banded tiers wizard; token limit; service picker fed by `getServiceCatalog(vault.chainId)` + manual address with un-vetted warning). Emits validated rule via `validateRulesConfig`. |
| `PolicyPanelV2` (new) | read view (numbered rules, per-rule window consumption, cooldown), edit flow staging a full `setRules` diff (before/after incl. order — FR-018), propose via `onPropose`; blocks new changes while a guard-targeted proposal is queued (FR-019) with explanation; attach (`none`) and upgrade (`managed` v1, pre-populated via `fromV1Policy`) use `buildAdoptV2Txs`. Empty-rule-set proposals require explicit "deny all" confirmation. |
| `CustodyPanel` | routes by status: `managed-v2` → PolicyPanelV2; `managed` → legacy PolicyPanel + upgrade entry; cross-chain vault list always rendered; creation gated per connected chain (FR-005) with other custody chains named + switch affordance. |
| `VaultList` | chain badge per row (name, testnet marker); `reachable:false` rows show honest per-vault error. |
| `VaultDetail` | Network row shows chain NAME + id (replaces raw number); off-chain vaults render read-only with switch prompt (generalizes the VaultProposalsPanel guard — FR-004). |
| `CreateVaultWizard` | owner rows → CustodyAddressField; explicit "This vault will be deployed on {chain name}" statement (FR-001). |
| `ProposeTransactionForm` | recipient/token → CustodyAddressField; violation preview extends to V2 via `matchPreview` + `previewTransaction` (`bytes32(0)` mode), messages name the rule number. |

## Accessibility & test contracts

- Every new/touched component: role/label-based queries + `vitest-axe` assertion (existing
  custody convention).
- Reorder tests drive the ↑/↓ buttons, not drag events (PoolParticipants test precedent).
- Chain-id conventions in tests: 1337 = fully policy-wired, 63 = custody without engine,
  1 = unsupported.
- New suites: `policyV2.test.js`, `serviceCatalog.test.js`, `CustodyAddressField.test.jsx`,
  `RuleList.test.jsx`, `RuleComposer.test.jsx`, `PolicyPanelV2.test.jsx`,
  `useCustodyVaults.multichain.test.jsx`, plus updates to `CreateVaultWizard`, `VaultList`,
  `VaultDetail`, `CustodyPanel`, `ProposeTransactionForm` suites and
  `vaultReferences.sync.test.js` (unchanged shape, cross-chain visibility).
