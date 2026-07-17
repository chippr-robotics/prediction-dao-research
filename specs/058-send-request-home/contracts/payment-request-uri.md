# Contract: Payment-Request URI (spec 058)

Module: `frontend/src/lib/payments/paymentRequest.js` (new, pure functions —
no hooks, no I/O). Consumed by RequestPanel (build) and PayPanel's scanner
(parse). `lib/addressBook/scanAddress.js#extractAddressFromScan` is NOT
modified; existing callers keep it.

## Format

EIP-681 subset ("standard URI first" per clarification), with one additive
parameter:

| Shape | URI |
| --- | --- |
| ERC-20 (stablecoin) | `ethereum:<tokenAddress>@<chainId>/transfer?address=<to>&uint256=<amountUnits>[&message=<note>]` |
| Native coin | `ethereum:<to>@<chainId>?value=<amountUnits>[&message=<note>]` |

- `<amountUnits>`: base-unit integer decimal string (`parseUnits`), never
  scientific notation, never floats.
- `<chainId>`: always present on generated URIs (FR-016).
- `message`: URL-encoded UTF-8 note; non-standard but ignored by conformant
  wallets, read by FairWins. Max length 280 chars pre-encoding.

## `buildPaymentRequestUri(input) → string`

Input: `{ chainId: number, to: address, kind: 'stable'|'native',
tokenAddress?: address, decimals: number, amount: string, note?: string }`

Throws (dev-facing) on: missing/invalid `to`, `amount <= 0`, `kind==='stable'`
without `tokenAddress`. Trims and drops an empty note (no dangling param).

## `parsePaymentRequest(decodedText) → ParsedPaymentRequest | null`

Returns `{ to, chainId, tokenAddress, amountUnits, note }` (fields null when
absent) for:

1. Full EIP-681 token form (`/transfer` + `address` + optional `uint256`)
2. Full EIP-681 native form (optional `value`)
3. Bare `ethereum:<address>` (address only)
4. Raw `0x[40 hex]` string (address only)

Returns `null` for anything else (caller shows "code not usable"). Rules:

- Addresses validated with checksum-tolerant `isAddress`; invalid → `null`.
- `@<chainId>` parsed as decimal or `0x` hex per EIP-681.
- Unknown query params ignored; `message` URL-decoded.
- Malformed numeric params (`value`/`uint256`) → treat that field as absent,
  keep the address (degrade to address-only prefill, FR-009) — never a wrong
  amount.

## Consumer obligations (PayPanel scan handling)

- `chainId` ≠ active network → show mismatch + switch affordance before any
  send (FR-016); do not silently re-denominate.
- `tokenAddress` present but ≠ active network stablecoin → error message,
  **no partial prefill** (wrong-asset edge case).
- Native form → currency kind `native`; token form → `stable`.

## Round-trip guarantee

For every valid `buildPaymentRequestUri` output,
`parsePaymentRequest(built)` MUST return the same `to`, `chainId`,
`tokenAddress`, `amountUnits`, and `note` (unit-tested).
