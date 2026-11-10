module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  verbose: true,
  // uuid 14 ESM-only: jest на Node 22 не может require(esm) (см. tests/shims/uuid.cjs).
  moduleNameMapper: {
    '^uuid$': '<rootDir>/tests/shims/uuid.cjs',
  },
};
