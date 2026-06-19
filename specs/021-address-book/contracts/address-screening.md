# Contract: `useAddressScreening` + screening cache

Wraps the existing `utils/sanctionsScreen.js` so the address book and the
`AddressInput` picker can show restriction tags without redundant on-chain reads.
**Advisory only** — the on-chain `SanctionsGuard` remains the enforcement layer
(FR-013).

## Status model

```ts
type RestrictionStatus = 'clear' | 'restricted' | 'uncertain' | 'loading'
```

Mapping from `screenAddress(account, provider) -> { allowed, available }`:

| Result | Status |
|--------|--------|
| `available && allowed` | `clear` |
| `available && !allowed` | `restricted` |
| `!available` | `uncertain` (fail-closed, FR-011) |
| in-flight | `loading` |

## Hook

```js
useAddressScreening(): {
  // Returns current status for an (address, chainId); triggers a screen if not cached.
  getStatus(address: string, chainId: number): RestrictionStatus,

  // Imperatively (re-)screen a set of entries (e.g. on book open / on select).
  screen(entries: Array<{ address, chainId }>): Promise<void>,

  // True if any address in the set resolves to 'restricted'.
  anyRestricted(entries: Array<{ address, chainId }>): boolean,
}
```

## Caching rules (clarified Q5)

- Cache key: `(chainId, lowercase(address))`.
- Cache scope: in-memory for the session (module-level Map or hook state); no
  persistence of status to disk.
- TTL: short window (target ~60s). After expiry, the next open/select re-screens, so
  a contact that becomes restricted is reflected without background polling
  (spec Edge Case).
- De-duplication: concurrent requests for the same key share one in-flight promise.
- Network scope: screening uses the provider for the active chain; a status is only
  ever associated with the `chainId` it was screened on (FR-014). The chosen provider
  must talk to the entry's `chainId`; if the active provider is on a different chain,
  the entry is reported `uncertain` rather than screened against the wrong chain.

## Failure behaviour

- Guard not configured on the chain, RPC error, or read rejection → `uncertain`
  (never `clear`). The UI shows an "unscreened/uncertain" tag distinct from a clean
  state (FR-011).
