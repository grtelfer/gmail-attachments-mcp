// src/tools/listAttachments.ts
import { UserError } from 'fastmcp';
import { z } from 'zod';
import type { FastMCP } from 'fastmcp';
import { getGmailClient } from '../clients.js';
import { collectAttachments, header } from './helpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'gmail_list_attachments',
    description:
      'List every attachment on a single Gmail message. Returns filename, mimeType, size, and attachmentId ' +
      'for each. Pass the message id (from gmail_search_messages or a Gmail URL).',
    parameters: z.object({
      messageId: z.string().describe('The Gmail message id.'),
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();
      log.info(`Listing attachments for message ${args.messageId}`);
      try {
        const msg = await gmail.users.messages.get({
          userId: 'me',
          id: args.messageId,
          format: 'full',
        });
        const p = msg.data.payload;
        const attachments = collectAttachments(p);
        return JSON.stringify(
          {
            messageId: msg.data.id,
            subject: header(p, 'Subject'),
            from: header(p, 'From'),
            attachmentCount: attachments.length,
            attachments: attachments.map((a) => ({
              filename: a.filename,
              mimeType: a.mimeType,
              sizeBytes: a.sizeBytes,
              attachmentId: a.attachmentId,
            })),
          },
          null,
          2
        );
      } catch (error: any) {
        log.error(`List attachments failed: ${error.message}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to list attachments: ${error.message}`);
      }
    },
  });
}
