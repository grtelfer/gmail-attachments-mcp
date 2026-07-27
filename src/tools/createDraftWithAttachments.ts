// src/tools/createDraftWithAttachments.ts
import { UserError } from 'fastmcp';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import type { FastMCP } from 'fastmcp';
import { getGmailClient } from '../clients.js';

function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function buildRaw(options: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    new MailComposer(options).compile().build((err: Error | null, message: Buffer) => {
      if (err) reject(err);
      else resolve(message);
    });
  });
}

export function register(server: FastMCP) {
  server.addTool({
    name: 'gmail_create_draft_with_attachments',
    description:
      'Create a Gmail DRAFT with one or more file attachments. The draft is saved to the account but NOT sent — ' +
      'review and send it manually from Gmail. Provide recipients, a subject, an HTML and/or plain-text body, ' +
      'and a list of local file paths to attach. Returns the draft id.',
    parameters: z.object({
      to: z.string().describe('Recipient(s). Comma-separate multiple addresses.'),
      cc: z.string().optional().describe('Cc recipient(s), comma-separated.'),
      bcc: z.string().optional().describe('Bcc recipient(s), comma-separated.'),
      subject: z.string().describe('Email subject line.'),
      bodyHtml: z
        .string()
        .optional()
        .describe('HTML body (preferred). Use <p> tags for paragraphs.'),
      bodyText: z
        .string()
        .optional()
        .describe('Plain-text body. Provide this and/or bodyHtml.'),
      attachments: z
        .array(z.string())
        .min(1)
        .describe('Absolute or ~-relative paths to files to attach.'),
    }),
    execute: async (args, { log }) => {
      if (!args.bodyHtml && !args.bodyText) {
        throw new UserError('Provide bodyHtml and/or bodyText.');
      }
      const gmail = await getGmailClient();

      // Resolve + validate attachment paths before composing.
      const attachments = [];
      for (const raw of args.attachments) {
        const p = expandHome(raw);
        try {
          const stat = await fs.stat(p);
          if (!stat.isFile()) throw new Error('not a regular file');
        } catch (e: any) {
          throw new UserError(`Attachment not found or unreadable: ${raw} (${e.message})`);
        }
        attachments.push({ path: p, filename: path.basename(p) });
      }

      try {
        const message = await buildRaw({
          to: args.to,
          cc: args.cc,
          bcc: args.bcc,
          subject: args.subject,
          text: args.bodyText,
          html: args.bodyHtml,
          attachments,
        });
        const raw = message.toString('base64url');

        const res = await gmail.users.drafts.create({
          userId: 'me',
          requestBody: { message: { raw } },
        });

        log.info(`Draft created: ${res.data.id}`);
        return JSON.stringify(
          {
            draftId: res.data.id,
            messageId: res.data.message?.id,
            attachmentsAttached: attachments.map((a) => a.filename),
            note: 'Draft saved but NOT sent. Open Gmail → Drafts to review and send.',
            draftsUrl: 'https://mail.google.com/mail/u/0/#drafts',
          },
          null,
          2
        );
      } catch (error: any) {
        log.error(`Draft creation failed: ${error.message}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to create draft: ${error.message}`);
      }
    },
  });
}
