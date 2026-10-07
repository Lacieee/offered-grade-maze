// @ts-check
import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Determinism rules for `packages/generator/**` (AGENTS.md, CP01 T1.6).
 * Generator output must be bit-identical across machines and releases, so every
 * source of non-determinism or floating-point maths is banned here. A file that
 * needs an exception must justify it in a comment and an ADR.
 */
const BANNED_MATH = ['random', 'sin', 'cos', 'tan', 'sqrt', 'pow', 'exp', 'log'];

export const determinismRules = /** @type {const} */ ({
  'no-restricted-globals': [
    'error',
    { name: 'Date', message: 'Generator must be deterministic: no Date.' },
    { name: 'performance', message: 'Generator must be deterministic: no performance timers.' },
  ],
  'no-restricted-properties': [
    'error',
    ...BANNED_MATH.map((property) => ({
      object: 'Math',
      property,
      message: `Generator must be deterministic: Math.${property} is banned (use rngFor / integer maths).`,
    })),
    {
      object: 'crypto',
      property: 'getRandomValues',
      message: 'Generator must be deterministic: use rngFor(canonicalSeed, label).',
    },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: "BinaryExpression[operator='**']",
      message: 'Generator must use integer maths: the ** operator is banned.',
    },
    {
      selector: "AssignmentExpression[operator='**=']",
      message: 'Generator must use integer maths: the **= operator is banned.',
    },
  ],
  'no-restricted-imports': [
    'error',
    {
      paths: ['crypto', 'node:crypto', 'perf_hooks', 'node:perf_hooks'].map((name) => ({
        name,
        message: 'Generator must be deterministic: no crypto or timer modules.',
      })),
      patterns: [
        {
          group: ['@ogm/client', '@ogm/client/*', '@ogm/server', '@ogm/server/*'],
          message: '@ogm/generator must not depend on the client or the server.',
        },
      ],
    },
  ],
});

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      'user inputs/**',
      'e2e/test-results/**',
      'e2e/playwright-report/**',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    // shared is pure TypeScript: no Node APIs, no other workspace packages.
    files: ['packages/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*'], message: '@ogm/shared must not use Node APIs.' },
            {
              group: ['@ogm/generator', '@ogm/generator/*', '@ogm/server', '@ogm/client'],
              message: '@ogm/shared must not depend on other workspace packages.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/generator/**/*.ts'],
    rules: determinismRules,
  },
  {
    files: ['packages/client/src/**/*.tsx'],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    // The client never imports the generator (spec §18, AGENTS.md).
    files: ['packages/client/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@ogm/generator', '@ogm/generator/*', '@ogm/server', '@ogm/server/*'],
              message: '@ogm/client must never import the generator or the server.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
