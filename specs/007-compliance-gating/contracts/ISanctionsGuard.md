# Contract: ISanctionsGuard (on-chain sanctions enforcement)

`contracts/interfaces/ISanctionsGuard.sol`, implemented by `contracts/access/SanctionsGuard.sol`
(Solidity `^0.8.24`, OZ `AccessControl`). Non-bypassable enforcement layer (FR-054/FR-020).

## Interface

```solidity
interface ISanctionsGuard {
    // Views
    function isAllowed(address account) external view returns (bool);
    function checkBlocked(address account) external view; // reverts SanctionedAddress(account) if not allowed
    function isDenied(address account) external view returns (bool);
    function sanctionsOracle() external view returns (address);

    // Admin (SANCTIONS_ADMIN_ROLE)
    function setDenied(address account, bool denied, string calldata reason) external;
    // Admin (DEFAULT_ADMIN_ROLE)
    function setSanctionsOracle(address oracle) external;

    // Events
    event DenyListUpdated(address indexed account, bool denied, address indexed actor, string reason);
    event SanctionsOracleUpdated(address indexed oracle);

    // Errors
    error SanctionedAddress(address account);
}
```

## Behavior contract

- `isAllowed(a)` returns **false** if `isDenied(a)` **or** (`sanctionsOracle != address(0)`
  **and** the oracle reports `isSanctioned(a) == true`). The external oracle call is wrapped
  in `try/catch`; **any revert, or empty/undecodable return data, ⇒ not allowed (fail-closed)**
  (FR-016/FR-019). The deny-list check short-circuits before the oracle call.
- `checkBlocked(a)` reverts `SanctionedAddress(a)` exactly when `isAllowed(a) == false`.
- `setDenied` rejects `address(0)`, sets `_denied[account]`, emits `DenyListUpdated` with
  `actor = msg.sender` and `reason` (SC-018). Role: `SANCTIONS_ADMIN_ROLE`.
- `setSanctionsOracle` emits `SanctionsOracleUpdated`. Role: `DEFAULT_ADMIN_ROLE`. SHOULD
  validate the new address has bytecode on mainnet.
- No state writes occur during `isAllowed`/`checkBlocked` (read-only Checks; CEI safe).
- Network-scoped: deployed per chain; oracle address injected per chain (R1).

## Consumption (modified contracts)

| Caller | Entry point | Screened |
|---|---|---|
| `WagerRegistry` | `createWager` | `msg.sender` (first Check) |
| `WagerRegistry` | `acceptWager` | `msg.sender` **and** `w.creator` (counterparty) |
| `MembershipManager` | `purchaseTier`, `upgradeTier` | `msg.sender` |

Exit/refund paths (`claimRefund`, `claimPayout`, `batchExpireOpen`, `declareDraw`) are
**NOT** screened — a newly-listed party must still recover their own escrowed funds.

## Tests (Principle II)

- Unit: `isAllowed` truth table (denied / oracle-sanctioned / both / neither); fail-closed
  on oracle revert + on EOA-as-oracle (empty return); role-gating reverts; events.
- Integration: each consuming entry point reverts for a listed sender, and `acceptWager`
  reverts for a listed counterparty; exit paths succeed for a listed party.
- Fork (Polygon 137): real oracle blocks a known sanctioned address, allows a clean one
  (SC-004/SC-016).
