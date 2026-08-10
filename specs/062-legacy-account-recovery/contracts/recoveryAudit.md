# Contract: `data/ledger/sources/legacyRecoverySource.js` (new)

A thin, secret-safe wrapper over the spec-051 client ledger for the recovery audit record (FR-023/025).

## Function

```
captureLegacyRecovery(account, chainId, { recoveredAddress, source }) → void
```

- `account`: the session account (owner of the ledger); lowercased internally.
- `chainId`: active chain (number).
- `recoveredAddress`: the legacy account address (lowercased in the record).
- `source`: `'privateKey' | 'mnemonic'` (the recovery type).

Builds and appends one `ClientLedgerRecord` via `appendClientRecord(account, record)`:

```
entryId:  clientEntryId(`legacy-recovered:${chainId}:${recoveredAddress.toLowerCase()}`)
chainId:  Number(chainId)
account:  String(account).toLowerCase()
class:    LEDGER_CLASS.MEMBERSHIP
kind:     'legacy_account_recovered'
direction: LEDGER_DIRECTION.NONE
status:   LEDGER_STATUS.SETTLED
provenance: PROVENANCE.CLIENT
timestamp: Date.now()
timestampProvenance: TS_PROVENANCE.DEVICE
refs:     { recoveredAddress: recoveredAddress.toLowerCase(), source }
```

## Guarantees

- **Idempotent**: the stable `entryId` means `appendClientRecord` no-ops on a repeat, and the
  `activityLedger` backup domain unions by `entryId` — re-recovering the same account adds no
  duplicate (FR-025).
- **Never throws**: `appendClientRecord` is no-throw; a failed audit write must not break recovery.
- **No secret material**: only `recoveredAddress`, `timestamp`, and `source` are recorded (FR-024).
  A unit test asserts the serialized record contains neither the private key nor the mnemonic.

## Caller

`LegacyKeyRecoveryPanel` calls `captureLegacyRecovery` exactly once when a recovery is stored
(the SAVED transition), using the session `account`/`chainId` and the classified `kind` as `source`.
