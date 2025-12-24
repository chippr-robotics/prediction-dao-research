# Manticore Analysis Fix

## Issue Summary

The Manticore symbolic execution tool was failing to analyze smart contracts due to compilation errors. The root cause was that Manticore's internal Solidity compiler couldn't resolve OpenZeppelin imports.

## Error Details

### Primary Error
```
Error: Source "@openzeppelin/contracts/access/Ownable.sol" not found: File not found.
```

### Secondary Error
```
AttributeError: 'NoneType' object has no attribute 'result'
```

This secondary error was a consequence of the primary error - when compilation fails, Manticore has no transaction objects to work with, causing the AttributeError in the finalizer.

## Solution

### 1. Created `remappings.txt`
Added a remappings file to tell the Solidity compiler where to find OpenZeppelin contracts:
```
@openzeppelin/=node_modules/@openzeppelin/
```

This maps the `@openzeppelin/` import prefix to the actual location in `node_modules/`.

### 2. Created `scripts/run-manticore.py`
A Python wrapper script that:
- Validates the environment (checks for `remappings.txt` and `node_modules`)
- Reads the remappings configuration
- Constructs the proper `manticore` CLI command with `--solc-remaps` arguments
- Handles timeouts gracefully (partial results are still valuable)
- Provides clear error messages and logging

### 3. Updated Workflows
Modified both `security-testing.yml` and `torture-test.yml` to use the new wrapper script instead of calling `manticore` directly:

**Before:**
```bash
manticore contracts/ProposalRegistry.sol --contract ProposalRegistry
```

**After:**
```bash
python scripts/run-manticore.py contracts/ProposalRegistry.sol --contract ProposalRegistry --timeout 300
```

## Usage

### Local Testing
```bash
# Install dependencies
npm ci

# Install Manticore
pip install manticore[native]

# Run analysis on a contract
python scripts/run-manticore.py contracts/WelfareMetricRegistry.sol \
  --contract WelfareMetricRegistry \
  --timeout 300
```

### CI/CD Pipeline
The wrapper script is automatically used in the GitHub Actions workflows:
- `security-testing.yml`: Runs on PRs and pushes to main/develop
- `torture-test.yml`: Runs weekly for comprehensive testing

## Benefits

1. **Proper Import Resolution**: Manticore can now find and compile contracts with OpenZeppelin dependencies
2. **Better Error Handling**: The wrapper provides clearer error messages
3. **Graceful Timeouts**: Partial analysis results are preserved even on timeout
4. **Maintainability**: Centralized configuration makes it easier to update remappings
5. **Consistency**: Same approach works across both security testing and torture test workflows

## Testing

The fix can be verified by:
1. Checking that `remappings.txt` exists and contains the correct mappings
2. Running the wrapper script with `--help` to verify it's executable
3. Observing that Manticore no longer fails with import resolution errors in CI
4. Confirming that `mcore_*` directories are created with analysis results

## Future Improvements

- Add more remappings if additional external dependencies are added
- Extend the wrapper to support more advanced Manticore configuration
- Add contract-specific analysis strategies based on contract patterns
- Integrate with automated vulnerability reporting
