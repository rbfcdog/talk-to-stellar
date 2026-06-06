#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const OUTPUT_ROOT = join(ROOT, 'insta-awards', 'evidence-runs');

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith('--')) continue;
  const [key, inlineValue] = arg.slice(2).split('=');
  if (inlineValue !== undefined) {
    args.set(key, inlineValue);
    continue;
  }
  const next = process.argv[index + 1];
  if (next && !next.startsWith('--')) {
    args.set(key, next);
    index += 1;
  } else {
    args.set(key, 'true');
  }
}

function safeSlug(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function git(argsList, fallback = '') {
  try {
    return execFileSync('git', argsList, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return fallback;
  }
}

function envStatus(names) {
  return Object.fromEntries(
    names.map((name) => [
      name,
      {
        present: Boolean(String(process.env[name] || '').trim()),
        value: String(process.env[name] || '').trim() ? '<redacted>' : '',
      },
    ]),
  );
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

const now = new Date();
const runId = safeSlug(args.get('run-id')) || now.toISOString().replace(/[:.]/g, '-');
const transferId = String(args.get('transfer-id') || '').trim();
const quoteId = String(args.get('quote-id') || '').trim();
const label = String(args.get('label') || 'Instawards reviewer evidence run').trim();
const runDir = join(OUTPUT_ROOT, runId);

mkdirSync(join(runDir, 'api'), { recursive: true });
mkdirSync(join(runDir, 'logs'), { recursive: true });
mkdirSync(join(runDir, 'screenshots'), { recursive: true });
mkdirSync(join(runDir, 'database'), { recursive: true });
mkdirSync(join(runDir, 'stellar'), { recursive: true });
mkdirSync(join(runDir, 'payout'), { recursive: true });

const manifest = {
  schema_version: 1,
  run_id: runId,
  label,
  created_at: now.toISOString(),
  git: {
    commit: git(['rev-parse', 'HEAD']),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    dirty: git(['status', '--short']) ? true : false,
  },
  scope: {
    sow: 'TalkToStellar - PIX-to-USD Transfer Routing on Stellar',
    environment: process.env.NODE_ENV || 'unspecified',
    transfer_id: transferId || null,
    quote_id: quoteId || null,
  },
  required_evidence: [
    {
      id: 'api-transcript',
      path: 'api/transcript.json',
      status: 'placeholder',
      description: 'Sequential request/response transcript for quote, transfer, Pix funding, settlement, payout, and reconciliation.',
    },
    {
      id: 'reconciliation-json',
      path: 'database/reconciliation.json',
      status: 'placeholder',
      description: 'Redacted reconciliation payload from GET /api/transfers/:id/reconciliation or database export.',
    },
    {
      id: 'transfer-row',
      path: 'database/transfer.json',
      status: 'placeholder',
      description: 'Redacted international_transfers row or GET /api/transfers/:id response.',
    },
    {
      id: 'stellar-evidence',
      path: 'stellar/settlement.json',
      status: 'placeholder',
      description: 'Real testnet hash/Horizon data, or explicit sandbox/mock label if settlement credentials were unavailable.',
    },
    {
      id: 'payout-evidence',
      path: 'payout/instruction.json',
      status: 'placeholder',
      description: 'Payout adapter payload/response with account numbers and secrets redacted.',
    },
    {
      id: 'screenshots',
      path: 'screenshots/',
      status: 'placeholder',
      description: 'Screenshots from /institution-settlement showing each lifecycle step.',
    },
    {
      id: 'logs',
      path: 'logs/',
      status: 'placeholder',
      description: 'Backend/frontend logs with correlation IDs and secrets redacted.',
    },
  ],
  environment_checklist: envStatus([
    'STELLAR_NETWORK',
    'STELLAR_SECRET_KEY',
    'STELLAR_PUBLIC_KEY',
    'USDC_ASSET_CODE',
    'USDC_ASSET_ISSUER',
    'USD_OFFRAMP_STELLAR_DESTINATION',
    'PAYOUT_PROVIDER',
    'ENABLE_REAL_PAYOUT_EXECUTION',
    'ALLOW_OPS_MOCKS',
    'ALLOW_MOCK_USD_PAYOUTS',
    'ETHERFUSE_API_KEY',
    'ETHERFUSE_SANDBOX_PIX_FALLBACK',
    'CIRCLE_PAYOUT_CREATE_URL',
    'BRIDGE_PAYOUT_CREATE_URL',
  ]),
  validation_commands: [
    'npm --prefix backend test -- --runInBand tests/international-transfer.service.test.ts tests/financial-conversion-reference.test.ts',
    'npm --prefix backend run build',
    'npm --prefix frontend run build',
  ],
};

writeJson(join(runDir, 'manifest.json'), manifest);
writeJson(join(runDir, 'api', 'transcript.json'), {
  run_id: runId,
  transfer_id: transferId || null,
  quote_id: quoteId || null,
  entries: [
    { step: 'quote', method: 'POST', path: '/api/quotes/brl-usd', status: 'pending', request: {}, response: {} },
    { step: 'transfer', method: 'POST', path: '/api/transfers', status: 'pending', request: {}, response: {} },
    { step: 'pix-intent', method: 'POST', path: '/api/transfers/:id/pix-intent', status: 'pending', request: {}, response: {} },
    { step: 'funding-confirmation', method: 'POST', path: '/api/transfers/:id/funding-confirmation', status: 'pending', request: {}, response: {} },
    { step: 'stellar-settlement', method: 'POST', path: '/api/transfers/:id/settle-stellar', status: 'pending', request: {}, response: {} },
    { step: 'payout-instruction', method: 'POST', path: '/api/transfers/:id/payout-instruction', status: 'pending', request: {}, response: {} },
    { step: 'reconciliation', method: 'GET', path: '/api/transfers/:id/reconciliation', status: 'pending', request: {}, response: {} },
  ],
});
writeJson(join(runDir, 'database', 'transfer.json'), { status: 'placeholder', transfer_id: transferId || null });
writeJson(join(runDir, 'database', 'reconciliation.json'), { status: 'placeholder', transfer_id: transferId || null });
writeJson(join(runDir, 'stellar', 'settlement.json'), {
  status: 'placeholder',
  evidence_type: 'real-testnet | sandbox | mock',
  network: process.env.STELLAR_NETWORK || null,
  transaction_hash: null,
  horizon_url: null,
});
writeJson(join(runDir, 'payout', 'instruction.json'), {
  status: 'placeholder',
  provider: process.env.PAYOUT_PROVIDER || null,
  provider_payout_id: null,
  sensitive_fields: 'redacted',
});

writeFileSync(
  join(runDir, 'README.md'),
  [
    `# ${label}`,
    '',
    `Run ID: \`${runId}\``,
    `Created: \`${now.toISOString()}\``,
    `Git commit: \`${manifest.git.commit || 'unknown'}\``,
    '',
    '## Fill Order',
    '',
    '1. Run the `/institution-settlement` demo route.',
    '2. Replace `api/transcript.json` placeholders with redacted request/response payloads.',
    '3. Export the transfer and reconciliation JSON into `database/`.',
    '4. Add Stellar settlement evidence in `stellar/settlement.json`.',
    '5. Add payout adapter payload/response in `payout/instruction.json`.',
    '6. Drop screenshots in `screenshots/` and logs in `logs/`.',
    '7. Update `manifest.json` evidence item statuses from `placeholder` to `captured`.',
    '',
    'Do not include private keys, API keys, session tokens, PINs, full bank account numbers, or unredacted customer data.',
    '',
  ].join('\n'),
);

writeFileSync(join(runDir, 'screenshots', 'README.md'), 'Place reviewer screenshots from /institution-settlement here.\n');
writeFileSync(join(runDir, 'logs', 'README.md'), 'Place redacted backend/frontend logs with correlation IDs here.\n');

console.log(`Instawards evidence framework created: ${runDir}`);
console.log('Generated output is intentionally ignored by git.');
