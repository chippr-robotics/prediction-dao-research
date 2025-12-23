# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records (ADRs) for the Prediction DAO Research project. ADRs document significant architectural and technical decisions made during the development of the platform.

## What is an ADR?

An Architecture Decision Record (ADR) is a document that captures an important architectural decision made along with its context and consequences. ADRs help:

- **Preserve knowledge**: Document why decisions were made
- **Onboard new team members**: Understand the reasoning behind design choices
- **Avoid revisiting settled decisions**: Reference past discussions
- **Learn from past decisions**: Review outcomes and adjust future choices

## ADR Format

Each ADR follows this structure:

1. **Title**: Short descriptive name
2. **Status**: Proposed | Accepted | Deprecated | Superseded
3. **Context**: The issue or situation requiring a decision
4. **Decision**: The chosen approach
5. **Consequences**: Positive and negative outcomes
6. **Alternatives Considered**: Other options that were evaluated

## Active ADRs

| Number | Title | Status | Date |
|--------|-------|--------|------|
| [ADR-001](001-integration-testing-strategy.md) | Integration Testing Strategy | Accepted | 2025-12-23 |

## Creating a New ADR

1. Copy the template from `template.md`
2. Number it sequentially (e.g., `002-title.md`)
3. Fill in all sections
4. Submit as part of a pull request
5. Update this README with the new ADR

## ADR Lifecycle

- **Proposed**: Under discussion, not yet accepted
- **Accepted**: Decision has been made and is current
- **Deprecated**: No longer relevant due to project changes
- **Superseded**: Replaced by a newer ADR (link to the new one)

## References

- [ADR GitHub Organization](https://adr.github.io/)
- [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
