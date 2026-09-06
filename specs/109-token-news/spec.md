# Feature Specification: Token news on portfolio and trade surfaces

**Feature Branch**: `109-token-news`
**Created**: 2026-09-06
**Status**: Reserved — skeleton only; full specification via `/speckit-specify`
**Input**: Issue #1465; estate evaluation `docs/research/alphaday-news-agent-context-evaluation.md`

## Problem statement

Members (and the agents acting for them) have no in-app source of information about the assets they
hold or trade: a member looking at a token in their portfolio, or at a selected trade pair, must
leave the app to learn what is happening to that asset, and the assistant cannot answer "what's the
news on X?" at all. Issue #1465 asks for asset news on the portfolio and trade surfaces, proposing
the Alphaday API as the source.

## Scope

**In scope** (per the merged estate evaluation):

- A read-only, optional relay-gateway news module on the spec-082 perps template: killswitch →
  enabled check → param validation → quota → single-flight per-asset cached fetch; honest
  degradation (`read` / `unreadable` / `not-configured`), off ⇒ `503 news_unconfigured` and the SPA
  hides the surface.
- An explicit asset-identity mapping contract: `(chainId, tokenAddress)` / trade-pair symbol →
  provider asset id. An unmapped or colliding asset renders honest absence, never another asset's
  news.
- Tenant-flagged frontend news cards on (a) the selected portfolio token and (b) the selected trade
  pair, three-state honesty, every item rendered as text with link-out attribution.
- One `get_token_news` public tool in `@fairwins/assistant-contract` (both rails; MCP snapshot
  parity regen), with honest-result wording labelling content as third-party and reported.
- FinOps catalogue entry for the vendor dependency; spec-097 secrets registry work only if probing
  finds a key tier.

**Out of scope** (deliberately — see the evaluation §3):

- Any persistent datastore (graph or otherwise) for news or agent context. Tool-pull is the
  retrieval mechanism; the persistent retrieval layer is parked as its own future issue.
- Context-push: news never enters the assistant's system prompt or rides un-asked into a turn.
- In-app rendering of article bodies or any third-party HTML.

## Open questions for `/speckit-specify` / research

The evaluation §4 lists the vendor probes that gate planning: Alphaday auth model (keyless claim is
unverified), rate limits and their unit, news/asset endpoint shapes and the asset catalog, coverage
of long-tail (ETC-cohort) assets, redistribution/caching terms, free-tier SLA posture.

## References

- Issue #1465 (tracking)
- `docs/research/alphaday-news-agent-context-evaluation.md` (estate evaluation, merged PR #1508)
- `specs/082-perps-trade-view/` (gateway read-proxy template)
- `specs/104-guttertoken-assistant-rail/` + `docs/developer-guide/agentic-chat.md` (tool table,
  injection posture)
