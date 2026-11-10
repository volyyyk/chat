/**
 * ESLint flat config. ESLint 10 поддерживает только flat config,
 * а в репо конфига eslint не было вовсе (npm run lint падал без него).
 * Сервер написан на CommonJS JavaScript; правила @typescript-eslint
 * пока не подключены: в src/ нет .ts файлов.
 */
module.exports = [
  {
    ignores: ['node_modules/', 'coverage/', 'bench/', 'tests/', 'src/public/'],
  },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'off',
      'no-console': 'off',
    },
  },
];
