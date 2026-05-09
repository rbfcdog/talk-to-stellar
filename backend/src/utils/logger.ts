/**
 * Logger utility for backend
 */

import fs from 'fs';
import path from 'path';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogConfig {
  level: LogLevel;
  timestamp: boolean;
  file: string | null;
  colorize: boolean;
}

const DEFAULT_CONFIG: LogConfig = {
  level: (process.env.LOG_LEVEL as LogLevel) || 'info',
  timestamp: true,
  file: process.env.LOG_FILE || null,
  colorize: process.stdout.isTTY ? true : false,
};

const COLORS = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m', // green
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
  reset: '\x1b[0m',
};

const LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

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
    const color = this.config.colorize ? COLORS[level] : '';
    const reset = this.config.colorize ? COLORS.reset : '';

    return `${color}${timestamp} [${level.toUpperCase()}]${reset} ${message}`;
  }

  private writeLog(level: LogLevel, message: string): void {
    const formatted = this.formatMessage(level, message);

    // Write to console
    if (level === 'error' || level === 'warn') {
      console.error(formatted);
    } else {
      console.log(formatted);
    }

    // Write to file if configured
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
