# GitHub Actions Test Pipeline

This repository includes an automated test pipeline that runs on every pull request to ensure code quality before merging.

## What Gets Tested

The test pipeline (`test.yml`) includes three main jobs:

1. **Smart Contract Tests** - Runs Hardhat tests for all smart contracts
   - Compiles Solidity contracts
   - Executes test suite
   - Generates code coverage report
   - **Status**: Required ✅ (PR cannot merge if this fails)

2. **Frontend Lint** - Checks frontend code quality
   - Runs ESLint on React/JavaScript code
   - **Status**: Required ✅ (PR cannot merge if this fails - errors indicate code quality issues)

3. **Frontend Build** - Verifies frontend builds successfully
   - Builds the Vite/React application
   - Ensures no build-time errors
   - **Status**: Required ✅ (PR cannot merge if this fails)

## Enabling Branch Protection

To require tests to pass before merging PRs, follow these steps:

### For Repository Administrators

1. Go to your repository on GitHub
2. Click on **Settings** → **Branches**
3. Under "Branch protection rules", click **Add rule** or edit an existing rule
4. For "Branch name pattern", enter: `main` (or `develop` for development branch)
5. Enable the following options:
   - ☑️ **Require a pull request before merging**
   - ☑️ **Require status checks to pass before merging**
   - ☑️ **Require branches to be up to date before merging**
6. In the status checks search box, select:
   - `Smart Contract Tests`
   - `Frontend Lint`
   - `Frontend Build`
7. Additional recommended settings:
   - ☑️ **Do not allow bypassing the above settings**
   - ☑️ **Require linear history** (optional, keeps commit history clean)
8. Click **Create** or **Save changes**

### What This Means for Contributors

- All pull requests must pass the test pipeline before they can be merged
- If tests fail, you'll see a red ❌ next to your PR
- You can click on "Details" to see which tests failed and why
- Push new commits to your branch to trigger the tests again
- Once all required checks pass, your PR will show a green ✅ and can be merged

## Running Tests Locally

Before pushing your code, you can run tests locally:

```bash
# Install dependencies
npm install

# Run smart contract tests
npm test

# Run tests with coverage
npm run test:coverage

# Compile contracts
npm run compile

# Frontend linting
cd frontend
npm install
npm run lint

# Frontend build
npm run build
```

## Continuous Integration Features

- **Automated Testing**: Tests run automatically on every push to a PR
- **Build Caching**: Node.js dependencies are cached to speed up workflows
- **Coverage Reports**: Code coverage artifacts are saved for 30 days
- **Build Artifacts**: Frontend builds are saved for 7 days
- **Manual Trigger**: Workflows can be run manually via GitHub Actions UI

## Workflow Triggers

The test pipeline runs on:
- Pull requests to `main` or `develop` branches
- Direct pushes to `main` or `develop` branches
- Manual workflow dispatch (Actions tab → Test Pipeline → Run workflow)

## Troubleshooting

### Tests Pass Locally But Fail in CI

- Ensure your local Node.js version matches the CI (Node.js 20)
- Check that all dependencies are properly listed in `package.json`
- Look for environment-specific issues in the workflow logs

### Cannot Merge PR

- Check the status checks at the bottom of your PR
- Click "Details" on any failing check to see the error logs
- Fix the issues and push new commits to re-run tests

### Need to Force Merge

If you have administrator access and need to bypass checks in an emergency:
1. Temporarily disable branch protection
2. Merge the PR
3. Re-enable branch protection
4. **Important**: Create a follow-up PR to fix the issues that caused the test failures

## CI/CD Error Handling Policy

We maintain strict policies about error handling in our CI/CD pipeline to prevent silent failures and maintain code quality. See **[CI_ERROR_HANDLING_POLICY.md](./CI_ERROR_HANDLING_POLICY.md)** for detailed guidelines.

### Key Principles

1. **Fail Loudly on Code Quality Issues**: Linting, testing, and build steps MUST fail the CI pipeline when errors occur
2. **Never Hide Failures**: Do not use `continue-on-error: true` on quality checks (linting, tests, builds)
3. **Document Exceptions**: If a step must use `continue-on-error`, it must include inline documentation explaining why

### Acceptable vs Unacceptable Error Handling

✅ **Acceptable**: Coverage report generation may fail without blocking (auxiliary operation)
```yaml
# Coverage generation can fail due to environment issues
- name: Generate coverage report
  run: npm run test:coverage
  continue-on-error: true
```

❌ **Not Acceptable**: Hiding linting or test failures
```yaml
- name: Run linter
  run: npm run lint
  continue-on-error: true  # WRONG: Hides code quality issues
```

For complete guidelines, see **[CI_ERROR_HANDLING_POLICY.md](./CI_ERROR_HANDLING_POLICY.md)**.

## Support

For issues with the test pipeline:
1. Check the workflow logs in the GitHub Actions tab
2. Review this documentation
3. Open an issue in the repository if problems persist
