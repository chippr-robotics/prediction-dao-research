/**
 * Tenant branding plugin tests (spec 072, T008).
 *
 * The transforms are pure functions; the plugin itself is a strict no-op for
 * the default tenant (US3 — static index.html/webmanifest stay the source).
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  transformIndexHtml,
  buildWebManifest,
  tenantBrandingPlugin,
} from '../../vite-plugins/tenant-branding'

const INDEX_HTML = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'index.html'),
  'utf8'
)

const ACME = {
  id: 'acme',
  identity: {
    displayName: 'Acme Markets',
    tagline: 'Wager with your crew',
    metaDescription: 'Acme Markets - wagers "for" <friends> & co.',
    appUrl: 'https://acme.example',
  },
  brand: {
    htmlTitle: 'Acme Markets - Social Wagers',
    logo: '/assets/acme_logo.svg',
    logoMark: '/assets/acme_mark.svg',
    favicon: '/assets/acme_logo.svg',
    appleTouchIcon: '/assets/acme_mark.svg',
    pwa: {
      name: 'Acme Markets',
      shortName: 'Acme',
      appleTitle: 'Acme',
      themeColor: '#AA00FF',
      backgroundColor: '#101010',
    },
  },
}

describe('tenant branding plugin (spec 072)', () => {
  it('rewrites every branded surface of index.html from the manifest', () => {
    const html = transformIndexHtml(INDEX_HTML, ACME)
    expect(html).toContain('<title>Acme Markets - Social Wagers</title>')
    expect(html).toContain('<meta name="theme-color" content="#AA00FF"')
    expect(html).toContain('content="Acme"')
    expect(html).toContain('href="/assets/acme_logo.svg"')
    expect(html).toContain('href="/assets/acme_mark.svg"')
    // Meta description is escaped
    expect(html).toContain('Acme Markets - wagers &quot;for&quot; &lt;friends> &amp; co.')
    // Pre-hydration defaults point at the built tenant, not another tenant
    expect(html).toContain("savedPlatform || 'acme'")
    expect(html).toContain("'platform-acme'")
    expect(html).not.toContain('FairWins')
    expect(html).not.toContain('fairwins')
  })

  it('builds a webmanifest mirroring the static file shape', () => {
    const wm = buildWebManifest(ACME)
    expect(wm.name).toBe('Acme Markets')
    expect(wm.short_name).toBe('Acme')
    expect(wm.theme_color).toBe('#AA00FF')
    expect(wm.background_color).toBe('#101010')
    expect(wm.start_url).toBe('/?source=pwa')
    expect(wm.icons).toHaveLength(2)
    expect(wm.icons[0].src).toBe('/assets/acme_mark.svg')
    expect(wm.icons[1].purpose).toBe('maskable')
  })

  it('does not touch HTML or the webmanifest for the default tenant (US3)', () => {
    // The test env has no VITE_TENANT_ID → default tenant.
    const plugin = tenantBrandingPlugin()
    expect(plugin.name).toBe('tenant-branding')
    expect(plugin.transformIndexHtml).toBeUndefined()
    expect(plugin.closeBundle).toBeUndefined()
  })

  it('injects only the active tenant manifest via virtual:tenant', () => {
    const plugin = tenantBrandingPlugin()
    const resolved = plugin.resolveId('virtual:tenant')
    const source = plugin.load.call({ addWatchFile: () => {} }, resolved)
    expect(source).toContain('"id":"fairwins"')
    expect(source).not.toContain('"id":"example"')
    expect(source).toContain('featureCatalog')
  })

  it('refuses a production build of a non-live tenant (lifecycle gate)', () => {
    const plugin = tenantBrandingPlugin()
    // Default tenant is live: production build allowed.
    expect(() =>
      plugin.config({}, { command: 'build', mode: 'production' })
    ).not.toThrow()
  })
})
