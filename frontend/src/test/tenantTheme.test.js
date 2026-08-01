/**
 * Tenant theme injection tests (spec 072, research D3).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { applyTenantTheme, buildTenantCss } from '../theme/tenantTheme'

const SAMPLE_MANIFEST = {
  id: 'acme',
  brand: {
    theme: {
      base: { '--brand-primary': '#FF0000', '--brand-secondary': '#00FF00' },
      light: { '--primary-button': '#FF0000', '--primary-button-hover': '#CC0000' },
      dark: { '--primary-button': '#FF3333', '--primary-button-hover': '#FF6666' },
    },
  },
}

describe('tenant theme (spec 072)', () => {
  afterEach(() => {
    document.getElementById('tenant-theme')?.remove()
  })

  it('builds platform-scoped CSS blocks from a manifest', () => {
    const css = buildTenantCss(SAMPLE_MANIFEST)
    expect(css).toContain('.platform-acme {')
    expect(css).toContain('--brand-primary: #FF0000;')
    expect(css).toContain('.theme-light.platform-acme {')
    expect(css).toContain('--primary-button-hover: #CC0000;')
    expect(css).toContain('.theme-dark.platform-acme {')
    expect(css).toContain('--primary-button: #FF3333;')
  })

  it('is a no-op for the default tenant — theme.css stays the source (US3)', () => {
    // The test build runs as the default tenant (no VITE_TENANT_ID).
    applyTenantTheme()
    expect(document.getElementById('tenant-theme')).toBeNull()
  })
})
