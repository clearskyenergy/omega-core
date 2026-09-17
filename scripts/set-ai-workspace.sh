#!/bin/bash
# © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
#
# Sets ANTHROPIC_WORKSPACE_ID on omega-core production, then redeploys.
# Anthropic refuses a key that was created outside a workspace unless the
# request names the workspace to bill; this is that name. Not a secret — a
# workspace id identifies, it does not authorise.
set -e
cd "$(dirname "$0")/.."

# Pull the id out of whatever was copied: the bare id, or a console URL
# containing it (…/settings/workspaces/wrkspc_01ABC…/members).
from_clipboard() { pbpaste 2>/dev/null | grep -oE 'wrkspc_[A-Za-z0-9]+' | head -1; }

ID=$(from_clipboard)
if [ -z "$ID" ]; then
  echo
  echo "1) A browser tab is opening on your Anthropic workspaces."
  echo "   Click the workspace you want Jarvis billed to (Default is fine)."
  echo "   Then copy the whole address from the address bar (Cmd+L, Cmd+C)."
  open "https://console.anthropic.com/settings/workspaces"
  echo
  echo "2) With that copied, press Return here."
  read -r _
  ID=$(from_clipboard)
fi
if [ -z "$ID" ]; then
  echo "   Nothing on the clipboard looks like a workspace id (they start with wrkspc_)."
  echo "   Open the workspace in the console and copy its web address, then run this again."
  exit 1
fi
echo "   Workspace: $ID"

echo
echo "3) Setting ANTHROPIC_WORKSPACE_ID on omega-core (production)…"
npx -y vercel@latest env rm ANTHROPIC_WORKSPACE_ID production --yes >/dev/null 2>&1 || true
printf '%s' "$ID" | npx -y vercel@latest env add ANTHROPIC_WORKSPACE_ID production >/dev/null
echo "   Set."

echo
echo "4) Redeploying…"
git commit -q --allow-empty -m "chore: redeploy with the AI workspace named"
git push -q origin main 2>/dev/null
echo "   Pushed. Jarvis answers once the build finishes (about two minutes)."
