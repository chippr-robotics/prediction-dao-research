/**
 * @fairwins/finops-catalogue — the single declaration of every revenue and cost source (spec 089).
 *
 * See src/sources.js for the list itself and the rule that governs adding to it.
 */
export { SOURCES, POOLS, FEE_SERVICE_LABELS } from './sources.js'
export {
  UNITS,
  KINDS,
  STATUSES,
  BASES,
  CHAIN_IDS,
  METRIC_FAMILIES,
  validateSource,
  validateCatalogue,
} from './schema.js'

import { SOURCES } from './sources.js'

/** One source by id, or undefined. */
export function sourceById(id) {
  return SOURCES.find((s) => s.id === id)
}

/**
 * Sources that should currently produce a value.
 *
 * `planned` and `retired` are excluded on purpose (FR-014, data-model invariant 4): a planned source
 * has nothing to read, and a retired one keeps its history queryable without polluting today's total.
 */
export function liveSources(kind = null) {
  return SOURCES.filter((s) => s.status === 'live' && (kind == null || s.kind === kind))
}

/** Sources a given collector is responsible for. */
export function sourcesForCollector(collector) {
  return SOURCES.filter((s) => s.collector === collector && s.status === 'live')
}

/**
 * Restrict to the build's cohort (FR-008, constitution III).
 *
 * A source with no `chains` is off-chain and belongs to every cohort. A source WITH chains is kept
 * only if it has at least one chain in the cohort, and its chain list is narrowed to the cohort —
 * so a mainnet build can never scan a testnet chain's events into the same revenue series.
 */
export function withinCohort(sources, cohortChainIds) {
  const cohort = new Set(cohortChainIds)
  return sources.flatMap((s) => {
    if (!s.chains) return [s]
    const chains = s.chains.filter((c) => cohort.has(c))
    return chains.length ? [{ ...s, chains }] : []
  })
}
