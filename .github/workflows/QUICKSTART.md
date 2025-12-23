# GitHub Action Manager - Quick Start Guide

## What is the CI Manager?

The CI Manager is an intelligent GitHub Actions workflow that automatically detects which parts of your codebase have changed and runs only the necessary tests. This saves time and CI resources by avoiding unnecessary test execution.

## How to Use

### Automatic Usage

The CI Manager runs automatically on:
- Every pull request to `main` or `develop`
- Every push to `main` or `develop`

No configuration needed - just create your PR and watch it work!

### What Happens

1. **Change Detection**: The CI Manager analyzes which files changed
2. **Smart Selection**: It determines which test suites are needed
3. **Conditional Execution**: Only necessary tests run
4. **Clear Reporting**: You get a summary of what ran and why

## Example

If you only change frontend code:
- ✅ Frontend tests run
- ⏭️ Contract tests skipped
- ⏭️ Documentation build skipped
- ⏭️ Security analysis skipped

**Result**: Faster feedback and lower CI costs!

## Quick Reference

| Change Type | Tests Run | Typical Time Saved |
|------------|-----------|-------------------|
| Contracts only | Contract + Security | 5-10 minutes |
| Frontend only | Frontend | 10-15 minutes |
| Docs only | Documentation | 15-20 minutes ⭐ |
| Multiple components | All relevant | Varies |

## Viewing Results

In your PR:
1. Go to the "Actions" tab
2. Click on "CI Manager - Smart Test Selection"
3. View the "Change Detection Summary" for what was detected
4. View the "CI Summary" for final results

## Component Categories

The CI Manager tracks these components:

- **Contracts**: Smart contracts, tests, Hardhat config
- **Frontend**: React app, components, styles
- **Docs**: MkDocs documentation, markdown files
- **Security**: Security testing configurations
- **Core**: Package dependencies, workflow files

## Need More Info?

- **Full Documentation**: See [README.md](.github/workflows/README.md)
- **Test Scenarios**: See [CI_MANAGER_TEST_SCENARIOS.md](.github/workflows/CI_MANAGER_TEST_SCENARIOS.md)
- **Configuration**: See [ci-config.yml](.github/workflows/ci-config.yml)

## Troubleshooting

**Issue**: Expected tests didn't run
**Fix**: Check the "Change Detection Summary" - verify your files match the path patterns

**Issue**: Too many tests running  
**Fix**: This might be correct if you changed core dependencies or multiple components

**Issue**: Want to force all tests
**Fix**: Push directly to `main` branch or use "Run workflow" manually

## Benefits

- ⚡ Faster CI feedback
- 💰 Lower CI costs
- 🎯 Only run relevant tests
- 📊 Clear visibility into what runs
- 🔧 Easy to maintain and extend

---

**Version**: 1.0  
**Last Updated**: 2025-12-23
