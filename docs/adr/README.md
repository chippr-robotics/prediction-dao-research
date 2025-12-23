# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records (ADRs) for the ClearPath & FairWins prediction market platform. ADRs document significant architectural decisions, their context, and their consequences.

## What is an ADR?

An Architecture Decision Record (ADR) captures an important architectural decision made along with its context and consequences. ADRs help teams:

- Understand why certain decisions were made
- Provide context for future architectural changes
- Document the evolution of the system architecture
- Facilitate knowledge transfer to new team members

## ADR Format

Each ADR follows a consistent structure:
- **Title**: Concise description of the decision
- **Status**: Proposed, Accepted, Deprecated, or Superseded
- **Context**: The problem or requirement driving the decision
- **Decision**: The chosen solution and rationale
- **Consequences**: Impact, trade-offs, and implications

## ADR Index

### Active ADRs

| ADR | Title | Status | Date | Phase |
|-----|-------|--------|------|-------|
| [001](./001-scalability-architecture.md) | Scalable Architecture & Batch Market Updates | Accepted | 2025-12-23 | Design |
| [002](./002-batch-operations-guide.md) | Batch Operations & Market Discovery API Integration | Accepted | 2025-12-23 | Implementation |
| [003](./003-implementation-summary.md) | Scalability Implementation Summary & Results | Accepted | 2025-12-23 | Complete |

### Superseded ADRs

None yet.

## How to Create a New ADR

1. Create a new file in this directory with the format: `NNN-title-with-dashes.md`
   - Use the next available number (e.g., `004-your-decision.md`)
   - Use lowercase with dashes for the title

2. Use this template structure:

```markdown
# ADR NNN: Title of Decision

**Status**: Proposed | Accepted | Deprecated | Superseded by [ADR-XXX]

**Date**: YYYY-MM-DD

**Deciders**: List of people involved in the decision

**Technical Story**: Link to issue/ticket if applicable

## Context

What is the issue or problem that we're addressing? What factors are influencing this decision?

## Decision

What is the change that we're proposing and/or doing?

## Consequences

What becomes easier or more difficult to do because of this change? What are the trade-offs?

### Positive

- List of positive consequences

### Negative

- List of negative consequences or trade-offs

### Neutral

- Other implications

## Implementation

How will this decision be implemented? What are the key steps?

## References

- Links to related documents, discussions, or external resources
```

3. Update this README to include your new ADR in the index

4. Get the ADR reviewed and approved before marking it as "Accepted"

## Implementation Phases

The scalability architecture follows a phased implementation approach:

### Phase 1: Foundation (Weeks 1-2) - **CURRENT**
- ✅ Batch market creation and enhanced events
- ✅ Storage packing and indexing infrastructure
- ✅ Pagination helper functions
- ✅ Unit tests for batch operations
- 🔄 Integration with existing systems (In Progress)

### Phase 2: Batch Processing (Weeks 3-4)
- ⏳ Position batching enhancements
- ⏳ Batch ZK proof verification
- ⏳ Epoch consolidation logic
- ⏳ Failure handling and monitoring

### Phase 3: Query API (Weeks 5-6)
- ⏳ On-chain query optimization
- ⏳ Off-chain indexer implementation
- ⏳ GraphQL/REST API deployment
- ⏳ Integration examples

### Phase 4: Optimization & Testing (Weeks 7-8)
- ⏳ Gas optimization profiling
- ⏳ Security audit preparation
- ⏳ Load testing
- ⏳ Documentation review

### Phase 5: Deployment & Monitoring (Weeks 9-10)
- ⏳ Testnet deployment
- ⏳ Monitoring infrastructure
- ⏳ Production preparation
- ⏳ Mainnet deployment plan

## Status Legend

- ✅ **Complete**: Implementation finished and tested
- 🔄 **In Progress**: Currently being worked on
- ⏳ **Planned**: Scheduled for future implementation
- ❌ **Blocked**: Cannot proceed due to dependencies
- 🔁 **Needs Review**: Implementation complete, awaiting review

## Contributing

When making significant architectural changes:

1. Create a new ADR following the template
2. Discuss with the team before implementation
3. Update this README with the new ADR
4. Mark as "Proposed" until team consensus
5. Update to "Accepted" after implementation
6. Link to implementation PR/commits

## Questions?

For questions about ADRs or architectural decisions, contact the development team or refer to:
- [Developer Guide](../developer-guide/architecture.md)
- [System Overview](../system-overview/how-it-works.md)
- [Contributing Guidelines](../developer-guide/contributing.md)
