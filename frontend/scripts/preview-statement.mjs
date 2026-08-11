/**
 * Render sample statement PDFs for design review (issue #1026).
 *
 *   node frontend/scripts/preview-statement.mjs [outDir]
 *
 * Loads the real renderer through Vite's SSR pipeline rather than plain Node so
 * the app's own module graph resolves — including `virtual:tenant`, which the
 * tenant-branding plugin provides and which nothing downstream can fake without
 * the preview quietly diverging from what members actually receive.
 *
 * Emits one PDF per scenario, including a second tenant brand, because the
 * point of the design is that a tenant re-skins it from a manifest alone.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { createServer } from 'vite'
import { monthOfActivity, yearOfActivity, FIXTURE_ACCOUNT } from './statement-fixture.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FRONTEND = resolve(HERE, '..')
const outDir = resolve(process.cwd(), process.argv[2] || 'statement-preview')

const PERIODS = {
  july: {
    kind: 'custom',
    from: Date.UTC(2026, 6, 1),
    to: Date.UTC(2026, 6, 31, 23, 59, 59, 999),
    label: '1 – 31 July 2026',
  },
  year: {
    kind: 'custom',
    from: Date.UTC(2026, 0, 1),
    to: Date.UTC(2026, 11, 31, 23, 59, 59, 999),
    label: 'Calendar year 2026',
  },
}

/** A second tenant, themed nothing like the default, to prove brandability. */
const ALT_TENANT = {
  brand: {
    displayName: 'Meridian Markets',
    tagline: 'Private client digital asset services',
    appUrl: 'https://meridian.example',
    copyrightNotice: 'Meridian Markets Ltd.',
    supportEmail: 'clients@meridian.example',
  },
  tokens: {
    primary: '#4B3FA7',
    positive: '#2F7D5B',
    negative: '#B3392B',
    warning: '#B77A0B',
  },
}

async function main() {
  const server = await createServer({
    root: FRONTEND,
    configFile: resolve(FRONTEND, 'vite.config.js'),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'warn',
  })

  const [{ renderStatement }, { statementTheme }, { computeTotals }, { statementBrand, statementThemeForTenant }] =
    await Promise.all([
      server.ssrLoadModule('/src/data/reports/statement/statementPdf.js'),
      server.ssrLoadModule('/src/data/reports/statement/theme.js'),
      server.ssrLoadModule('/src/data/reports/reportBuilder.js'),
      server.ssrLoadModule('/src/data/reports/statement/brand.js'),
    ])

  const defaultBrand = statementBrand()
  const defaultTheme = statementThemeForTenant()

  const report = (lineItems, period, extra = {}) => ({
    account: FIXTURE_ACCOUNT,
    chainId: 137,
    networkName: 'Polygon',
    isTestnet: false,
    period,
    generatedAt: Date.UTC(2026, 7, 1, 9, 12),
    source: 'ledger',
    lineItems,
    totals: computeTotals(lineItems, extra.nativeSymbol || 'POL'),
    staleClasses: [],
    prunedBefore: null,
    valuationNote:
      'Stablecoin amounts are valued at the $1.00 par baseline. No market price feed is applied, so a ' +
      'stablecoin trading off par is not reflected here.',
    selfTransferNote: lineItems.some((i) => i.selfTransfer)
      ? 'Moving your own assets between networks is not income and not a disposal. Each bridge is listed once, ' +
        'naming both networks and both transactions; its value is reported separately from income and disposals, ' +
        'and the only cost attributed to it is the platform fee actually charged.'
      : null,
    disclaimer:
      'This is an informational record of your on-chain activity — wagers, transfers, bridges, liquidity, wager ' +
      'pools, earn, and membership — not tax advice. The platform does not compute tax owed. Consult a qualified ' +
      'professional.',
    ...extra,
  })

  const month = monthOfActivity()
  const scenarios = [
    ['01-account-statement', report(month, PERIODS.july), { type: 'full' }],
    ['02-wagering-statement', report(month, PERIODS.july), { type: 'wagers' }],
    ['03-earnings-statement', report(month, PERIODS.july), { type: 'earnings' }],
    [
      '04-summary-only',
      report(month, PERIODS.july),
      { type: 'full', sections: { register: false, byActivity: false, failed: false } },
    ],
    ['05-full-year', report(yearOfActivity(), PERIODS.year), { type: 'full' }],
    [
      '06-degraded',
      report(month, PERIODS.july, {
        staleClasses: ['earn', 'staking'],
        prunedBefore: Date.UTC(2026, 0, 15),
      }),
      { type: 'full' },
    ],
    ['07-empty', report([], PERIODS.july), { type: 'full' }],
    [
      '08-testnet',
      report(month.slice(0, 8), { ...PERIODS.july, label: 'July 2026' }, {
        chainId: 63, networkName: 'Mordor', isTestnet: true,
        // Mordor's native asset is ETC, not POL. The app derives this from the
        // chain config; the preview has to say it explicitly or the sample
        // statement denominates gas in a currency that chain does not use.
        nativeSymbol: 'ETC',
      }),
      { type: 'full' },
    ],
    [
      '09-alt-tenant-brand',
      report(month, PERIODS.july),
      { type: 'full', brand: ALT_TENANT.brand, theme: statementTheme(ALT_TENANT.tokens) },
    ],
  ]

  mkdirSync(outDir, { recursive: true })
  for (const [name, r, options] of scenarios) {
    const blob = renderStatement(r, { brand: defaultBrand, theme: defaultTheme, ...options })
    const bytes = Buffer.from(await blob.arrayBuffer())
    writeFileSync(resolve(outDir, `${name}.pdf`), bytes)
    console.log(`  ${name}.pdf  ${(bytes.length / 1024).toFixed(0)} KB`)
  }

  await server.close()
  console.log(`\nWrote ${scenarios.length} statements to ${outDir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
