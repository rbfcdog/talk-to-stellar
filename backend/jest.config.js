module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/server.ts',
  ],
  // @noble/@scure (pulled in by @stellar/stellar-sdk) ship ESM-only, which Jest
  // cannot parse as CJS. Transform just those packages with ts-jest (allowJs)
  // so SDK-importing suites compile; everything else stays ignored.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true }],
    '^.+\\.jsx?$': ['ts-jest', { isolatedModules: true, tsconfig: { allowJs: true } }],
  },
  transformIgnorePatterns: ['/node_modules/(?!(@noble|@scure|uint8array-extras)/)'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000,
  verbose: true,
};
