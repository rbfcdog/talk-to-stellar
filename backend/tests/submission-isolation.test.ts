import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';

// The normal suite is intentionally not restricted to the submission permission model.
const submissionOnly = process.permission ? describe : describe.skip;

submissionOnly('Submission credential and network isolation', () => {
  it('does not inherit provider credentials from the invoking shell', () => {
    expect(process.env.BRIDGE_API_KEY).toBeUndefined();
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(process.env.NODE_OPTIONS).toBeUndefined();
  });

  it('does not load environment files even when dotenv override is requested', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'dotenv-probe-'));
    try {
      const fixture = path.join(directory, '.env');
      writeFileSync(fixture, 'SUBMISSION_DOTENV_PROBE=must-not-be-loaded\nSTELLAR_NETWORK=PUBLIC\n');
      dotenv.config({ path: fixture, override: true });
      expect(process.env.SUBMISSION_DOTENV_PROBE).toBeUndefined();
      expect(process.env.STELLAR_NETWORK).toBe('TESTNET');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('denies actual socket creation rather than relying on provider mocks', async () => {
    const socket = new net.Socket();
    try {
      const denied = once(socket, 'error');
      socket.connect({ host: '127.0.0.1', port: 9 });
      const [error] = await denied;
      expect(error).toMatchObject({ code: 'ERR_ACCESS_DENIED' });
    } finally {
      socket.destroy();
    }
  });

  it('cannot bypass network restrictions by spawning an external client', () => {
    expect(() => spawnSync(process.execPath, ['-e', 'process.exit(0)'])).toThrow(
      expect.objectContaining({ code: 'ERR_ACCESS_DENIED' }),
    );
  });
});
