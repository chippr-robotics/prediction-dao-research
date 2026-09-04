import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // 'dist' alone matches only the top-level build; each mini-app package emits its own
  // (spec 073), and linting generated bundles reports errors nobody can fix at source.
  // The native shells (spec 102) are generated projects whose assets/ tree is a COPY of
  // dist made by `cap sync` — same reasoning, plus their own template JS.
  globalIgnores(['dist', 'miniapps/*/dist', 'miniapps/dist/**', 'android/**', 'ios/**']),
  {
    files: ['**/*.{js,jsx}'],
    ignores: ['cypress/**', 'src/test/**'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
      // Allow calling setState in effects for initial data loading patterns
      'react-hooks/set-state-in-effect': 'warn',
      // React Compiler readiness rules (eslint-plugin-react-hooks 7.1+). This codebase does not
      // run the React Compiler, and these flag patterns that are correct today: Date.now() read
      // at render time for "is this expired/live" UI, a useMemo deliberately snapshotting a
      // timestamp rather than ticking with it, and dependency arrays the compiler's own inference
      // disagrees with but plain React semantics do not require. Kept as warnings, not silenced.
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  // Configuration for Cypress test files
  {
    files: ['cypress/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        cy: 'readonly',
        Cypress: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        before: 'readonly',
        after: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        expect: 'readonly',
        context: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },
  // Configuration for Vitest test files
  {
    files: ['src/test/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.node,
        vi: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },
])
