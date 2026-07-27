// src/logger.ts
//
// Centralized logger with LOG_LEVEL support.
// MCP servers communicate over stdout, so all log output goes to stderr.

const LOG_LEVELS: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

function resolveLevel(): string {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && env in LOG_LEVELS) {
    return env;
  }
  return 'info';
}

const currentLevel = resolveLevel();

function shouldLog(level: string): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

export const logger = {
  debug(...args: unknown[]) {
    if (shouldLog('debug')) console.error('[DEBUG]', ...args);
  },
  info(...args: unknown[]) {
    if (shouldLog('info')) console.error('[INFO]', ...args);
  },
  warn(...args: unknown[]) {
    if (shouldLog('warn')) console.error('[WARN]', ...args);
  },
  error(...args: unknown[]) {
    if (shouldLog('error')) console.error('[ERROR]', ...args);
  },
};
