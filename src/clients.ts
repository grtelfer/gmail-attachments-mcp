// src/clients.ts
//
// Singleton Gmail API client.

import { google, gmail_v1 } from 'googleapis';
import { UserError } from 'fastmcp';
import { authorize } from './auth.js';
import { logger } from './logger.js';

let authClient: any = null;
let gmail: gmail_v1.Gmail | null = null;

export async function initializeGoogleClient() {
  if (gmail) return { authClient, gmail };
  try {
    logger.info('Authorizing Gmail API client...');
    authClient = await authorize();
    gmail = google.gmail({ version: 'v1', auth: authClient });
    logger.info('Gmail API client authorized.');
  } catch (error) {
    logger.error('FATAL: Failed to initialize Gmail client:', error);
    authClient = null;
    gmail = null;
    throw new Error('Gmail client initialization failed. Run `gmail-mcp auth` first.');
  }
  return { authClient, gmail };
}

export async function getGmailClient(): Promise<gmail_v1.Gmail> {
  const { gmail: client } = await initializeGoogleClient();
  if (!client) throw new UserError('Gmail client is not initialized.');
  return client;
}
