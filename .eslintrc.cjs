/**
 * ESLint config raíz del monorepo.
 *
 * CRÍTICO: implementa las reglas de ADR-009 y ADR-004:
 *  - El núcleo NUNCA importa de un vertical.
 *  - Un vertical NUNCA importa de otro vertical.
 *  - Las apps pueden importar de cualquier paquete.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'boundaries', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
  ],
  settings: {
    'boundaries/elements': [
      { type: 'core', pattern: 'packages/core/*' },
      { type: 'adapter', pattern: 'packages/adapters/*' },
      { type: 'vertical', pattern: 'packages/verticals/*' },
      { type: 'app', pattern: 'apps/*' },
      { type: 'tool', pattern: 'tools/*' },
    ],
    'import/resolver': {
      typescript: { project: ['packages/*/*/tsconfig.json', 'apps/*/tsconfig.json'] },
    },
  },
  rules: {
    // ADR-009: el núcleo NO conoce verticales ni apps
    'boundaries/element-types': [
      'error',
      {
        default: 'disallow',
        rules: [
          { from: 'core', allow: ['core'] },
          { from: 'adapter', allow: ['core', 'adapter'] },
          { from: 'vertical', allow: ['core'] },
          { from: 'app', allow: ['core', 'adapter', 'vertical'] },
          { from: 'tool', allow: ['core', 'adapter'] },
        ],
      },
    ],
    // ADR-004: prohibir que un vertical importe de otro vertical
    'boundaries/no-unknown-files': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/consistent-type-imports': 'error',
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
      },
    ],
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.config.js', '*.config.ts'],
};
