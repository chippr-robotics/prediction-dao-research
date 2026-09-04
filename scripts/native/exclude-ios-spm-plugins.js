#!/usr/bin/env node
/**
 * Remove plugins from the generated iOS SPM package (spec 103).
 *
 * WHY THIS EXISTS. `cap sync ios` regenerates `CapApp-SPM/Package.swift` from every installed
 * Capacitor plugin, and Capacitor offers no per-platform exclusion — a plugin in package.json is a
 * plugin on both platforms. `@capacitor-community/bluetooth-le@8.3.0` (the newest published) does
 * not compile against the Capacitor Swift API the app pins (`capacitor-swift-pm exact 8.5.0`):
 *
 *     Plugin.swift:719: value of type 'CAPPluginCall' has no member 'reject'
 *     Plugin.swift:730: missing argument for parameter #2 in call   (getString)
 *
 * That failed the iOS archive on the v1.16.0 release attempt, and because `Publish release` is
 * gated on the native artifacts, it blocked the release itself. Ledger-over-BLE is therefore
 * ANDROID-ONLY until the plugin catches up; the existing capability seam
 * (`lib/native/runtime.js` → `NativeCapabilityNotice`) already reports an absent transport
 * honestly, so an iOS member is told rather than shown a control that cannot work.
 *
 * The removal is DELIBERATELY LOUD. A plugin named here that is not in the generated file fails
 * this script: either the plugin left the tree (delete its entry here) or the CLI changed its
 * output shape (revisit this script) — and both are things a person must look at, not something
 * to shrug off with a no-op. The same holds in reverse: nothing is removed by guesswork, only the
 * exact `.package`/`.product` pair belonging to a declared node_modules path.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
const PACKAGE_SWIFT = path.join(ROOT, 'frontend', 'ios', 'App', 'CapApp-SPM', 'Package.swift')

/** node_modules paths whose plugins must NOT reach the iOS build, each with the reason. */
const EXCLUDED = [
  {
    module: '@capacitor-community/bluetooth-le',
    reason:
      'bluetooth-le@8.3.0 (latest) does not compile against capacitor-swift-pm 8.5.0; Ledger BLE is Android-only',
  },
]

function stripPlugin(text, module) {
  // `.package(name: "<SwiftName>", path: "<…>/node_modules/<module>"…),` — the path is what
  // identifies the plugin; the Swift name is derived by the CLI and is read back out of the line
  // so the matching `.product(…)` entry is removed by the same authority.
  const pkg = new RegExp(
    `,?\\n\\s*\\.package\\(name: "([^"]+)", path: "[^"]*node_modules/${module.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^)]*\\)`,
  )
  const pkgMatch = pkg.exec(text)
  if (!pkgMatch) return { ok: false }
  const swiftName = pkgMatch[1]
  let out = text.replace(pkg, '')

  const product = new RegExp(`,?\\n\\s*\\.product\\(name: "${swiftName}", package: "${swiftName}"[^)]*\\)`)
  if (!product.test(out)) return { ok: false, swiftName, missing: 'product' }
  out = out.replace(product, '')
  return { ok: true, swiftName, text: out }
}

function main() {
  if (!fs.existsSync(PACKAGE_SWIFT)) {
    console.error(`::error::${path.relative(ROOT, PACKAGE_SWIFT)} does not exist — run \`cap sync ios\` first.`)
    process.exit(1)
  }
  let text = fs.readFileSync(PACKAGE_SWIFT, 'utf8')
  const removed = []
  for (const { module, reason } of EXCLUDED) {
    const result = stripPlugin(text, module)
    if (!result.ok) {
      console.error(
        `::error::${module} is not in the generated Package.swift${
          result.missing ? ` as a matching .product entry for "${result.swiftName}"` : ''
        }. Either it is no longer a dependency (drop it from EXCLUDED in ${path.relative(
          ROOT,
          __filename,
        )}) or the Capacitor CLI changed its output shape (this script needs revisiting). Refusing to build an iOS archive whose plugin set nobody checked.`,
      )
      process.exit(1)
    }
    text = result.text
    removed.push(`${module} (${result.swiftName}) — ${reason}`)
  }
  fs.writeFileSync(PACKAGE_SWIFT, text)
  for (const line of removed) console.log(`✔ excluded from the iOS package: ${line}`)
}

main()
