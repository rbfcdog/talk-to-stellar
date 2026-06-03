import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import {
  researchLogToCsv,
  researchLogToMarkdown,
  researchLogToNotionBlocks,
  UserResearchEvidenceService,
} from '../src/api/services/user-research-log.service';

dotenv.config();

type CliOptions = {
  since?: string;
  until?: string;
  outDir: string;
  limitUsers: number;
  syncNotion: boolean;
  notionPageId: string;
  includeSuspectedTestUsers: boolean;
  network: string;
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

function parseOptions(): CliOptions {
  const outDir = argValue('out') || process.env.USER_RESEARCH_EXPORT_DIR || 'exports/user-research';
  const network = (argValue('network') || process.env.USER_RESEARCH_NETWORK || 'TESTNET').trim().toUpperCase();
  return {
    since: argValue('since') || process.env.USER_RESEARCH_SINCE || undefined,
    until: argValue('until') || process.env.USER_RESEARCH_UNTIL || undefined,
    outDir,
    limitUsers: Number(argValue('limit') || process.env.USER_RESEARCH_LIMIT || 25),
    syncNotion: hasFlag('sync-notion') || /^(1|true|yes)$/i.test(String(process.env.USER_RESEARCH_SYNC_NOTION || '')),
    notionPageId: argValue('notion-page-id') || process.env.NOTION_USER_RESEARCH_PAGE_ID || '',
    includeSuspectedTestUsers:
      hasFlag('include-test-users') ||
      /^(1|true|yes)$/i.test(String(process.env.USER_RESEARCH_INCLUDE_SUSPECTED_TEST_USERS || '')),
    network: hasFlag('include-testnet') ? 'ALL' : network,
  };
}

function safeStamp(value = new Date()) {
  return value.toISOString().replace(/[:.]/g, '-');
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath: string, content: string) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`wrote ${filePath}`);
}

async function appendBlocksToNotion(input: { pageId: string; blocks: any[] }) {
  const notionApiKey = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN || '';
  if (!notionApiKey) {
    throw new Error('NOTION_API_KEY is required for --sync-notion.');
  }
  if (!input.pageId) {
    throw new Error('NOTION_USER_RESEARCH_PAGE_ID or --notion-page-id is required for --sync-notion.');
  }

  const headers = {
    Authorization: `Bearer ${notionApiKey}`,
    'Content-Type': 'application/json',
    'Notion-Version': process.env.NOTION_VERSION || '2022-06-28',
  };

  for (let index = 0; index < input.blocks.length; index += 90) {
    const children = input.blocks.slice(index, index + 90);
    await axios.patch(
      `https://api.notion.com/v1/blocks/${encodeURIComponent(input.pageId)}/children`,
      { children },
      { headers },
    );
  }
}

async function main() {
  const options = parseOptions();
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
  const base = path.join(absoluteOutDir, `${networkSlug}-user-research-log-${stamp}`);
  const jsonPath = `${base}.json`;
  const csvPath = `${base}.csv`;
  const mdPath = `${base}.md`;

  writeFile(jsonPath, `${JSON.stringify(exportData, null, 2)}\n`);
  writeFile(csvPath, `${researchLogToCsv(exportData)}\n`);
  writeFile(mdPath, researchLogToMarkdown(exportData));

  console.log('');
  console.log(`real users found: ${exportData.realUserCount}`);
  console.log(`raw events scanned: ${exportData.rawEventCount}`);
  for (const warning of exportData.warnings) console.warn(`warning: ${warning}`);

  if (options.syncNotion) {
    const blocks = researchLogToNotionBlocks(exportData);
    await appendBlocksToNotion({ pageId: options.notionPageId, blocks });
    console.log(`synced to Notion page: ${options.notionPageId}`);
  } else {
    console.log('notion sync skipped. Use --sync-notion with NOTION_API_KEY and NOTION_USER_RESEARCH_PAGE_ID.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
