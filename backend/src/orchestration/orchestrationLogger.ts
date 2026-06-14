import fs from 'fs';
import path from 'path';
import { TransferActor, TransferState } from './types';

export type OrchestrationLogEntry = {
  ts: string;
  level: 'info' | 'warn' | 'error';
  transfer_id: string;
  public_ref: string;
  event: string;
  from_state: TransferState | null;
  to_state: TransferState;
  actor: TransferActor;
  correlation_id: string | null;
  meta: Record<string, unknown>;
};

function writeFileLine(line: string): void {
  const logFile = String(process.env.LOG_FILE || '').trim();
  if (!logFile) return;
  try {
    const dir = path.dirname(logFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(logFile, `${line}\n`);
  } catch (error) {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      event: 'orchestration_log_file_write_failed',
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

export function logOrchestration(entry: Omit<OrchestrationLogEntry, 'ts'>): OrchestrationLogEntry {
  const fullEntry: OrchestrationLogEntry = {
    ts: new Date().toISOString(),
    ...entry,
    correlation_id: entry.correlation_id || null,
    meta: entry.meta || {},
  };
  const line = JSON.stringify(fullEntry);
  if (entry.level === 'error' || entry.level === 'warn') console.error(line);
  else console.log(line);
  writeFileLine(line);
  return fullEntry;
}

export function readLogFileEntriesForTransfer(input: {
  transferId: string;
  publicRef?: string;
  logFile?: string;
}): OrchestrationLogEntry[] {
  const logFile = String(input.logFile || process.env.LOG_FILE || '').trim();
  if (!logFile || !fs.existsSync(logFile)) return [];
  const lines = fs.readFileSync(logFile, 'utf8').split(/\r?\n/).filter(Boolean);
  const entries: OrchestrationLogEntry[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as OrchestrationLogEntry;
      if (
        parsed.transfer_id === input.transferId ||
        (input.publicRef && parsed.public_ref === input.publicRef)
      ) {
        entries.push(parsed);
      }
    } catch {
      continue;
    }
  }
  return entries;
}
