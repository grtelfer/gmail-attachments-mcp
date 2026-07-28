# gmail-attachments-mcp

An [MCP](https://modelcontextprotocol.io) server that gives Claude the two Gmail
capabilities most built-in Gmail connectors lack: **downloading attachments** and
**creating drafts with file attachments**.

Runs locally. Talks only to your own mailbox. Cannot send email.

## Why this exists

Most hosted Gmail integrations are metadata-only. They can tell you an email has
a PDF attached; they cannot hand you the PDF, and they cannot attach a file to a
draft. That makes a large class of ordinary work impossible: reading an invoice
someone emailed you, or replying to a request with a document attached.

This server closes that gap and nothing else.

## Tools

| Tool | What it does |
|------|--------------|
| `gmail_search_messages` | Search with Gmail query syntax; returns messages plus attachment metadata |
| `gmail_list_attachments` | List every attachment on one message (filename, mimeType, size, attachmentId) |
| `gmail_download_attachment` | Save one attachment, or all of them, to a local folder |
| `gmail_create_draft_with_attachments` | Create a draft with file attachments. Saved, never sent. |
| `gmail_apply_label` | Add or remove labels on a message. Creates missing labels, including nested names. |

### One gotcha worth knowing

Gmail does not guarantee that `attachmentId` values stay stable across separate
API calls. The same attachment can report a different id seconds later. Always
pass `filename` to `gmail_download_attachment` rather than `attachmentId`. The
tool re-resolves the id internally.

## Install

Requires Node.js 18 or later.

```bash
git clone https://github.com/grtelfer/gmail-attachments-mcp.git
cd gmail-attachments-mcp
./install.sh
```

The installer checks prerequisites, installs dependencies, builds, registers the
server with Claude Code, and walks you through authorization.

You need your own Google OAuth client first. See
**[SETUP-GOOGLE-CLOUD.md](SETUP-GOOGLE-CLOUD.md)**. It works with a personal
@gmail.com account; Google Workspace is not required. Budget ten minutes, once.

> **The one thing people get wrong:** if you leave the OAuth consent screen in
> **Testing** status, Google expires your refresh token every seven days and the
> server silently stops working. Publishing the app removes the expiry and takes
> one click. Step 5 of the setup guide covers it.

### Manual install

If you would rather not run the script:

```bash
npm install
npm run build
claude mcp add gmail --scope user -- node "$PWD/dist/index.js"
npm run auth
```

Then restart Claude Code. Tools appear as `mcp__gmail__*`.

Registering the server under the name `gmail` is what produces the `mcp__gmail__`
prefix. Pick a different name if you prefer, but any skills referring to these
tools will need updating to match.

## Verify it works

Restart Claude Code, then ask:

> find my most recent email with an attachment and download it

## Configuration

| Variable | Effect |
|----------|--------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Supply OAuth credentials via environment instead of `credentials.json` |
| `GOOGLE_MCP_PROFILE` | Namespace the stored token, so you can authorize multiple Google accounts side by side. Alphanumeric, hyphens, and underscores only. |
| `XDG_CONFIG_HOME` | Overrides where the token is stored. Defaults to `~/.config/gmail-mcp/`. |

## Security

- **Never commit `credentials.json` or `token.json`.** Both are in `.gitignore`.
- The token file is written with mode 0600 and holds only a refresh token.
- Scopes are `gmail.modify` and `gmail.compose`. There is no send scope, so the
  server cannot send mail on your behalf. Drafts wait for you.
- Everything runs on your machine. No data leaves it except calls to Google's own
  API.
- To revoke access at any time, go to
  https://myaccount.google.com/permissions and remove the app.

## Optional: the Claude skill

[`SKILL.md`](SKILL.md) is an [Agent Skill](https://docs.claude.com/en/docs/claude-code/skills)
that teaches Claude the common workflows: reading an attachment somebody sent
you, and replying with a file attached. Copy it into `~/.claude/skills/gmail-attachments/`
to install it, or ignore it and use the tools directly.

## License

MIT. See [LICENSE](LICENSE).
