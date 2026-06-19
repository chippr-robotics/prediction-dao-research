# Contract: `onProgress` callback for `purchaseRoleWithStablecoin`

Additive, **optional** parameter so the modal can surface the approve/pay
sub-steps. Existing callers that omit it are unaffected (FR-001a — no mechanics
change).

## Signature (additive)

```
purchaseRoleWithStablecoin(
  signer, roleName, priceUSD, tier, action, termsHash,
  onProgress?           // NEW: optional (event) => void
)
```

> Implementation note: prefer appending as a trailing optional argument or an
> options object to avoid breaking the positional signature used by current
> callers and `blockchainService.purchase.test.js`.

## Event shape

```
{
  step:  'approve' | 'pay',
  phase: 'start' | 'sent' | 'confirmed' | 'skipped',
  txHash?: string        // present on 'sent' / 'confirmed' for transaction steps
}
```

## Emission rules

| Situation | Events emitted (in order) |
|-----------|---------------------------|
| Approval needed (`allowance < price`) | `{approve,start}` → `{approve,sent,txHash}` → `{approve,confirmed,txHash}` |
| Approval not needed | `{approve,skipped}` (or no approve event at all — the modal omits the step from its pre-flight list either way) |
| Payment | `{pay,start}` → `{pay,sent,txHash}` → `{pay,confirmed,txHash}` |

## Guarantees

- Callback invocation is best-effort and MUST NOT change control flow, on-chain
  calls, arguments, or their order. Errors thrown by `onProgress` MUST NOT abort the
  purchase (wrap in a try/catch).
- No new wallet prompt is introduced by emitting events.
- `sign` and `register` steps are **not** emitted here — they are orchestrated and
  tracked by the modal/`usePurchaseFlow` (R3), since they occur after the service
  call returns.

## Test expectations (`blockchainService.purchase.test.js`)

- With sufficient allowance: no `approve,start`/`sent`/`confirmed` sequence (only
  `pay` events, optionally a single `approve,skipped`).
- With insufficient allowance: full `approve` sequence precedes `pay`.
- Omitting `onProgress` entirely: behavior identical to today (regression guard).
