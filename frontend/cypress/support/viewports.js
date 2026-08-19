// =============================================================================
// Viewport profiles (spec 094, FR-019/FR-020)
//
// Two named profiles, applied from a GLOBAL beforeEach rather than per spec. That is the whole
// point: a spec that sets its own viewport inherits 1280×720 forever, and the phone leg quietly
// stops growing as new specs land. Driven from the environment, a new spec is covered at both
// widths the day it is written, with no author action.
//
// Only the no-chain tier runs both legs. Responsive behaviour needs no chain, and doubling a
// ~30-minute chain tier to prove a button is reachable at 390px is exactly what admission rule 1
// of docs/developer-guide/e2e-testing-policy.md forbids.
// =============================================================================

export const VIEWPORTS = {
  // iPhone 12/13/14 logical viewport — the narrowest mainstream target.
  phone: { width: 390, height: 844 },
  // What every existing spec was written against, so the desktop leg is a no-op change and any
  // diff there is a real regression rather than a re-baselining.
  desktop: { width: 1280, height: 720 },
}

export const DEFAULT_PROFILE = 'desktop'

/**
 * The profile for this run. Unknown names fail loudly: silently falling back to desktop would
 * report a green "phone" leg that never ran at phone width.
 */
export function activeProfile() {
  const name = Cypress.env('VIEWPORT_PROFILE') || DEFAULT_PROFILE
  if (!VIEWPORTS[name]) {
    throw new Error(
      `Unknown CYPRESS_VIEWPORT_PROFILE "${name}". Known profiles: ${Object.keys(VIEWPORTS).join(', ')}`
    )
  }
  return name
}

export function isPhone() {
  return activeProfile() === 'phone'
}

/** Apply a profile for the rest of the current test. */
export function useViewport(name = activeProfile()) {
  const { width, height } = VIEWPORTS[name]
  cy.viewport(width, height)
}

/**
 * Assert a control is REACHABLE, not merely present.
 *
 * `should('be.visible')` passes for an element scrolled outside a clipping ancestor as long as it
 * has dimensions and no `display:none` — which is precisely the phone-layout failure this is for:
 * the button exists, the test can click it programmatically, and a member cannot reach it.
 */
Cypress.Commands.add('assertReachable', (selector, options = {}) => {
  const { scrollIntoView = true } = options
  cy.get(selector).should('exist').then(($el) => {
    if (scrollIntoView) cy.wrap($el).scrollIntoView({ duration: 0 })
    cy.wrap($el).should('be.visible').then(($visible) => {
      const rect = $visible[0].getBoundingClientRect()
      const vw = Cypress.config('viewportWidth')
      const vh = Cypress.config('viewportHeight')

      expect(rect.width, `${selector} has width`).to.be.greaterThan(0)
      expect(rect.height, `${selector} has height`).to.be.greaterThan(0)
      expect(
        rect.left >= 0 && rect.right <= vw,
        `${selector} is within the ${vw}px viewport horizontally (left ${Math.round(rect.left)}, right ${Math.round(rect.right)})`
      ).to.be.true
      expect(
        rect.top >= 0 && rect.bottom <= vh,
        `${selector} is within the ${vh}px viewport vertically after scrolling (top ${Math.round(rect.top)}, bottom ${Math.round(rect.bottom)})`
      ).to.be.true
    })
  })
})
