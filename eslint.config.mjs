import js from '@eslint/js';
// eslint-config-next 16 ships a native flat config. `core-web-vitals` already
// bundles the base Next config + next/typescript rules, so importing it gives us
// core-web-vitals + TypeScript in one go.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const eslintConfig = [
  // Build artifacts, generated code, and config files we don't want to lint.
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'build/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'public/**',
      'prisma/generated/**',
      'src/generated/**',
      'next-env.d.ts',
      'tsconfig.tsbuildinfo',
      '*.config.js',
      '*.config.mjs',
      '*.config.ts',
    ],
  },

  js.configs.recommended,

  ...nextCoreWebVitals,

  // TypeScript-only relaxations. These reference `@typescript-eslint/*` rules, so
  // they MUST be scoped to TS files — the plugin is only registered for TS files
  // (via eslint-config-next). Applying them globally makes `eslint .` fail on
  // plain .js/.mjs files with "could not find plugin @typescript-eslint".
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    rules: {
      // The codebase intentionally uses `any` in several integration/boundary
      // spots (Stripe, next-intl, map libs). Warn rather than error.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Many intentionally-unused args (handlers, destructured rest). Warn and
      // allow underscore-prefixed escapes.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // Project-wide rule adjustments. The existing codebase is large and predates
  // this lint gate, so a few high-volume rules are relaxed to keep the gate
  // green and actionable rather than drowning in pre-existing noise. Tighten
  // these back up incrementally as the code is cleaned.
  {
    rules: {
      // Core ESLint rules that misfire on TypeScript: `no-undef` is redundant
      // (the compiler checks this and the rule flags global/ambient types), and
      // the core `no-unused-vars` duplicates the typescript-eslint version
      // below. Both are the recommended off-switches for TS projects.
      'no-undef': 'off',
      'no-unused-vars': 'off',

      // `no-html-link-for-pages` assumes a `pages/` dir and false-positives
      // across the board on App Router projects.
      '@next/next/no-html-link-for-pages': 'off',

      // React Compiler (react-hooks v6) rules. The existing components predate
      // these checks; surface them as warnings to fix incrementally instead of
      // blocking the gate. Auto-fixing them is not safe.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/exhaustive-deps': 'warn',

      // Next/React conveniences that are noisy on a large existing app.
      'react/no-unescaped-entities': 'warn',
      '@next/next/no-img-element': 'warn',
      'prefer-const': 'warn',
    },
  },

  // Must be last: disables ESLint formatting rules that conflict with Prettier.
  prettier,
];

export default tseslint.config(...eslintConfig);
