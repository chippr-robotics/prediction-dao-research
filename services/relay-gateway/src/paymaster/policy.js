/**
 * Per-operation sponsorship limits (spec 050, FR-010 defense-in-depth). The killswitch, sanctions
 * screen, and per-account/global quotas are the SAME modules the intent path uses (composed in the
 * route); this module adds the two per-op ceilings that bound a single sponsored op's cost so one
 * deliberately-expensive UserOp can't burn a large slice of the deposit.
 */
import { estCostWei, totalGas } from './build.js'

/**
 * @param {object} userOp
 * @param {{maxCostWei: bigint, maxGas: bigint}} limits
 * @returns {{ok: true} | {ok: false, code: 'cost_ceiling_exceeded'|'gas_ceiling_exceeded', detail: string}}
 */
export function checkOpLimits(userOp, { maxCostWei, maxGas }) {
  const gas = totalGas(userOp)
  if (maxGas != null && gas > maxGas) {
    return { ok: false, code: 'gas_ceiling_exceeded', detail: `totalGas ${gas} > ${maxGas}` }
  }
  const cost = estCostWei(userOp)
  if (maxCostWei != null && cost > maxCostWei) {
    return { ok: false, code: 'cost_ceiling_exceeded', detail: `estCostWei ${cost} > ${maxCostWei}` }
  }
  return { ok: true }
}
