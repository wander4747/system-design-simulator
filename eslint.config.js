import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  { ignores: ['node_modules/'] },
  js.configs.recommended,
  {
    rules: {
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-shadow': 'error',
      'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_' }],
    },
  },
  // The engine is pure: no DOM, no Node APIs.
  { files: ['src/engine/**/*.js'], languageOptions: { globals: {} } },
  { files: ['src/ui/**/*.js', 'src/presets.js'], languageOptions: { globals: globals.browser } },
  { files: ['server.mjs', 'test/**/*.js', 'eslint.config.js'], languageOptions: { globals: globals.node } },
  prettier,
];
