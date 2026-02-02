/**
 * Conditional Logger Utility
 *
 * Provides logging functions that only output in development mode.
 * This prevents console spam in production and improves performance.
 *
 * Usage:
 * ```javascript
 * import logger from './logger'
 *
 * logger.log('Debug info')  // Only logs in dev mode
 * logger.error('Error')     // Always logs (errors important in prod)
 * logger.warn('Warning')    // Always logs (warnings important in prod)
 * ```
 */

const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development'

const logger = {
  /**
   * Log debug information (dev mode only)
   */
  log: (...args) => {
    if (isDev) {
      console.log(...args)
    }
  },

  /**
   * Log warnings (always enabled, but can be toggled)
   */
  warn: (...args) => {
    if (isDev) {
      console.warn(...args)
    }
  },

  /**
   * Log errors (always enabled for critical issues)
   */
  error: (...args) => {
    console.error(...args)
  },

  /**
   * Log info (dev mode only)
   */
  info: (...args) => {
    if (isDev) {
      console.info(...args)
    }
  },

  /**
   * Group logs together (dev mode only)
   */
  group: (...args) => {
    if (isDev) {
      console.group(...args)
    }
  },

  groupEnd: () => {
    if (isDev) {
      console.groupEnd()
    }
  },

  /**
   * Debug logs (dev mode only) - alias for log with "debug" semantics
   */
  debug: (...args) => {
    if (isDev) {
      console.debug(...args)
    }
  }
}

export { logger }
export default logger
