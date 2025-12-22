# CI/CD Configuration

This page documents the GitHub Actions workflow configuration for automated security testing and how to maintain it.

## Workflow Overview

The security testing workflow (`security-testing.yml`) orchestrates all automated testing:

**Location:** `.github/workflows/security-testing.yml`

### Workflow Triggers

The workflow runs on:

- **Pull Requests** to `main` or `develop` branches
- **Direct Pushes** to `main` or `develop` branches  
- **Weekly Schedule**: Mondays at 00:00 UTC
- **Manual Dispatch**: Via GitHub Actions UI

```yaml
on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]
  schedule:
    - cron: '0 0 * * 1'
  workflow_dispatch:
```

## Workflow Jobs

### 1. Hardhat Unit Tests & Gas Report

**Purpose:** Run all unit tests with detailed gas usage reporting

```yaml
hardhat-tests:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
    - run: npm ci
    - run: npm run compile
    - env:
        REPORT_GAS: true
      run: npm test
    - uses: actions/upload-artifact@v4
      with:
        name: gas-report
        path: gas-report.txt
```

**Outputs:**
- Test results in workflow log
- Gas report artifact (`gas-report.txt`)

### 2. Coverage Analysis

**Purpose:** Generate code coverage metrics

```yaml
coverage-report:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - run: npm ci
    - run: npm run test:coverage
    - uses: actions/upload-artifact@v4
      with:
        name: coverage-report
        path: coverage/
```

**Outputs:**
- HTML coverage report
- Coverage metrics (lines, branches, statements)

### 3. Slither Static Analysis

**Purpose:** Detect vulnerabilities and code quality issues

```yaml
slither-analysis:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - uses: actions/setup-python@v5
      with:
        python-version: '3.11'
    - run: pip install slither-analyzer solc-select
    - run: solc-select install 0.8.24 && solc-select use 0.8.24
    - run: slither . --config-file slither.config.json || true
    - uses: actions/upload-artifact@v4
      with:
        name: slither-reports
        path: |
          slither-report.json
          slither-report.md
```

**Outputs:**
- JSON report (`slither-report.json`)
- Markdown report (`slither-report.md`)

### 4. Manticore Symbolic Execution

**Purpose:** Explore all execution paths for vulnerabilities

```yaml
manticore-analysis:
  runs-on: ubuntu-latest
  timeout-minutes: 30
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-python@v5
    - run: pip install manticore[native] solc-select
    - run: solc-select install 0.8.24 && solc-select use 0.8.24
    - run: |
        manticore contracts/ProposalRegistry.sol \
          --contract ProposalRegistry \
          --timeout 300 \
          --quick-mode || true
    - run: |
        mkdir -p manticore-results
        find . -name "mcore_*" -exec cp -r {} manticore-results/ \;
    - uses: actions/upload-artifact@v4
      with:
        name: manticore-results
        path: manticore-results/
```

**Outputs:**
- Execution path analysis
- Test cases for each path
- Vulnerability reports

### 5. Medusa Fuzz Testing

**Purpose:** Test invariants with random inputs

```yaml
medusa-fuzzing:
  runs-on: ubuntu-latest
  timeout-minutes: 30
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-go@v5
      with:
        go-version: '1.21'
    - run: go install github.com/crytic/medusa@latest
    - run: medusa fuzz --timeout 300 || true
    - run: |
        mkdir -p medusa-results
        cp -r medusa-corpus medusa-results/
    - uses: actions/upload-artifact@v4
      with:
        name: medusa-results
        path: medusa-results/
```

**Outputs:**
- Property test results
- Corpus of interesting test cases
- Coverage metrics

### 6. Summary Generation

**Purpose:** Aggregate all results into a comprehensive summary

```yaml
summary:
  needs: [hardhat-tests, coverage-report, slither-analysis, 
          manticore-analysis, medusa-fuzzing]
  runs-on: ubuntu-latest
  if: always()
  steps:
    - uses: actions/download-artifact@v4
    - run: |
        echo "# Security Testing Summary" >> $GITHUB_STEP_SUMMARY
        # ... generate summary from artifacts
```

**Outputs:**
- Markdown summary in GitHub Actions UI
- Links to all artifacts

## Tool Versions

| Tool | Version | Update Command |
|------|---------|----------------|
| Node.js | 20.x | Update `actions/setup-node` |
| Python | 3.11 | Update `actions/setup-python` |
| Go | 1.21 | Update `actions/setup-go` |
| Hardhat | 2.22.0 | `npm update hardhat` |
| Slither | latest | `pip install --upgrade slither-analyzer` |
| Manticore | latest | `pip install --upgrade manticore[native]` |
| Medusa | latest | `go install github.com/crytic/medusa@latest` |

## Updating the Workflow

### Changing Node.js Version

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '22'  # Update version here
```

### Changing Python Version

```yaml
- uses: actions/setup-python@v5
  with:
    python-version: '3.12'  # Update version here
```

### Adding New Contracts to Analysis

Update `medusa.json`:

```json
{
  "fuzzing": {
    "targetContracts": [
      "ProposalRegistryFuzzTest",
      "WelfareMetricRegistryFuzzTest",
      "NewContractFuzzTest"  // Add here
    ]
  }
}
```

Update workflow for Manticore:

```yaml
- name: Run Manticore on NewContract
  run: |
    manticore contracts/NewContract.sol \
      --contract NewContract \
      --timeout 300 \
      --quick-mode || true
```

### Adjusting Timeouts

For longer-running analyses:

```yaml
timeout-minutes: 60  # Increase from 30
```

Or for individual tools:

```bash
manticore ... --timeout 600  # Increase from 300
medusa fuzz --timeout 600    # Increase from 300
```

## Artifacts

### Retention Policy

All artifacts are retained for **30 days**:

```yaml
- uses: actions/upload-artifact@v4
  with:
    retention-days: 30
```

### Downloading Artifacts

From GitHub UI:
1. Navigate to workflow run
2. Scroll to "Artifacts" section
3. Click artifact name to download

From CLI:
```bash
gh run download <run-id> --name gas-report
```

### Artifact Contents

| Artifact | Contents |
|----------|----------|
| `gas-report` | `gas-report.txt` with gas usage metrics |
| `coverage-report` | HTML coverage reports and metrics |
| `slither-reports` | JSON and Markdown analysis results |
| `manticore-results` | Execution paths and test cases |
| `medusa-results` | Corpus and property test results |

## Permissions

The workflow requires these permissions:

```yaml
permissions:
  contents: read        # Read repository contents
  security-events: write  # Write security findings (future use)
```

## Failure Handling

### Continue on Error

Some jobs use `|| true` to prevent failures from blocking the workflow:

```bash
slither . --config-file slither.config.json || true
```

This allows:
- Slither to report findings without failing the build
- Other jobs to continue even if one fails
- Results to be collected for all tools

### Required vs Optional

**Required jobs** (block merge if failed):
- Unit tests (`hardhat-tests`)
- Compilation

**Optional jobs** (informational):
- Static analysis
- Symbolic execution
- Fuzz testing

To make a job required, remove `|| true` and configure branch protection.

## Branch Protection

### Recommended Settings

Configure branch protection for `main`:

1. Navigate to **Settings** → **Branches**
2. Add rule for `main` branch
3. Enable:
   - ☑️ Require pull request before merging
   - ☑️ Require status checks to pass
   - ☑️ Select: `hardhat-tests`
4. Save changes

This ensures all unit tests pass before merging.

## Troubleshooting

### Workflow Not Triggering

**Check:**
- Workflow file is in `.github/workflows/`
- YAML syntax is valid
- Branch names match trigger configuration
- Repository Actions are enabled

**Solution:**
```bash
# Validate YAML locally
python -c "import yaml; yaml.safe_load(open('.github/workflows/security-testing.yml'))"
```

### Job Timeout

**Symptoms:**
- Job exceeds `timeout-minutes`
- Analysis incomplete

**Solutions:**
- Increase timeout: `timeout-minutes: 60`
- Use quick mode: `--quick-mode`
- Reduce analysis scope
- Split into multiple jobs

### Artifact Upload Fails

**Symptoms:**
- "No files found" error
- Missing artifacts

**Solutions:**
- Check file paths are correct
- Ensure files are generated before upload
- Use `if: always()` to upload on failure

### Dependency Installation Fails

**Symptoms:**
- `pip install` or `npm install` fails
- Version conflicts

**Solutions:**
- Pin specific versions
- Use `npm ci` instead of `npm install`
- Clear cache: add `cache: ''` to setup actions

## Monitoring

### Viewing Results

**In GitHub UI:**
1. Navigate to **Actions** tab
2. Select workflow run
3. View job logs and artifacts

**Key Metrics:**
- Test pass rate
- Coverage percentage
- Security issues found
- Analysis execution time

### Notifications

Configure notifications for workflow failures:

1. **Settings** → **Notifications**
2. Enable "Actions" notifications
3. Choose notification method (email, web, mobile)

### Workflow Insights

View trends over time:

1. **Actions** tab → **Workflows**
2. Select "Security Testing & Analysis"
3. View run history and metrics

## Cost Optimization

### Reducing CI Minutes

**Strategies:**
- Cache dependencies:
  ```yaml
  - uses: actions/setup-node@v4
    with:
      cache: 'npm'
  ```
- Run expensive jobs only on specific branches
- Use matrix builds efficiently
- Schedule weekly runs instead of daily

### Resource Limits

Set appropriate timeouts:
```yaml
timeout-minutes: 30  # Prevent runaway jobs
```

Use resource-efficient modes:
```bash
manticore --quick-mode  # Faster analysis
medusa --workers 5      # Fewer parallel workers
```

## Maintenance Schedule

### Weekly
- Review workflow run results
- Check for new security findings
- Download and archive important artifacts

### Monthly
- Update tool versions
- Review and optimize timeouts
- Clean up old workflow runs

### Quarterly
- Update Node.js/Python versions
- Review and update documentation
- Audit security findings

## Related Documentation

- [Unit Testing](unit-testing.md)
- [Static Analysis](static-analysis.md)
- [Symbolic Execution](symbolic-execution.md)
- [Fuzz Testing](fuzz-testing.md)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
