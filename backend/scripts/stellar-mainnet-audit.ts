/**
 * Static Mainnet hardening scan for the repository.
 *
 * The scan is intentionally conservative. It does not prove the project is
 * Mainnet-ready; it highlights patterns that need review before cutover.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

type Severity = 'critical' | 'high' | 'medium' | 'low';

interface Finding {
  id: string;
  severity: Severity;
  title: string;
  status: 'pass' | 'fail' | 'review';
  detail: string;
  files: string[];
}

const repoRoot = path.resolve(__dirname, '../..');
const trackedFiles = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
  .split('\n')
  .map((file) => file.trim())
  .filter(Boolean)
  .filter((file) => !file.includes('/node_modules/') && !file.startsWith('deprecated/'));

const fileText = new Map<string, string>();
for (const file of trackedFiles) {
  const fullPath = path.join(repoRoot, file);
  try {
    if (fs.statSync(fullPath).isFile()) {
      fileText.set(file, fs.readFileSync(fullPath, 'utf8'));
    }
  } catch {
    // Ignore deleted or binary files in a dirty worktree.
  }
}

function filesMatching(predicate: (file: string, text: string) => boolean): string[] {
  return Array.from(fileText.entries())
    .filter(([file, text]) => predicate(file, text))
    .map(([file]) => file)
    .sort();
}

function addFinding(findings: Finding[], finding: Finding): void {
  findings.push({
    ...finding,
    files: finding.files.slice(0, 20),
  });
}

const findings: Finding[] = [];

const wrongPassphraseFiles = filesMatching((_file, text) =>
  /Public Global Stellar Network ; May 2015|Test StellarNetwork ; September 2015/.test(text)
).filter((file) => file !== 'backend/scripts/stellar-mainnet-audit.ts' && file !== 'docs/STELLAR_MAINNET_HARDENING_SCAN.md');
addFinding(findings, {
  id: 'stellar-passphrase-drift',
  severity: 'critical',
  title: 'Stellar network passphrases must use SDK/official values',
  status: wrongPassphraseFiles.length ? 'fail' : 'pass',
  detail: wrongPassphraseFiles.length
    ? 'Found legacy or invalid passphrase literals that can produce envelopes invalid for the intended network.'
    : 'No invalid Stellar passphrase literals found in tracked files.',
  files: wrongPassphraseFiles,
});

const runtimeConfig = fileText.get('backend/src/config/stellar.ts') || '';
addFinding(findings, {
  id: 'public-runtime-activation-guard',
  severity: 'high',
  title: 'PUBLIC runtime must require an explicit cutover guard',
  status: runtimeConfig.includes('STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION') ? 'pass' : 'fail',
  detail: 'The active Stellar config should refuse STELLAR_NETWORK=PUBLIC unless the Mainnet cutover guard is explicitly enabled.',
  files: ['backend/src/config/stellar.ts'],
});

const unguardedTestnetScripts = filesMatching((file, text) =>
  file.startsWith('backend/scripts/') &&
  /(friendbot|Networks\.TESTNET|horizon-testnet)/i.test(text) &&
  !file.endsWith('stellar-script-safety.ts') &&
  !file.endsWith('stellar-mainnet-audit.ts') &&
  !text.includes('assertTestnetOnlyScript')
);
addFinding(findings, {
  id: 'testnet-script-mainnet-guard',
  severity: 'high',
  title: 'Testnet scripts must refuse Mainnet execution',
  status: unguardedTestnetScripts.length ? 'review' : 'pass',
  detail: unguardedTestnetScripts.length
    ? 'Some Testnet-oriented scripts do not use the shared assertTestnetOnlyScript guard. Review whether they are read-only or should be guarded.'
    : 'Tracked Testnet mutation scripts use the shared Testnet-only guard.',
  files: unguardedTestnetScripts,
});

const bulkScripts = [
  'backend/scripts/add-trustlines-all.ts',
  'backend/scripts/backfill-default-trustlines.ts',
  'backend/scripts/backfill-trustlines-all-existing-wallets.ts',
].filter((file) => {
  const text = fileText.get(file) || '';
  return text && !text.includes('assertMainnetBulkMutationAllowed');
});
addFinding(findings, {
  id: 'mainnet-bulk-mutation-guard',
  severity: 'high',
  title: 'Bulk account mutation scripts need a separate Mainnet guard',
  status: bulkScripts.length ? 'fail' : 'pass',
  detail: 'Bulk trustline/backfill scripts should require STELLAR_MAINNET_ALLOW_BULK_MUTATION=true if run after Mainnet activation.',
  files: bulkScripts,
});

const legacySqlHazards = filesMatching((file, text) =>
  file.startsWith('backend/migrations/') &&
  /(CREATE OR REPLACE FUNCTION public\.exec_sql|DISABLE ROW LEVEL SECURITY|public\.get_private_key|vault\.decrypted_secrets)/i.test(text)
);
addFinding(findings, {
  id: 'legacy-sql-production-hazards',
  severity: 'critical',
  title: 'Legacy SQL setup contains production-hostile security patterns',
  status: legacySqlHazards.length ? 'review' : 'pass',
  detail: legacySqlHazards.length
    ? 'Legacy setup files still contain exec_sql, RLS disablement, or decrypted Vault access. Keep them out of Mainnet production migrations.'
    : 'No tracked migration file contains the reviewed legacy SQL hazard patterns.',
  files: legacySqlHazards,
});

const secretLoggingFiles = filesMatching((file, text) =>
  file.startsWith('backend/scripts/') &&
  /(console\.(log|info|warn|error)\([^)]*(\.secret\(\)|Secret Key:|_SECRET\s*=))/is.test(text)
);
addFinding(findings, {
  id: 'secret-material-logging',
  severity: 'high',
  title: 'Scripts should not print secret material in Mainnet workflows',
  status: secretLoggingFiles.length ? 'review' : 'pass',
  detail: secretLoggingFiles.length
    ? 'Some scripts print generated or loaded secret material. This can be acceptable for throwaway Testnet setup, but must stay impossible in Mainnet workflows.'
    : 'No tracked script matched the secret logging pattern.',
  files: secretLoggingFiles,
});

const publicSecretEnvFiles = filesMatching((_file, text) => /NEXT_PUBLIC_[A-Z0-9_]*(SECRET|PRIVATE|SERVICE_ROLE|API_KEY)/.test(text));
addFinding(findings, {
  id: 'frontend-public-secret-env',
  severity: 'critical',
  title: 'Secrets must not use NEXT_PUBLIC_* env names',
  status: publicSecretEnvFiles.length ? 'fail' : 'pass',
  detail: publicSecretEnvFiles.length
    ? 'Found public frontend env variable names that look secret-bearing.'
    : 'No NEXT_PUBLIC_* variable name matched the secret-bearing pattern.',
  files: publicSecretEnvFiles,
});

const staleIssuerDocs = filesMatching((file, text) =>
  file.startsWith('docs/') && /GBBD47UZQ2JTIKI3HP3OZFZWMJBFNMK32K4EX4VUP5DGNMVJ6DZWBSA6|GBBD47UZQ5PBC7BY76I3PN4RYSEE3U2IRVIB42IXLKNVGIZCMARVEL6/.test(text)
);
addFinding(findings, {
  id: 'stale-mainnet-issuer-docs',
  severity: 'medium',
  title: 'Docs should not keep stale Mainnet issuer examples',
  status: staleIssuerDocs.length ? 'review' : 'pass',
  detail: staleIssuerDocs.length
    ? 'Some docs reference older/example USDC issuer values that differ from the configured Mainnet issuer.'
    : 'No stale USDC issuer examples found in docs.',
  files: staleIssuerDocs,
});

function severityRank(severity: Severity): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[severity];
}

function renderMarkdown(): string {
  const sorted = [...findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  const now = new Date().toISOString();
  const counts = sorted.reduce<Record<string, number>>((acc, finding) => {
    acc[finding.status] = (acc[finding.status] || 0) + 1;
    return acc;
  }, {});

  const lines = [
    '# Stellar Mainnet Static Audit',
    '',
    `Generated: ${now}`,
    '',
    `Summary: pass=${counts.pass || 0}, review=${counts.review || 0}, fail=${counts.fail || 0}`,
    '',
  ];

  for (const finding of sorted) {
    lines.push(`## ${finding.id}`);
    lines.push('');
    lines.push(`- Severity: ${finding.severity}`);
    lines.push(`- Status: ${finding.status}`);
    lines.push(`- Title: ${finding.title}`);
    lines.push(`- Detail: ${finding.detail}`);
    if (finding.files.length) {
      lines.push('- Files:');
      finding.files.forEach((file) => lines.push(`  - ${file}`));
    } else {
      lines.push('- Files: none');
    }
    lines.push('');
  }

  return lines.join('\n');
}

const output = renderMarkdown();
console.log(output);

if (process.argv.includes('--strict') && findings.some((finding) => finding.status === 'fail')) {
  process.exitCode = 1;
}
