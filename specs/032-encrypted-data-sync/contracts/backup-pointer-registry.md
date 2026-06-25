# Contract: BackupPointerRegistry (on-chain)

The trustless locator. A value-free, per-wallet pointer to a wallet's latest encrypted backup CID. Clones the
audited `KeyRegistry` shape (plain, non-upgradeable, `msg.sender`-keyed, no external calls). Solidity ^0.8.24,
no OpenZeppelin. Deployed deterministically (CREATE2) for a stable address; canonical network = Polygon
mainnet (137), also deployable to Amoy/Mordor for testing.

## Interface

```solidity
contract BackupPointerRegistry {
    uint256 private constant MAX_CID_LENGTH = 256; // CIDv1 base32 ~60 chars; generous bound

    mapping(address => string) private _pointer;

    event BackupPointerSet(address indexed owner, string cid, uint64 timestamp);

    error CidTooLong();

    /// @notice Set (or overwrite) the caller's backup pointer. Owner-only by construction (keyed on msg.sender).
    function setPointer(string calldata cid) external;        // checks length → writes _pointer[msg.sender] → emits

    /// @notice Read any wallet's latest backup pointer ("" if none). Free.
    function getPointer(address owner) external view returns (string memory);

    /// @notice Whether a wallet has a backup pointer set. Free.
    function hasPointer(address owner) external view returns (bool);
}
```

- **Clearing**: a member may overwrite with `""` to remove their pointer (FR-011 "request removal"); `hasPointer`
  treats `""` as absent. (Unpinning the IPFS content is a separate client/pinning concern.)
- **No admin, no roles, no funds, no external calls, no arithmetic.**

## Invariants (security-review + tests)

1. **Owner-only writes**: after `setPointer(x)` from A, `getPointer(A) == x`; no other address's slot changes.
2. **Overwrite**: a second `setPointer(y)` from A replaces x with y (latest wins).
3. **Isolation**: A cannot write B's slot (writes are keyed on `msg.sender` — no parameter for the owner).
4. **Length bound**: `setPointer` reverts `CidTooLong` when `bytes(cid).length > MAX_CID_LENGTH`.
5. **Event**: every successful write emits `BackupPointerSet(owner, cid, block.timestamp)`.
6. **CEI / reentrancy**: no external calls → reentrancy structurally impossible (no guard needed).

## Constitution I gate (how this clears it)

- CEI trivially satisfied (check length → effect write → emit); **zero external calls** → no reentrancy surface.
- Access control = `msg.sender` keying; no privileged path to bypass; no admin key to protect.
- No arithmetic (0.8 checked regardless).
- **Slither** expected clean (no calls/arithmetic/roles). **Medusa** harness `contracts/test/
  BackupPointerRegistryFuzzTest.sol` (invariant: a write from A only changes A's slot to the written value).
- **EthTrust-SL**: the L2 bar targets *value-bearing* contracts; this is **value-free** → documented as below
  that tier by design (no fund custody, no oracle path, no access-control surface).
- Security-agent review before merge (`.github/agents/`).

## Deploy / record / verify (existing flow)

- Deterministic CREATE2 via `deployDeterministic("BackupPointerRegistry", [], generateSalt(...), deployer)`
  (model on the `KeyRegistry` deploy block in `scripts/deploy/deploy.js`, or a standalone deploy script). NOT
  `lib/upgradeable.js` (that's UUPS only).
- Record `contracts.backupPointerRegistry = <addr>` + `constructorArgs.backupPointerRegistry = []` in
  `deployments/<net>-chain<id>-v2.json` (source of truth). Sync to the frontend address config.
- Verify via the existing `npm run verify:<net>` flow.
