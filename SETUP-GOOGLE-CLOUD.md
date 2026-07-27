# One-time Google Cloud setup

You need your own OAuth client. This takes about ten minutes and you only do it
once. It works with a **personal @gmail.com account**; Google Workspace is not
required.

There is one step people commonly miss that breaks everything a week later.
It is step 5. Do not skip it.

---

## 1. Create a project

Go to https://console.cloud.google.com/projectcreate and create a project. Any
name works.

## 2. Enable the Gmail API

Go to https://console.cloud.google.com/apis/library/gmail.googleapis.com, make
sure your new project is selected in the top bar, and click **Enable**.

Without this, authorization appears to succeed and then every call fails.

## 3. Configure the consent screen

The OAuth settings live under **Google Auth Platform** in the left menu.

Go to https://console.cloud.google.com/auth/branding and fill in:

- **App name**: anything descriptive, for example `gmail-attachments-mcp`
- **User support email**: your own address

Then go to https://console.cloud.google.com/auth/audience and set:

- **User type**: **External**

External is correct even though you are the only user. "Internal" requires a
Google Cloud Organization, which requires Google Workspace.

## 4. Create the OAuth client

Go to https://console.cloud.google.com/auth/clients and click
**Create client**:

- **Application type**: **Desktop app**
- **Name**: anything, for example `local`

Click **Create**, then **Download JSON**. Save the file as `credentials.json`
in the root of this repository.

```bash
mv ~/Downloads/client_secret_*.json /path/to/gmail-attachments-mcp/credentials.json
```

`credentials.json` is listed in `.gitignore`. Never commit it.

Alternatively, skip the file and set two environment variables instead:

```bash
export GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
export GOOGLE_CLIENT_SECRET="..."
```

## 5. Publish the app — do not skip this

Go back to https://console.cloud.google.com/auth/audience and click
**Publish app**, moving the publishing status from **Testing** to
**In production**.

**Why this matters.** Gmail scopes are classified by Google as *restricted*.
While an External app sits in **Testing** status, Google's own documentation
states:

> Authorizations by a test user will expire seven days from the time of consent.
> If your OAuth client requests an `offline` access type and receives a refresh
> token, that token will also expire.

So a Testing-status app stops working every seven days, forever, and you have to
re-authorize by hand. Publishing removes the expiry entirely.

**What publishing costs you.** Two things, both harmless for personal use:

1. A one-time warning screen saying Google has not verified this app. Click
   **Advanced**, then **Go to (unsafe)**. It says unsafe because Google has not
   reviewed the app; the app is the code in this repository, running locally on
   your own machine, talking only to your own mailbox.
2. A lifetime cap of 100 new users on the project, which cannot be reset. For a
   tool you run on your own account, this is irrelevant.

You do **not** need to complete Google's verification process. Verification
exists so an app can be distributed publicly without the warning screen, and for
restricted Gmail scopes it requires a paid third-party security assessment.

## 6. Authorize

```bash
npm install
npm run build
npm run auth
```

A browser window opens. Sign in, click through the unverified-app warning, and
approve. The refresh token is written to `~/.config/gmail-mcp/token.json` with
mode 0600.

---

## Verifying you did step 5 correctly

If you are ever unsure whether a project is in Testing or In production, ask
Google directly. This requests a token refresh and inspects the response:

```bash
python3 - <<'PY'
import json, urllib.request, urllib.parse, os
creds = json.load(open('credentials.json'))
k = creds.get('installed') or creds.get('web')
tok = json.load(open(os.path.expanduser('~/.config/gmail-mcp/token.json')))
data = urllib.parse.urlencode({
    'client_id': k['client_id'], 'client_secret': k['client_secret'],
    'refresh_token': tok['refresh_token'], 'grant_type': 'refresh_token',
}).encode()
with urllib.request.urlopen(
        urllib.request.Request('https://oauth2.googleapis.com/token', data=data)) as r:
    resp = json.load(r)
if 'refresh_token_expires_in' in resp:
    print("TESTING mode. Token expires in %.2f days. Go publish the app."
          % (resp['refresh_token_expires_in'] / 86400))
else:
    print("IN PRODUCTION. No expiry. Correctly configured.")
PY
```

Google returns `refresh_token_expires_in` only for Testing-status apps. If the
field is absent, you are correctly configured.

---

## Scopes this server requests

| Scope | Why |
|-------|-----|
| `gmail.modify` | Read messages, download attachments, add and remove labels. Does not permit permanent deletion. |
| `gmail.compose` | Create and update drafts. Does not permit sending. |

The server has no send capability. Drafts are always left in Gmail for you to
review and send by hand.

If you do not need labelling, you can narrow `gmail.modify` to `gmail.readonly`
in `src/auth.ts` and drop the `gmail_apply_label` tool. Change the scope list,
rebuild, then re-run `npm run auth` so the stored token carries the new scope.

---

## Troubleshooting

| Symptom | Cause |
|---------|-------|
| `invalid_grant` after about a week | The app is in Testing status. Do step 5. |
| Auth succeeds, every call fails | Gmail API not enabled. Do step 2. |
| `credentials.json not found` | The file is not in the repo root, and no `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set. |
| Tools do not appear in Claude Code | Restart Claude Code. MCP servers load at startup. |
| `access_denied` on the consent screen | The app is in Testing and your account is not on the test-user list. Publishing (step 5) makes this moot. |
