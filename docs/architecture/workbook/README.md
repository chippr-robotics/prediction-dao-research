# FairWins Architecture Workbook

> **Status:** living document. Generated from a full-repository sweep at
> `staging` commit `57676112` (2026-09-11) and maintained against it.
> Every factual claim in this workbook carries a `path:line` citation into
> the repository. Where a fact could not be established from the code, the
> workbook says so rather than guessing.

## Why this workbook exists

`docs/developer-guide/architecture.md` describes FairWins as "three
deployable pieces … with **no application backend**". That was true once.
It is not true now: the platform runs a policy gateway, a bundler estate,
an exporter, and a set of VM-hosted services, across two repositories and a
shared GCP project. This workbook is the current, whole-system picture, and
it is organised as the three standard architecture views so that a reader
can enter at the altitude they need:

| View | Question it answers | Page |
|---|---|---|
| **Logical** | What does the platform do, for whom, and under what rules? | [01-logical-view.md](01-logical-view.md) |
| **Architectural** | What are the components, and what are the seams between them? | [02-architecture-view.md](02-architecture-view.md) |
| **Systems** | Where does it physically run, and along which network paths? | [03-systems-view.md](03-systems-view.md) |

Three reference annexes carry the detail the views point at:

| Annex | Contents | Page |
|---|---|---|
| **Connectors & ports** | Every connector crossing a process boundary; every listening socket and egress path | [04-connectors-and-ports.md](04-connectors-and-ports.md) |
| **Cryptographic BOM** | Curves, typed-data domains, KDFs, key material inventory, library pins | [05-cryptographic-bom.md](05-cryptographic-bom.md) |
| **External vendors** | Every third-party dependency, auth model, data exposure, commercial direction | [06-external-vendors.md](06-external-vendors.md) |

An [executive summary](00-executive-summary.md) states the architecture and
its controls in review-board register, for readers who will not read the body.

## Diagram sources

`diagrams/` holds editable draw.io XML. Open with [app.diagrams.net](https://app.diagrams.net)
or the draw.io desktop app; the `.drawio` file is the source of truth and the
mermaid blocks in the markdown pages are the rendered-in-docs equivalent.

| File | View |
|---|---|
| `diagrams/logical-view.drawio` | Capability and domain model |
| `diagrams/architecture-view.drawio` | Components and seams |
| `diagrams/systems-view.drawio` | Deployment and network topology |
| `diagrams/trust-boundaries.drawio` | Trust boundaries and crypto controls |

## How to keep it true

This workbook is descriptive, never authoritative — the code and the CI
gates decide. When the two disagree, the code is right and this document is
a bug. It is deliberately **not** wired into a CI gate: a gate that could
fail on prose would be a gate nobody could fix, and the repository already
carries the enforcement that matters (spec registry, storage layout,
bytecode digests, CBOM-adjacent dependency pins, FinOps catalogue).
