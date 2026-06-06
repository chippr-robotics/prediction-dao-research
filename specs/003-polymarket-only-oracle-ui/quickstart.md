# Quickstart: validating Polymarket-only oracle selection

Validates both states of the exposure switch and that hidden-model wagers still
display. Frontend-only; no chain/contract changes.

## Prerequisites

- Frontend deps installed (`npm --prefix frontend ci`).

## Validate the default (Polymarket-only)

```bash
# default: VITE_ORACLE_MODELS unset (or 'polymarket-only')
npm --prefix frontend run dev
```
Open the app → start creating an **oracle / auto-settled** wager (check **both** the
1v1 and the **Bookmaker** flows):
- **Expect**: Polymarket is the only oracle model offered and is selected; there is
  **no** Chainlink Data Feed / Chainlink Functions / UMA option (no tab, dropdown
  entry, or keyboard path), and no empty/dead oracle chooser — in both flows.
- Pick a Polymarket market and create the wager → **works as before**.
- Dashboard/onboarding copy names only Polymarket as the auto-settlement source.
- **Landing page** footer "Oracles" list shows only Polymarket — no Chainlink/UMA
  links; no landing/marketing page contains "Chainlink"/"UMA".

## Validate reversibility (all oracles)

```bash
VITE_ORACLE_MODELS=all npm --prefix frontend run dev
```
- **Expect**: all four oracle models reappear in the selector and the copy —
  today's behavior — with no other change (SC-004).

## Validate display preservation

- View an existing wager that uses Chainlink/UMA (or a fixture) under the default
  flag → **Expect**: its model name still renders and it resolves normally (SC-005).

## Automated test

```bash
npm --prefix frontend run test -- oracleExposure
```
- Default → selector offers only Polymarket; `all` → offers all four; a
  Chainlink/UMA wager still labels its model (per contracts/ui-contract.md).

## Success criteria

- SC-001 (only Polymarket selectable), SC-002 (Polymarket path no regression),
  SC-003 (copy Polymarket-only), SC-004 (flag=all restores), SC-005 (hidden-model
  wagers still render/settle), SC-006 (zero contract/ABI/deploy changes).
