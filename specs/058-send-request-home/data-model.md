# Data Model: Pay / Request / Wager Home (spec 058)

**Spec**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)

All entities are client-side only. Nothing is stored on-chain or server-side;
no contract or subgraph schema changes (FR-018).

## HomeMode

Enumeration of the home surface's modes.

| Value | Meaning |
| --- | --- |
| `pay` | Send value to a recipient (default) |
| `request` | Generate a payment-request QR |
| `wager` | Existing create-a-challenge view (spec 053) |

Transitions: any → any, user-initiated via bottom nav (mobile) or segmented
switcher (desktop). Switching never clears the panels' drafts (FR-015).

## HomePreferences

Device-scoped, persisted at localStorage key **`fairwins_home_v1`** by
`utils/homePreference.js`.

| Field | Type | Default | Constraint |
| --- | --- | --- | --- |
| `defaultMode` | `HomeMode` | `'pay'` | invalid/unknown value → fallback `'pay'` |
| `defaultCurrencyKind` | `'stable' \| 'native'` | `'stable'` | invalid → fallback `'stable'` |

Rules:
- Read at HomeScreen mount to pick the initial mode and hero currency.
- Missing key, corrupt JSON, or storage unavailable → coded defaults, never
  throws (edge case: cleared storage).
- Writes go through the util's setters; a `subscribe` pub/sub notifies open
  consumers (settings panel ↔ home) — same pattern as
  `quickAccessPreference.js`.

## CurrencySelection (per-transaction, derived)

The hero currency is a *kind* resolved against the active network via
`useChainTokens()`; nothing symbol-hardcoded (honest state on networks whose
stablecoin is not USDC).

| Field | Type | Source |
| --- | --- | --- |
| `kind` | `'stable' \| 'native'` | preference default, changeable per-transaction |
| `symbol` | string | `stable` symbol or native symbol from network config |
| `address` | address \| null | `stableAddress` for `stable`; null for native |
| `decimals` | number | `stableDecimals` (6 for USDC) or 18 native |

## PayDraft (local state of PayPanel)

| Field | Type | Validation |
| --- | --- | --- |
| `amount` | string (decimal, ≤2 dp via `applyAmountKey`) | > 0 required; ≤ spendable balance (FR-005) |
| `recipientInput` | string | as typed/pasted/scanned |
| `recipientResolved` | address \| null | from `AddressInput` resolution (book / callsign / ENS); required valid |
| `screeningStatus` | `'clear' \| 'uncertain' \| 'restricted' \| 'pending'` | `restricted` blocks Pay (FR-005) |
| `note` | string | optional; client-side only (transfers carry no on-chain memo) |
| `currency` | `CurrencySelection` | see above |

Lifecycle: `editing → submitting → success | error`, driven by
`useTransfer.send`; `submitting` and result states reuse the engine's honest
lifecycle (sponsored vs user-pays fee disclosure, vault → "proposed" outcome).
Draft survives mode switches (panel stays mounted); resets on successful send.

## PaymentRequest (Request mode output)

Built by `lib/payments/paymentRequest.js#buildPaymentRequestUri`; ephemeral —
displayed, copyable, shareable; never persisted.

| Field | Type | Notes |
| --- | --- | --- |
| `to` | address | requester's receiving address (`useWallet().address` — correct for passkey account and EOA) |
| `chainId` | number | active network; always encoded (FR-016) |
| `kind` | `'stable' \| 'native'` | selects URI shape |
| `tokenAddress` | address \| null | stablecoin address for `stable` |
| `amountUnits` | bigint (base units) | `parseUnits(amount, decimals)`; no floats |
| `note` | string | `message` query param (URL-encoded) + shown as plain text |

Serialized form (EIP-681):
- stable: `ethereum:<tokenAddress>@<chainId>/transfer?address=<to>&uint256=<amountUnits>&message=<note>`
- native: `ethereum:<to>@<chainId>?value=<amountUnits>&message=<note>`

Validation: amount > 0 and connected receiving address required before a code
can be generated (US2 scenario 4).

## ParsedPaymentRequest (Pay-side scan result)

Output of `parsePaymentRequest(decodedText)`; `null` when unrecognizable.

| Field | Type | Prefill rule |
| --- | --- | --- |
| `to` | address | always prefilled when present |
| `chainId` | number \| null | mismatch with active network → surface switch prompt before send (FR-016); null → treat as active network |
| `tokenAddress` | address \| null | must equal active network's stablecoin (else error, **no partial prefill**) or be null (native) |
| `amountUnits` | bigint \| null | prefills amount (formatted with token decimals) |
| `note` | string \| null | prefills memo |

Accepted inputs: full EIP-681 URIs, bare `ethereum:<address>` URIs, raw
`0x…` addresses (address-only prefill, FR-009). Anything else → scanner
"cannot use this code" message (edge case).

## RequestDraft (local state of RequestPanel)

| Field | Type | Validation |
| --- | --- | --- |
| `amount` | string (≤2 dp) | > 0 required to generate |
| `note` | string | optional |
| `currency` | `CurrencySelection` | defaults from preference |
| `generated` | `PaymentRequest \| null` | regenerated on demand; cleared when inputs change |

## Relationships

```
HomePreferences ──defaults──▶ HomeMode (initial)  &  CurrencySelection.kind
HomeScreen ──hosts (all mounted)──▶ PayPanel · RequestPanel · CreateChallengePanel(existing)
RequestPanel ──build──▶ PaymentRequest ──QR/copy/share──▶ payer
QRScanner(decoded) ──parse──▶ ParsedPaymentRequest ──prefill──▶ PayDraft
PayDraft ──send──▶ useTransfer (existing engine, unchanged)
```
