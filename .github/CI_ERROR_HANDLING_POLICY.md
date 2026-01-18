# CI/CD Error Handling Policy

## Overview
This document defines the error handling and failure propagation policies for our CI/CD pipeline to ensure code quality and prevent silent failures.

## Core Principles

### 1. Fail Loudly on Code Quality Issues
All linting, testing, and build steps MUST fail the CI pipeline when errors occur. This includes:
- ESLint errors and warnings
- Test suite failures
- Build failures
- Type checking errors

**Never use `continue-on-error: true` on these steps.**

### 2. Graceful Degradation for Auxiliary Operations
Some operations are supplementary and should not block the pipeline:
- Coverage report generation (can fail due to environment issues)
- Optional security scans
- Documentation generation

**These may use `continue-on-error: true` but MUST include documentation explaining why.**

## Workflow-Specific Guidelines

### test.yml
- **Smart Contract Tests**: Must fail on any test failure
- **Frontend Linting**: Must fail on ESLint errors (no continue-on-error)
- **Frontend Tests**: Must fail on any test failure
- **Frontend Build**: Must fail on build errors
- **Coverage Reports**: May continue on error (auxiliary operation)

### frontend-testing.yml
- **Unit/Integration Tests**: Must fail on test failures
- **Lighthouse Audit**: Must fail if accessibility standards not met
- **axe Accessibility Audit**: Must fail on WCAG AA violations
- **Coverage Reports**: May continue on error (auxiliary operation)

### security-testing.yml
- **Security Scans**: Should fail on critical vulnerabilities
- **Coverage Reports**: May continue on error (auxiliary operation)

## ESLint Configuration

### Current State
The frontend currently has ESLint configured with strict rules in `frontend/eslint.config.js`:
- Unused variables must match pattern `/^[A-Z_]/u` or cause errors
- React Hooks rules are enforced
- React Refresh rules are applied

### Error vs Warning
- **Errors**: Block the build immediately
- **Warnings**: Should be addressed but don't block the build

The CI pipeline should **fail on ESLint errors** but may continue with warnings (though warnings should be minimized).

## Testing Configuration

### Vitest (Frontend)
Configuration in `frontend/vite.config.js`:
- Tests must pass for CI to succeed
- Coverage generation is auxiliary and may fail without blocking

### Hardhat (Smart Contracts)
- All contract tests must pass
- Gas reports are informational only

## When to Use continue-on-error

Only use `continue-on-error: true` when:
1. The step is auxiliary (e.g., coverage report generation)
2. The failure doesn't indicate code quality issues
3. You document the reason with an inline comment
4. The step is followed by conditional artifact upload

### Example (Acceptable)
```yaml
# Coverage report generation can fail due to environment issues without indicating
# actual test failures. We allow this to fail gracefully while still uploading
# whatever coverage data was generated.
- name: Generate coverage report
  run: npm run test:coverage
  continue-on-error: true
```

### Example (Not Acceptable)
```yaml
- name: Run linter
  run: npm run lint
  continue-on-error: true  # WRONG: Hides code quality issues
```

## Enforcement

### Code Review
- PRs that add `continue-on-error` without documentation will be rejected
- PRs that hide test or lint failures will be rejected

### Monitoring
- Review CI logs regularly for patterns of failures
- Address warnings before they become errors
- Keep the main branch in a passing state

## Remediation Process

If you need to add `continue-on-error` to a previously failing step:
1. Document why the step is failing
2. Create an issue to fix the underlying problem
3. Add the flag with documentation referencing the issue
4. Set a timeline for removing the flag

## Updates
This policy should be reviewed quarterly and updated as the project evolves.

**Last Updated**: 2026-01-18  
**Next Review**: 2026-04-18
