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
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

// Virtual module consumed by src/config/tenant.js. Only the ACTIVE tenant's
// manifest is injected into the bundle — a built instance must physically
// contain no other tenant's identity (spec 072, research D2).
const VIRTUAL_ID = 'virtual:tenant'
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID

function manifestPathFor(tenantId) {
  return path.join(REPO_ROOT, 'tenants', tenantId, 'manifest.json')
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
  const catalogPath = path.join(REPO_ROOT, 'tenants', 'features.json')
  return JSON.parse(fs.readFileSync(catalogPath, 'utf8')).features
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
      return (
        `export const activeTenantManifest = ${JSON.stringify(manifest)};\n` +
        `export const featureCatalog = ${JSON.stringify(featureCatalog)};\n`
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
