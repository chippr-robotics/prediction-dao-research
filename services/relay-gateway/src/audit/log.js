/**
 * Append-only audit events (FR-021, SC-009/SC-017) as structured JSON on stdout.
 *
 * In production stdout is captured by Cloud Logging and routed via a Log Router sink to a
 * WORM-locked destination retained >=5 years (research.md §3). On-chain remains the permanent
 * record of record; these events are the request-side intent -> signer -> txHash binding.
 *
 * MUST NEVER contain: the hot key (the gateway never has it), raw signatures, or any secret.
 * The signer address and uniquenessMarker are on-chain-public values.
 */

const FORBIDDEN_KEYS = new Set(['signature', 'sig', 'intentSig', 'privateKey', 'key', 'secret', 'authorization'])

/**
 * @param {{sink?: (line: string) => void, now?: () => Date}} [opts]
 * @returns {(fields: object) => void}
 */
export function createAuditLogger({ sink = (line) => process.stdout.write(line + '\n'), now = () => new Date() } = {}) {
  return function audit(fields) {
    const clean = {}
    for (const [k, v] of Object.entries(fields)) {
      if (FORBIDDEN_KEYS.has(k)) continue // hard guard: key material / signatures never hit the log
      clean[k] = typeof v === 'bigint' ? v.toString() : v
    }
    const event = {
      timestamp: now().toISOString(),
      severity: 'INFO',
      // Cloud-Logging-friendly: structured payload with a stable event name for the Log Router sink.
      event: 'relay_audit',
      ...clean,
    }
    sink(JSON.stringify(event))
  }
}
