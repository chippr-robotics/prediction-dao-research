# Unused File Detection Tool

This directory contains an automated tool to identify front-end files that are no longer used in the main application flows.

## Overview

The tool uses `unimported`, an industry-standard static analysis tool, to scan the codebase and identify:

1. **Unimported Files**: Source files that exist but are not imported by any other file
2. **Unused Dependencies**: npm packages listed in package.json but not imported anywhere
3. **Unresolved Imports**: Import statements that cannot be resolved to actual files

## Quick Start

```bash
# Run the detection tool
npm run detect:unused
```

This will:
- Scan all source files in the `src/` directory
- Generate a detailed report at `UNUSED_FILES_REPORT.md`
- Display a summary in the terminal

## Files

- **`detect-unused-files.js`**: Main script that runs the analysis and generates the report
- **`../.unimportedrc.json`**: Configuration file for the unimported tool

## Configuration

The analysis is configured to:

- **Entry Point**: `src/main.jsx` - the application's main entry point
- **Excluded Patterns**: 
  - Test files (`*.test.js`, `*.test.jsx`, `*.cy.js`)
  - Test directories (`cypress/`, `src/test/`)
  - Configuration files
- **Excluded Dependencies**: Build tools and testing frameworks (Vite, Vitest, Cypress, etc.)

## Understanding the Report

The generated report (`UNUSED_FILES_REPORT.md`) includes:

1. **Summary**: Count of unimported files, unused dependencies, and unresolved imports
2. **Unused Files**: Categorized list of files not imported in the main application flow
3. **Unused Dependencies**: npm packages that are not imported anywhere
4. **Recommendations**: Suggestions for cleanup and CI integration
5. **Usage Instructions**: How to run the analysis and interpret results

## Important Notes

### What "Unused" Means

A file is marked as "unused" if:
- It's not imported by any other file in the main application flow
- It's not referenced from the entry point (`src/main.jsx`)

This does NOT necessarily mean the file should be deleted:
- Files may be used only in tests (e.g., `QRScanner.jsx`)
- Files may be kept for future features
- Files may be used via dynamic imports (not detected by static analysis)

### Before Deleting Files

Always verify that a file is truly unused:

1. **Check test files**: Some files may only be used in tests
   ```bash
   grep -r "filename" src/test/
   ```

2. **Check for dynamic imports**: Search for dynamic imports
   ```bash
   grep -r "import(" src/
   ```

3. **Check documentation**: See if the file is mentioned in docs

4. **Check git history**: Understand why the file was created
   ```bash
   git log --follow path/to/file
   ```

## CI Integration

### Adding to CI Pipeline

To prevent accumulation of unused files, add this check to your CI pipeline:

```yaml
# .github/workflows/frontend-checks.yml
- name: Check for unused files
  working-directory: frontend
  run: |
    npm run detect:unused
    # Optional: fail if count exceeds threshold
    UNUSED_COUNT=$(grep "Unimported Files:" UNUSED_FILES_REPORT.md | grep -o '[0-9]*')
    if [ "$UNUSED_COUNT" -gt 20 ]; then
      echo "Warning: $UNUSED_COUNT unused files detected"
      exit 1
    fi
```

### Pre-commit Hook

Add a warning for developers:

```bash
# .git/hooks/pre-commit
#!/bin/bash
cd frontend
npm run detect:unused --silent
if [ $? -ne 0 ]; then
  echo "Warning: Unused files detected. Run 'npm run detect:unused' to see details."
fi
```

## Manual Usage

You can also run the `unimported` tool directly:

```bash
# Show all results
npx unimported

# Show only unused files
npx unimported --show-unused-files

# Show only unused dependencies
npx unimported --show-unused-deps

# Show unresolved imports
npx unimported --show-unresolved-imports

# Update ignore lists
npx unimported -u
```

## Customizing Configuration

Edit `.unimportedrc.json` to customize the analysis:

```json
{
  "ignorePatterns": [
    // Add patterns for files to ignore
    "**/node_modules/**",
    "**/*.test.js"
  ],
  "ignoreUnimported": [
    // Add specific files that should not be flagged as unimported
    "src/main.jsx"
  ],
  "ignoreUnused": [
    // Add dependencies that should not be flagged as unused
    "vite"
  ]
}
```

## Troubleshooting

### False Positives

If a file is incorrectly marked as unused:

1. Check if it's imported via dynamic imports
2. Check if it's a barrel export (index.js) that re-exports other files
3. Add it to `ignoreUnimported` in `.unimportedrc.json` if it should be kept

### Tool Not Finding Files

If the tool isn't detecting certain files:

1. Make sure they have proper extensions (`.js`, `.jsx`, `.ts`, `.tsx`)
2. Check that they're not in an ignored directory
3. Verify they're tracked by git (if `respectGitignore: true`)

## Further Reading

- [unimported documentation](https://github.com/smeijer/unimported)
- [Frontend README](../README.md)
- [Development Guidelines](../../FRONTEND_BUILD_BOOK.md)
