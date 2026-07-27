// src/tools/applyLabel.ts
import { UserError } from 'fastmcp';
import { z } from 'zod';
import type { FastMCP } from 'fastmcp';
import type { gmail_v1 } from 'googleapis';
import { getGmailClient } from '../clients.js';

/** name -> labelId map for the account's current labels. */
async function labelMap(gmail: gmail_v1.Gmail): Promise<Map<string, string>> {
  const res = await gmail.users.labels.list({ userId: 'me' });
  const m = new Map<string, string>();
  for (const l of res.data.labels ?? []) {
    if (l.name && l.id) m.set(l.name, l.id);
  }
  return m;
}

export function register(server: FastMCP) {
  server.addTool({
    name: 'gmail_apply_label',
    description:
      'Add and/or remove Gmail labels on a single message. Label names are resolved to IDs; any ' +
      'name in "add" that does not exist is created (nested names like "Contracts/Filed" are supported). ' +
      'Names in "remove" that do not exist are ignored. Requires the gmail.modify scope.',
    parameters: z.object({
      messageId: z.string().describe('The Gmail message id to modify.'),
      add: z
        .array(z.string())
        .optional()
        .default([])
        .describe('Label display names to add (created if missing), e.g. ["Contracts/Filed"].'),
      remove: z
        .array(z.string())
        .optional()
        .default([])
        .describe('Label display names to remove (ignored if they do not exist).'),
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();
      if (args.add.length === 0 && args.remove.length === 0) {
        throw new UserError('Provide at least one label in "add" or "remove".');
      }
      try {
        const map = await labelMap(gmail);

        // Resolve add-labels, creating any that are missing.
        const addLabelIds: string[] = [];
        for (const name of args.add) {
          let id = map.get(name);
          if (!id) {
            const created = await gmail.users.labels.create({
              userId: 'me',
              requestBody: {
                name,
                labelListVisibility: 'labelShow',
                messageListVisibility: 'show',
              },
            });
            id = created.data.id!;
            map.set(name, id);
            log.info(`Created label "${name}" (${id}).`);
          }
          addLabelIds.push(id);
        }

        // Resolve remove-labels; skip any that don't exist.
        const removedNames = args.remove.filter((n) => map.has(n));
        const removeLabelIds = removedNames.map((n) => map.get(n)!);

        await gmail.users.messages.modify({
          userId: 'me',
          id: args.messageId,
          requestBody: { addLabelIds, removeLabelIds },
        });

        return JSON.stringify(
          { messageId: args.messageId, added: args.add, removed: removedNames },
          null,
          2
        );
      } catch (error: any) {
        log.error(`Label update failed: ${error.message}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Gmail label update failed: ${error.message}`);
      }
    },
  });
}
