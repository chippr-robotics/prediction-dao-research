/**
 * Test-time resolution for the bare specifier `@fairwins/miniapp-sdk`
 * (spec 073, prerequisite for the US2 conversions).
 *
 * A mini-app package writes `import { useMiniAppHost } from '@fairwins/miniapp-sdk'`.
 * At RUNTIME that specifier is never resolved by a bundler at all: the build
 * preset rewrites it to a read from the host's frozen shared-module scope
 * (`hostScope.js`, research R2), so the package ships no copy of it and there is
 * no such npm package to install.
 *
 * Under Vitest, though, package source is imported directly rather than through
 * a built bundle, so the specifier reaches the resolver and fails. This shim is
 * what `frontend/vite.config.js` aliases it to.
 *
 * IT RE-EXPORTS THE REAL IMPLEMENTATION, deliberately — not a hand-written fake.
 * A stub would drift from the contract it stands for, and the behaviours a
 * converted app most needs covered are exactly the ones a stub would omit:
 * `UNDECLARED_CONTRACT`, `NO_WRITE_RAIL`, the rail split, toast clamping, the
 * namespaced store. Aliasing to the real hook means a package test exercises the
 * frozen host contract itself, and the only thing the alias supplies is module
 * resolution.
 *
 * Keep this in step with the SDK surface published in `hostScope.js` — one hook
 * today, by design.
 */
export { useMiniAppHost } from './hostContext'
