// src/tools/helpers.ts
//
// Shared helpers for walking Gmail message payloads.

import type { gmail_v1 } from 'googleapis';

export interface AttachmentInfo {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  attachmentId: string;
  partId: string;
}

/** Recursively collect real attachments (named parts with an attachmentId). */
export function collectAttachments(
  payload: gmail_v1.Schema$MessagePart | undefined
): AttachmentInfo[] {
  const out: AttachmentInfo[] = [];
  const walk = (part?: gmail_v1.Schema$MessagePart) => {
    if (!part) return;
    const filename = part.filename ?? '';
    const attachmentId = part.body?.attachmentId ?? '';
    if (filename && attachmentId) {
      out.push({
        filename,
        mimeType: part.mimeType ?? 'application/octet-stream',
        sizeBytes: part.body?.size ?? 0,
        attachmentId,
        partId: part.partId ?? '',
      });
    }
    part.parts?.forEach(walk);
  };
  walk(payload);
  return out;
}

/** Pull a header value (case-insensitive) from a message payload. */
export function header(
  payload: gmail_v1.Schema$MessagePart | undefined,
  name: string
): string {
  const h = payload?.headers?.find(
    (x) => (x.name ?? '').toLowerCase() === name.toLowerCase()
  );
  return h?.value ?? '';
}
