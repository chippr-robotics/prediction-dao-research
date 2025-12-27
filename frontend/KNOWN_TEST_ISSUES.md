# Known Test Issues

## useIpfs.test.js - Memory Exhaustion and Hanging

**Status:** Temporarily excluded from test suite  
**Date:** 2025-12-27  
**Severity:** High

### Description
The `src/test/useIpfs.test.js` test file causes the test runner to hang indefinitely and eventually crash with a "JavaScript heap out of memory" error. When running the full test suite, this test consistently fails after all other tests complete successfully.

### Symptoms
- Test runner hangs after processing 21 out of 22 test files
- Worker process exits unexpectedly with OOM error
- Memory usage grows to ~4GB before crashing
- Occurs even with increased Node.js heap size (--max-old-space-size=4096)

### Root Cause Analysis
The exact root cause is still under investigation, but potential issues include:

1. **Infinite Loop/Re-render**: The hooks being tested (particularly `useBatchIpfs`) have `useCallback` dependencies on array references that may cause infinite re-renders in test environment
2. **Improper Cleanup**: React hooks may not be properly cleaning up between tests, leading to memory leaks
3. **Mock Issues**: The mocked `ipfsService` module may not be properly resetting state between tests

### Affected Tests
- All 7 hooks in useIpfs.test.js:
  - useIpfs
  - useTokenMetadata
  - useMarketData
  - useMarketMetadata
  - useIpfsByCid
  - useBatchIpfs
  - useIpfsCache

### Temporary Solution
The test file has been excluded from the test suite via `vite.config.js`:
```javascript
exclude: [
  // ... other excludes
  '**/useIpfs.test.js'
]
```

### Recommended Fix
To properly fix this issue:

1. **Investigate Hook Dependencies**: Review the `useBatchIpfs` hook in `src/hooks/useIpfs.js` - the `paths` array dependency in the `useCallback` may need to be handled differently (possibly using a ref or serializing the array)

2. **Add Proper Cleanup**: Ensure all tests properly unmount components and clear timers/promises

3. **Isolate the Problem**: Run individual test suites within the file to identify which specific test(s) cause the hang

4. **Consider Rewriting Tests**: The tests may need to use `act()` properly for all state updates, or use a different testing approach for complex hook interactions

5. **Add Resource Limits**: Consider adding per-test memory limits or timeouts to prevent runaway tests

### Impact
- 21 out of 22 test files pass successfully (291 tests)
- IPFS hook functionality is not being tested in CI
- Manual testing is required to verify useIpfs hooks work correctly

### Next Steps
1. Create a separate issue to track the fix for this test
2. Investigate the root cause in a dedicated debugging session
3. Re-enable the test once the underlying issue is resolved
