/**
 * Tenant branding Vite plugin (spec 072, T008).
 *
 * Makes the HTML shell and PWA manifest tenant-driven for NON-default tenants:
 * - index.html title/meta/theme-color/icons/pre-hydration default are rewritten
 *   from the active tenant's manifest at build/serve time
 * - manifest.webmanifest is generated from the manifest (overriding the static
 *   public/ copy)
 *
 * For the DEFAULT tenant this plugin is a strict no-op: the static
 * frontend/index.html and frontend/public/manifest.webmanifest remain the
 * source, guaranteeing byte-identical default-tenant output (spec US3/SC-003).
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const DEFAULT_TENANT_ID = 'fairwins'

/**
 * Locate the tenants/ manifest directory. Normally <repo root>/tenants (two
 * levels up from this plugin), but containerized builds copy frontend/ and
 * tenants/ as siblings of an arbitrary base, so walk upward until the
 * directory is found; TENANTS_DIR overrides for exotic layouts. Failing to
 * find it is a loud build failure — never a silent unbranded build.
 */
function findTenantsDir() {
  if (process.env.TENANTS_DIR) return path.resolve(process.env.TENANTS_DIR)
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'tenants')
    if (fs.existsSync(path.join(candidate, 'features.json'))) return candidate
    dir = path.dirname(dir)
  }
  throw new Error(
    '[tenant-branding] could not locate the tenants/ directory (looked upward from the plugin; set TENANTS_DIR to override)'
  )
}

const TENANTS_DIR = findTenantsDir()

// Virtual module consumed by src/config/tenant.js. Only the ACTIVE tenant's
// manifest is injected into the bundle — a built instance must physically
// contain no other tenant's identity (spec 072, research D2).
const VIRTUAL_ID = 'virtual:tenant'
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID

function manifestPathFor(tenantId) {
  return path.join(TENANTS_DIR, tenantId, 'manifest.json')
}

function loadManifest(tenantId) {
  const manifestPath = manifestPathFor(tenantId)
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `[tenant-branding] unknown tenant id "${tenantId}" — no manifest at tenants/${tenantId}/manifest.json. ` +
        'Author it and run `npm run tenants:validate`.'
    )
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (manifest.id !== tenantId) {
    throw new Error(
      `[tenant-branding] manifest id "${manifest.id}" does not match its directory "tenants/${tenantId}/"`
    )
  }
  return manifest
}

function loadFeatureCatalog() {
  const catalogPath = path.join(TENANTS_DIR, 'features.json')
  return JSON.parse(fs.readFileSync(catalogPath, 'utf8')).features
}

function tenantContractSetPath(tenantId) {
  // Lives inside the frontend source tree — resolve relative to this plugin,
  // not the repo root, so containerized layouts (frontend copied standalone)
  // keep working.
  const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  return path.join(frontendRoot, 'src', 'config', 'tenants', `${tenantId}.contracts.json`)
}

/**
 * Load the generated per-chain contract set for a DEDICATED tenant
 * (written by `sync-frontend-contracts --tenant <id>` from the tenant's
 * deployments/tenants/<id>/ records). A live dedicated tenant without a
 * generated set fails the build — a dedicated instance must never silently
 * resolve the shared estate's addresses (spec 072 FR-003/D6). Shared-mode
 * tenants get an empty set: their resolution stays the shared estate.
 */
function loadTenantContractSets(tenantId, manifest) {
  if (manifest.contractSet.mode !== 'dedicated') return {}
  const setPath = tenantContractSetPath(tenantId)
  if (!fs.existsSync(setPath)) {
    if (manifest.lifecycle === 'live') {
      throw new Error(
        `[tenant-branding] dedicated tenant "${tenantId}" has no generated contract set at ` +
          `frontend/src/config/tenants/${tenantId}.contracts.json. Run ` +
          `\`node scripts/utils/sync-frontend-contracts.js --tenant ${tenantId} --network <n> --chainId <id>\` ` +
          'after deploying — a dedicated build must never fall back to the shared estate.'
      )
    }
    return {}
  }
  return JSON.parse(fs.readFileSync(setPath, 'utf8'))
}

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/**
 * Rewrite the branded parts of index.html from a tenant manifest.
 * Pure; exported for tests.
 */
export function transformIndexHtml(html, manifest) {
  const { identity, brand } = manifest
  const title = brand.htmlTitle ?? identity.displayName
  let out = html

  out = out.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
  out = out.replace(
    /(<meta name="description" content=")[^"]*(")/,
    `$1${escapeAttr(identity.metaDescription ?? identity.tagline ?? '')}$2`
  )
  out = out.replace(
    /(<meta name="theme-color" content=")[^"]*(")/,
    `$1${brand.pwa.themeColor}$2`
  )
  out = out.replace(
    /(<meta name="apple-mobile-web-app-title" content=")[^"]*(")/,
    `$1${escapeAttr(brand.pwa.appleTitle ?? brand.pwa.shortName)}$2`
  )
  out = out.replace(
    /(<link rel="icon"[^>]*href=")[^"]*(")/,
    `$1${brand.favicon}$2`
  )
  out = out.replace(
    /(<link rel="apple-touch-icon" href=")[^"]*(")/,
    `$1${brand.appleTouchIcon ?? brand.logoMark}$2`
  )
  // Pre-hydration script defaults: platform falls back to the built tenant,
  // never to another tenant's class.
  out = out.replaceAll(`savedPlatform || '${DEFAULT_TENANT_ID}'`, `savedPlatform || '${manifest.id}'`)
  out = out.replaceAll(`'platform-${DEFAULT_TENANT_ID}'`, `'platform-${manifest.id}'`)
  out = out.replaceAll(`default to ${DEFAULT_TENANT_ID}`, `default to ${manifest.id}`)

  return out
}

/**
 * Build the PWA webmanifest object from a tenant manifest.
 * Pure; exported for tests. Mirrors the shape of public/manifest.webmanifest.
 */
export function buildWebManifest(manifest) {
  const { identity, brand } = manifest
  const icon = brand.logoMark
  return {
    name: brand.pwa.name,
    short_name: brand.pwa.shortName,
    description: identity.metaDescription ?? identity.tagline ?? '',
    id: '/',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui', 'browser'],
    orientation: 'portrait-primary',
    background_color: brand.pwa.backgroundColor,
    theme_color: brand.pwa.themeColor,
    categories: ['finance', 'social'],
    icons: [
      { src: icon, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: icon, sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  }
}

export function tenantBrandingPlugin() {
  const tenantId = process.env.VITE_TENANT_ID || DEFAULT_TENANT_ID
  // Unknown VITE_TENANT_ID fails here — build, dev server, and tests alike
  // (fail loudly, FR-008; never fall back to another tenant's identity).
  const manifest = loadManifest(tenantId)
  const featureCatalog = loadFeatureCatalog()
  const isDefault = tenantId === DEFAULT_TENANT_ID

  const virtualModuleHooks = {
    // Lifecycle gate (spec 072 data-model): only a live tenant may produce a
    // production build. Draft/retired tenants build only in non-production
    // modes (previews); suspended tenants fail here until the unavailability
    // shell ships — failing beats silently serving a suspended tenant.
    config(_config, { command, mode }) {
      if (command === 'build' && mode === 'production' && manifest.lifecycle !== 'live') {
        throw new Error(
          `[tenant-branding] tenant "${tenantId}" has lifecycle "${manifest.lifecycle}" — ` +
            'only a "live" tenant may produce a production build. Use a non-production mode ' +
            'for previews (vite build --mode staging), or update the manifest via PR.'
        )
      }
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return
      this.addWatchFile(manifestPathFor(tenantId))
      const contractSets = loadTenantContractSets(tenantId, manifest)
      return (
        `export const activeTenantManifest = ${JSON.stringify(manifest)};\n` +
        `export const featureCatalog = ${JSON.stringify(featureCatalog)};\n` +
        `export const tenantContractSets = ${JSON.stringify(contractSets)};\n`
      )
    },
  }

  // Default tenant: the virtual module only — the static index.html and
  // public/manifest.webmanifest stay the source of truth (US3 byte-equivalence).
  if (isDefault) {
    return { name: 'tenant-branding', ...virtualModuleHooks }
  }

  const webManifestJson = JSON.stringify(buildWebManifest(manifest), null, 2) + '\n'
  let outDir = 'dist'

  return {
    name: 'tenant-branding',
    ...virtualModuleHooks,
    configResolved(config) {
      outDir = config.build.outDir
    },
    transformIndexHtml(html) {
      return transformIndexHtml(html, manifest)
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/manifest.webmanifest') {
          res.setHeader('Content-Type', 'application/manifest+json')
          res.end(webManifestJson)
          return
        }
        next()
      })
    },
    // public/ is copied into outDir by Vite core, so overwrite the static
    // webmanifest after the bundle is fully written.
    closeBundle() {
      const target = path.resolve(outDir, 'manifest.webmanifest')
      if (fs.existsSync(path.dirname(target))) {
        fs.writeFileSync(target, webManifestJson)
      }
    },
  }
}
