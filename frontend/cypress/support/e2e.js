// ***********************************************************
// This example support/e2e.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands'

// Alternatively you can use CommonJS syntax:
// require('./commands')

// Disable uncaught exception failures for Web3 errors
Cypress.on('uncaught:exception', (err) => {
  // Log errors for debugging
  console.error('Uncaught exception:', err.message)
  
  // Ignore ResizeObserver errors (harmless browser errors)
  if (err.message.includes('ResizeObserver')) {
    return false
  }
  
  // Ignore Web3 provider errors during testing
  if (err.message.includes('MetaMask') || 
      err.message.includes('ethereum') ||
      err.message.includes('provider') ||
      err.message.includes('Web3') ||
      err.message.includes('process is not defined') ||
      err.message.includes('Cannot read properties of undefined')) {
    return false
  }
  // Let other errors fail the test
  return true
})

// Add beforeEach hook to check for console errors (optional)
beforeEach(() => {
  cy.window().then(() => {
    // Optionally stub console.error to catch app errors
    // Commented out by default to avoid false positives
    // cy.stub(win.console, 'error').as('consoleError')
  })
})
