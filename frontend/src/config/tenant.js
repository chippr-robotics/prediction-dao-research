/**
 * Active tenant resolution (spec 072).
 *
 * The tenant manifest (tenants/<id>/manifest.json at the repo root) is the
 * single source of truth for a tenant's identity, settings, and contract set.
 * Selection is BUILD-TIME: VITE_TENANT_ID picks the manifest (default
 * "fairwins", the tenant that reproduces today's FairWins product). One served
 * origin is one tenant — there is deliberately no runtime tenant switching
 * (spec 072 FR-007), so a built instance physically contains only its own
 * tenant's identity.
 *
 * An unknown tenant id fails at module init (fail loudly, FR-008) — it must
 * never silently fall back to another tenant's identity.
 */

// Eagerly bundle every manifest + the feature catalog at build time. The glob
// is relative to this file (frontend/src/config/ -> repo root /tenants).
const manifestModules = import.meta.glob('../../../tenants/*/manifest.json', { eager: true })
const featureCatalogModules = import.meta.glob('../../../tenants/features.json', { eager: true })

export const DEFAULT_TENANT_ID = 'fairwins'

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze(value[key])
  }
  return value
}

function buildManifestIndex() {
  const index = {}
  for (const [modulePath, module] of Object.entries(manifestModules)) {
    const match = modulePath.match(/\/tenants\/([^/]+)\/manifest\.json$/)
    if (!match) continue
    const dirId = match[1]
    const manifest = module.default ?? module
    if (manifest.id !== dirId) {
      throw new Error(
        `[tenant] manifest id "${manifest.id}" does not match its directory "tenants/${dirId}/" — refusing to load`
      )
    }
    index[dirId] = deepFreeze(manifest)
  }
  return index
}

const MANIFESTS = buildManifestIndex()

const FEATURE_CATALOG = deepFreeze(
  Object.values(featureCatalogModules).map((m) => m.default ?? m)[0]?.features ?? []
)

/**
 * Resolve a tenant id to its manifest. Throws on unknown ids — absence must
 * never resolve to another tenant's identity.
 */
export function resolveTenant(tenantId) {
  const manifest = MANIFESTS[tenantId]
  if (!manifest) {
    const known = Object.keys(MANIFESTS).sort().join(', ')
    throw new Error(
      `[tenant] unknown tenant id "${tenantId}" (known: ${known}). ` +
        'Author tenants/<id>/manifest.json and run `npm run tenants:validate`.'
    )
  }
  return manifest
}

const ACTIVE_TENANT_ID = import.meta.env.VITE_TENANT_ID || DEFAULT_TENANT_ID
const ACTIVE_TENANT = resolveTenant(ACTIVE_TENANT_ID)

/** The full frozen manifest of the tenant this build serves. */
export function getActiveTenant() {
  return ACTIVE_TENANT
}

export function getActiveTenantId() {
  return ACTIVE_TENANT.id
}

export function isDefaultTenant() {
  return ACTIVE_TENANT.id === DEFAULT_TENANT_ID
}

/** Identity + brand for member-visible surfaces (names, logos, PWA, share frames). */
export function tenantBrand() {
  return {
    id: ACTIVE_TENANT.id,
    displayName: ACTIVE_TENANT.identity.displayName,
    tagline: ACTIVE_TENANT.identity.tagline ?? '',
    appUrl: ACTIVE_TENANT.identity.appUrl,
    logo: ACTIVE_TENANT.brand.logo,
    logoMark: ACTIVE_TENANT.brand.logoMark,
    favicon: ACTIVE_TENANT.brand.favicon,
    pwa: ACTIVE_TENANT.brand.pwa,
    htmlTitle: ACTIVE_TENANT.brand.htmlTitle ?? ACTIVE_TENANT.identity.displayName,
  }
}

/** Support/social/legal links for footers, entry gates, and docs surfaces. */
export function tenantLinks() {
  return {
    support: ACTIVE_TENANT.identity.support ?? {},
    social: ACTIVE_TENANT.identity.social ?? {},
    legal: ACTIVE_TENANT.identity.legal ?? {},
  }
}

/** Feature ids this tenant enables (validated subset of tenants/features.json). */
export function tenantFeatures() {
  return ACTIVE_TENANT.settings.features
}

/**
 * Whether a feature surface should exist in this tenant's instance. A disabled
 * feature is absent from nav/routes — never present-but-broken.
 */
export function isFeatureEnabled(featureId) {
  return ACTIVE_TENANT.settings.features.includes(featureId)
}

/** The known feature catalog (for admin/validation surfaces). */
export function knownFeatureIds() {
  return FEATURE_CATALOG
}

/**
 * Chain ids the tenant enables for a cohort ('mainnet' | 'testnet'). Callers
 * must still intersect with the build cohort rules (spec 071) — a tenant list
 * never crosses the testnet/mainnet boundary.
 */
export function tenantChainIds(cohort) {
  const chains = ACTIVE_TENANT.settings.chains
  if (cohort !== 'mainnet' && cohort !== 'testnet') {
    throw new Error(`[tenant] unknown cohort "${cohort}" — use 'mainnet' or 'testnet'`)
  }
  return chains[cohort]
}

/**
 * The platform CSS class for the active tenant, consumed by ThemeContext and
 * the pre-hydration script contract (theme-<mode> + platform-<id> on <html>).
 * The default tenant's tokens live statically in theme.css; non-default
 * tenants get theirs injected by src/theme/tenantTheme.js.
 */
export function tenantThemeClass() {
  return `platform-${ACTIVE_TENANT.id}`
}

/**
 * Contract-set mode: 'shared' fronts the platform estate (existing
 * config/contracts.js resolution unchanged); 'dedicated' resolves ONLY the
 * tenant's own generated set (frontend/src/config/tenants/<id>.contracts.js,
 * written by sync-frontend-contracts --tenant). Dedicated resolution lands
 * with spec 072 T016; shared mode is a pass-through by design.
 */
export function tenantContractMode() {
  return ACTIVE_TENANT.contractSet.mode
}
