import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We need to test with different import.meta.env.DEV values,
// so we re-import the module for each scenario.

describe('logger utility', () => {
  let consoleSpy

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      group: vi.spyOn(console, 'group').mockImplementation(() => {}),
      groupEnd: vi.spyOn(console, 'groupEnd').mockImplementation(() => {}),
    }
  })

  afterEach(() => {
    Object.values(consoleSpy).forEach(spy => spy.mockRestore())
    vi.restoreAllMocks()
  })

  describe('in development mode', () => {
    // Vitest runs with DEV=true by default, so the default import should
    // treat the environment as development.
    let logger

    beforeEach(async () => {
      // Dynamic import to get fresh module each time
      vi.resetModules()
      const mod = await import('../utils/logger.js')
      logger = mod.default
    })

    it('should export logger as default and named export', async () => {
      const mod = await import('../utils/logger.js')
      expect(mod.default).toBeDefined()
      expect(mod.logger).toBeDefined()
      expect(mod.default).toBe(mod.logger)
    })

    it('logger.log should call console.log in dev mode', () => {
      logger.log('test message')
      expect(consoleSpy.log).toHaveBeenCalledWith('test message')
    })

    it('logger.log should forward multiple arguments', () => {
      logger.log('hello', 42, { key: 'value' })
      expect(consoleSpy.log).toHaveBeenCalledWith('hello', 42, { key: 'value' })
    })

    it('logger.warn should call console.warn in dev mode', () => {
      logger.warn('warning message')
      expect(consoleSpy.warn).toHaveBeenCalledWith('warning message')
    })

    it('logger.info should call console.info in dev mode', () => {
      logger.info('info message')
      expect(consoleSpy.info).toHaveBeenCalledWith('info message')
    })

    it('logger.debug should call console.debug in dev mode', () => {
      logger.debug('debug message')
      expect(consoleSpy.debug).toHaveBeenCalledWith('debug message')
    })

    it('logger.error should call console.error (always enabled)', () => {
      logger.error('error message')
      expect(consoleSpy.error).toHaveBeenCalledWith('error message')
    })

    it('logger.error should forward multiple arguments', () => {
      const err = new Error('test')
      logger.error('Something failed:', err)
      expect(consoleSpy.error).toHaveBeenCalledWith('Something failed:', err)
    })

    it('logger.group should call console.group in dev mode', () => {
      logger.group('group label')
      expect(consoleSpy.group).toHaveBeenCalledWith('group label')
    })

    it('logger.groupEnd should call console.groupEnd in dev mode', () => {
      logger.groupEnd()
      expect(consoleSpy.groupEnd).toHaveBeenCalled()
    })

    it('logger.log should handle objects and arrays', () => {
      const obj = { a: 1, b: [2, 3] }
      logger.log(obj)
      expect(consoleSpy.log).toHaveBeenCalledWith(obj)
    })

    it('logger.warn should forward multiple arguments', () => {
      logger.warn('warning', 'extra', 123)
      expect(consoleSpy.warn).toHaveBeenCalledWith('warning', 'extra', 123)
    })

    it('logger.info should forward multiple arguments', () => {
      logger.info('info', { detail: true })
      expect(consoleSpy.info).toHaveBeenCalledWith('info', { detail: true })
    })

    it('logger.debug should forward multiple arguments', () => {
      logger.debug('dbg', 1, 2, 3)
      expect(consoleSpy.debug).toHaveBeenCalledWith('dbg', 1, 2, 3)
    })

    it('logger.group should forward multiple arguments', () => {
      logger.group('group', 'extra')
      expect(consoleSpy.group).toHaveBeenCalledWith('group', 'extra')
    })
  })

  describe('error always logs regardless of mode', () => {
    let logger

    beforeEach(async () => {
      vi.resetModules()
      const mod = await import('../utils/logger.js')
      logger = mod.default
    })

    it('logger.error should always output', () => {
      logger.error('critical error', { code: 500 })
      expect(consoleSpy.error).toHaveBeenCalledWith('critical error', { code: 500 })
    })

    it('logger.error should handle Error objects', () => {
      const err = new Error('Something broke')
      logger.error(err)
      expect(consoleSpy.error).toHaveBeenCalledWith(err)
    })

    it('logger.error should handle no arguments', () => {
      logger.error()
      expect(consoleSpy.error).toHaveBeenCalled()
    })
  })

  describe('logger API surface', () => {
    let logger

    beforeEach(async () => {
      vi.resetModules()
      const mod = await import('../utils/logger.js')
      logger = mod.default
    })

    it('should expose all expected methods', () => {
      expect(typeof logger.log).toBe('function')
      expect(typeof logger.warn).toBe('function')
      expect(typeof logger.error).toBe('function')
      expect(typeof logger.info).toBe('function')
      expect(typeof logger.debug).toBe('function')
      expect(typeof logger.group).toBe('function')
      expect(typeof logger.groupEnd).toBe('function')
    })

    it('should not throw when called with no arguments', () => {
      expect(() => logger.log()).not.toThrow()
      expect(() => logger.warn()).not.toThrow()
      expect(() => logger.error()).not.toThrow()
      expect(() => logger.info()).not.toThrow()
      expect(() => logger.debug()).not.toThrow()
      expect(() => logger.group()).not.toThrow()
      expect(() => logger.groupEnd()).not.toThrow()
    })

    it('should be a plain object (not a class instance)', () => {
      expect(typeof logger).toBe('object')
      expect(logger).not.toBeNull()
    })

    it('should have exactly 7 methods', () => {
      const methods = Object.keys(logger)
      expect(methods).toHaveLength(7)
      expect(methods).toContain('log')
      expect(methods).toContain('warn')
      expect(methods).toContain('error')
      expect(methods).toContain('info')
      expect(methods).toContain('debug')
      expect(methods).toContain('group')
      expect(methods).toContain('groupEnd')
    })
  })
})
