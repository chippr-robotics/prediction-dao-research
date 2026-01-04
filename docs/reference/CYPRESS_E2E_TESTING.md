# Cypress E2E Testing Documentation

## Overview

This document describes the Cypress end-to-end (E2E) testing implementation for the ClearPath and FairWins prediction markets platform. These tests ensure that major user flows work correctly and catch functional regressions before deployment.

## Test Coverage

### 1. User Onboarding Flow (`01-onboarding.cy.js`)

Tests the complete user onboarding journey:

- **Landing Page**: Verify page loads with all key elements
- **Platform Selection**: Test navigation to platform selector
- **Platform Options**: Ensure both ClearPath and FairWins are visible
- **Wallet Connection**: Test wallet connection and disconnection
- **Network Verification**: Verify correct network connection
- **Cross-Platform Navigation**: Test navigation between platforms
- **Wallet Persistence**: Ensure wallet stays connected across navigation
- **Accessibility**: Basic accessibility checks on all onboarding pages

**Test Count**: 15 tests

### 2. FairWins Market Trading (`02-fairwins-trading.cy.js`)

Tests prediction market interaction:

- **Market Discovery**: Browse and filter markets by category
- **Market Display**: Verify market information (prices, liquidity, status)
- **Trading Interface**: Test swap panel and trading interactions
- **Balance Display**: Verify user balance and wallet integration
- **Market Deadlines**: Check trading deadlines are displayed
- **Correlated Markets**: Test related markets viewing
- **Responsive Design**: Test mobile and tablet layouts
- **Keyboard Navigation**: Ensure keyboard accessibility
- **Loading States**: Verify appropriate loading indicators

**Test Count**: 18 tests

### 3. ClearPath DAO Governance (`03-clearpath-governance.cy.js`)

Tests DAO governance functionality:

- **Dashboard**: Verify ClearPath dashboard loads correctly
- **Wallet Integration**: Test wallet connection requirements
- **Navigation**: Test governance section navigation
- **Proposal Viewing**: Verify proposal list and details
- **Proposal Creation**: Test proposal submission interface
- **Welfare Metrics**: Check welfare metrics display
- **Treasury Information**: Verify DAO treasury/balance display
- **Voting Interface**: Test voting UI for active proposals
- **Status Indicators**: Verify proposal status displays
- **DAO Launchpad**: Test DAO creation interface if available
- **Responsive Design**: Test mobile and tablet layouts

**Test Count**: 18 tests

### 4. Position Management and Results (`04-positions-results.cy.js`)

Tests portfolio and results viewing:

- **Balance Display**: Verify user balance when connected
- **Position Viewing**: Test portfolio/positions section
- **Balance Visualization**: Check charts and graphs
- **Token Balances**: Verify token balance display
- **Position Value**: Test position value calculations
- **Profit/Loss**: Check P&L indicators
- **Market Results**: Verify resolved market results
- **Claim/Payout**: Test claim interface for winnings
- **Historical Data**: Verify historical performance
- **Transaction History**: Check activity log
- **Position Details**: Test detailed position view
- **Empty States**: Verify handling of no positions
- **Filtering/Sorting**: Test position filters and sorting

**Test Count**: 17 tests

### 5. Integration Tests (`05-integration.cy.js`)

Tests complete user journeys:

- **Full Onboarding Journey**: Complete flow from landing to trading
- **Platform Switching**: Test switching between ClearPath and FairWins
- **Complete Governance Workflow**: Full DAO interaction flow
- **Multi-Market Browsing**: Browse and filter multiple markets
- **Connection Management**: Test disconnect/reconnect flows
- **State Persistence**: Verify state across page reloads
- **Browser Navigation**: Test back/forward navigation
- **Multi-Viewport**: Test across different screen sizes
- **Rapid Navigation**: Test quick navigation stability
- **Error Handling**: Verify graceful error handling
- **User Feedback**: Test UI feedback for actions
- **Concurrent Actions**: Test multiple simultaneous interactions
- **Cross-Page Accessibility**: Accessibility checks on all pages
- **Feature Integration**: Demonstrate all features working together

**Test Count**: 14 tests

## Total Test Coverage

- **Total Test Suites**: 5
- **Total Tests**: 82
- **Platforms Covered**: 2 (ClearPath, FairWins)
- **User Flows**: 10+ major flows

## Running Tests

### Prerequisites

1. **Node.js 18+** and npm installed
2. **Frontend dependencies** installed: `npm install`
3. **Development server** running on `http://localhost:5173`

### Test Commands

```bash
# Open Cypress interactive test runner (with live preview)
npm run cypress:open

# Run tests in headless mode (CI)
npm run cypress:headless

# Run specific test file
npx cypress run --spec "cypress/e2e/01-onboarding.cy.js"

# Run all E2E tests with automatic server startup
npm run test:e2e

# Open Cypress with automatic server startup
npm run test:e2e:open
```

### Running with Hardhat Testnet

For tests that require blockchain interaction:

1. Start Hardhat local node:
```bash
# In project root
npm run node
```

2. Deploy contracts (if needed):
```bash
npm run deploy:local
```

3. Run Cypress tests:
```bash
# In frontend directory
npm run test:e2e
```

## Test Architecture

### Custom Commands

Located in `cypress/support/commands.js`:

- **`cy.mockWeb3Provider(options)`**: Injects mock Web3 provider for wallet testing
- **`cy.waitForWalletConnection()`**: Waits for wallet connection to complete
- **`cy.connectWallet()`**: Connects wallet via UI
- **`cy.verifyNetwork(chainId)`**: Verifies network connection
- **`cy.selectPlatform(platform)`**: Navigates to ClearPath or FairWins
- **`cy.navigateAndVerify(path, pattern)`**: Navigates and verifies URL
- **`cy.checkA11y()`**: Performs basic accessibility checks

### Mock Web3 Provider

The test suite includes a mock Web3 provider that simulates wallet connections without requiring browser extensions. This enables:

- **Automated Testing**: No manual wallet interactions needed
- **CI/CD Integration**: Tests run in headless mode
- **Deterministic Testing**: Consistent test accounts and balances
- **Fast Execution**: No real blockchain transactions

The mock provider:
- Simulates MetaMask API
- Uses Hardhat account #0 by default (`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`)
- Forwards contract calls to local Hardhat node
- Supports account switching and network detection

## CI/CD Integration

### GitHub Actions Workflow

The E2E tests are integrated into the CI/CD pipeline via `.github/workflows/frontend-testing.yml`:

```yaml
cypress-e2e:
  name: Cypress E2E Tests
  runs-on: ubuntu-latest
  
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
    
    - name: Install frontend dependencies
      working-directory: frontend
      run: npm ci
    
    - name: Start Hardhat node
      run: npm run node &
      
    - name: Wait for Hardhat
      run: sleep 10
    
    - name: Deploy contracts
      run: npm run deploy:local
    
    - name: Run Cypress tests
      working-directory: frontend
      run: npm run test:e2e
    
    - name: Upload test artifacts
      uses: actions/upload-artifact@v4
      if: always()
      with:
        name: cypress-results
        path: |
          frontend/cypress/screenshots
          frontend/cypress/videos
        retention-days: 30
```

### Test Results

- **Screenshots**: Captured on test failure
- **Videos**: Recorded for all test runs
- **Reports**: Uploaded as GitHub Actions artifacts
- **Retention**: Kept for 30 days

## Test Strategy

### What We Test

✅ **User Flows**: Complete journeys from start to finish
✅ **Critical Paths**: Essential functionality (wallet, trading, governance)
✅ **Integration Points**: Cross-feature and cross-platform interactions
✅ **Accessibility**: Basic WCAG AA compliance
✅ **Responsive Design**: Mobile, tablet, desktop viewports
✅ **Error Handling**: Graceful degradation and error states

### What We Don't Test

❌ **Smart Contract Logic**: Covered by unit/integration tests
❌ **Visual Regression**: Would require additional tooling
❌ **Performance**: Covered by Lighthouse CI
❌ **Browser Compatibility**: Focused on Chromium-based browsers
❌ **Real Wallet Extensions**: Use mock provider instead

## Known Limitations

### 1. Mock Web3 Provider

**Limitation**: Tests use a simulated wallet, not real wallet extensions.

**Impact**: 
- Cannot test actual MetaMask/wallet UI interactions
- May not catch wallet-specific edge cases
- Transaction signing is mocked

**Mitigation**: 
- Mock covers standard Ethereum JSON-RPC methods
- Manual testing with real wallets in staging
- Tests can be extended with Synpress for real wallet testing

### 2. Smart Contract Interactions

**Limitation**: Tests assume contracts are deployed and functional.

**Impact**:
- Cannot test contract deployment flows
- Requires Hardhat node to be running
- May have timing issues with blockchain state

**Mitigation**:
- Separate integration tests for contracts
- Use deterministic accounts and state
- Add appropriate wait times for blockchain confirmation

### 3. Test Data

**Limitation**: Tests use mock/static data from the frontend.

**Impact**:
- Real backend integration not tested
- May not reflect actual user scenarios
- Limited market/proposal data

**Mitigation**:
- Tests verify UI behavior with available data
- Seed script can populate test data
- Integration tests cover backend interactions

### 4. Network Conditions

**Limitation**: Tests run in ideal network conditions.

**Impact**:
- Cannot test slow networks or timeouts
- May not catch loading state issues
- Real-world latency not simulated

**Mitigation**:
- Manual testing on staging environment
- Could add Cypress network throttling
- Lighthouse performance tests catch some issues

### 5. Browser Coverage

**Limitation**: Cypress primarily tests Chromium-based browsers.

**Impact**:
- Firefox, Safari not fully covered
- Browser-specific bugs may slip through

**Mitigation**:
- Core web standards ensure compatibility
- Manual cross-browser testing in staging
- Could add additional browser testing with BrowserStack

## Future Improvements

### Short Term

1. **Add Synpress Integration**: Real MetaMask testing
2. **Extend Contract Interactions**: Test actual contract calls
3. **Add Visual Regression**: Screenshot comparison
4. **Improve Test Data**: Use seed script for realistic data
5. **Network Mocking**: Test error conditions and timeouts

### Medium Term

1. **API Mocking**: Use MSW for backend API testing
2. **Performance Testing**: Add timing assertions
3. **Cross-Browser Testing**: Expand to Firefox, Safari
4. **Test Reporting**: Integrate Cypress Dashboard
5. **Parallel Execution**: Speed up CI with parallelization

### Long Term

1. **End-to-End Backend Integration**: Full stack testing
2. **Load Testing**: Multi-user scenarios
3. **Security Testing**: XSS, CSRF, injection prevention
4. **Internationalization**: Multi-language testing
5. **Advanced Accessibility**: Full WCAG AAA compliance

## Maintenance

### Adding New Tests

1. Create test file in `cypress/e2e/` with descriptive name
2. Follow naming convention: `##-feature-name.cy.js`
3. Use custom commands for common operations
4. Add appropriate assertions and waits
5. Test across different viewports when relevant
6. Include accessibility checks
7. Update this documentation

### Debugging Failed Tests

1. **Check Screenshots**: Review failure screenshots in `cypress/screenshots/`
2. **Watch Videos**: View test execution in `cypress/videos/`
3. **Run Interactively**: Use `npm run cypress:open` for live debugging
4. **Add Logging**: Use `cy.log()` for debug messages
5. **Check Console**: Review browser console in Cypress UI
6. **Verify Selectors**: Ensure elements exist and are visible
7. **Timing Issues**: Add appropriate `cy.wait()` if needed

### Updating Tests

When the UI changes:

1. Update selectors if elements changed
2. Adjust assertions if behavior changed
3. Add new tests for new features
4. Remove tests for deprecated features
5. Update custom commands if needed
6. Re-run all tests to ensure no regressions
7. Update documentation

## Support

For issues or questions:

1. Check Cypress documentation: https://docs.cypress.io
2. Review test logs and artifacts
3. Run tests locally with `npm run cypress:open`
4. Check GitHub Actions logs for CI failures
5. Consult frontend development team

## References

- [Cypress Documentation](https://docs.cypress.io)
- [Frontend README](./README.md)
- [CI/CD Pipeline Documentation](../CI_CD_PIPELINE.md)
- [Accessibility Testing](../MANUAL_ACCESSIBILITY_TESTING.md)
