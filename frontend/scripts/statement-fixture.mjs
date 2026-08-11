/**
 * Synthetic activity used to preview the statement document (issue #1026).
 *
 * Deliberately awkward: it carries the cases the design has to survive rather
 * than a tidy happy path — an entry with no usable date, an entry with no USD
 * basis, a platform fee nobody reported, a cross-chain bridge, a failed
 * operation, two assets, and enough classes to push the breakdown chart into
 * its "Other" fold. A preview built from clean data proves nothing.
 *
 * Preview-only: not imported by the app or its tests.
 */

const DAY = 24 * 60 * 60 * 1000

const ACCOUNT = '0x7A16fF8270133F063aAb6C9977183D9e72835428'
const PEER = '0xB4b2E2E4b7d8C1a4F0c6d9E3a5F7C8b1D2E3F4A5'
const PEER2 = '0x1F2e3D4c5B6a79880706F5e4D3c2B1a09f8E7D6C'

function entry(base) {
  return {
    entryId: base.entryId,
    class: base.class,
    classLabel: base.classLabel,
    kind: base.kind,
    direction: base.legacyDirection || base.kind,
    valueDirection: base.valueDirection,
    status: base.status || 'settled',
    failureReason: base.failureReason ?? null,
    timestamp: base.timestamp,
    tokenTicker: base.token || 'USDC',
    tokenDecimals: 6,
    tokenAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    amount: String(base.amount),
    amountNumber: base.amount,
    usdValue: base.usd ?? base.amount,
    costBasis: base.usd ?? base.amount,
    valuationStatus: base.valuationStatus || 'valued',
    valuationSource: 'ledger',
    feeNative: base.feeNative ?? 0.0142,
    feeNativeSymbol: 'POL',
    feeUnavailableReason: null,
    platformFee: base.platformFee ?? { status: 'n/a', legs: [], usd: null, bps: null },
    txHash: base.txHash,
    fromAddress: base.from ?? PEER,
    toAddress: base.to ?? ACCOUNT,
    selfTransfer: Boolean(base.selfTransfer),
    destinationChainId: base.destinationChainId ?? null,
    destinationNetworkName: base.destinationNetworkName ?? null,
    destinationTxHash: base.destinationTxHash ?? null,
    settlementProtocol: base.settlementProtocol ?? null,
    wagerId: base.wagerId ?? '',
  }
}

function hash(seed) {
  let out = '0x'
  let n = seed * 2654435761
  for (let i = 0; i < 64; i++) {
    n = (n * 1103515245 + 12345) & 0x7fffffff
    out += '0123456789abcdef'[(n >> 8) & 15]
  }
  return out
}

const chargedFee = (usd, bps) => ({
  status: 'charged',
  legs: [{ raw: String(Math.round(usd * 1e6)), amount: usd, symbol: 'USDC', usd }],
  usd,
  bps,
})

/**
 * A month of activity for a member who wagers, gets paid, earns yield, bridges
 * to another network, and has one transaction fail.
 */
export function monthOfActivity(periodStart = Date.UTC(2026, 6, 1)) {
  const d = (n, h = 12) => periodStart + n * DAY + h * 3600e3
  let seed = 1
  const rows = [
    { class: 'membership', classLabel: 'Membership', kind: 'membership_purchase', valueDirection: 'out', legacyDirection: 'deposit', amount: 25, timestamp: d(0, 9), to: '0x9C1E4f0aC1b0F6bD3E5A7c8D9e0F1a2B3c4D5E6F', platformFee: chargedFee(0, 0) },
    { class: 'wager', classLabel: 'Wager', kind: 'deposit', valueDirection: 'out', amount: 250, timestamp: d(1, 14), wagerId: '4821', to: '0x2fC1a3B4c5D6e7F8091a2B3c4D5e6F7a8B9c0D1E' },
    { class: 'transfer', classLabel: 'Transfer', kind: 'transfer_in', valueDirection: 'in', legacyDirection: 'payout', amount: 1200, timestamp: d(2, 10), from: PEER },
    { class: 'wager', classLabel: 'Wager', kind: 'deposit', valueDirection: 'out', amount: 500, timestamp: d(3, 16), wagerId: '4833', to: '0x2fC1a3B4c5D6e7F8091a2B3c4D5e6F7a8B9c0D1E' },
    { class: 'earn', classLabel: 'Earn', kind: 'vault_deposit', valueDirection: 'out', amount: 2000, timestamp: d(4, 11), to: '0x5aB9c8D7e6F5a4B3c2D1e0F9a8B7c6D5e4F3a2B1', platformFee: chargedFee(4.0, 20) },
    { class: 'wager', classLabel: 'Wager', kind: 'payout', valueDirection: 'in', amount: 940, timestamp: d(6, 18), wagerId: '4821', from: '0x2fC1a3B4c5D6e7F8091a2B3c4D5e6F7a8B9c0D1E' },
    { class: 'pool', classLabel: 'Wager Pool', kind: 'deposit', valueDirection: 'out', amount: 120, timestamp: d(7, 13), to: '0x8D7c6B5a4F3e2D1c0B9a8F7e6D5c4B3a2F1e0D9C' },
    { class: 'transfer', classLabel: 'Transfer', kind: 'transfer_out', valueDirection: 'out', legacyDirection: 'deposit', amount: 85.5, timestamp: d(8, 9), to: PEER2 },
    {
      class: 'bridge', classLabel: 'Bridge', kind: 'bridge_transfer', valueDirection: 'none', amount: 750,
      timestamp: d(9, 15), selfTransfer: true, from: ACCOUNT, to: ACCOUNT,
      destinationChainId: 8453, destinationNetworkName: 'Base', destinationTxHash: hash(91),
      settlementProtocol: 'Across V3', platformFee: chargedFee(0.75, 10),
    },
    { class: 'staking', classLabel: 'Staking', kind: 'stake', valueDirection: 'out', amount: 0.85, token: 'WETH', usd: 2635.5, timestamp: d(10, 12), to: '0xAe7c9B1d2E3f4A5b6C7d8E9f0A1b2C3d4E5f6A7B' },
    { class: 'wager', classLabel: 'Wager', kind: 'refund', valueDirection: 'in', amount: 500, timestamp: d(12, 17), wagerId: '4833', from: '0x2fC1a3B4c5D6e7F8091a2B3c4D5e6F7a8B9c0D1E' },
    { class: 'earn', classLabel: 'Earn', kind: 'yield_claim', valueDirection: 'in', legacyDirection: 'payout', amount: 41.28, timestamp: d(14, 8), from: '0x5aB9c8D7e6F5a4B3c2D1e0F9a8B7c6D5e4F3a2B1' },
    { class: 'transfer', classLabel: 'Transfer', kind: 'transfer_in', valueDirection: 'in', legacyDirection: 'payout', amount: 300, timestamp: d(15, 19), from: PEER2 },
    {
      class: 'liquidity', classLabel: 'Liquidity', kind: 'lp_deposit', valueDirection: 'out', amount: 1500,
      timestamp: d(17, 10), to: '0xC1d2E3f4A5b6C7d8E9f0A1b2C3d4E5f6A7b8C9d0',
      // A chargeable action that never reported what it took: "unknown", not zero.
      platformFee: { status: 'unknown', legs: [{ raw: null, amount: null, symbol: 'USDC', usd: null }], usd: null, bps: 25 },
    },
    { class: 'wager', classLabel: 'Wager', kind: 'deposit', valueDirection: 'out', amount: 175, timestamp: d(18, 20), wagerId: '4901', to: '0x2fC1a3B4c5D6e7F8091a2B3c4D5e6F7a8B9c0D1E' },
    { class: 'wager', classLabel: 'Wager', kind: 'payout', valueDirection: 'in', amount: 330, timestamp: d(21, 21), wagerId: '4901', from: '0x2fC1a3B4c5D6e7F8091a2B3c4D5e6F7a8B9c0D1E' },
    { class: 'pool', classLabel: 'Wager Pool', kind: 'payout', valueDirection: 'in', amount: 480, timestamp: d(22, 14), from: '0x8D7c6B5a4F3e2D1c0B9a8F7e6D5c4B3a2F1e0D9C' },
    { class: 'transfer', classLabel: 'Transfer', kind: 'transfer_out', valueDirection: 'out', legacyDirection: 'deposit', amount: 62, timestamp: d(24, 11), to: PEER },
    // No USD basis available — flagged, never counted as zero.
    { class: 'miniapp', classLabel: 'Mini-App', kind: 'app_transaction', valueDirection: 'none', amount: 0, usd: 0, timestamp: d(25, 16), valuationStatus: 'unvalued', to: '0xF0e1D2c3B4a5968778695A4b3C2d1E0f9A8b7C6D' },
    { class: 'earn', classLabel: 'Earn', kind: 'vault_withdraw', valueDirection: 'in', legacyDirection: 'payout', amount: 2050, timestamp: d(27, 9), from: '0x5aB9c8D7e6F5a4B3c2D1e0F9a8B7c6D5e4F3a2B1' },
    { class: 'staking', classLabel: 'Staking', kind: 'unstake_request', valueDirection: 'none', amount: 0.4, token: 'WETH', usd: 1240, timestamp: d(28, 13), from: '0xAe7c9B1d2E3f4A5b6C7d8E9f0A1b2C3d4E5f6A7B' },
    // A real entry whose timestamp could not be established — disclosed, not invented.
    { class: 'transfer', classLabel: 'Transfer', kind: 'transfer_in', valueDirection: 'in', legacyDirection: 'payout', amount: 18.4, timestamp: null, from: PEER2 },
    {
      class: 'wager', classLabel: 'Wager', kind: 'deposit', valueDirection: 'out', amount: 400, timestamp: d(29, 15),
      status: 'failed', failureReason: 'Reverted: wager already accepted by another participant',
      wagerId: '4915', to: '0x2fC1a3B4c5D6e7F8091a2B3c4D5e6F7a8B9c0D1E', feeNative: 0.0031,
    },
  ]
  return rows.map((r) => entry({ ...r, entryId: `oc:${String(seed).padStart(4, '0')}`, txHash: hash(seed++) }))
}

/** A year of the same shapes, so the flow chart's monthly buckets get exercised. */
export function yearOfActivity() {
  const out = []
  for (let m = 0; m < 12; m += 1) {
    const month = monthOfActivity(Date.UTC(2026, m, 1)).slice(0, 6 + (m % 5))
    out.push(...month.map((e, i) => ({ ...e, entryId: `oc:y${m}${i}`, txHash: hash(m * 100 + i + 7) })))
  }
  return out
}

export const FIXTURE_ACCOUNT = ACCOUNT
