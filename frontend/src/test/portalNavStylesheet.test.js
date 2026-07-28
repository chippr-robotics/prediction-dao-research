/**
 * A parse-level guard for `PortalNav.css`.
 *
 * The portal shell is a two-column flex row: rail on the left, content beside it. That is one
 * declaration — `display: flex` on `.portal-shell` — and it was silently deleted by a COMMENT.
 * The file header abbreviated a group of custom properties as an asterisk glob followed by a
 * slash, which is the comment terminator; CSS then read the remainder of the sentence as the
 * start of a selector and swallowed everything up to the next closing brace. The rule it ate was
 * `.portal-shell`, taking `display: flex` and both rail-width custom properties with it.
 *
 * The failure is invisible to every other kind of test. Nothing throws, the build succeeds, the
 * stylesheet loads, jsdom computes no layout, and axe has no complaint — the sidebar simply falls
 * out of the row and the whole console renders below its own navigation. So this test does what a
 * browser does: strips comments the way the CSS tokenizer does, then checks the rules that must
 * survive are still there.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CSS_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../components/ui/PortalNav.css',
)

/** Strip comments exactly as CSS does: from the first opener to the NEXT terminator, non-greedy. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * The declaration block of `selector` — but only when `selector` actually BEGINS a rule.
 *
 * Finding the text `.portal-shell {` is not enough, and assuming it was is how a first draft of
 * this file passed against the very bug it exists to catch. When a comment ends early the leaked
 * prose runs straight into the next selector, so CSS sees one long invalid selector — the text
 * is all still present, and only the rule boundary tells you it is dead. So this requires the
 * preceding non-whitespace character to be `}` or nothing: a real start of rule.
 */
function ruleBody(css, selector) {
  const at = css.indexOf(selector + ' {')
  if (at === -1) return null
  const before = css.slice(0, at).trimEnd()
  if (before !== '' && !before.endsWith('}')) return null
  const open = css.indexOf('{', at)
  const close = css.indexOf('}', open)
  return close === -1 ? null : css.slice(open + 1, close)
}

describe('PortalNav.css survives comment stripping', () => {
  const parsed = stripComments(readFileSync(CSS_PATH, 'utf8'))

  it('keeps .portal-shell a flex row — the rail and the content are side by side', () => {
    const body = ruleBody(parsed, '.portal-shell')
    expect(body, '.portal-shell was swallowed by an early comment terminator').not.toBeNull()
    expect(body).toMatch(/display:\s*flex/)
  })

  it('keeps both rail widths defined, so the collapsed rail has a width to collapse to', () => {
    const body = ruleBody(parsed, '.portal-shell')
    expect(body).toMatch(/--portal-rail-expanded:\s*\d+px/)
    expect(body).toMatch(/--portal-rail-collapsed:\s*\d+px/)
  })

  it('leaves no stray comment terminator, which is how the rule was lost', () => {
    // After a correct strip there is no `*/` left anywhere. One that survives means an opener
    // closed early and the text between them is being parsed as CSS.
    expect(parsed).not.toContain('*/')
  })

  it('still declares every rule the shell depends on', () => {
    for (const selector of ['.portal-sidebar', '.portal-main', '.portal-nav']) {
      expect(ruleBody(parsed, selector), `${selector} is missing`).not.toBeNull()
    }
  })
})
