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
        projectService: {
          allowDefaultProject: [
            '*.config.js',
            'example/*.js',
            'benchmark/src/*.ts',
          ],
        },
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
  },
  {
    ignores: ['dist', 'wasm', 'rust'],
  },
);

export default eslintConfig;
