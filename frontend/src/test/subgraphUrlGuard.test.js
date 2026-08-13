import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Regression guard for issue #1172: `cloudbuild.yaml`/`cloudbuild.staging.yaml`
 * baked `VITE_SUBGRAPH_URL` to the abandoned v0.2.0 subgraph while
 * `config/networks.js` had already moved every chain's real endpoint to
 * v0.3.0. `drawProposalScan.js` and `useSiteStats.js` read the global env var
 * directly instead of the per-chain `getSubgraphUrl(chainId)` every other
 * reader uses, so the two builds silently diverged and both features read an
 * always-empty subgraph — HTTP 200, no error, wrong answer.
 *
 * `data/wagers/SubgraphSource.js#resolveSubgraphUrl(chainId)` is now the ONE
 * place allowed to read `VITE_SUBGRAPH_URL` directly (as a legacy fallback
 * behind the per-chain config); every other reader must call
 * `resolveSubgraphUrl(chainId)` instead. This scans the shipped source (not
 * tests) for a direct read of the bare env var and fails if it finds one
 * anywhere but the allowed file.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

// Every accepted way to pull VITE_SUBGRAPH_URL off import.meta.env. All three
// exclude the per-chain `VITE_SUBGRAPH_URL_POLYGON` etc. (word boundary / no
// trailing `_` after the name) so those legitimate reads never trip the guard.
const DIRECT_READ_PATTERNS = [
  // import.meta.env.VITE_SUBGRAPH_URL / import.meta.env?.VITE_SUBGRAPH_URL
  /import\.meta\.env\??\.VITE_SUBGRAPH_URL\b(?!_)/,
  // import.meta.env['VITE_SUBGRAPH_URL'] / import.meta.env?.['VITE_SUBGRAPH_URL']
  /import\.meta\.env\??\.?\[\s*['"`]VITE_SUBGRAPH_URL['"`]\s*\]/,
  // const { VITE_SUBGRAPH_URL } = import.meta.env
  /\{[^}]*\bVITE_SUBGRAPH_URL\b(?!_)[^}]*\}\s*=\s*import\.meta\.env\b/,
]

const ALLOWED_FILE = 'data/wagers/SubgraphSource.js'

function walk(dir) {
  const out = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'test') continue
      out.push(...walk(full))
    } else if (/\.(jsx?|tsx?)$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

describe('subgraph URL resolution guard (issue #1172)', () => {
  it('only SubgraphSource.js reads VITE_SUBGRAPH_URL directly; everything else must call resolveSubgraphUrl(chainId)', () => {
    const offenders = []
    for (const file of walk(SRC)) {
      const rel = file.slice(SRC.length + 1).split('\\').join('/')
      if (rel === ALLOWED_FILE) continue
      const code = readFileSync(file, 'utf8')
      if (DIRECT_READ_PATTERNS.some((re) => re.test(code))) offenders.push(rel)
    }
    expect(
      offenders,
      'Found a direct read of VITE_SUBGRAPH_URL outside data/wagers/SubgraphSource.js. ' +
        'Import resolveSubgraphUrl(chainId) from there instead so a stale global override can ' +
        'never diverge from the per-chain config in config/networks.js:\n  ' + offenders.join('\n  ')
    ).toEqual([])
  })
})
