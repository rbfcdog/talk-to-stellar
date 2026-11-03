const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

assert(Number(process.versions.node.split('.')[0]) >= 26, 'Submission checks require Node.js 26+ for native network permissions');

const backend = path.resolve(__dirname, '..');
const temporary = mkdtempSync(path.join(tmpdir(), 'tts-submission-'));
const env = {
  PATH: process.env.PATH,
  NODE_ENV: 'test',
  CI: 'true',
  STELLAR_NETWORK: 'TESTNET',
  STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION: 'false',
  TMPDIR: temporary,
  TZ: 'UTC',
};
const base = require('../jest.config.js');
const config = {
  ...base,
  rootDir: backend,
  cacheDirectory: temporary,
  setupFilesAfterEnv: ['<rootDir>/tests/submission.setup.cjs', ...base.setupFilesAfterEnv],
};

try {
  const checks = [
    // ponytail: Jest needs native addons; use an OS sandbox before running untrusted code.
    [process.execPath, [
      '--permission', '--allow-addons', '--allow-fs-read=*', `--allow-fs-write=${temporary}`,
      require.resolve('jest/bin/jest'), '--config', JSON.stringify(config),
      '--runInBand', '--runTestsByPath',
      'tests/submission-isolation.test.ts',
      'tests/bridge.routes.test.ts',
      'tests/anchor-pix-organization-bank-account.test.ts',
    ]],
    ['python3', [path.resolve(backend, '../evolution/tests/test_create_instance.py')]],
  ];
  for (const [command, args] of checks) {
    const result = spawnSync(command, args, { cwd: backend, env, stdio: 'inherit', timeout: 180000 });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.exitCode = result.status || 1;
      break;
    }
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
