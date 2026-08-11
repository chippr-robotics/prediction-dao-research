/**
 * Screenshot the Reporting section for design review (issue #1026 follow-up).
 *
 *   node frontend/scripts/shoot-reporting.mjs [outDir]
 *
 * Starts the app's own Vite dev server, drives the preview page at
 * scripts/ui-preview/ with the pre-installed Chromium, and writes one PNG per
 * scenario × viewport. A layout defect is invisible in a unit test and obvious
 * in an image, so this is how the section is reviewed.
 *
 * Console errors and uncaught exceptions are reported per scenario: a
 * screenshot of a page that threw on mount looks fine and proves nothing.
 *
 * Dev-only. Nothing in the app imports it.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { createServer } from 'vite'
import { launch } from './lib/cdp.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FRONTEND = resolve(HERE, '..')
const outDir = resolve(process.cwd(), process.argv[2] || 'reporting-shots')
const PORT = 5199

const VIEWPORTS = [
  { id: 'mobile', width: 390, height: 844, mobile: true },
  { id: 'desktop', width: 1180, height: 1000, mobile: false },
]

/** Page states worth looking at — not the happy path only. */
const SCENARIOS = [
  { id: '1-landing', query: '' },
  // A sheet is position:fixed, so a full-page capture renders it at the bottom
  // of the document instead of over the page. Sheet states are shot at the
  // VIEWPORT, which is also what a member actually sees.
  { id: '2-sheet', query: 'sheet=1', fullPage: false },
  { id: '3-sheet-dark', query: 'sheet=1&theme=dark', fullPage: false },
  { id: '4-sheet-custom', query: 'sheet=1&expand=1', fullPage: false },
  { id: '5-result', query: 'generate=1' },
  { id: '6-result-dark', query: 'generate=1&theme=dark' },
  { id: '7-landing-dark', query: 'theme=dark' },
  { id: '8-empty', query: 'state=empty&generate=1' },
  { id: '9-error', query: 'state=error&generate=1' },
]

async function main() {
  const server = await createServer({
    root: FRONTEND,
    configFile: resolve(FRONTEND, 'vite.config.js'),
    server: { port: PORT, strictPort: true },
    logLevel: 'error',
  })
  await server.listen()

  const browser = await launch()
  mkdirSync(outDir, { recursive: true })
  let failures = 0

  for (const viewport of VIEWPORTS) {
    for (const scenario of SCENARIOS) {
      const page = await browser.newPage(viewport)
      const url = `http://localhost:${PORT}/scripts/ui-preview/index.html?${scenario.query}`
      let note = ''
      try {
        await page.goto(url)
        await page.waitFor("!!document.querySelector('.tax-reports-section')")
        // Drive the flows a screenshot cannot reach by URL alone.
        if (scenario.query.includes('expand=1')) {
          await page.evaluate(`
            (() => {
              const byText = (sel, text) => [...document.querySelectorAll(sel)]
                .find((el) => el.textContent.trim().toLowerCase().includes(text))
              byText('.statement-type-tile', 'custom')?.click()
              byText('.statement-disclosure', 'sections')?.click()
              return true
            })()
          `)
        }
        if (scenario.query.includes('generate=1')) {
          await page.evaluate(`
            (() => {
              const byText = (sel, text) => [...document.querySelectorAll(sel)]
                .find((el) => el.textContent.trim().toLowerCase().includes(text))
              byText('button', 'new statement')?.click()
              return true
            })()
          `)
          await new Promise((r) => setTimeout(r, 250))
          await page.evaluate(`
            (() => {
              const btn = [...document.querySelectorAll('.statement-primary-btn')]
                .find((el) => el.textContent.toLowerCase().includes('generate statement'))
              btn?.click()
              return true
            })()
          `)
        }
        // Let generation settle so the result state is captured, not the
        // spinner that precedes it.
        await new Promise((r) => setTimeout(r, 1200))
      } catch (err) {
        note = `  ✗ ${err.message}`
        failures += 1
      }

      // A clipped control is invisible in a screenshot you skim and obvious in
      // a measurement, so the harness measures. `.wallet-page` clips its
      // overflow, so anything wider than its host is silently cut in half
      // rather than pushing a scrollbar.
      const overflow = await page.evaluate(`
        (() => {
          const host = document.querySelector('.tab-content')
          if (!host) return []
          const limit = host.getBoundingClientRect()
          return [...host.querySelectorAll('*')]
            .filter((el) => {
              // Anything under a fixed ancestor is deliberately viewport-
              // scoped (the sheet backdrop and everything inside it); it is not
              // overflowing its container, it has no container in this flow.
              for (let n = el; n && n !== host; n = n.parentElement) {
                if (getComputedStyle(n).position === 'fixed') return false
              }
              const r = el.getBoundingClientRect()
              return r.width > 0 && (r.right > limit.right + 1 || r.left < limit.left - 1)
            })
            .slice(0, 5)
            .map((el) => el.className + ' | ' + Math.round(el.getBoundingClientRect().right - limit.right) + 'px past')
        })()
      `)
      if (overflow?.length) {
        page.problems.push(...overflow.map((o) => `overflows its container: ${o}`))
      }

      const name = `${scenario.id}_${viewport.id}.png`
      writeFileSync(resolve(outDir, name), await page.screenshot({ fullPage: scenario.fullPage !== false }))
      const problems = dedupe(page.problems)
      console.log(`  ${name}${note}${problems.length ? `  ⚠ ${problems.length} page error(s)` : ''}`)
      for (const problem of problems.slice(0, 4)) console.log(`      ${problem.slice(0, 220)}`)
      if (problems.length) failures += 1
      await page.close()
    }
  }

  await browser.close()
  await server.close()
  console.log(`\nWrote screenshots to ${outDir}`)
  if (failures) console.log(`${failures} scenario(s) reported problems — see above.`)
}

function dedupe(list) {
  return [...new Set(list.filter(Boolean))]
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
