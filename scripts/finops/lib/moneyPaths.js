/**
 * Money-path discovery for the FinOps coverage gate (spec 089, FR-019).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *  WHY THIS FILE EXISTS
 *
 *  C2 originally discovered exactly one KIND of new revenue: a FeeRouter service id, found by
 *  regexing `keccakId('x.y')` out of two files. That is a complete answer for fees routed through
 *  the FeeRouter and a blind spot for everything else. The x402 paid rail (spec 096) takes USDC
 *  straight to the platform treasury, registers no `serviceId`, and was therefore invisible to the
 *  gate by construction — the catalogue could stay silent about it forever and CI would stay green.
 *
 *  A gate that cannot see the source is not protection. This module widens the aperture from
 *  "FeeRouter services" to "money paths": a place in the relay gateway where the PLATFORM is named
 *  as the recipient of funds.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * WHAT IS DETECTED, AND WHY THESE SIGNALS
 *
 *   B1  A CONFIGURED PLATFORM PAYEE. The gateway holds no key and hardcodes no address, so a
 *       recipient we control arrives as configuration — an env var, READ FROM THE ENVIRONMENT,
 *       whose name ends in one of the payee suffixes below. This is the signal that actually
 *       catches a new rail: you cannot pay FairWins without telling the gateway where to pay.
 *
 *       "Read from the environment" is load-bearing, not incidental tightening. Matching the NAME
 *       anywhere in the text also matched `OPENSEA_FEE_RECIPIENT`, which is a hardcoded constant
 *       holding OPENSEA's fee address — a third party's payee, used to RECOGNISE their fee in an
 *       order. Reporting it as evidence that FairWins gets paid would be a false fact in a gate
 *       whose entire purpose is refusing to state false facts about money.
 *
 *   B2  A HARDCODED PLATFORM PAYEE. The same fact written the wrong way — `payTo: '0x…'` in source.
 *       Zero occurrences today; it exists so that skipping the env var does not skip the gate.
 *
 *   B3  A DORMANT PATH BEING SWITCHED ON. A catalogued-but-`planned` money path whose payee or
 *       enable flag is set in a COMMITTED deployment file. `planned` means "nothing to read";
 *       the moment a deployment contradicts that, the catalogue is stating something untrue and the
 *       build must go red rather than the dashboard quietly under-reporting real income.
 *
 * WHAT IS DELIBERATELY *NOT* DETECTED
 *
 *   A bare `recipient`. The gateway is full of them — Across bridge quotes, intent structs, Seaport
 *   orders — and every one is the MEMBER's address, not ours. Matching it would raise a fistful of
 *   false positives on day one, and a gate that cries wolf on its first run is a gate somebody adds
 *   `continue-on-error` to. The discriminator is not "an address is named" but "an address WE
 *   control is named", which in this codebase means "it came from our configuration".
 *
 *   A new VENDOR COST. There is no honest heuristic: `fetch(vendor)` looks identical whether the
 *   vendor bills per call or serves free public data — the perps module proxies three free APIs
 *   with the same shape the metered Anthropic call has. See the note in check-finops-coverage.js
 *   for what is done about the cost side instead.
 *
 * Pure functions over text, so the gate's own tests can feed it fixtures instead of the repo.
 */

/**
 * Env-var name suffixes that mean "an address or code that pays FairWins".
 *
 * Each is a payee in the strict sense — funds or a revenue share arrive at something we control.
 * `_ADDRESS` on its own is NOT here: `POLYMARKET_API_ADDRESS` is an API identity, not a payee, and
 * one suffix that means two things is how a gate starts producing noise.
 */
export const PAYEE_SUFFIXES = Object.freeze([
  'PAY_TO',
  'PAYEE',
  'TREASURY',
  'FEE_RECIPIENT',
  'PAYOUT_ADDRESS',
  'REFERRAL_ADDRESS',
  'REFERRER',
  'REF_CODE',
  'BUILDER_CODE',
])

/** Identifier names that hold a platform payee in source. Used only for the hardcoded-address rule. */
export const PAYEE_IDENTIFIERS = Object.freeze(['payTo', 'payee', 'treasury', 'feeRecipient', 'feeTreasury', 'payoutAddress'])

/**
 * The three shapes an environment read takes in this gateway:
 *   `opt(env, 'NAME', …)` / `int(env, 'NAME', …)` — the config module's own helpers
 *   `env.NAME` / `env['NAME']`
 *   `process.env.NAME` / `process.env['NAME']`
 */
const ENV_READ_RES = [
  /\b\w+\(\s*env\s*,\s*['"]([A-Z][A-Z0-9_]*)['"]/g,
  /\benv\.([A-Z][A-Z0-9_]*)\b/g,
  /\benv\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\]/g,
]

const HARDCODED_PAYEE_RE = new RegExp(
  String.raw`\b(${PAYEE_IDENTIFIERS.join('|')})\s*[:=]\s*['"\`]0x[0-9a-fA-F]{40}['"\`]`,
  'g',
)

/** Every environment variable a file READS, regardless of what it is named. */
export function envReads(text) {
  const names = new Set()
  for (const re of ENV_READ_RES) {
    for (const m of text.matchAll(re)) names.add(m[1])
  }
  return [...names]
}

/** `X402` → `x402`; `PERPS_GAINS` → `perps-gains`. Kebab, so it lives in the same space as source ids. */
export function namespaceOf(envPrefix) {
  return envPrefix.toLowerCase().replace(/_/g, '-')
}

/**
 * Split a payee env var into `{ namespace, suffix }`, or null if it is not one.
 *
 * The longest matching suffix wins, so `FOO_PAYOUT_ADDRESS` is a payout address rather than a
 * namespace called `FOO_PAYOUT` with a suffix of `ADDRESS` — which is not even a suffix we accept.
 */
export function parsePayeeEnv(name) {
  let best = null
  for (const suffix of PAYEE_SUFFIXES) {
    if (!name.endsWith(`_${suffix}`)) continue
    if (best && best.length >= suffix.length) continue
    best = suffix
  }
  if (!best) return null
  const prefix = name.slice(0, name.length - best.length - 1)
  if (!prefix) return null
  return { namespace: namespaceOf(prefix), env: name, suffix: best }
}

/** The `services/relay-gateway/src/<module>/…` directory a file belongs to, or `src` for a loose file. */
export function moduleOf(relPath) {
  const m = relPath.match(/services\/relay-gateway\/src\/([^/]+)\//)
  return m ? namespaceOf(m[1].replace(/([a-z0-9])([A-Z])/g, '$1-$2').toUpperCase()) : 'src'
}

/**
 * Discover every platform-payee money path in a set of gateway source files.
 *
 * @param {Array<{path: string, text: string}>} files
 * @returns {Map<string, {namespace: string, evidence: string[]}>} keyed by namespace
 */
export function discoverMoneyPaths(files) {
  /** @type {Map<string, {namespace: string, evidence: string[]}>} */
  const found = new Map()
  const add = (namespace, evidence) => {
    const entry = found.get(namespace) ?? { namespace, evidence: [] }
    if (!entry.evidence.includes(evidence)) entry.evidence.push(evidence)
    found.set(namespace, entry)
  }

  for (const { path, text } of files) {
    // B1 — a configured payee, read from the environment.
    for (const name of envReads(text)) {
      const parsed = parsePayeeEnv(name)
      if (parsed) add(parsed.namespace, `${parsed.env} (${path})`)
    }
    // B2 — a payee written into source as a literal address.
    for (const m of text.matchAll(HARDCODED_PAYEE_RE)) {
      add(moduleOf(path), `hardcoded ${m[1]} address in ${path}`)
    }
  }

  for (const entry of found.values()) entry.evidence.sort()
  return found
}

const COMMENT_RE = /^\s*(#|\/\/)/

/**
 * Does a committed deployment file set `envName` to a real value?
 *
 * Commented lines do not count — a commented flag is the documented way this repo parks a module
 * that is built but not offered, and treating it as "on" would make the honest thing fail the gate.
 * Neither do empty strings or `<placeholder>` text, which are how "deliberately unset" is written
 * here (`OPENSEA_REFERRAL_ADDRESS: ""`).
 *
 * @param {Array<{path: string, text: string}>} files
 * @param {string} envName
 * @param {(value: string) => boolean} [accept] extra predicate on the value (e.g. truthiness)
 * @returns {{path: string, line: number, value: string}|null}
 */
export function findEnvAssignment(files, envName, accept = () => true) {
  const assign = new RegExp(String.raw`^\s*(?:-\s*)?(?:export\s+)?${envName}\s*[:=]\s*(.*)$`)
  for (const { path, text } of files) {
    const lines = text.split('\n')
    for (const [i, line] of lines.entries()) {
      if (COMMENT_RE.test(line)) continue
      const m = line.match(assign)
      if (!m) continue
      const raw = m[1].trim().replace(/\s+#.*$/, '')
      const value = raw.replace(/^['"]|['"]$/g, '').trim()
      if (!value || value.includes('<')) continue // unset on purpose, or a placeholder
      if (!accept(value)) continue
      return { path, line: i + 1, value }
    }
  }
  return null
}

/** Truthy in the sense every gateway flag uses (`opt(env, X, 'false').toLowerCase() === 'true'`). */
export const isTruthyFlag = (value) => value.toLowerCase() === 'true'

// ── the three C2b rules, as predicates over data ─────────────────────────────────────────────
//
// Pure and exported so the gate's tests can drive them with a catalogue that is DELIBERATELY wrong
// — `SOURCES` minus one entry — and prove each rule fires. A rule that never fires is a rule that is
// not enforced, and the only way to know is to make it fail on purpose.

/** namespace → the catalogue entries claiming it. Several entries may claim one path (Polymarket). */
export function claimsByNamespace(sources) {
  const claims = new Map()
  for (const source of sources) {
    const ns = source.moneyPath?.namespace
    if (!ns) continue
    claims.set(ns, [...(claims.get(ns) ?? []), source])
  }
  return claims
}

/**
 * Money paths the gateway configures that no catalogue entry claims.
 *
 * @param {Map<string, {namespace: string, evidence: string[]}>} found from discoverMoneyPaths
 * @param {Array<object>} sources the catalogue
 */
export function unclaimedMoneyPaths(found, sources) {
  const claims = claimsByNamespace(sources)
  return [...found.values()]
    .filter((path) => !claims.has(path.namespace))
    .sort((a, b) => a.namespace.localeCompare(b.namespace))
}

/**
 * Catalogue entries claiming a payee the gateway no longer reads. The claim is stale, so whatever
 * replaced it is unwatched.
 */
export function staleClaims(found, sources, gatewayFiles) {
  return sources.filter((source) => {
    const payeeEnv = source.moneyPath?.payeeEnv
    if (!payeeEnv || source.status === 'retired') return false
    return !gatewayFiles.some(({ text }) => text.includes(payeeEnv))
  })
}

/**
 * `planned` entries a committed deployment has switched on.
 *
 * `planned` is a claim about the world — there is nothing to read — and turning such a path on is a
 * one-line config change that nothing else in this gate looks at. Enabling is where promotion to
 * `live` (with a collector) stops being optional, because switching on a revenue rail is precisely
 * the moment nobody remembers the dashboard.
 *
 * @returns {Array<{source: object, what: string, hit: {path: string, line: number, value: string}}>}
 */
export function dormantPathsSwitchedOn(sources, deploymentFiles) {
  const out = []
  for (const source of sources) {
    if (source.status !== 'planned' || !source.moneyPath) continue
    const { payeeEnv, enableEnv } = source.moneyPath

    const setPayee = payeeEnv ? findEnvAssignment(deploymentFiles, payeeEnv) : null
    const setFlag = enableEnv ? findEnvAssignment(deploymentFiles, enableEnv, isTruthyFlag) : null
    const hit = setPayee ?? setFlag
    if (!hit) continue

    out.push({
      source,
      what: setPayee ? `${payeeEnv} is configured` : `${enableEnv} is set to '${setFlag.value}'`,
      hit,
    })
  }
  return out
}
