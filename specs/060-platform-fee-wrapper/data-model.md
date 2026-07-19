# Data Model: Configurable Platform Fee Wrapper (spec 060)

## On-chain — `FeeRouter` (per network, UUPS)

### Storage (append-only, trailing `__gap`)

| Field | Type | Notes |
|---|---|---|
| `treasury` | `address` | Per-network fee destination. Set in `initialize`, changeable via `setTreasury` (DEFAULT_ADMIN). Zero ⇒ charge path skips the fee (emits `FeeSkippedNoTreasury`). |
| `_services` | `mapping(bytes32 => Service)` | Registry of fee services. |
| `_serviceIds` | `bytes32[]` | Enumeration for the admin UI (`serviceCount()` / `serviceAt(i)`). |
| `__gap` | `uint256[47]` | Reserved. |

### `Service` struct

| Field | Type | Notes |
|---|---|---|
| `capBps` | `uint16` | Fixed-after-registration hard cap. Wrapped: ≤ `MAX_WRAPPED_FEE_BPS` (250). ConfigOnly: set at registration (Polymarket 100/50). `0` cap ⇒ unregistered sentinel. |
| `feeBps` | `uint16` | Live rate, `0..capBps`. Default 0. |
| `kind` | `uint8` enum `{Unregistered, Wrapped, ConfigOnly}` | `Wrapped` is chargeable via the deposit entrypoint; `ConfigOnly` is read-only config. |

### Constants / roles

- `MAX_WRAPPED_FEE_BPS = 250` (FR-004)
- `BPS_DENOMINATOR = 10_000`
- `FEE_ADMIN_ROLE = keccak256("FEE_ADMIN_ROLE")` — rate changes
- `DEFAULT_ADMIN_ROLE` — register services, set treasury, grant roles
- `UPGRADER_ROLE` — from `UUPSManaged`

### Launch service ids

| id | derivation | kind | cap |
|---|---|---|---|
| Earn lending | `keccak256("earn.lend")` | Wrapped | 250 |
| Polymarket taker | `keccak256("polymarket.taker")` | ConfigOnly | 100 |
| Polymarket maker | `keccak256("polymarket.maker")` | ConfigOnly | 50 |

(Future: `stake.lido`, `stake.polygon`, `swap.uniswap` — registration only, no code.)

### Events (= audit history, FR-012/020, SC-006)

- `ServiceRegistered(bytes32 indexed serviceId, uint16 capBps, uint8 kind)`
- `FeeBpsChanged(bytes32 indexed serviceId, uint16 oldBps, uint16 newBps, address indexed actor)`
- `TreasuryChanged(address oldTreasury, address newTreasury, address indexed actor)`
- `FeeCharged(bytes32 indexed serviceId, address indexed payer, address indexed asset, uint256 grossAmount, uint256 feeAmount, address vault, address receiver)`
- `FeeSkippedNoTreasury(bytes32 indexed serviceId, address indexed payer, uint256 grossAmount)`

### Errors

`ServiceUnknown()`, `ServiceNotWrapped()`, `CapExceeded()`, `CapAboveMax()`, `CapZero()`,
`AlreadyRegistered()`, `FeeAboveQuoted()` (maxFeeBps consent, FR-005), `ZeroAmount()`,
`ZeroAddress()`.

### State transitions

```
Unregistered --registerService(id, cap, kind) [DEFAULT_ADMIN]--> Registered(feeBps=0)
Registered   --setFeeBps(id, bps<=cap) [FEE_ADMIN]-->            Registered(feeBps=bps)   (emits FeeBpsChanged)
(no deregistration in v1; emergency = setFeeBps(id, 0))
```

## Gateway (in-memory only — no new persistence)

- **FeeRouterReader** (`src/fees/onchain.js`): `{ address, chainId, cacheTtlMs }` +
  cached `{ takerBps, makerBps, fetchedAt }`. Read failure ⇒ served-if-fresh-ish else
  null ⇒ env fallback.
- **/fee-rate response (extended)**: `{ tokenId, feeRateBps, builderCode,
  builderTakerFeeBps, builderMakerFeeBps, source: "chain"|"env-fallback" }` — chain
  values clamped to spec-057 caps.
- **/status.fees (new block)**: `{ feeRouter, polymarket: { takerBps, makerBps, source },
  opensea: { referralConfigured, beneficiary } }`.

## Frontend

- **FeeQuote** (`lib/fees/feeQuote.js`): `{ available, bps, capBps, routerAddress }` +
  `splitFee(gross, bps)` (floor) + `bpsToPercent`. The quoted `bps` is passed as
  `maxFeeBps` (consent ceiling, FR-005).
- **Fees tab row**: `{ serviceId, label, surface, feeBps, capBps, kind }` + history
  entries `{ actor, at, oldBps, newBps }` from `FeeBpsChanged`.
- **RoleContext**: adds `FEE_ADMIN` (resolved on the FeeRouter) for tab gating;
  enforcement stays on-chain.

## Validation rules (cross-layer)

1. `bps <= capBps` — enforced in `setFeeBps` (revert) and re-checked at charge time.
2. `capBps <= 250` for Wrapped — enforced at registration.
3. `bps <= maxFeeBps` (member consent) — enforced at charge time only.
4. `fee = gross * bps / 10_000` floor; `fee == 0` ⇒ no transfer (FR-006).
5. `treasury == 0` ⇒ fee skipped, event emitted (never revert, never lose funds).
6. Gateway clamps chain-read bps to spec-057 caps before serving.
7. UI blocks the action when no live rate is obtainable (FR-015).
