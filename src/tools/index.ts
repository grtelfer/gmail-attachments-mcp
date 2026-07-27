// src/tools/index.ts
import type { FastMCP } from 'fastmcp';
import { register as registerSearch } from './searchMessages.js';
import { register as registerList } from './listAttachments.js';
import { register as registerDownload } from './downloadAttachment.js';
import { register as registerDraft } from './createDraftWithAttachments.js';
import { register as registerApplyLabel } from './applyLabel.js';

export function registerAllTools(server: FastMCP) {
  registerSearch(server);
  registerList(server);
  registerDownload(server);
  registerDraft(server);
  registerApplyLabel(server);
}
