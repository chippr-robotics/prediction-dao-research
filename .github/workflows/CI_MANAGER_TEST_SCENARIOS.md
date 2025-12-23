# CI Manager Test Scenarios

This document provides example scenarios demonstrating how the CI Manager intelligently selects tests based on code changes.

## Test Scenario 1: Smart Contract Changes Only

### Changed Files
```
contracts/ProposalRegistry.sol
test/ProposalRegistry.test.js
```

### Expected Behavior
- ✅ **Smart Contract Tests**: Will run
- ⏭️ **Frontend Tests**: Skipped (no frontend changes)
- ⏭️ **Documentation Build**: Skipped (no doc changes)
- ✅ **Security Analysis**: Will run (security-sensitive files changed)

### Validation Command
```bash
# To test this scenario, make changes to contracts and run:
git checkout -b test/contract-only-changes
echo "// Test change" >> contracts/ProposalRegistry.sol
git add contracts/ProposalRegistry.sol
git commit -m "test: contract-only change"
git push origin test/contract-only-changes
# Then create a PR and observe CI Manager behavior
```

### Expected Time Savings
Approximately 5-10 minutes by skipping frontend and documentation builds.

---

## Test Scenario 2: Frontend Changes Only

### Changed Files
```
frontend/src/components/MarketCard.jsx
frontend/src/styles/market.css
```

### Expected Behavior
- ⏭️ **Smart Contract Tests**: Skipped (no contract changes)
- ✅ **Frontend Tests**: Will run
- ⏭️ **Documentation Build**: Skipped (no doc changes)
- ⏭️ **Security Analysis**: Skipped (no security-sensitive changes)

### Validation Command
```bash
# To test this scenario:
git checkout -b test/frontend-only-changes
echo "/* Test change */" >> frontend/src/styles/market.css
git add frontend/src/styles/market.css
git commit -m "test: frontend-only change"
git push origin test/frontend-only-changes
# Then create a PR and observe CI Manager behavior
```

### Expected Time Savings
Approximately 10-15 minutes by skipping contract tests and security analysis.

---

## Test Scenario 3: Documentation Changes Only

### Changed Files
```
docs/user-guide/getting-started.md
README.md
```

### Expected Behavior
- ⏭️ **Smart Contract Tests**: Skipped (no contract changes)
- ⏭️ **Frontend Tests**: Skipped (no frontend changes)
- ✅ **Documentation Build**: Will run
- ⏭️ **Security Analysis**: Skipped (no security-sensitive changes)

### Validation Command
```bash
# To test this scenario:
git checkout -b test/docs-only-changes
echo "## Test section" >> docs/user-guide/getting-started.md
git add docs/user-guide/getting-started.md
git commit -m "docs: documentation update"
git push origin test/docs-only-changes
# Then create a PR and observe CI Manager behavior
```

### Expected Time Savings
Approximately 15-20 minutes by skipping all test suites - MAXIMUM savings!

---

## Test Scenario 4: Multi-Component Changes

### Changed Files
```
contracts/ConditionalMarketFactory.sol
frontend/src/hooks/useMarket.js
docs/reference/market-api.md
```

### Expected Behavior
- ✅ **Smart Contract Tests**: Will run
- ✅ **Frontend Tests**: Will run
- ✅ **Documentation Build**: Will run
- ✅ **Security Analysis**: Will run

### Validation Command
```bash
# To test this scenario:
git checkout -b test/multi-component-changes
echo "// Test change" >> contracts/ConditionalMarketFactory.sol
echo "// Test change" >> frontend/src/hooks/useMarket.js
echo "## Test section" >> docs/reference/market-api.md
git add contracts/ frontend/ docs/
git commit -m "feat: multi-component update"
git push origin test/multi-component-changes
# Then create a PR and observe CI Manager behavior
```

### Expected Time Savings
Minimal or none - all components changed, all tests needed. This is correct behavior!

---

## Test Scenario 5: Core Dependency Update

### Changed Files
```
package.json
package-lock.json
```

### Expected Behavior
- ✅ **Smart Contract Tests**: Will run (contracts use npm packages)
- ✅ **Frontend Tests**: Will run (frontend uses npm packages)
- ⏭️ **Documentation Build**: Skipped (docs use Python packages)
- ⏭️ **Security Analysis**: Skipped (unless on main branch)

### Validation Command
```bash
# To test this scenario:
git checkout -b test/dependency-update
npm install --save-dev chai@latest
git add package.json package-lock.json
git commit -m "chore: update chai dependency"
git push origin test/dependency-update
# Then create a PR and observe CI Manager behavior
```

### Expected Time Savings
Approximately 2-5 minutes by skipping documentation build.

---

## Test Scenario 6: Workflow Changes

### Changed Files
```
.github/workflows/ci-manager.yml
```

### Expected Behavior
- ✅ **Smart Contract Tests**: Will run (core infrastructure changed)
- ✅ **Frontend Tests**: Will run (core infrastructure changed)
- ⏭️ **Documentation Build**: Skipped (no doc changes)
- ⏭️ **Security Analysis**: Skipped (unless on main branch)

### Rationale
When CI workflows change, we run code tests to ensure the workflow changes don't break testing infrastructure.

### Validation Command
```bash
# To test this scenario:
git checkout -b test/workflow-changes
echo "# Comment" >> .github/workflows/ci-manager.yml
git add .github/workflows/ci-manager.yml
git commit -m "ci: update workflow"
git push origin test/workflow-changes
# Then create a PR and observe CI Manager behavior
```

### Expected Time Savings
Approximately 2-5 minutes by skipping documentation build.

---

## Test Scenario 7: Security Config Changes

### Changed Files
```
slither.config.json
medusa.json
```

### Expected Behavior
- ✅ **Smart Contract Tests**: Will run
- ⏭️ **Frontend Tests**: Skipped
- ⏭️ **Documentation Build**: Skipped
- ✅ **Security Analysis**: Will run

### Validation Command
```bash
# To test this scenario:
git checkout -b test/security-config-changes
echo "{}" >> slither.config.json
git add slither.config.json
git commit -m "chore: update security config"
git push origin test/security-config-changes
# Then create a PR and observe CI Manager behavior
```

### Expected Time Savings
Approximately 5-10 minutes by skipping frontend and documentation.

---

## Test Scenario 8: Test File Changes Only

### Changed Files
```
test/OracleResolver.test.js
test/integration/clearpath/end-to-end.test.js
```

### Expected Behavior
- ✅ **Smart Contract Tests**: Will run
- ⏭️ **Frontend Tests**: Skipped
- ⏭️ **Documentation Build**: Skipped
- ✅ **Security Analysis**: Will run (tests affect behavior)

### Rationale
Test changes could affect contract behavior verification, so both contract tests and security analysis run.

### Validation Command
```bash
# To test this scenario:
git checkout -b test/test-changes-only
echo "// New test case" >> test/OracleResolver.test.js
git add test/OracleResolver.test.js
git commit -m "test: add new test case"
git push origin test/test-changes-only
# Then create a PR and observe CI Manager behavior
```

### Expected Time Savings
Approximately 5-10 minutes by skipping frontend and documentation.

---

## Test Scenario 9: Mixed Code and Documentation

### Changed Files
```
contracts/FutarchyGovernor.sol
docs/reference/governance.md
```

### Expected Behavior
- ✅ **Smart Contract Tests**: Will run
- ⏭️ **Frontend Tests**: Skipped
- ✅ **Documentation Build**: Will run
- ✅ **Security Analysis**: Will run

### Validation Command
```bash
# To test this scenario:
git checkout -b test/code-and-docs
echo "// Update" >> contracts/FutarchyGovernor.sol
echo "## Update" >> docs/reference/governance.md
git add contracts/FutarchyGovernor.sol docs/reference/governance.md
git commit -m "feat: update governance with docs"
git push origin test/code-and-docs
# Then create a PR and observe CI Manager behavior
```

### Expected Time Savings
Approximately 5-10 minutes by skipping frontend tests.

---

## Test Scenario 10: README Only (Special Case)

### Changed Files
```
README.md
```

### Expected Behavior
- ⏭️ **Smart Contract Tests**: Skipped
- ⏭️ **Frontend Tests**: Skipped
- ✅ **Documentation Build**: Will run (README changes trigger docs)
- ⏭️ **Security Analysis**: Skipped

### Note
Root-level markdown files (like README.md) are considered documentation and trigger doc builds but not code tests.

### Validation Command
```bash
# To test this scenario:
git checkout -b test/readme-only
echo "## New section" >> README.md
git add README.md
git commit -m "docs: update README"
git push origin test/readme-only
# Then create a PR and observe CI Manager behavior
```

### Expected Time Savings
Approximately 15-20 minutes by skipping all test suites - same as docs-only!

---

## Automated Testing Script

You can use this script to test multiple scenarios automatically:

```bash
#!/bin/bash
# test-ci-manager.sh - Automated CI Manager testing

scenarios=(
  "contracts:contracts/ProposalRegistry.sol"
  "frontend:frontend/src/App.jsx"
  "docs:docs/index.md"
  "multi:contracts/OracleResolver.sol,frontend/src/hooks/useOracle.js"
  "deps:package.json"
)

for scenario in "${scenarios[@]}"; do
  name="${scenario%%:*}"
  files="${scenario#*:}"
  
  echo "Testing scenario: $name"
  git checkout -b "test/ci-manager-$name"
  
  IFS=',' read -ra FILEARRAY <<< "$files"
  for file in "${FILEARRAY[@]}"; do
    echo "// Test change $(date)" >> "$file"
    git add "$file"
  done
  
  git commit -m "test: CI manager scenario $name"
  git push origin "test/ci-manager-$name"
  
  echo "Create PR for branch: test/ci-manager-$name"
  echo "---"
done
```

---

## Verification Checklist

After creating a test PR, verify:

- [ ] Change Detection Summary appears in workflow
- [ ] Correct components are marked as changed
- [ ] Only expected jobs are executed
- [ ] Skipped jobs show clear skip reasons
- [ ] CI Summary table shows correct results
- [ ] Time savings are realized
- [ ] No unexpected failures

---

## Common Patterns

### Pattern 1: Independent Components
Changes to independent components run only their tests:
- Contract-only → Contract tests only
- Frontend-only → Frontend tests only  
- Docs-only → Docs build only

### Pattern 2: Cascading Tests
Some changes trigger multiple test suites:
- Contract changes → Contract tests + Security
- Test changes → Contract tests + Security
- Core deps → Contract tests + Frontend tests

### Pattern 3: Branch-Specific
Some tests always run on specific branches:
- Main branch → Always runs security analysis
- Develop branch → Normal change detection

---

## Expected Outcomes Summary

| Scenario | Contract Tests | Frontend Tests | Docs Build | Security | Time Saved |
|----------|---------------|----------------|------------|----------|------------|
| 1. Contracts only | ✅ | ⏭️ | ⏭️ | ✅ | 5-10 min |
| 2. Frontend only | ⏭️ | ✅ | ⏭️ | ⏭️ | 10-15 min |
| 3. Docs only | ⏭️ | ⏭️ | ✅ | ⏭️ | 15-20 min |
| 4. Multi-component | ✅ | ✅ | ✅ | ✅ | Minimal |
| 5. Dependencies | ✅ | ✅ | ⏭️ | ⏭️ | 2-5 min |
| 6. Workflows | ✅ | ✅ | ⏭️ | ⏭️ | 2-5 min |
| 7. Security config | ✅ | ⏭️ | ⏭️ | ✅ | 5-10 min |
| 8. Tests only | ✅ | ⏭️ | ⏭️ | ✅ | 5-10 min |
| 9. Code + Docs | ✅ | ⏭️ | ✅ | ✅ | 5-10 min |
| 10. README only | ⏭️ | ⏭️ | ✅ | ⏭️ | 15-20 min |

---

## Notes

- All scenarios assume PR to `develop` branch (not `main`)
- Security analysis always runs on `main` branch regardless of changes
- Time savings are approximate and depend on test duration
- Use these scenarios to verify CI Manager is working correctly
- Create actual PRs to see real behavior in GitHub Actions UI
