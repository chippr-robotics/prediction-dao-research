# Unused Front-end Files Report

**Generated:** 12/31/2025, 1:33:41 AM

## Summary

- **Unimported Files:** 17
- **Unused Dependencies:** 1
- **Unresolved Imports:** 0

## Analysis Details

This report was generated using the `unimported` tool, which analyzes the codebase to identify:

1. **Unimported Files**: Source files that exist but are not imported by any other file in the main application flow
2. **Unused Dependencies**: npm packages listed in package.json but not imported anywhere
3. **Unresolved Imports**: Import statements that cannot be resolved to actual files

### Exclusions

The analysis automatically excludes:
- Test files (`*.test.js`, `*.test.jsx`, `*.cy.js`)
- Test directories (`cypress/`, `src/test/`)
- Configuration files (`vite.config.js`, `eslint.config.js`, etc.)
- Build and development tools
- Entry points (`src/main.jsx`)

## Unused Files

The following files were created but are no longer imported or used in the main application flow:

### Components

- `src/components/fairwins/HorizontalMarketScroller.jsx`
- `src/components/fairwins/index.js`
- `src/components/GovernanceModeSelector.jsx`
- `src/components/MarketCreation.jsx`
- `src/components/MarketTrading.jsx`
- `src/components/MyPositions.jsx`
- `src/components/ProposalList.jsx`
- `src/components/TraditionalVoting.jsx`
- `src/components/ui/QRScanner.jsx`
- `src/components/ui/SettingsModal.jsx`
- `src/components/WelfareMetrics.jsx`

### Utilities

- `src/utils/ipfsService.js`
- `src/utils/metadataGenerator.js`

### Hooks

- `src/hooks/useIpfs.js`

### Constants

- `src/constants/ipfs.js`

### IPFS/Metadata

- `src/ipfs.js`

### Other

- `src/contexts/index.js`

## Unused Dependencies

The following npm packages are listed in package.json but not imported anywhere:

- `html5-qrcode`

## Recommendations

### File Cleanup

The identified unused files fall into several categories:

1. **Legacy/Replaced Components**: Files that were part of old implementations but have been replaced
2. **Test-Only Code**: Files that are only used in tests (e.g., QRScanner, IPFS utilities)
3. **Barrel Exports**: Index files that export components no longer used

**Action Items:**
- Review each file to confirm it's truly unused and not needed for future features
- Files only used in tests should be moved to `src/test/` directory or clearly marked
- Consider archiving rather than deleting if there's historical value
- Update documentation if removing documented components

### Dependency Cleanup

**Action Items:**
- Verify that unused dependencies are truly not needed
- Remove unused dependencies to reduce bundle size and security surface
- Run `npm uninstall <package>` for each unused dependency

### CI Integration

To prevent accumulation of unused files in the future, consider:

1. **Pre-commit Hook**: Add a warning when committing unused files
2. **CI Check**: Add this script to CI pipeline as a non-blocking check
3. **Regular Audits**: Schedule monthly reviews of this report
4. **Documentation**: Update development guidelines to address file cleanup

## How to Run This Analysis

```bash
# From the frontend directory:
npm run detect:unused

# Or manually:
npx unimported
npx unimported --show-unused-files
npx unimported --show-unused-deps
```

## Configuration

The analysis is configured via `.unimportedrc.json`. Key settings:

- Entry point: `src/main.jsx`
- Ignored patterns: Test files, config files, Cypress tests
- Respects .gitignore

## Notes

- This analysis is based on static code analysis and may not catch dynamic imports
- Files used only via dynamic imports may appear as "unused"
- Always manually verify before deleting files
- Consider the context: some files may be intentionally kept for future use
