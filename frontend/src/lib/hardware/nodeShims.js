// Spec 085 follow-up — the Ledger and Trezor SDKs are written against Node globals: their
// bundled code calls `Buffer.from/alloc/concat` bare (Vite externalizes the Node built-in to an
// empty stub), so in a real browser the FIRST device exchange threw `ReferenceError: Buffer is
// not defined`. Nothing in dev caught it because every dev-side flow (Cypress, capture harness)
// drives the test-adapter seam instead of the vendor SDKs — staging's real devices were the
// first code path to reach the bundled SDK bytes. This is why both vendors failed identically.
//
// The shim is LAZY and scoped to the hardware seam: the polyfill loads only when a member
// actually starts a device flow — the rest of the app never gains a Buffer global it might
// silently start depending on.

let installed = false

export async function ensureNodeGlobals() {
  if (installed) return
  if (typeof globalThis.Buffer === 'undefined') {
    // The npm `buffer` package (declared dependency) — NOT the externalized Node built-in;
    // Vite bundles the real polyfill because the package resolves from node_modules.
    const { Buffer } = await import('buffer')
    globalThis.Buffer = Buffer
  }
  // Some vendor code probes `global` (typeof-guarded today, but the probe result changes
  // behavior); pointing it at globalThis matches what those probes expect in a browser.
  if (typeof globalThis.global === 'undefined') globalThis.global = globalThis
  installed = true
}
