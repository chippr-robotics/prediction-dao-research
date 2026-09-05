# Guided multichain vault creation — screenshot record (spec 105)

First actor pass (2026-09-05): the three creation sheets that render without a chain — **type**
(presets + owners + label), **rules** (tile grid, one tile open in `-editing`, live summary with
the `Joint account · 1 of 2` chip), **networks** (cohort multi-select, connected chain
preselected, one primary "Deploy vault" CTA) — captured against the real dev app with a mocked
injected wallet on Polygon, 2 viewports × 2 themes = 16 shots. Every non-loopback request aborted.

Critic notes from this round: dark-mode selected network chip correctly inverts to the Teal 300
fill + Gunmetal label pair; tiles read title/value/hint at three sizes with token colours; the
summary restates the arrangement in the same words `describeSemanticRules` feeds the flow, so it
cannot claim what the realized rules will not enforce. No defects requiring a fix were found in
this pass.

**This is not the full loop.** The deployment-status states (queued → awaiting signature →
deploying → confirming → live / failed+retry), the done sheet, the reworked Details rows +
drift/coverage disclosures, the queue chips, and the load sheet need seeded stub chains (the
spec-102 harness pattern) — tracked as #1455, which closes only on the complete both-themes ×
both-viewports record.
