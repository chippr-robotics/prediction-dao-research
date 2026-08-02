/**
 * The fixture mini-app (spec 073, task T014).
 *
 * Deliberately the smallest package that still exercises every part of the
 * runtime contract the host has to honor:
 *
 * - it default-exports a mountable React component (`contracts/host-context.md`);
 * - it imports `react` and — through JSX — `react/jsx-runtime`, so the built
 *   package contains the host-scope shims (research R2) rather than a copy of
 *   React. If the shim and `frontend/src/lib/miniapps/hostScope.js` ever stop
 *   agreeing, this module throws the moment it is evaluated;
 * - it reads its host object through `@fairwins/miniapp-sdk`, the one published
 *   SDK binding, so the fixture proves the SDK reaches a package at all;
 * - it holds local state, which only works if the shim resolved to the HOST's
 *   React (a second copy would have its own, empty, hook dispatcher);
 * - it styles itself from its own stylesheet, so the package emits the
 *   `style.css` the host is expected to inject scoped.
 *
 * `ethers` is intentionally not imported: it would add a ~190-binding shim to
 * committed bytes that are meant to stay human-reviewable, and it would prove
 * nothing the React shims do not already prove.
 */

import { useState } from 'react'
import { useMiniAppHost } from '@fairwins/miniapp-sdk'

import './fixture.css'

export default function FixtureApp() {
  const host = useMiniAppHost()
  const [greeted, setGreeted] = useState(false)

  return (
    <section className="fixture-app">
      <h2 className="fixture-app__title">Fixture mini-app</h2>
      <p className="fixture-app__id">{host.appId}</p>
      <button type="button" className="fixture-app__action" onClick={() => setGreeted(true)}>
        {greeted ? 'Greeted' : 'Greet'}
      </button>
    </section>
  )
}
