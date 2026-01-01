# Unused File Detection - Implementation Summary

## Overview

This document summarizes the implementation of an automated tool to detect unused front-end files in the prediction-dao-research project. The tool helps maintain code quality by identifying orphaned files and dependencies that can be safely removed.

## Implementation

### Tool Selection

After evaluating several options, we selected **`unimported`** (v1.31.1) for the following reasons:

1. **Industry Standard**: Widely used in the JavaScript/React ecosystem with 1M+ weekly downloads
2. **Comprehensive Analysis**: Detects unused files, dependencies, and unresolved imports
3. **Configurable**: Supports exclusion patterns for tests, configs, and tooling
4. **Active Maintenance**: Regularly updated with good community support
5. **No Build Required**: Works with source code directly, no need to build first

### Components Installed

1. **Tool Package**: `unimported` npm package (installed as dev dependency)
2. **Configuration File**: `.unimportedrc.json` with project-specific settings
3. **Detection Script**: `scripts/detect-unused-files.js` - automated report generator
4. **Documentation**: `scripts/README.md` - comprehensive usage guide
5. **npm Script**: `detect:unused` - convenience command to run the tool

### Configuration

The tool is configured to:

**Entry Point**: `src/main.jsx`

**Excluded Patterns**:
- Test files: `*.test.js`, `*.test.jsx`, `*.spec.js`, `*.cy.js`
- Test directories: `cypress/`, `src/test/`
- Configuration files: `vite.config.js`, `eslint.config.js`, etc.

**Excluded Dependencies** (build/test tools):
- Build tools: `vite`, `@vitejs/plugin-react`
- Testing: `vitest`, `cypress`, `@testing-library/*`, `jsdom`
- Linting: `eslint`, `globals`
- Other tooling: `axe-core`, `vitest-axe`, `start-server-and-test`

**Respects**: `.gitignore` patterns

## Current Findings

### Summary Statistics

As of the initial run:
- **Unimported Files**: 17
- **Unused Dependencies**: 1 (`html5-qrcode`)
- **Unresolved Imports**: 0

### Categorized Unused Files

#### Components (11 files)
1. `src/components/fairwins/HorizontalMarketScroller.jsx` - Horizontal scrolling market list
2. `src/components/fairwins/index.js` - Barrel export for FairWins components
3. `src/components/GovernanceModeSelector.jsx` - DAO governance mode selector
4. `src/components/MarketCreation.jsx` - Legacy market creation form
5. `src/components/MarketTrading.jsx` - Legacy market trading interface
6. `src/components/MyPositions.jsx` - Legacy positions display
7. `src/components/ProposalList.jsx` - Legacy proposal list component
8. `src/components/TraditionalVoting.jsx` - Traditional voting interface
9. `src/components/ui/QRScanner.jsx` - QR code scanner (only used in tests)
10. `src/components/ui/SettingsModal.jsx` - Settings modal (replaced by page)
11. `src/components/WelfareMetrics.jsx` - Welfare metrics display

#### IPFS/Metadata Related (5 files)
12. `src/utils/ipfsService.js` - IPFS service utilities (only used in tests)
13. `src/utils/metadataGenerator.js` - Metadata generation utilities (only used in tests)
14. `src/hooks/useIpfs.js` - IPFS React hooks (only used in tests)
15. `src/constants/ipfs.js` - IPFS constants
16. `src/ipfs.js` - IPFS configuration

#### Other (1 file)
17. `src/contexts/index.js` - Barrel export for contexts

### Unused Dependencies
- `html5-qrcode` - Used only by QRScanner component, which is only used in tests

## Analysis & Recommendations

### Category 1: Legacy Components Replaced by New Implementation

The following components appear to be legacy implementations that have been replaced:

- `MarketCreation.jsx`, `MarketTrading.jsx`, `MyPositions.jsx` - Replaced by newer modal/page implementations
- `ProposalList.jsx` - Replaced by newer proposal dashboard components
- `WelfareMetrics.jsx`, `TraditionalVoting.jsx`, `GovernanceModeSelector.jsx` - Old governance UI

**Recommendation**: These can be safely archived or removed after confirming no future use is planned.

### Category 2: Test-Only Code

These files are only used in test files:

- `QRScanner.jsx` and `html5-qrcode` dependency
- IPFS utilities: `ipfsService.js`, `metadataGenerator.js`, `useIpfs.js`

**Recommendation**: 
- Move to `src/test/` directory if they provide value for testing
- Or remove them if the tests can be simplified without them
- Consider the test coverage trade-offs

### Category 3: Barrel Exports

These index files re-export components that are no longer used:

- `src/components/fairwins/index.js`
- `src/contexts/index.js`

**Recommendation**: Remove if all exports are unused, or update to only export used components.

### Category 4: IPFS Infrastructure

Several IPFS-related files are unused in the main flow:

- `ipfs.js`, `constants/ipfs.js`
- Note: These may have been part of planned IPFS integration for metadata storage

**Recommendation**: Remove if IPFS integration is not planned. Keep if future integration is intended.

## Usage

### Running the Tool

```bash
# From the frontend directory
npm run detect:unused
```

This generates:
- Terminal output with summary statistics
- Detailed report at `UNUSED_FILES_REPORT.md`

### Manual Tool Usage

```bash
# Show all results
npx unimported

# Show only unused files
npx unimported --show-unused-files

# Show only unused dependencies
npx unimported --show-unused-deps
```

## CI Integration Recommendations

### Option 1: Informational Check (Recommended)

Add as a non-blocking check that generates an artifact:

```yaml
- name: Detect unused files
  working-directory: frontend
  run: npm run detect:unused
  continue-on-error: true

- name: Upload report
  uses: actions/upload-artifact@v3
  with:
    name: unused-files-report
    path: frontend/UNUSED_FILES_REPORT.md
```

### Option 2: Threshold-Based Check

Fail the build if unused files exceed a threshold:

```yaml
- name: Check unused files threshold
  working-directory: frontend
  run: |
    npm run detect:unused
    UNUSED_COUNT=$(grep "Unimported Files:" UNUSED_FILES_REPORT.md | grep -o '[0-9]*')
    if [ "$UNUSED_COUNT" -gt 20 ]; then
      echo "Error: Too many unused files ($UNUSED_COUNT > 20)"
      exit 1
    fi
```

### Option 3: Monthly Audit

Schedule a monthly job to review and report:

```yaml
on:
  schedule:
    - cron: '0 0 1 * *'  # First day of month

jobs:
  audit:
    steps:
      - name: Run unused files audit
        working-directory: frontend
        run: npm run detect:unused
      
      - name: Create issue if files found
        # Create GitHub issue with findings
```

## Maintenance

### Regular Reviews

Schedule regular reviews of the report:
- **Monthly**: Review new unused files
- **Quarterly**: Plan cleanup of accumulated unused files
- **Before releases**: Verify no critical files are marked as unused

### Updating Configuration

When adding new entry points or changing project structure:

1. Update `.unimportedrc.json` if needed
2. Add new exclusions for legitimate unused files
3. Test with `npm run detect:unused`

### False Positives

If a file is incorrectly flagged:

1. Check if it's used via dynamic imports
2. Add to `ignoreUnimported` in `.unimportedrc.json`
3. Document why it should be ignored

## Benefits

### Code Quality
- Identifies dead code that increases maintenance burden
- Reduces codebase size and complexity
- Makes it easier for new developers to understand the project

### Performance
- Smaller bundle sizes (when dependencies are removed)
- Faster builds (fewer files to process)
- Reduced npm install times (fewer dependencies)

### Security
- Smaller attack surface (fewer dependencies)
- Easier security audits (less code to review)
- Reduced vulnerability exposure

### Maintenance
- Easier refactoring (less code to update)
- Clearer project structure
- Better code discoverability

## Files Created

```
frontend/
├── .unimportedrc.json              # Tool configuration
├── package.json                     # Added detect:unused script
├── UNUSED_FILES_REPORT.md          # Generated report (in .gitignore)
└── scripts/
    ├── README.md                    # Documentation
    └── detect-unused-files.js       # Detection script
```

## Next Steps

### Immediate Actions

1. ✅ Tool installed and configured
2. ✅ Initial report generated
3. ✅ Documentation created
4. ⏭️ Review findings with team
5. ⏭️ Decide which files to keep/remove
6. ⏭️ Plan cleanup PR

### Future Enhancements

1. **CI Integration**: Add to GitHub Actions workflow
2. **Pre-commit Hook**: Warn developers about unused files
3. **Dashboard**: Visualize trends over time
4. **Auto-cleanup**: Automated PRs for safe-to-remove files
5. **Custom Rules**: Add project-specific detection rules

## Conclusion

The unused file detection tool is now fully operational and ready for use. It provides automated, configurable analysis of the front-end codebase to identify opportunities for cleanup and maintenance.

The initial scan revealed 17 unused files and 1 unused dependency, providing a clear starting point for code cleanup efforts. Regular use of this tool will help maintain a lean, maintainable codebase going forward.

## References

- **Tool Documentation**: `frontend/scripts/README.md`
- **Generated Report**: `frontend/UNUSED_FILES_REPORT.md`
- **Configuration**: `frontend/.unimportedrc.json`
- **unimported GitHub**: https://github.com/smeijer/unimported
