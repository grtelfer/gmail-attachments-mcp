#!/bin/bash
# Installer for gmail-attachments-mcp.
# Run from the repository root:  ./install.sh
#
# Prerequisites: Node.js 18+, and a Google OAuth client (see SETUP-GOOGLE-CLOUD.md).

set -e

echo "gmail-attachments-mcp installer"
echo "==============================="
echo ""

# --- Step 0: prerequisites -------------------------------------------------
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: Node.js and npm are required."
  echo "Install Node 18 or later from https://nodejs.org and re-run."
  exit 1
fi

NODE_MAJOR="$(node --version | sed 's/^v\([0-9]*\).*/\1/')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "ERROR: Node 18 or later is required. Found $(node --version)."
  exit 1
fi
echo "Found node $(node --version), npm $(npm --version)"

# --- Step 1: locate the repo (this script's own directory) ----------------
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if [ ! -f "$DIR/package.json" ] || [ ! -d "$DIR/src" ]; then
  echo "ERROR: run this script from inside the repository."
  echo "Expected package.json and src/ next to it, in $DIR"
  exit 1
fi
echo "Repository: $DIR"
echo ""

# --- Step 2: OAuth credentials -------------------------------------------
if [ -n "$GOOGLE_CLIENT_ID" ] && [ -n "$GOOGLE_CLIENT_SECRET" ]; then
  echo "Using OAuth credentials from environment variables."
elif [ -f "$DIR/credentials.json" ]; then
  echo "Found credentials.json"
else
  echo "MISSING: OAuth credentials."
  echo ""
  echo "This server needs your own Google OAuth client. It is free, works with a"
  echo "personal @gmail.com account, and takes about ten minutes once."
  echo ""
  echo "Open SETUP-GOOGLE-CLOUD.md and follow steps 1 to 5. In short:"
  echo ""
  echo "  1. Create a project      https://console.cloud.google.com/projectcreate"
  echo "  2. Enable the Gmail API  https://console.cloud.google.com/apis/library/gmail.googleapis.com"
  echo "  3. Consent screen        https://console.cloud.google.com/auth/branding"
  echo "                           set User type = External on the Audience page"
  echo "  4. Create an OAuth client of type 'Desktop app', download the JSON,"
  echo "     and save it as:  $DIR/credentials.json"
  echo "  5. Click 'Publish app'   https://console.cloud.google.com/auth/audience"
  echo ""
  echo "     Step 5 is the one people skip. Without it Google expires your"
  echo "     access every 7 days and this server stops working."
  echo ""
  echo "Then re-run ./install.sh"
  exit 1
fi
echo ""

# --- Step 3: dependencies and build --------------------------------------
echo "Installing dependencies (this can take a minute)..."
npm install --silent
echo "Building..."
npm run build >/dev/null

if [ ! -f "$DIR/dist/index.js" ]; then
  echo "ERROR: build did not produce dist/index.js. Check the output above."
  exit 1
fi
echo "Built $DIR/dist/index.js"
echo ""

# --- Step 4: register with Claude Code -----------------------------------
if command -v claude >/dev/null 2>&1; then
  if claude mcp list 2>/dev/null | grep -q '^gmail\b'; then
    echo "Already registered with Claude Code as 'gmail'. Leaving as-is."
  else
    claude mcp add gmail --scope user -- node "$DIR/dist/index.js"
    echo "Registered with Claude Code as 'gmail' (user scope)."
  fi
else
  echo "NOTE: the 'claude' CLI is not on your PATH. Register manually with:"
  echo ""
  echo "  claude mcp add gmail --scope user -- node \"$DIR/dist/index.js\""
fi
echo ""

# --- Step 5: authorize ---------------------------------------------------
TOKEN="${XDG_CONFIG_HOME:-$HOME/.config}/gmail-mcp/token.json"
if [ -f "$TOKEN" ]; then
  echo "An existing token was found at $TOKEN"
  read -r -p "Re-authorize anyway? [y/N] " REPLY
  case "$REPLY" in
    [yY]*) node dist/index.js auth ;;
    *)     echo "Keeping the existing token." ;;
  esac
else
  echo "Next: one-time authorization. A Google sign-in page will open."
  echo "Sign in with the account whose mailbox you want to access."
  echo ""
  echo "You will see a warning that Google has not verified this app. That is"
  echo "expected for a self-hosted tool. Click Advanced, then proceed."
  echo ""
  read -r -p "Press Enter to start authorization..."
  node dist/index.js auth
fi

echo ""
echo "==============================="
echo "Done. RESTART Claude Code so it loads the server."
echo ""
echo "Then try:  \"find my most recent email with an attachment and download it\""
