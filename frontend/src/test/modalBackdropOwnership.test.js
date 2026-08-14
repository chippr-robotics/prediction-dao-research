import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative, join } from 'node:path'

// Regression guard for the global modal tier.
//
// `.modal-backdrop` is the root element of the app-wide ModalSystem — the thing
// `showModal()` renders, used by the membership purchase flow, the wallet
// dropdown's upgrade/extend flows and every other modal routed through
// `hooks/useUI`. It is declared ONCE, in components/ui/ModalSystem.css, at the
// modal tier (z-index 2000) so it clears the sticky site header (1000), the
// fixed bottom icon nav (1200) and the nav drawer (1401).
//
// AdminPanel.css carried an unscoped copy of that selector at `z-index: 1000`.
// Nothing under AdminPanel ever rendered the class, so the rule was dead there
// — but it was NOT inert. Bare class selectors have identical specificity, so
// the winner is whichever the bundler emits last, and AdminPanel.css came
// later. The backdrop dropped to z-index 1000, which capped its stacking
// context: a descendant can never paint above its ancestor's context, so the
// purchase modal's own `.ppm-overlay { z-index: 2000 }` bought nothing. The
// flow rendered underneath the bottom nav and behind the header (same level
// 1000, but later in the DOM), leaving its title and its Cancel/Continue
// buttons unreachable on mobile.
//
// This is not a mistake a scoped-run test suite or a lint pass catches — the
// CSS is valid and the component tree is fine; only the emitted cascade order
// tells you. So assert the ownership directly at the source level: exactly one
// stylesheet may declare a bare `.modal-backdrop`, and it must be the one that
// owns the class. Scope admin-only overrides to an admin class instead.

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '..')

const OWNER = 'components/ui/ModalSystem.css'
const MODAL_TIER = 2000

/** Every .css file under src/, as paths relative to src/. */
function cssFiles(dir = SRC, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) cssFiles(full, out)
    else if (entry.endsWith('.css')) out.push(relative(SRC, full))
  }
  return out
}

/**
 * True when the file declares `.modal-backdrop` as a whole, unqualified
 * selector — the form that competes with the owner's rule on equal
 * specificity. Compound/descendant selectors (`.admin-panel .modal-backdrop`,
 * `.share-modal-backdrop`) are scoped and therefore fine.
 */
function declaresBareBackdrop(css) {
  // Strip comments so prose or a commented-out example never trips the guard.
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  // Every selector list that opens a rule. Excluding `@` skips at-rule heads
  // (`@media …{`) while still reaching the rules nested inside them, so a
  // bare declaration hidden in a media query is caught too.
  const heads = stripped.matchAll(/(?:^|[{};])\s*([^{}@;]+?)\s*\{/g)
  for (const [, selectorList] of heads) {
    if (selectorList.split(',').some((sel) => sel.trim() === '.modal-backdrop')) return true
  }
  return false
}

describe('.modal-backdrop ownership', () => {
  const files = cssFiles()

  it('finds the stylesheets to check', () => {
    expect(files).toContain(OWNER)
    expect(files.length).toBeGreaterThan(10)
  })

  it('is declared as a bare selector only by ModalSystem.css', () => {
    const declaring = files.filter((f) =>
      declaresBareBackdrop(readFileSync(resolve(SRC, f), 'utf8')),
    )
    // A second bare declaration wins or loses purely on bundle order, and when
    // it loses the modal system it silently sinks below the fixed navigation.
    expect(declaring).toEqual([OWNER])
  })

  it('keeps the owner at the modal tier, above the header, bottom nav and drawer', () => {
    const css = readFileSync(resolve(SRC, OWNER), 'utf8')
    const rule = css.slice(css.indexOf('.modal-backdrop'))
    const zIndex = Number(/z-index:\s*(\d+)/.exec(rule.slice(0, rule.indexOf('}')))?.[1])

    expect(zIndex).toBe(MODAL_TIER)
    // The surfaces a modal must cover: site header (1000), bottom icon nav
    // (1200), nav drawer (1401).
    expect(zIndex).toBeGreaterThan(1401)
  })
})
