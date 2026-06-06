#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

function hashText(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function redactSensitive(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactSensitive);
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (/secret|token|pin|password|authorization|private|seed|api[_-]?key/i.test(key)) {
        return [key, item ? '[redacted]' : item];
      }
      if (/account(number)?|account_number/i.test(key)) {
        const digits = String(item || '').replace(/\D+/g, '');
        return [key, digits ? `[redacted-last4:${digits.slice(-4)}]` : '[redacted]'];
      }
      if (/routing(number)?|routing_number/i.test(key)) {
        const digits = String(item || '').replace(/\D+/g, '');
        return [key, digits ? `[redacted-last4:${digits.slice(-4)}]` : '[redacted]'];
      }
      if (/legal_name|entity_name|accountHolderName|account_holder_name|tax_id|cpf|email/i.test(key)) {
        return [key, item ? `[redacted-hash:${hashText(item)}]` : item];
      }
      return [key, redactSensitive(item)];
    }),
  );
}

const now = new Date();
const runId = safeSlug(args.get('run-id')) || now.toISOString().replace(/[:.]/g, '-');
const transferId = String(args.get('transfer-id') || '').trim();
const quoteId = String(args.get('quote-id') || '').trim();
const label = String(args.get('label') || 'Instawards reviewer evidence run').trim();
const apiBase = String(args.get('api-base') || process.env.INSTAWARDS_API_BASE || '').replace(/\/+$/, '');
const opsSecret = String(args.get('ops-secret') || process.env.INTERNATIONAL_TRANSFER_OPS_SECRET || '').trim();
const correlationId = String(args.get('correlation-id') || args.get('corr') || '').trim();
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
    {
      id: 'orchestration-log',
      path: 'logs/orchestration-log.json',
      status: 'placeholder',
      description: 'Redacted lifecycle log from GET /api/transfers/:id/orchestration-log.',
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

async function fetchJson(path) {
  if (!apiBase) throw new Error('--api-base is required for API capture.');
  const headers = {
    accept: 'application/json',
    'x-request-id': `instawards_${Date.now().toString(36)}`,
    ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
    ...(opsSecret ? { 'x-international-transfer-ops-secret': opsSecret } : {}),
  };
  const response = await fetch(`${apiBase}${path}`, { headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`${path} failed with HTTP ${response.status}: ${payload?.message || 'unknown error'}`);
  }
  return {
    captured_at: new Date().toISOString(),
    http_status: response.status,
    request_id: payload?.request_id || response.headers.get('x-request-id') || null,
    correlation_id: payload?.correlation_id || response.headers.get('x-correlation-id') || correlationId || null,
    payload: redactSensitive(payload),
  };
}

function markEvidence(id, status, detail) {
  const item = manifest.required_evidence.find((entry) => entry.id === id);
  if (!item) return;
  item.status = status;
  if (detail) item.detail = detail;
}

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

if (apiBase && transferId) {
  const captureSummary = {
    api_base: apiBase,
    transfer_id: transferId,
    started_at: new Date().toISOString(),
    captures: [],
  };
  const captures = [
    {
      id: 'transfer-row',
      path: `/api/transfers/${encodeURIComponent(transferId)}`,
      file: join(runDir, 'database', 'transfer.json'),
    },
    {
      id: 'reconciliation-json',
      path: `/api/transfers/${encodeURIComponent(transferId)}/reconciliation`,
      file: join(runDir, 'database', 'reconciliation.json'),
    },
    {
      id: 'orchestration-log',
      path: `/api/transfers/${encodeURIComponent(transferId)}/orchestration-log`,
      file: join(runDir, 'logs', 'orchestration-log.json'),
    },
  ];

  for (const capture of captures) {
    try {
      const body = await fetchJson(capture.path);
      writeJson(capture.file, body);
      markEvidence(capture.id, 'captured', `Captured from ${capture.path}`);
      captureSummary.captures.push({ id: capture.id, status: 'captured', path: capture.path });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeJson(capture.file, {
        status: 'blocked',
        captured_at: new Date().toISOString(),
        path: capture.path,
        message,
      });
      markEvidence(capture.id, 'blocked', message);
      captureSummary.captures.push({ id: capture.id, status: 'blocked', path: capture.path, message });
    }
  }

  if (captureSummary.captures.some((capture) => capture.id === 'orchestration-log' && capture.status === 'captured')) {
    markEvidence('logs', 'captured', 'Orchestration log captured through the lifecycle API.');
  }
  captureSummary.finished_at = new Date().toISOString();
  writeJson(join(runDir, 'api', 'capture-summary.json'), captureSummary);
}

writeJson(join(runDir, 'manifest.json'), manifest);

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
    apiBase && transferId
      ? '8. API capture was attempted automatically for transfer, reconciliation and orchestration log.'
      : '8. To capture API artifacts automatically, rerun with `--api-base=<url> --transfer-id=<id>`.',
    '',
    'Do not include private keys, API keys, session tokens, PINs, full bank account numbers, or unredacted customer data.',
    '',
  ].join('\n'),
);

writeFileSync(join(runDir, 'screenshots', 'README.md'), 'Place reviewer screenshots from /institution-settlement here.\n');
writeFileSync(join(runDir, 'logs', 'README.md'), 'Place redacted backend/frontend logs with correlation IDs here.\n');

console.log(`Instawards evidence framework created: ${runDir}`);
console.log('Generated output is intentionally ignored by git.');
