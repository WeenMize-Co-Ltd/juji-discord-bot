// @ts-check

import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

export default defineConfig({
  files: ['**/*.{js,ts}'],
  extends: [
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    prettier,
  ],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    // Interpolating a number is idiomatic here (durations, ports, latencies) and
    // always well-defined — the rule's default only guards against object/any.
    '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
  },
})
