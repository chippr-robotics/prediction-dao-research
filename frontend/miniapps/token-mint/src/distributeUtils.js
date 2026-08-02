import { ethers } from 'ethers'

// Spec 028 (US11) — batch-distribute helpers, separate from the component so the .jsx file exports only the
// component (react-refresh constraint).

/** Mirrors the v2 templates' on-chain batch bound. */
export const MAX_BATCH = 200

/** Parse "0xabc, 1000" / "0xabc 1000" lines into { rows: [{addr, amount}], errors: [string] }. */
export function parseDistribution(raw) {
  const rows = []
  const errors = []
  raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const parts = line.split(/[\s,]+/).filter(Boolean)
      const [addr, amount] = parts
      if (!ethers.isAddress(addr)) errors.push(`Line ${i + 1}: invalid address`)
      else if (!amount || !(Number(amount) > 0)) errors.push(`Line ${i + 1}: invalid amount`)
      else rows.push({ addr, amount })
    })
  return { rows, errors }
}
