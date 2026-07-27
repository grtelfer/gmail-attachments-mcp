// src/tools/searchMessages.ts
import { UserError } from 'fastmcp';
import { z } from 'zod';
import type { FastMCP } from 'fastmcp';
import { getGmailClient } from '../clients.js';
import { collectAttachments, header } from './helpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'gmail_search_messages',
    description:
      'Search Gmail using standard Gmail query syntax (e.g. "has:attachment from:jane@x.com newer_than:30d"). ' +
      'Returns matching messages with their id, sender, subject, date, snippet, and a list of any attachments ' +
      '(filename, mimeType, size, attachmentId). Use the returned message id + attachmentId with gmail_download_attachment.',
    parameters: z.object({
      query: z
        .string()
        .describe('Gmail search query, e.g. "has:attachment from:jane@x.com subject:invoice".'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe('Maximum number of messages to return (1-50).'),
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();
      log.info(`Searching Gmail: "${args.query}"`);
      try {
        const list = await gmail.users.messages.list({
          userId: 'me',
          q: args.query,
          maxResults: args.maxResults,
        });
        const ids = (list.data.messages ?? []).map((m) => m.id!).filter(Boolean);
        const results = [];
        for (const id of ids) {
          const msg = await gmail.users.messages.get({
            userId: 'me',
            id,
            format: 'full',
          });
          const p = msg.data.payload;
          results.push({
            id: msg.data.id,
            threadId: msg.data.threadId,
            from: header(p, 'From'),
            to: header(p, 'To'),
            date: header(p, 'Date'),
            subject: header(p, 'Subject'),
            snippet: msg.data.snippet,
            attachments: collectAttachments(p).map((a) => ({
              filename: a.filename,
              mimeType: a.mimeType,
              sizeBytes: a.sizeBytes,
              attachmentId: a.attachmentId,
            })),
          });
        }
        return JSON.stringify(
          { resultCount: results.length, messages: results },
          null,
          2
        );
      } catch (error: any) {
        log.error(`Search failed: ${error.message}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Gmail search failed: ${error.message}`);
      }
    },
  });
}
