import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import {
  researchLogToCsv,
  researchLogToMarkdown,
  UserResearchEvidenceService,
  UserResearchExport,
  UserResearchLogEntry,
} from '../src/api/services/user-research-log.service';

dotenv.config();

type CliOptions = {
  since?: string;
  until?: string;
  outDir: string;
  network: string;
  minUsers: number;
  limitUsers: number;
  includeSuspectedTestUsers: boolean;
  strict: boolean;
  help: boolean;
};

function argValue(name: string): string {
  const exact = `--${name}=`;
  const pairIndex = process.argv.indexOf(`--${name}`);
  if (pairIndex >= 0 && process.argv[pairIndex + 1]) return process.argv[pairIndex + 1];
  const match = process.argv.find((arg) => arg.startsWith(exact));
  return match ? match.slice(exact.length) : '';
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function parseOptions(): CliOptions {
  const minUsers = parsePositiveInt(argValue('min-users') || process.env.USER_RESEARCH_MIN_USERS, 15);
  const limitUsers = parsePositiveInt(argValue('limit') || process.env.USER_RESEARCH_LIMIT, Math.max(25, minUsers));
  return {
    since: argValue('since') || process.env.USER_RESEARCH_SINCE || undefined,
    until: argValue('until') || process.env.USER_RESEARCH_UNTIL || undefined,
    outDir: argValue('out') || process.env.USER_RESEARCH_EXPORT_DIR || 'exports/user-research',
    network: (argValue('network') || process.env.USER_RESEARCH_NETWORK || 'TESTNET').trim().toUpperCase(),
    minUsers,
    limitUsers,
    includeSuspectedTestUsers:
      hasFlag('include-test-users') ||
      /^(1|true|yes)$/i.test(String(process.env.USER_RESEARCH_INCLUDE_SUSPECTED_TEST_USERS || '')),
    strict: hasFlag('strict') || /^(1|true|yes)$/i.test(String(process.env.USER_RESEARCH_STRICT || '')),
    help: hasFlag('help') || hasFlag('h'),
  };
}

function usage() {
  return [
    'Build a Notion-ready 15+ real-user research log package.',
    '',
    'Usage:',
    '  npm run research:build-15-user-log -- --since=2026-06-01 --network=testnet',
    '',
    'Options:',
    '  --since=YYYY-MM-DD           Include events from this date.',
    '  --until=YYYY-MM-DD           Include events until this date.',
    '  --network=testnet|mainnet|all',
    '  --min-users=15               Minimum real users expected.',
    '  --limit=25                   Maximum users exported.',
    '  --out=exports/user-research  Output directory.',
    '  --strict                     Exit non-zero if fewer than --min-users are found.',
    '  --include-test-users         Include users with QA/test markers.',
    '',
    'The script does not fabricate sessions. If fewer than 15 real users exist,',
    'it writes a manual capture CSV for the missing real testers.',
  ].join('\n');
}

function safeStamp(value = new Date()) {
  return value.toISOString().replace(/[:.]/g, '-');
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath: string, content: string) {
  fs.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  console.log(`wrote ${filePath}`);
}

function csvEscape(value: unknown): string {
  const text = String(value || '').replace(/\r?\n/g, ' ');
  return `"${text.replace(/"/g, '""')}"`;
}

function csvLine(values: unknown[]): string {
  return values.map(csvEscape).join(',');
}

function needsManualFeedback(entry: UserResearchLogEntry): boolean {
  return (
    !entry.feedbackLiteral ||
    entry.feedbackLiteral === 'Sem feedback literal registrado' ||
    !entry.evidence ||
    entry.evidence === 'Sem link/hash anexado'
  );
}

function buildManualCaptureCsv(exportData: UserResearchExport, minUsers: number): string {
  const headers = [
    'Usuario',
    'Status da linha',
    'Data',
    'Canal',
    'Pessoa real',
    'Identificador mascarado',
    'Frase exata digitada',
    'O que o produto fez',
    'Onde travou ou confundiu',
    'Feedback literal',
    'Evidencia print/link/hash',
    'Observacoes',
  ];
  const rows: string[][] = [];

  for (const entry of exportData.entries) {
    if (!needsManualFeedback(entry)) continue;
    rows.push([
      entry.userLabel,
      'completar evidencia/feedback real',
      entry.dateLabel,
      entry.channel,
      'sim',
      entry.userIdentifier,
      entry.prompts[0] || '',
      entry.whatDid,
      entry.blockers.join(' | '),
      entry.feedbackLiteral === 'Sem feedback literal registrado' ? '' : entry.feedbackLiteral,
      entry.evidence === 'Sem link/hash anexado' ? '' : entry.evidence,
      'Preencha apenas com informacao real observada.',
    ]);
  }

  for (let index = exportData.entries.length + 1; index <= minUsers; index += 1) {
    rows.push([
      `User ${String(index).padStart(2, '0')}`,
      'capturar usuario real faltante',
      '',
      'Web/WhatsApp/Telegram',
      'sim',
      '',
      '',
      '',
      '',
      '',
      '',
      'Nao inventar. Preencher depois de uma sessao real.',
    ]);
  }

  return [headers, ...rows].map(csvLine).join('\n');
}

function buildPackageReadme(input: {
  exportData: UserResearchExport;
  minUsers: number;
  files: Record<string, string>;
}): string {
  const missing = Math.max(0, input.minUsers - input.exportData.realUserCount);
  const needsFeedback = input.exportData.entries.filter(needsManualFeedback).length;
  const lines = [
    `# Pacote de log de usuarios - ${input.exportData.networkFilter}`,
    '',
    `Gerado em: ${input.exportData.generatedAt}`,
    `Usuarios reais encontrados: ${input.exportData.realUserCount}`,
    `Minimo esperado: ${input.minUsers}`,
    `Linhas faltantes para 15+: ${missing}`,
    `Usuarios reais sem feedback/evidencia completa: ${needsFeedback}`,
    '',
    '## Arquivos',
    '',
    `- CSV para importar no Notion: ${input.files.csv}`,
    `- Markdown para revisar/colar no Notion: ${input.files.markdown}`,
    `- JSON bruto para auditoria: ${input.files.json}`,
    `- CSV de captura manual: ${input.files.manualCsv}`,
    '',
    '## Como usar no Notion',
    '',
    '1. Importe o CSV principal em uma tabela do Notion.',
    '2. Abra o Markdown para copiar os detalhes por usuario abaixo da tabela.',
    '3. Se faltarem usuarios ou feedback, use o CSV de captura manual durante os testes reais.',
    '4. Anexe prints, links de recibo, hashes ou gravacoes reais quando existirem.',
    '',
    '## Regras',
    '',
    '- Nao complete linhas faltantes com usuarios falsos.',
    '- Nao invente feedback literal.',
    '- Testnet pode ser usado para produto em teste, mas marque a rede corretamente.',
    '- Mainnet so deve conter sessoes realmente executadas no produto mainnet.',
    '',
  ];

  if (input.exportData.warnings.length) {
    lines.push('## Avisos do export');
    for (const warning of input.exportData.warnings) lines.push(`- ${warning}`);
    lines.push('');
  }

  return lines.join('\n');
}

async function main() {
  const options = parseOptions();
  if (options.help) {
    console.log(usage());
    return;
  }

  const absoluteOutDir = path.resolve(process.cwd(), options.outDir);
  ensureDir(absoluteOutDir);

  const exportData = await UserResearchEvidenceService.buildMainnetLog({
    since: options.since,
    until: options.until,
    limitUsers: options.limitUsers,
    network: options.network,
    includeSuspectedTestUsers: options.includeSuspectedTestUsers,
  });

  const stamp = safeStamp();
  const networkSlug = String(exportData.networkFilter || options.network || 'testnet').toLowerCase();
  const baseName = `${networkSlug}-15plus-user-research-${stamp}`;
  const paths = {
    json: path.join(absoluteOutDir, `${baseName}.json`),
    csv: path.join(absoluteOutDir, `${baseName}.csv`),
    markdown: path.join(absoluteOutDir, `${baseName}.md`),
    manualCsv: path.join(absoluteOutDir, `${baseName}-manual-capture.csv`),
    readme: path.join(absoluteOutDir, `${baseName}-README.md`),
  };

  writeFile(paths.json, JSON.stringify(exportData, null, 2));
  writeFile(paths.csv, researchLogToCsv(exportData));
  writeFile(paths.markdown, researchLogToMarkdown(exportData));
  writeFile(paths.manualCsv, buildManualCaptureCsv(exportData, options.minUsers));
  writeFile(paths.readme, buildPackageReadme({
    exportData,
    minUsers: options.minUsers,
    files: {
      json: path.basename(paths.json),
      csv: path.basename(paths.csv),
      markdown: path.basename(paths.markdown),
      manualCsv: path.basename(paths.manualCsv),
    },
  }));

  console.log('');
  console.log(`real users found: ${exportData.realUserCount}/${options.minUsers}`);
  console.log(`network: ${exportData.networkFilter}`);
  console.log(`raw events scanned: ${exportData.rawEventCount}`);
  for (const warning of exportData.warnings) console.warn(`warning: ${warning}`);

  if (exportData.realUserCount < options.minUsers) {
    const message = `Only ${exportData.realUserCount} real users found. Use ${paths.manualCsv} to capture the missing real sessions.`;
    if (options.strict) {
      console.error(message);
      process.exit(2);
    }
    console.warn(message);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
