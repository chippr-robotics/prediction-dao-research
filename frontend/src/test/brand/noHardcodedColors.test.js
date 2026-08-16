import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative, join, sep } from 'node:path'

// The colour-literal gate (spec 091).
//
// Spec 090 moved the brand hues onto tokens and proved the token layer could
// govern. It could not prove the layer STAYS the only place a colour is stated,
// because ~500 non-brand literals were still in the tree and any guard that
// allowed them allowed a new one too.
//
// This test closes that: `theme.css` is the only file in shipped styling that
// may contain a colour literal. Everything else asks for a token.
//
// It is the guard that makes the palette genuinely changeable from one place —
// the property `docs/developer-guide/brand-tokens.md` claims, and the one that
// silently decays otherwise, one "just this once" hex at a time.

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND = resolve(__dirname, '../../..')

/**
 * WHITE AND BLACK ARE NOT PALETTE COLOURS.
 *
 * `#fff` on a brand-filled button is not `--surface-color`, and `#000` at 6%
 * opacity is a shadow, not text. They are absolutes that mean the same thing in
 * every theme, and forcing them through tokens would make ~100 call sites less
 * honest, not more.
 */
const ABSOLUTES = new Set(['#FFF', '#FFFFFF', '#000', '#000000'])

/**
 * Files allowed to state colour literals, each with the reason.
 *
 * Adding a row here is a design decision, not a formality — it is a promise
 * that the colour identifies something outside our palette. If it is our
 * colour, it belongs in theme.css.
 */
const ALLOWED_FILES = {
  'src/theme.css': 'the single source of truth — it is where colour is stated',
  'src/components/ui/NetworkPill.css':
    'third-party CHAIN identity (Polygon purple, Ethereum indigo, Bitcoin orange). ' +
    'Rendering Polygon in teal would not be on-brand, it would be wrong.',
}

/**
 * Individual literals allowed anywhere, each with the reason. Same rule: this
 * is for colours that belong to somebody else.
 */
const ALLOWED_LITERALS = {
  '#F7931A': "Bitcoin's brand orange, on the Bitcoin network badge (spec 061)",
}

/** Minimal recursive walk — see the note in codemod-colors.mjs about `glob`. */
function walk(dir, match, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      walk(full, match, out)
    } else if (match(full)) {
      out.push(full)
    }
  }
  return out
}

/** Blank out comment bodies so prose — including issue refs like `#938` — is not scanned. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
}

function expand(hex) {
  const h = hex.slice(1)
  return h.length === 3
    ? `#${h.split('').map((c) => c + c).join('').toUpperCase()}`
    : hex.toUpperCase()
}

function scan() {
  const exemptPrefix = resolve(FRONTEND, 'src/test') + sep
  const files = walk(
    resolve(FRONTEND, 'src'),
    (f) => f.endsWith('.css') && !f.startsWith(exemptPrefix)
  ).sort()

  const findings = []
  for (const file of files) {
    const rel = relative(FRONTEND, file).split(sep).join('/')
    if (ALLOWED_FILES[rel]) continue
    stripComments(readFileSync(file, 'utf8'))
      .split('\n')
      .forEach((line, i) => {
        for (const match of line.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
          const literal = match[0]
          const key = expand(literal)
          if (ABSOLUTES.has(key) || ALLOWED_LITERALS[key]) continue
          findings.push({ rel, line: i + 1, literal, text: line.trim().slice(0, 80) })
        }
      })
  }
  return findings
}

function report(findings) {
  const lines = [
    `${findings.length} hardcoded colour literal(s) outside src/theme.css.`,
    '',
    'Colour is stated in ONE place so the palette can be changed in one place.',
    'Use the token for the role — see docs/developer-guide/brand-tokens.md.',
    '',
    'If the colour genuinely belongs to somebody else (a chain, a vendor, a token',
    'logo), add it to ALLOWED_FILES or ALLOWED_LITERALS in this file WITH a reason.',
    '',
  ]
  for (const f of findings.slice(0, 40)) {
    lines.push(`  ${f.rel}:${f.line}  ${f.literal}`)
    lines.push(`      ${f.text}`)
  }
  if (findings.length > 40) lines.push(`  … and ${findings.length - 40} more`)
  return lines.join('\n')
}

describe('colour lives only in theme.css (spec 091)', () => {
  it('scans a realistic number of stylesheets', () => {
    // A walk that silently matched nothing would make the assertion below pass
    // for the wrong reason.
    const exemptPrefix = resolve(FRONTEND, 'src/test') + sep
    const files = walk(
      resolve(FRONTEND, 'src'),
      (f) => f.endsWith('.css') && !f.startsWith(exemptPrefix)
    )
    expect(files.length).toBeGreaterThan(100)
  })

  it('states no colour literal outside the token layer', () => {
    const findings = scan()
    expect(findings.length, findings.length ? report(findings) : '').toBe(0)
  })

  it('does not scan comment prose', () => {
    // `#938` in a comment is an issue reference, not a colour. An earlier
    // version of the codemod rewrote hexes inside comments and mangled one that
    // documented a measured contrast pair.
    const stripped = stripComments('/* see #938 and #abcdef */\n.x { color: #123456; }')
    expect(stripped).not.toContain('#938')
    expect(stripped).toContain('#123456')
  })

  it('keeps line numbers accurate after stripping comments', () => {
    // The stripper replaces comment characters with spaces rather than deleting
    // them, so a multi-line comment does not shift every finding below it.
    const stripped = stripComments('/* a\nb */\n.x { color: #123456; }')
    expect(stripped.split('\n')).toHaveLength(3)
  })
})
