// src/tools/downloadAttachment.ts
import { UserError } from 'fastmcp';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { FastMCP } from 'fastmcp';
import { getGmailClient } from '../clients.js';
import { collectAttachments } from './helpers.js';

function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** Strip any directory components; keep a safe basename. */
function safeBasename(filename: string): string {
  const base = path.basename(filename).replace(/[/\\]/g, '_');
  return base || 'attachment';
}

/** Return a path in destDir that does not already exist (adds -1, -2, ...). */
async function uniquePath(destDir: string, filename: string): Promise<string> {
  const ext = path.extname(filename);
  const stem = path.basename(filename, ext);
  let candidate = path.join(destDir, filename);
  let i = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(destDir, `${stem}-${i}${ext}`);
      i += 1;
    } catch {
      return candidate;
    }
  }
}

export function register(server: FastMCP) {
  server.addTool({
    name: 'gmail_download_attachment',
    description:
      'Download attachment(s) from a Gmail message to a local folder. Provide a messageId and either a ' +
      'filename (recommended, stable across calls), a specific attachmentId, OR set all=true to download every ' +
      'attachment on the message. Files save to destDir (default ~/Downloads). Returns the absolute path(s) ' +
      'written. Existing files are never overwritten (a numeric suffix is added).',
    parameters: z.object({
      messageId: z.string().describe('The Gmail message id.'),
      filename: z
        .string()
        .optional()
        .describe(
          'Filename of the attachment to download, as returned by gmail_list_attachments. Preferred over ' +
          'attachmentId, since Gmail attachment ids are not guaranteed stable across separate API calls.'
        ),
      attachmentId: z
        .string()
        .optional()
        .describe(
          'Specific attachment id to download. Prefer filename instead: Gmail can return a different ' +
          'attachmentId for the same attachment on a later call, which makes this param unreliable on its own.'
        ),
      all: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, download all attachments on the message.'),
      destDir: z
        .string()
        .optional()
        .default('~/Downloads')
        .describe('Destination folder. Supports ~. Created if missing.'),
    }),
    execute: async (args, { log }) => {
      if (!args.filename && !args.attachmentId && !args.all) {
        throw new UserError('Provide a filename (preferred), an attachmentId, or set all=true.');
      }
      const gmail = await getGmailClient();
      const destDir = expandHome(args.destDir);
      await fs.mkdir(destDir, { recursive: true });

      try {
        const msg = await gmail.users.messages.get({
          userId: 'me',
          id: args.messageId,
          format: 'full',
        });
        let targets = collectAttachments(msg.data.payload);
        if (!args.all) {
          if (args.filename) {
            const wanted = args.filename.trim().toLowerCase();
            targets = targets.filter((a) => a.filename.trim().toLowerCase() === wanted);
            if (targets.length === 0) {
              throw new UserError(
                `No attachment named "${args.filename}" on message ${args.messageId}. Call gmail_list_attachments ` +
                'to see current filenames.'
              );
            }
          } else {
            targets = targets.filter((a) => a.attachmentId === args.attachmentId);
            if (targets.length === 0) {
              throw new UserError(
                `No attachment with id "${args.attachmentId}" on message ${args.messageId}. Gmail attachment ids ` +
                'can change between calls; pass filename instead (from a fresh gmail_list_attachments call).'
              );
            }
          }
        }
        if (targets.length === 0) {
          throw new UserError(`Message ${args.messageId} has no attachments.`);
        }

        const saved: { filename: string; path: string; sizeBytes: number }[] = [];
        for (const att of targets) {
          const res = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: args.messageId,
            id: att.attachmentId,
          });
          const data = res.data.data;
          if (!data) {
            log.warn(`Attachment ${att.filename} returned no data; skipping.`);
            continue;
          }
          const buf = Buffer.from(data, 'base64url');
          const outPath = await uniquePath(destDir, safeBasename(att.filename));
          await fs.writeFile(outPath, buf);
          saved.push({ filename: att.filename, path: outPath, sizeBytes: buf.length });
          log.info(`Saved ${outPath} (${buf.length} bytes)`);
        }

        return JSON.stringify(
          { messageId: args.messageId, savedCount: saved.length, files: saved },
          null,
          2
        );
      } catch (error: any) {
        log.error(`Download failed: ${error.message}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to download attachment: ${error.message}`);
      }
    },
  });
}
