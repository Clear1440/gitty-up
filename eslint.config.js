import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  { ignores: ['dist', 'release'] },
  js.configs.recommended,
  {
    files: ['server/**/*.js', 'electron/**/*.js', 'scripts/**/*.js', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Components are used from JSX, which this rule cannot see.
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z]' }],
    },
  },
  {
    // All network traffic goes through the API layer.
    files: ['src/**/*.{js,jsx}'],
    ignores: ['src/api/client.js', '**/*.test.js'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Use the API layer in src/api instead.' },
        { name: 'XMLHttpRequest', message: 'Use the API layer in src/api instead.' },
      ],
    },
  },
];
