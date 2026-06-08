/**
 * Logger utility for backend
 */

import fs from 'fs';
import path from 'path';

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

interface LogConfig {
  level: LogLevel;
  timestamp: boolean;
  file: string | null;
  colorize: boolean;
}

function resolveLogLevel(): LogLevel {
  const raw = String(process.env.LOG_LEVEL || '').trim().toLowerCase();
  if (/^trace\b/.test(raw)) return 'trace';
  if (/^debug\b/.test(raw)) return 'debug';
  if (/^info\b/.test(raw)) return 'info';
  if (/^warn\b/.test(raw)) return 'warn';
  if (/^error\b/.test(raw)) return 'error';
  return 'info';
}

const DEFAULT_CONFIG: LogConfig = {
  level: resolveLogLevel(),
  timestamp: true,
  file: process.env.LOG_FILE || null,
  colorize: process.stdout.isTTY ? true : false,
};

const COLORS: Record<LogLevel | 'reset', string> = {
  trace: '\x1b[90m', // grey
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m',  // green
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
  reset: '\x1b[0m',
};

const LEVEL_VALUES: Record<LogLevel, number> = {
  trace: -1,
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Truncate a string to maxLen characters, appending a suffix if truncated.
 * Useful for logging long payloads, URLs, or agent responses without flooding logs.
 */
export function truncate(value: string, maxLen = 200): string {
  const raw = String(value ?? '');
  if (raw.length <= maxLen) return raw;
  return raw.slice(0, maxLen) + `...[truncated ${raw.length - maxLen} chars]`;
}

/**
 * Simple elapsed-time tracker for logging step durations.
 *
 * Usage:
 *   const t = startTimer();
 *   // ... do work ...
 *   logger.trace(`step took ${t.elapsed()}ms`);
 */
export function startTimer(): { elapsed: () => number; reset: () => void } {
  let started = Date.now();
  return {
    elapsed: () => Date.now() - started,
    reset: () => { started = Date.now(); },
  };
}

/**
 * Returns a base duration in ms since the given timestamp, formatted as "Nms".
 */
export function elapsedSince(started: number): string {
  return `${Date.now() - started}ms`;
}

/**
 * Format a duration in ms as a human-readable string e.g. "1234ms" or "2.3s".
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

class Logger {
  private config: LogConfig;

  constructor(config: Partial<LogConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_VALUES[level] >= LEVEL_VALUES[this.config.level];
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = this.config.timestamp
      ? `[${new Date().toISOString()}]`
      : '';
    const color = this.config.colorize ? (COLORS[level] ?? '') : '';
    const reset = this.config.colorize ? COLORS.reset : '';

    return `${color}${timestamp} [${level.toUpperCase()}]${reset} ${message}`;
  }

  private writeLog(level: LogLevel, message: string): void {
    const formatted = this.formatMessage(level, message);

    if (level === 'error' || level === 'warn') {
      console.error(formatted);
    } else {
      console.log(formatted);
    }

    if (this.config.file) {
      try {
        const dir = path.dirname(this.config.file);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.appendFileSync(this.config.file, formatted + '\n');
      } catch (error) {
        console.error('Failed to write log to file:', error);
      }
    }
  }

  trace(message: string): void {
    if (this.shouldLog('trace')) {
      this.writeLog('trace', message);
    }
  }

  debug(message: string): void {
    if (this.shouldLog('debug')) {
      this.writeLog('debug', message);
    }
  }

  info(message: string): void {
    if (this.shouldLog('info')) {
      this.writeLog('info', message);
    }
  }

  warn(message: string): void {
    if (this.shouldLog('warn')) {
      this.writeLog('warn', message);
    }
  }

  error(message: string): void {
    if (this.shouldLog('error')) {
      this.writeLog('error', message);
    }
  }
}

export const logger = new Logger();
