# Spec 028 — Security analysis (T096)

Static + dynamic analysis over the Token Mint expansion (v2 templates + factory). Goal (T096): **no new
high/critical findings**; resolve or justify everything else.

## Slither

- Tool: `slither-analyzer` 0.11.5, solc 0.8.24, hardhat framework, `slither.config.json`.
- Command: `slither . --config-file slither.config.json`
- Project-wide result: **82 findings — 0 High, 0 Critical** (26 Medium, 40 Low, 16 Informational).
- Touching `contracts/tokens/`: **17 unique findings, 0 High/Critical.**

| Impact | Check | Location(s) | Disposition |
|--------|-------|-------------|-------------|
| Medium | `unused-return` | `OpenERC20V2._setFrozenInternal`, `OpenERC721V2.setFrozen` | **Justified.** Ignores `EnumerableSet.add/remove` bool. Intentional: the set membership *is* the freeze state and add/remove are idempotent; the boolean "did the set change" is not needed. Standard EnumerableSet usage. |
| Low | `reentrancy-benign` | `TokenFactory.create*` / `create*V2` (6) | **Justified.** The clone+`initialize` external call precedes the registry write. The factory is `nonReentrant`; the call target is a freshly-deployed, trusted clone of an immutable template; the token must exist before it can be registered (documented CEI). No value at risk. The v2 entrypoints mirror the v1 pattern already accepted in the original release. |
| Low | `calls-loop` | `OpenERC20V2._restrictionCode`, `OpenERC721V2._update` | **Justified.** The flagged "loop" is `SanctionsGuard.isAllowed(from/to)` in the transfer hook — one screen per transfer, by design and required (sanctions are non-bypassable). Not an unbounded loop over external calls. |
| Low | `missing-zero-check` | `TokenFactory.initialize` template impl args (3) | **Justified.** One-time, admin-controlled initialization. A zero impl address would make every clone fail immediately and loudly at deploy time (caught by the deploy script + integration tests), not a latent runtime risk. |
| Informational | `costly-loop` | `OpenERC721V2.batchMint` (`tokenId++` in loop) | **Justified.** Bounded by `MAX_BATCH = 200`; the increment is intrinsic to per-item minting. |
| Informational | `dead-code` | `OpenERC20V2._extraRestrictionCode` | **False positive.** It is a `virtual` hook overridden by `RestrictedERC20V2`; Slither's per-contract view misses the override. Removing it would break the restricted subclass. |
| Informational | `naming-convention` | `__OpenERC20V2_init`, `TokenFactory.__gap` | **Justified.** Leading-underscore names follow OpenZeppelin upgradeable conventions (`__gap`, `__X_init`). |

**Conclusion:** no high/critical; all token-contract findings are benign-by-design or false positives and are justified above. No deployed template source is changed for cosmetic items (the templates are deployed and referenced by immutable clones on Mordor; a bytecode change would force a redeploy for no security gain).

## Medusa (fuzzing)

Medusa is the Go-based fuzzer wired into CI (`.github/workflows/torture-test.yml`). It is not installable in the
local analysis environment here; it runs in CI as a non-gating supplementary job. The invariants it would
exercise on the v2 templates (cap never exceeded, paused blocks transfers, frozen/ineligible blocked, sanctions
non-bypassable) are also covered by the Hardhat unit + integration suites (`test/tokens/`, `test/integration/tokens/`).

## Accessibility (axe — WCAG 2.1 AA)

- `frontend/src/test/tokens.accessibility.test.jsx` runs `vitest-axe` over the portal surfaces (ContractPanel,
  HoldersPanel cap table, ActivityPanel feed + filter, CreateTokenWizard) — **no violations**. Picked up by the
  gating CI step `npm test -- --run accessibility.test` (`frontend-testing.yml`, `continue-on-error: false`).
- The Phase 14 adversarial review additionally fixed the activity category filter to use `radiogroup`/`radio`
  (was a misused `tab`/`tablist` with no associated tabpanel) and confirmed link-vs-button semantics, `role=alert`
  / `role=status` usage, and disabled-state signalling across the new components.
- **Lighthouse** (full-page perf/SEO/PWA + contrast in a real browser) is not runnable headless in this
  environment; jsdom cannot evaluate `getComputedStyle` pseudo-elements, so axe's color-contrast check is the one
  rule that can't run under Vitest. Color contrast is instead guaranteed structurally: the portal is mapped onto
  the app's existing `theme.css` variables (light + dark), which already meet AA in the rest of the app.
