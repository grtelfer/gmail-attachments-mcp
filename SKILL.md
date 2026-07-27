---
name: gmail-attachments
description: Read files that people emailed you, and reply with files attached. Use when the user refers to an attachment, a document someone sent, an invoice or receipt in their inbox, or asks to draft an email with a file attached. Requires the gmail-attachments-mcp server.
---

# Gmail attachments

Two workflows: getting a file out of an email, and putting a file into a draft.

Both need the `mcp__gmail__*` tools. If they are not available, the
`gmail-attachments-mcp` server is not installed or Claude was not restarted after
installing it. Say so rather than falling back to a hosted Gmail connector, which
cannot handle attachments.

## Reading a file someone emailed

1. **Find the message.**

   ```
   mcp__gmail__gmail_search_messages
     query: "has:attachment from:someone@example.com newer_than:30d"
   ```

   Standard Gmail query syntax works: `has:attachment`, `from:`, `subject:`,
   `newer_than:7d`, `filename:pdf`, `in:anywhere`. The response already includes
   attachment filenames and sizes, so you often do not need a second call.

2. **Download it.**

   ```
   mcp__gmail__gmail_download_attachment
     messageId: "<id from step 1>"
     filename:  "<filename from step 1>"
     destDir:   "<a working directory>"
   ```

   **Always pass `filename`, never `attachmentId`.** Gmail does not guarantee
   attachment ids are stable between calls, so an id captured a moment earlier
   can fail. Pass `all: true` to grab every attachment on the message.

3. **Read it.** Use the `Read` tool on the returned path. Text, Markdown, CSV,
   JSON, and PDF are read directly. For `.xlsx` and `.docx`, convert first, for
   example with `openpyxl` or `python-docx`.

## Replying with a file attached

1. **Make sure the file exists on disk.** If the user is asking you to send
   something you generated, write or render it to a file first. To produce a PDF
   from HTML without opening a browser:

   ```bash
   # macOS
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --headless --disable-gpu --no-pdf-header-footer \
     --print-to-pdf="/path/out.pdf" "file:///path/in.html"
   ```

2. **Create the draft.**

   ```
   mcp__gmail__gmail_create_draft_with_attachments
     to:          "recipient@example.com"
     subject:     "..."
     bodyHtml:    "<p>...</p>"
     bodyText:    "..."
     attachments: ["/absolute/path/to/file.pdf"]
   ```

   Supply both `bodyHtml` and `bodyText`. HTML alone renders badly in some
   clients; plain text alone looks unformatted in most.

3. **Report, do not send.** The tool creates a draft and cannot send. Tell the
   user the draft is waiting in Gmail, name the attached files, and let them
   review and send it themselves.

## Labelling

```
mcp__gmail__gmail_apply_label
  messageId: "..."
  add:    ["Processed/2026"]
  remove: ["Needs Review"]
```

Missing labels in `add` are created, including nested `Parent/Child` names.
Names in `remove` that do not exist are ignored.

## Rules

- **Never claim an email was sent.** This server has no send capability by
  design. The most it does is leave a draft.
- **Verify before reporting success.** A tool returning a draft id means the API
  accepted the request. If it matters that the attachment really landed, confirm
  the filename appears in the tool's `attachmentsAttached` response field.
- **Search misses are common.** Gmail thread previews show the oldest message in
  a thread, so a long thread with recent activity can look stale. Before telling
  the user something does not exist, try a broader query, including
  `in:anywhere` to cover spam and trash.
- **Do not paste secrets into drafts.** Attachments may contain credentials or
  personal data. Attach the file; do not transcribe its contents into the body
  unless asked.
