/**
 * Build config for the committed test fixture package (spec 073, task T014).
 *
 * This is a REAL mini-app package built by the REAL preset — the same
 * `createMiniAppConfig()` a vendor uses — so the bytes committed under
 * `../package/` are bytes the shipping build tool produced, not bytes a test
 * synthesized. That is the entire point of the fixture: it is the only thing in
 * the suite that can catch the build tool and the host loader drifting apart.
 *
 * Regenerate with `node frontend/src/test/miniapps/fixtures/regenerate.mjs`.
 * See `../README.md` for what each committed artifact is and why.
 *
 * The relative import of the preset is deliberate (six levels up to the repo
 * root): `tools/miniapp-build/` is Node tooling, not a frontend dependency, so
 * there is no package name to import it by — the same reason the preset's own
 * README shows a relative path.
 */

import react from '@vitejs/plugin-react'

import { createMiniAppConfig } from '@fairwins/miniapp-build/index.js'

export default createMiniAppConfig({
  appId: 'fixture-app',
  name: 'Fixture Mini-App',
  version: '1.0.0',
  root: import.meta.dirname,
  entry: 'src/entry.jsx',
  // Two capabilities, not all five: a fixture that declared everything could
  // never catch a manifest that over-declares.
  permissions: ['store', 'toast'],
  storeKeys: ['notes'],
  plugins: [react()]
  // Every other option is left at the preset's default ON PURPOSE — including
  // minification. A fixture built with non-default settings would be a weaker
  // guard than one built the way real packages are built, and the committed
  // bytes are auditable by regeneration (re-run the script, `git diff` must be
  // empty) rather than by reading a deliberately prettified artifact.
})
