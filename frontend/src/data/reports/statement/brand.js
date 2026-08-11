/**
 * The seam between the active tenant (spec 072) and the statement renderer.
 *
 * Everything downstream of here is pure and brand-agnostic: it takes an
 * identity object and a token set. This module is the only place that reads the
 * tenant manifest, which is what lets the document be previewed, unit-tested
 * and rendered for any tenant — including one that does not exist yet — without
 * touching the renderer.
 */

import { tenantBrand, tenantLinks, tenantThemeTokens } from '../../../config/tenant'
import { brandTokensFromTheme, statementTheme } from './theme'

/** Identity the statement prints: masthead name, tagline, footer attribution. */
export function statementBrand() {
  const brand = tenantBrand()
  const links = tenantLinks()
  return {
    id: brand.id,
    displayName: brand.displayName,
    tagline: brand.tagline,
    appUrl: brand.appUrl,
    copyrightNotice: brand.copyrightNotice,
    supportEmail: links.support?.email || null,
  }
}

/** The tenant's statement palette, derived from its manifest theme tokens. */
export function statementThemeForTenant() {
  return statementTheme(brandTokensFromTheme(tenantThemeTokens()))
}
