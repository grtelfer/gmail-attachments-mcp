// src/auth.ts
//
// OAuth 2.0 authentication for the Gmail MCP server.
// Mirrors the google-slides-mcp auth pattern:
//   - Reuses a desktop ("installed") OAuth client from credentials.json
//   - CSRF state parameter on the browser flow
//   - Stores only the refresh_token, with 0o600 permissions
//   - Token lives under ~/.config/gmail-mcp/ (separate from slides)

import { google } from 'googleapis';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

/** Best-effort open of a URL in the user's default browser (no-op on failure). */
function openInBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start ""'
        : 'xdg-open';
  exec(`${cmd} "${url}"`, (err) => {
    if (err) logger.warn('Could not auto-open browser; copy the URL above manually.');
  });
}

// Derive the client type from the factory so it always matches the OAuth2
// instance googleapis actually returns (avoids duplicate google-auth-library
// type clashes between the top-level dep and googleapis-common's nested copy).
type OAuthClient = InstanceType<typeof google.auth.OAuth2>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRootDir = path.resolve(__dirname, '..');

const CREDENTIALS_PATH = path.join(projectRootDir, 'credentials.json');
const VALID_PROFILE_REGEX = /^[a-zA-Z0-9_-]+$/;

function getConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg || path.join(os.homedir(), '.config');
  const baseDir = path.join(base, 'gmail-mcp');
  const profile = process.env.GOOGLE_MCP_PROFILE;
  if (profile) {
    if (!VALID_PROFILE_REGEX.test(profile)) {
      throw new Error(
        `Invalid GOOGLE_MCP_PROFILE "${profile}". Only alphanumeric, hyphens, and underscores are allowed.`
      );
    }
    return path.join(baseDir, profile);
  }
  return baseDir;
}

function getTokenPath(): string {
  return path.join(getConfigDir(), 'token.json');
}

// ---------------------------------------------------------------------------
// Scopes — least privilege for the jobs this server does:
//   gmail.modify  — read messages + download attachments, and add/remove
//                   labels on messages (find-or-create). A superset of
//                   gmail.readonly. Does NOT permit permanent delete or send.
//   gmail.compose — create/update drafts (with attachments). Does NOT
//                   auto-send; drafts are left for the user to review + send.
// NOTE: changing this list requires re-running `npm run auth` (the browser
// consent) so the stored token carries the new scope.
// ---------------------------------------------------------------------------

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
];

async function loadClientSecrets(): Promise<{ client_id: string; client_secret: string }> {
  const envId = process.env.GOOGLE_CLIENT_ID;
  const envSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (envId && envSecret) {
    return { client_id: envId, client_secret: envSecret };
  }
  try {
    const content = await fs.readFile(CREDENTIALS_PATH, 'utf8');
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    if (!key) throw new Error('Could not find client secrets in credentials.json.');
    return { client_id: key.client_id, client_secret: key.client_secret };
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      throw new Error(
        'No OAuth credentials found. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET ' +
          'environment variables, or place a credentials.json file in the project root.'
      );
    }
    throw err;
  }
}

async function loadSavedCredentialsIfExist(): Promise<OAuthClient | null> {
  try {
    const content = await fs.readFile(getTokenPath(), 'utf8');
    const credentials = JSON.parse(content);
    const { client_secret, client_id } = await loadClientSecrets();
    const client = new google.auth.OAuth2(client_id, client_secret);
    client.setCredentials(credentials);
    return client;
  } catch {
    return null;
  }
}

async function saveCredentials(client: OAuthClient): Promise<void> {
  const configDir = getConfigDir();
  await fs.mkdir(configDir, { recursive: true });
  const payload = JSON.stringify(
    { type: 'authorized_user', refresh_token: client.credentials.refresh_token },
    null,
    2
  );
  await fs.writeFile(getTokenPath(), payload, { mode: 0o600 });
  logger.info('Token stored to', getTokenPath());
}

async function authenticate(): Promise<OAuthClient> {
  const { client_secret, client_id } = await loadClientSecrets();

  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const redirectUri = `http://127.0.0.1:${port}`;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);
  const state = crypto.randomBytes(32).toString('hex');

  const authorizeUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES.join(' '),
    state,
  });

  logger.info('Authorize this app by visiting this url:\n' + authorizeUrl);
  openInBrowser(authorizeUrl);

  const code = await new Promise<string>((resolve, reject) => {
    server.on('request', (req, res) => {
      const url = new URL(req.url!, `http://127.0.0.1:${port}`);
      const error = url.searchParams.get('error');
      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authorization failed</h1><p>You can close this tab.</p>');
        reject(new Error(`Authorization error: ${error}`));
        server.close();
        return;
      }
      const returnedState = url.searchParams.get('state');
      if (returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Invalid state parameter</h1><p>Possible CSRF attack. Please try again.</p>');
        reject(new Error('OAuth state mismatch — possible CSRF attack'));
        server.close();
        return;
      }
      const authCode = url.searchParams.get('code');
      if (authCode) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authorization successful!</h1><p>You can close this tab.</p>');
        resolve(authCode);
        server.close();
      }
    });
  });

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  if (tokens.refresh_token) {
    await saveCredentials(oAuth2Client);
  } else {
    logger.warn('Did not receive a refresh token. Re-run auth to force consent.');
  }
  logger.info('Authentication successful!');
  return oAuth2Client;
}

export async function authorize(): Promise<OAuthClient> {
  const client = await loadSavedCredentialsIfExist();
  if (client) {
    logger.info('Using saved credentials.');
    return client;
  }
  logger.info('No saved token found. Starting interactive auth flow...');
  return authenticate();
}

export async function runAuthFlow(): Promise<void> {
  await authenticate();
}
