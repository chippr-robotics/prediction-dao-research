# Contract: IChainalysisSanctionsOracle (external dependency)

`contracts/interfaces/IChainalysisSanctionsOracle.sol`. Minimal read-only view over the
deployed Chainalysis `SanctionsList` oracle. Address is **injected per chain** (never
hardcoded — FR-055).

## Interface

```solidity
interface IChainalysisSanctionsOracle {
    function isSanctioned(address addr) external view returns (bool);
}
```

## Deployed addresses (verified, R1)

| Network | chainId | Address | Notes |
|---|---|---|---|
| Polygon mainnet | 137 | `0x40C57923924B5c5c5455c48D93317139ADDaC8fb` | verified contract; production |
| Polygon Amoy | 80002 | _none_ | NOT deployed → inject `MockSanctionsOracle` |
| Hardhat / localhost | 31337/1337 | _deploy mock_ | `contracts/mocks/MockSanctionsOracle.sol` |

(Base differs: `0x3A91A31cB3dC49b4db9Ce721F50a9D076c8D739B` — not used here, but proves a
single global constant is wrong.)

## Rules

- Free to read; no API key (R1).
- The address comes from per-chain deploy config and flows to the frontend via
  `sync:frontend-contracts` (FR-055). Deploy MUST verify bytecode exists at the configured
  address on mainnet; on Amoy/local it points at the mock.
- `SanctionsGuard` is the only production consumer that *enforces*; the frontend reads it
  advisory-only.

## MockSanctionsOracle (test/testnet only — `contracts/mocks/`)

Implements `isSanctioned(address)` from a settable mapping; used ONLY on Amoy/local/forks.
Never imported by production contracts; `SanctionsGuard` holds an injected interface address
so the same guard bytecode runs everywhere (Principle III: no mock in the mainnet path).
