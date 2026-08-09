/**
 * The build stamp shown at the bottom of the nav drawer.
 *
 * It exists for one job — someone reports a problem and we need to know which build they were on —
 * so the properties worth pinning are about HONESTY, not formatting:
 *
 *   · it renders in the drawer (that is the whole point)
 *   · it never silently disappears, because an absent label reads as "no version info exists"
 *     rather than "this build was not stamped"
 *   · it is copyable, because it will be pasted into a bug report
 *
 * Under vitest, Vite's `define` substitution does not run, so buildInfo falls back to its unstamped
 * values. That IS the case worth covering: it is the same path a local dev server takes, and the
 * fallback is exactly where a "sometimes present" value would start lying.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Footer from '../components/Footer'
import { APP_VERSION, APP_COMMIT, IS_STAMPED, buildLabel } from '../config/buildInfo'

describe('build stamp', () => {
  it('resolves to honest values whether or not the build was stamped', () => {
    // Not asserting a specific version — that moves. Asserting it is a real value, not undefined
    // leaking into the UI as "vundefined".
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/)

    /*
     * CONDITIONAL on IS_STAMPED, not pinned to 'dev'. vitest loads the same vite.config.js, so
     * `define` substitution DOES run here — meaning a developer or CI step with VITE_COMMIT_SHA
     * exported would inline a real SHA and fail a hardcoded assertion while the behaviour was
     * entirely correct. Reported in review on #1070.
     *
     * The invariant worth pinning is not "the commit is dev", it is "the two agree": either we are
     * stamped and the commit looks like a short SHA, or we are not and it says so. That holds in
     * both environments and still catches the failure that matters — a blank or undefined commit
     * reaching the UI.
     */
    if (IS_STAMPED) {
      expect(APP_COMMIT).toMatch(/^[0-9a-f]{7}$/)
    } else {
      expect(APP_COMMIT).toBe('dev')
    }
  })

  it('never renders "undefined" or an empty label', () => {
    const label = buildLabel()
    expect(label).not.toMatch(/undefined|null/)
    expect(label.trim().length).toBeGreaterThan(1)
  })
})

describe('Footer — the drawer shows which build this is', () => {
  it('renders the build stamp in the drawer variant', () => {
    render(<Footer variant="drawer" />)
    expect(screen.getByText(buildLabel())).toBeInTheDocument()
  })

  it('renders it in the condensed in-app footer too', () => {
    render(<Footer variant="condensed" />)
    expect(screen.getByText(buildLabel())).toBeInTheDocument()
  })

  it('is not hidden from assistive tech', () => {
    // A support conversation conducted over a screen reader needs this as much as a sighted one,
    // so "subtle" must mean visually quiet, never aria-hidden.
    const { container } = render(<Footer variant="drawer" />)
    const stamp = container.querySelector('.app-footer-build')
    expect(stamp).not.toBeNull()
    expect(stamp.closest('[aria-hidden="true"]')).toBeNull()
  })

  it('leaves the landing footer alone', () => {
    // The stamp is a diagnostic for people already inside the app; the marketing page does not
    // need a commit SHA on it.
    render(<Footer variant="full" />)
    expect(screen.queryByText(buildLabel())).not.toBeInTheDocument()
  })
})
