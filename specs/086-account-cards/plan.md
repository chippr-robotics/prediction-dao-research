# Implementation Plan: Unified, Customizable Account Cards

**Branch**: `claude/hardware-wallet-protect-ojldc1` (PR #1180) | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

## Summary

Acting accounts lose their banner (all kinds equal; the header avatar is the identity cue), the
account tile becomes one shared, glass-styled `AccountCard`, identity art becomes one shared
`AccountAvatar` (member picture → Blockies fallback), and a single Customize sheet sets a local
picture, tint, and pattern per account. Frontend-only.

The design turns on one decision: **cosmetics are device presentation, not account data.** They
live in a device-scoped store (never synced — asserted by a test), carry no authority anywhere,
and default to absence, which is why removal needed no migration and the store can render before
a wallet resolves (the header avatar's first paint).

## Constitution Check — PASS

| Principle | Assessment |
|---|---|
| **I. Security-First** | No contract/gateway change. Images never leave the device; cosmetics are never an input to any decision. The card remains a single option button (no new interactive surface inside the listbox). |
| **II. Coverage** | Store sanitization (unknown ids, oversized/foreign images), avatar reactivity, sheet failure paths (refused image keeps the old picture), carousel integration + kind tags, absence-from-backup test. |
| **III. Honest State** | A failed image read states its reason and changes nothing. Defaults are true absence, not empty records. The removed banner is deleted code, not hidden UI. |
| **IV. Fail Loudly** | No CI softening; existing suites updated where the contract genuinely changed (banner test deleted with its component). |
| **V. Accessible, Consistent** | One card/avatar component reused; swatch radiogroups with labels; axe audits on the sheet; glass keeps AA text contrast with a solid fallback under `@supports`. |
| **Simplicity** | No new dependency; tokens over free-form values; one new device store following the established shape (revision + subscribers). |

## What changed

- **Removed**: `OperateAsIndicator` (component, render site in App.jsx, CSS, test) — spec 043's
  vault-only banner. FR-002's header identity already held for every kind.
- **Added**: `lib/account/accountProfilesStore.js` (+ `profileImage.js`, `accountKinds.js`),
  `AccountAvatar`, `AccountCard` (+ CSS with `--glass-*`/`--card-tint-*` tokens in theme.css),
  `AccountCustomizeSheet` (+ CSS), carousel "Customize card" entry point.
- **Standardized**: BlockiesAvatar call sites (header button, switcher rows, transfer-from
  select, vault list, recovery list, hardware list, user modals) now render `AccountAvatar`;
  hardware rows gained the avatar; `Hardware` kind label everywhere; legacy switcher labels
  prefer the address-book nickname (chain-agnostic).
- **Verification**: 4 new Vitest suites + carousel additions (all green), actor-critic capture
  harness (12 shots; round-1 finding was a washed-out FIXTURE image photographing a working
  header avatar as broken — see screenshots/README.md), developer guide + mkdocs nav.
