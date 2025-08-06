import eslint from '@eslint/js';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

/** @type {import('typescript-eslint').Config} */
const eslintConfig = tseslint.config(
  eslint.configs.recommended,
  eslintPluginUnicorn.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylisticTypeChecked,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
  },
  {
    rules: {
      'no-undef': 'off', // Everything is checked by TypeScript; this is recommended by typescript-eslint.
    },
  },
  {
    ignores: ['dist', 'build', 'coverage', 'wasm', 'rust', 'hidden'],
  },
);

export default eslintConfig;
