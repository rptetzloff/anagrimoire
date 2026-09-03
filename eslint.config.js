import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', '.vite'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // The scripts were unlinted until a `POOLS` that was never defined shipped
    // in publish-puzzles.mjs and failed every nightly run — swallowed by a
    // `|| echo ::warning::` in the workflow, so the file feed carried the site
    // and nobody saw it. no-undef is the rule that would have caught it, and
    // it only applies where a config block says these files exist.
    files: ['scripts/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      // Warn, not error, and deliberately. Turning the rule on found five
      // unused declarations that predate it, and one of them — `gridRng` in
      // fetch-puzzles, shadowed by an inner binding of the same name — sits
      // inside a puzzle generator. Deleting a line there in a change about
      // publishing is how generated output moves without anyone meaning it to.
      // They deserve a pass of their own; no-undef, which is what actually
      // shipped a broken script, stays an error.
      'no-unused-vars': 'warn',
    },
  },
  {
    // Playwright fixtures use `use` as a callback and `{}` as an intentional
    // empty dependency pattern; neither is a React hook or a mistake there.
    files: ['e2e/**/*.ts', 'tests/**/*.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'no-empty-pattern': 'off',
    },
  }
);
