module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/lib'],
  testMatch: ['**/*.test.ts', '**/*.test.mjs', '**/*.test.js'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  }
};
