const assert = require('node:assert/strict');

// Use only through check:submission; provider calls must fail before making a connection.
assert.equal(process.permission?.has('net'), false, 'Submission checks require native network denial');
assert.equal(process.permission.has('child'), false, 'Submission checks cannot spawn provider CLIs');

// Includes dotenv.config calls in shared test setup and imported application modules.
jest.mock('dotenv', () => ({
  config: () => ({ parsed: {} }),
  configDotenv: () => ({ parsed: {} }),
}));
