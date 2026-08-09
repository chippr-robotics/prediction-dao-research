/**
 * The ethers fixture mini-app (spec 075, task T033).
 *
 * A SECOND committed package, whose only reason to exist is the one shared
 * dependency the first fixture deliberately leaves out.
 *
 * `source/`'s app imports React, `react/jsx-runtime` and the SDK, and its own
 * header records that `ethers` is "intentionally not imported". That was a
 * reasonable call for spec 073 — the React shims prove the mechanism and ethers
 * would only have added bytes. It stopped being reasonable at spec 075, because
 * the whole hazard that spec exists to bound runs through ethers specifically:
 *
 *   npm hoisting -> module resolution -> `discoverExports()` -> shim text ->
 *   entry.js -> its sha256 in manifest.json -> keccak256(manifest bytes) ->
 *   the on-chain MiniAppRegistry commitment.
 *
 * `hostScopePlugin.js` enumerates a shared module's bindings by importing the
 * very file Vite resolved, so the emitted shim is a literal transcript of what
 * the installer put on disk. ethers contributes ~190 names to that transcript —
 * by far the largest — and both real packages carry it. A fixture without it
 * could not notice a resolution change that rewrote thousands of bytes in every
 * published package, which is precisely the change a workspace conversion, a
 * hoisting change or a dependency bump can make with no error raised anywhere.
 *
 * So this app imports ethers and nothing else it does not need. Its committed
 * `entry.js` contains the full binding list; regenerating it after any such
 * change produces a git diff, and `packageFixture.test.jsx` re-checks the
 * digests continuously in the frontend suite.
 *
 * Its shared-dependency set is deliberately IDENTICAL to Token Mint's and
 * ClearPath's (`@fairwins/miniapp-sdk`, `ethers`, `react`, `react/jsx-runtime`),
 * so the fixture and the real packages exercise the same shim surface.
 *
 * It ships no stylesheet, which is not an omission either: `styles: []` is a
 * package shape the host must handle and the first fixture cannot produce.
 */

import { useState } from 'react'
import { formatUnits, getAddress } from 'ethers'
import { useMiniAppHost } from '@fairwins/miniapp-sdk'

/**
 * Values chosen so the rendered output is a FUNCTION of ethers rather than a
 * constant: a shim that resolved to nothing (or to a stub) cannot produce
 * either string, and the test recomputes both with its own ethers import rather
 * than hardcoding them.
 */
const RAW_AMOUNT = 1234567n
const DECIMALS = 6
const LOWERCASE_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

export default function EthersFixtureApp() {
  const host = useMiniAppHost()
  const [checksummed, setChecksummed] = useState(false)

  return (
    <section className="fixture-ethers-app">
      <h2>Ethers fixture mini-app</h2>
      <p>{host.appId}</p>
      <p>{formatUnits(RAW_AMOUNT, DECIMALS)}</p>
      <button type="button" onClick={() => setChecksummed(true)}>
        {checksummed ? getAddress(LOWERCASE_ADDRESS) : 'Checksum'}
      </button>
    </section>
  )
}
