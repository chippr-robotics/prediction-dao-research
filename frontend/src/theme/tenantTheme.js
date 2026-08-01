/**
 * Tenant theme injection (spec 072, research D3).
 *
 * The theming seam is the existing platform-* CSS class contract: brand tokens
 * live under .platform-<id> (base), .theme-light.platform-<id> and
 * .theme-dark.platform-<id> (mode-specific) — see src/theme.css. The DEFAULT
 * tenant's tokens stay static in theme.css (zero visual diff, spec US3);
 * non-default tenants get an equivalent rule set generated from their manifest
 * and injected once at bootstrap.
 */

import { getActiveTenant, isDefaultTenant } from '../config/tenant'

const STYLE_ELEMENT_ID = 'tenant-theme'

function cssBlock(selector, vars) {
  const body = Object.entries(vars)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n')
  return `${selector} {\n${body}\n}`
}

/**
 * Build the CSS text for a tenant manifest's theme. Exported for tests.
 */
export function buildTenantCss(manifest) {
  const { id } = manifest
  const { base, light, dark } = manifest.brand.theme
  return [
    cssBlock(`.platform-${id}`, base),
    cssBlock(`.theme-light.platform-${id}`, light),
    cssBlock(`.theme-dark.platform-${id}`, dark),
  ].join('\n\n')
}

/**
 * Inject the active tenant's theme tokens. No-op for the default tenant
 * (its tokens are the static theme.css rules). Idempotent.
 */
export function applyTenantTheme(doc = document) {
  if (isDefaultTenant()) return
  if (doc.getElementById(STYLE_ELEMENT_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ELEMENT_ID
  style.textContent = buildTenantCss(getActiveTenant())
  doc.head.appendChild(style)
}
