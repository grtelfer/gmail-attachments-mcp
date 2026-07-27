#!/usr/bin/env node

// src/index.ts
//
// Entry point for the Gmail MCP Server.
//
// Usage:
//   gmail-mcp          Start the MCP server (default)
//   gmail-mcp auth     Run the interactive OAuth flow, then verify Gmail access

import { FastMCP } from 'fastmcp';
import { initializeGoogleClient, getGmailClient } from './clients.js';
import { registerAllTools } from './tools/index.js';
import { logger } from './logger.js';

// --- Auth subcommand ---
if (process.argv[2] === 'auth') {
  const { runAuthFlow } = await import('./auth.js');
  try {
    await runAuthFlow();
    // Verify the token actually works against the Gmail API. This surfaces the
    // "Gmail API has not been used in project ... is disabled" error (with its
    // enable URL) immediately, instead of on first tool call.
    const gmail = await getGmailClient();
    const profile = await gmail.users.getProfile({ userId: 'me' });
    logger.info(
      `Gmail access verified for ${profile.data.emailAddress} ` +
        `(${profile.data.messagesTotal} messages total).`
    );
    logger.info('Authorization complete. You can now start the MCP server.');
    process.exit(0);
  } catch (error: any) {
    logger.error('Authorization/verification failed:', error.message || error);
    logger.error(
      'If the error mentions the Gmail API is disabled, enable it once in the Google Cloud ' +
        'Console for this OAuth client\'s project, then re-run `gmail-mcp auth`.'
    );
    process.exit(1);
  }
}

// --- Server startup ---
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection:', reason);
});

const server = new FastMCP({
  name: 'gmail-attachments-mcp',
  version: '1.0.0',
});

registerAllTools(server);

try {
  await initializeGoogleClient();
  logger.info('Starting Gmail MCP server...');
  server.start({ transportType: 'stdio' as const });
  logger.info('MCP Server running via stdio.');
} catch (startError: any) {
  logger.error('FATAL: Server failed to start:', startError.message || startError);
  process.exit(1);
}
