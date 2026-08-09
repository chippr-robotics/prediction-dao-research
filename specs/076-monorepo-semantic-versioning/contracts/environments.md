# Contract: Environment Matrix

**Feature**: `specs/076-monorepo-semantic-versioning` | Satisfies FR-023 – FR-028, FR-027a

Three services, two of which are "staging". Both staging services are built from the same commit and
carry the same release-candidate version; they differ only in cohort (R1).

---

## The three services

| | Production | Staging (mainnet) | Staging (testnet) |
| --- | --- | --- | --- |
| Cloud Run service | `prediction-dao-research` | `prediction-dao-research-staging` | `prediction-dao-research-staging-testnet` |
| Tracks branch | `main` | `staging` | `staging` |
| Hostname | `fairwins.app` | `staging.fairwins.app` | `staging-testnet.fairwins.app` |
| `VITE_NETWORK_ID` | `137` | `137` | `80002` |
| Cohort | mainnet | mainnet | testnet |
| Membership chain | Polygon 137 | Polygon 137 | Amoy 80002 |
| Mini-app registry | Polygon 137 | Polygon 137 | Mordor 63 |
| Version identity | `vX.Y.Z` | `vX.Y.Z-rc.N` | `vX.Y.Z-rc.N` |
| Role | live | **promotion mirror** | safe rehearsal |

The mainnet staging service is the one FR-026 calls the mirror and FR-027a compares against
production. The testnet one exists to satisfy FR-026a and is where destructive testing belongs.

## Enumerated differences (FR-024)

These are the ONLY values permitted to differ between production and staging-mainnet. Any other
difference blocks a promotion (FR-027a).

1. `VITE_APP_URL` — the hostname
2. Cloud Run service name
3. Secret references (each environment holds its own — FR-027)
4. The non-production banner flag (FR-025)
5. Relayer, bundler, and paymaster endpoints — staging points at its own, never production's
   (FR-026c)
6. `VITE_APP_VERSION` / `VITE_GIT_SHA` — differ by construction

`VITE_NETWORK_ID` is on this list only for the **testnet** service, and its difference is the whole
reason that service exists.

## Blast-radius isolation (FR-026c, SC-012)

Staging carries real mainnet reach. Every funded or rate-limited resource MUST be its own:

| Resource | Rule |
| --- | --- |
| Relayer gas wallet | separate address, separately funded, sized for testing |
| Paymaster deposit | separate EntryPoint deposit |
| Origin-lock secret | separate value |
| RPC keys / API credentials | separate keys, so a staging loop cannot exhaust production's quota |
| Any admin or deployer key | staging holds none |

A defect exercised on staging must not be able to drain, exhaust, or rate-limit anything production
depends on.

## Honest presentation (FR-025, FR-026d)

- Both staging services are `noindex` and are never advertised as the product.
- The app shows a persistent non-production marker.
- The mainnet staging service additionally discloses that actions are **real on-chain actions on
  mainnet**, not a simulation. Constitution III forbids implying otherwise, and the risk here is a
  tester assuming a dry run and spending real funds.

## Deploy failure (FR-028)

A failed deploy fails loudly and leaves the previous revision serving. The version an environment
reports always describes what is actually running, never what was intended — so a failed deploy
leaves the *old* version displayed, which is correct.
