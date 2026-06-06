# Phase 1 Data Model: exposure setting & oracle-model matrix

## Entities

- **OracleExposureSetting** — the single switch.
  - Source: `import.meta.env.VITE_ORACLE_MODELS`.
  - Values: `polymarket-only` (default; also when unset/unknown) | `all`.
  - Derives: `EXPOSED_ORACLE_RESOLUTION_TYPES` (array of `ResolutionType`).

- **Oracle Model (ResolutionType)** — the auto-settlement source.
  - Members: `Polymarket(4)`, `ChainlinkDataFeed(5)`, `ChainlinkFunctions(6)`, `UMA(7)`.
  - Per-feature state: `exposed | hidden` (in the **selection** UI only).

## Exposure matrix

| Setting | Exposed (selectable) | Hidden (not selectable, still displayable) |
|---|---|---|
| `polymarket-only` (default) | Polymarket | Chainlink Data Feed, Chainlink Functions, UMA |
| `all` | Polymarket, Chainlink Data Feed, Chainlink Functions, UMA | — |

## Where each state is read (selection vs display)

| Surface | Reads | Behavior |
|---|---|---|
| `FriendMarketsModal` oracle tab strip | `EXPOSED_ORACLE_RESOLUTION_TYPES` | renders only exposed models; if 1 → auto-select Polymarket, no chooser |
| `FriendMarketsModal` initial `resolutionType` | exposed set | falls back to Polymarket if a pre-selected model is hidden |
| `Dashboard` / `OnboardingTutorial` copy | setting | reduced wording when Polymarket-only; full when `all` |
| `RESOLUTION_TYPE_LABELS` / display of an existing wager's model | **full set (unchanged)** | every model still labels/renders correctly (FR-006) |
| `OracleConditionPicker` (Chainlink/UMA) | — | unreachable when those models hidden; unchanged |
| Admin `OracleAdaptersTab` | — | **out of scope; unchanged** |

## Validation / invariants

- A user can select only models in `EXPOSED_ORACLE_RESOLUTION_TYPES` — by any path
  (tab click, keyboard, programmatic). (FR-001)
- With one exposed model, no empty/dead chooser is shown. (FR-002)
- Display + settlement of a hidden-model wager is unaffected. (FR-006)
- `EXPOSED_ORACLE_RESOLUTION_TYPES` always includes Polymarket (Polymarket is never
  hidden). Default array = `[Polymarket]`.
