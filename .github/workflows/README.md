# GitHub Actions CI Manager

## Overview

The CI Manager is an intelligent workflow orchestrator that automatically detects which components of the codebase have changed and runs only the necessary test suites. This optimizes CI resources and reduces build times by avoiding unnecessary test execution.

## Architecture

The CI Manager consists of:

1. **ci-manager.yml** - Main orchestration workflow
2. **ci-config.yml** - Configuration file defining path patterns (located in `.github/` directory)
3. **Modified workflows** - test.yml and security-testing.yml support `workflow_call`

## How It Works

### Change Detection

The CI Manager uses the [dorny/paths-filter](https://github.com/dorny/paths-filter) action to analyze changed files in PRs and commits. It categorizes changes into:

- **Contracts**: Smart contract code, tests, and configuration
- **Frontend**: Frontend application code
- **Docs**: Documentation files
- **Security**: Security-sensitive files
- **Core**: Core dependencies and workflow files

### Conditional Execution

Based on detected changes, the CI Manager conditionally triggers:

1. **Smart Contract Tests** - Runs when contracts, tests, or core dependencies change
2. **Frontend Tests** - Runs when frontend code or core dependencies change
3. **Documentation Build** - Runs when documentation files change
4. **Security Analysis** - Runs on main branch or when security-relevant files change

### Workflow Integration

The CI Manager calls reusable workflows using `workflow_call`:
- Calls `test.yml` for smart contract tests
- Calls `security-testing.yml` for security analysis
- Inline jobs for frontend and docs (lighter workloads)

## Configuration

### Path Patterns (.github/ci-config.yml)

The `.github/ci-config.yml` file defines glob patterns for each component:

```yaml
components:
  contracts:
    patterns:
      - "contracts/**"
      - "hardhat.config.js"
      - "scripts/deploy*.js"
      - "test/*.test.js"
      
  frontend:
    patterns:
      - "frontend/**"
      - "!frontend/README.md"
```

### Adding New Categories

To add a new component category:

1. **Update .github/ci-config.yml**:
   ```yaml
   components:
     new-component:
       description: "Description of component"
       patterns:
         - "path/to/component/**"
   ```

2. **Update ci-manager.yml** - Add to filters:
   ```yaml
   - name: Detect changed files
     uses: dorny/paths-filter@v3
     id: filter
     with:
       filters: |
         new-component:
           - 'path/to/component/**'
   ```

3. **Add output mapping**:
   ```yaml
   outputs:
     new-component: ${{ steps.filter.outputs.new-component }}
   ```

4. **Create conditional job**:
   ```yaml
   new-component-tests:
     name: New Component Tests
     needs: detect-changes
     if: needs.detect-changes.outputs.new-component == 'true'
     runs-on: ubuntu-latest
     steps:
       # Add test steps here
   ```

5. **Update CI summary job** to include the new component in reporting.

## Usage

### Automatic Triggering

The CI Manager runs automatically on:
- Pull requests to `main` or `develop` branches
- Pushes to `main` or `develop` branches
- Manual workflow dispatch

### Manual Triggering

You can manually trigger the CI Manager from the GitHub Actions tab:
1. Go to Actions → CI Manager - Smart Test Selection
2. Click "Run workflow"
3. Select branch and click "Run workflow"

## Example Scenarios

### Scenario 1: Contract-Only Changes

**Changed files:**
- `contracts/ProposalRegistry.sol`
- `test/ProposalRegistry.test.js`

**Result:**
- ✅ Smart Contract Tests run
- ⏭️ Frontend Tests skipped
- ⏭️ Documentation Build skipped
- ✅ Security Analysis runs (contracts changed)

**Time saved:** ~5-10 minutes (frontend build + docs build)

### Scenario 2: Frontend-Only Changes

**Changed files:**
- `frontend/src/components/Header.jsx`
- `frontend/src/styles/main.css`

**Result:**
- ⏭️ Smart Contract Tests skipped
- ✅ Frontend Tests run
- ⏭️ Documentation Build skipped
- ⏭️ Security Analysis skipped

**Time saved:** ~10-15 minutes (contract tests + security analysis)

### Scenario 3: Documentation-Only Changes

**Changed files:**
- `docs/user-guide/getting-started.md`
- `README.md`

**Result:**
- ⏭️ Smart Contract Tests skipped
- ⏭️ Frontend Tests skipped
- ✅ Documentation Build runs
- ⏭️ Security Analysis skipped

**Time saved:** ~15-20 minutes (all test suites)

### Scenario 4: Multi-Component Changes

**Changed files:**
- `contracts/OracleResolver.sol`
- `frontend/src/hooks/useOracle.js`
- `docs/reference/oracle-api.md`

**Result:**
- ✅ Smart Contract Tests run
- ✅ Frontend Tests run
- ✅ Documentation Build runs
- ✅ Security Analysis runs

**Time saved:** None (all components changed, all tests needed)

### Scenario 5: Core Dependency Changes

**Changed files:**
- `package.json`
- `package-lock.json`

**Result:**
- ✅ Smart Contract Tests run (uses npm packages)
- ✅ Frontend Tests run (uses npm packages)
- ⏭️ Documentation Build skipped
- ⏭️ Security Analysis skipped (unless on main branch)

**Time saved:** ~2-5 minutes (docs build)

### Scenario 6: Workflow Changes

**Changed files:**
- `.github/workflows/ci-manager.yml`

**Result:**
- ✅ Smart Contract Tests run (core files changed)
- ✅ Frontend Tests run (core files changed)
- ⏭️ Documentation Build skipped
- ⏭️ Security Analysis skipped

**Rationale:** Workflow changes are treated as core changes to ensure CI integrity

## Benefits

### Resource Optimization

- **Reduced CI minutes**: Only run necessary tests
- **Faster feedback**: Developers get results sooner for focused changes
- **Lower costs**: Fewer compute resources consumed

### Developer Experience

- **Clear visibility**: Summary shows which tests run and why
- **Predictable behavior**: Consistent rules for test selection
- **Easy debugging**: Clear logs of what was detected and executed

### Maintainability

- **Centralized configuration**: All path patterns in one place
- **Easy extension**: Simple process to add new categories
- **Self-documenting**: Workflow generates detailed summaries

## Monitoring

### GitHub Actions UI

View the CI Manager execution in the Actions tab:
1. See which jobs ran and which were skipped
2. Review change detection summary
3. Check final CI summary table

### Job Summaries

The CI Manager generates two summaries:

1. **Change Detection Summary** (detect-changes job):
   - Lists which components changed
   - Shows which tests will run
   - Provides count of test suites to execute

2. **CI Summary** (ci-summary job):
   - Table with job results
   - Status indicators (Success/Skipped/Failed)
   - Reasons for each outcome

## Troubleshooting

### Issue: Tests not running when expected

**Solution:** Check path patterns in ci-manager.yml match your file changes.

Example: If you changed `scripts/custom-deploy.js` but contract tests didn't run, verify the pattern includes your file. The pattern `scripts/deploy*.js` only matches files starting with "deploy".

### Issue: Too many tests running

**Solution:** Refine path patterns to be more specific. Use exclusion patterns with `!` prefix.

Example: Exclude README changes from triggering tests:
```yaml
frontend:
  - 'frontend/**'
  - '!frontend/README.md'
```

### Issue: Security tests not running on PR

**Solution:** Security tests only run when security-relevant files change OR on the main branch. This is intentional to save resources while ensuring security before merge.

### Issue: Workflow call fails

**Solution:** Ensure called workflows (test.yml, security-testing.yml) have `workflow_call:` trigger. Check for syntax errors in workflow files.

## Best Practices

1. **Review path patterns regularly** - As codebase evolves, update patterns
2. **Test pattern changes** - Create test PRs to verify new patterns work
3. **Keep categories focused** - Don't create too many overlapping categories
4. **Document exceptions** - If a pattern seems unintuitive, add comments
5. **Monitor skipped tests** - Ensure important tests aren't skipped incorrectly

## Migration Guide

### For Existing Workflows

The CI Manager doesn't replace existing workflows - it orchestrates them:

- **test.yml** - Now callable by CI Manager, still runs independently
- **security-testing.yml** - Now callable by CI Manager, still runs independently
- **deploy-docs.yml** - Remains independent (deployment workflow)
- **deploy-contracts.yml** - Remains independent (deployment workflow)

### Gradual Adoption

You can gradually adopt the CI Manager:

1. **Phase 1**: Run CI Manager alongside existing workflows
2. **Phase 2**: Monitor and tune path patterns
3. **Phase 3**: Make CI Manager the primary workflow
4. **Phase 4**: Disable direct triggers on individual workflows (optional)

## Performance Impact

Expected time savings based on change type:

| Change Type | Time Saved | Resources Saved |
|------------|------------|-----------------|
| Docs only | 15-20 min | 80-90% |
| Frontend only | 10-15 min | 60-70% |
| Contracts only | 5-10 min | 40-50% |
| Core deps | 2-5 min | 20-30% |
| Multiple components | Minimal | <10% |

## Security Considerations

The CI Manager includes security-aware rules:

1. **Main branch**: Always runs security analysis
2. **Contract changes**: Triggers security analysis
3. **Test changes**: Triggers security analysis (tests affect contract behavior)
4. **Dependency changes**: Runs both contract and frontend tests

These rules ensure security isn't compromised for optimization.

## Future Enhancements

Potential improvements:

1. **Slack/Email notifications** - Alert when tests are skipped
2. **Dynamic timeout adjustment** - Shorter timeouts for smaller change sets
3. **Parallel execution optimization** - Smarter job dependencies
4. **Cache optimization** - Component-specific caching strategies
5. **Cost tracking** - Report CI cost savings per PR
6. **ML-based prediction** - Learn which tests typically fail together

## Support

For issues or questions:

1. Check this documentation
2. Review workflow run logs in GitHub Actions
3. Check path patterns in .github/ci-config.yml
4. Create an issue with the `ci-manager` label

## Version History

- **v1.0** (2025-12-23): Initial release
  - Path-based change detection
  - Conditional job execution
  - Smart contract, frontend, docs, and security components
  - Comprehensive summaries and reporting
